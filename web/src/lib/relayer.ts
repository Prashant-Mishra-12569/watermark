/**
 * Browser client for the relayer (interfaces F6). Called directly from the browser, never proxied through Next:
 * the relayer rate-limits by socket IP, so a proxy would put every visitor into one bucket.
 *
 * Never logs request or response bodies, sessions or signatures.
 */
import type { Address, Hex } from "viem";
import type { Session } from "@watermark/sdk";
import type { ChainIdString } from "./config.ts";
import { checkFullTapLink } from "./tap-link.ts";

export type RelayerErrorCode =
  // F6 error codes
  | "BAD_REQUEST"
  | "UNKNOWN_APP"
  | "RATE_LIMIT"
  | "CHAIN_NOT_READY"
  | "BUSY"
  | "CHAIN_UNAVAILABLE"
  | "NOT_FOUND"
  // POST /pay refusals (F6) and /pay, /fund setup states
  | "NOT_STAMPED"
  | "QUOTA_USED"
  | "BUDGET_CAP"
  | "GAS_CAP"
  | "BAD_SIGNATURE"
  | "PAUSED"
  | "SPONSOR_NOT_CONFIGURED"
  | "FUND_NOT_CONFIGURED"
  | "ALREADY_FUNDED"
  | "INSUFFICIENT_FUNDS" // the payer's USDT balance is too low (relayer: INSUFFICIENT_USDT)
  | "TX_FAILED" // sent but reverted (relayer: PAY_REVERTED, FUND_REVERTED)
  | "TX_PENDING" // sent, no receipt yet; the error carries txHash (relayer: PAY_PENDING, FUND_PENDING)
  | "NONCE_USED" // this exact authorization was already used
  | "PAY_REJECTED" // the chain would refuse it; nothing was sent (relayer: PAY_REJECTED, FUND_REJECTED)
  | "FUND_EMPTY" // the business wallet is out of demo USDT
  // client-side
  | "NETWORK" // relayer down, wrong URL, or this origin isn't in CORS_ORIGINS
  | "TIMEOUT"
  | "ABORTED"
  | "BAD_RESPONSE" // malformed JSON or a session that doesn't match what we asked for
  | "HTTP_ERROR"; // any other status

const KNOWN_CODES = new Set<RelayerErrorCode>([
  "BAD_REQUEST",
  "UNKNOWN_APP",
  "RATE_LIMIT",
  "CHAIN_NOT_READY",
  "BUSY",
  "CHAIN_UNAVAILABLE",
  "NOT_FOUND",
  "NOT_STAMPED",
  "QUOTA_USED",
  "BUDGET_CAP",
  "GAS_CAP",
  "BAD_SIGNATURE",
  "PAUSED",
  "SPONSOR_NOT_CONFIGURED",
  "FUND_NOT_CONFIGURED",
  "ALREADY_FUNDED",
  "INSUFFICIENT_FUNDS",
  "TX_FAILED",
  "TX_PENDING",
  "NONCE_USED",
  "PAY_REJECTED",
  "FUND_EMPTY",
]);

/** The relayer's /pay and /fund reason codes (relayer/src/pay.ts) that map onto one of the codes above. */
const RELAYER_ALIASES: Readonly<Record<string, RelayerErrorCode>> = {
  INSUFFICIENT_USDT: "INSUFFICIENT_FUNDS",
  PAY_REVERTED: "TX_FAILED",
  FUND_REVERTED: "TX_FAILED",
  PAY_PENDING: "TX_PENDING",
  FUND_PENDING: "TX_PENDING",
  FUND_REJECTED: "PAY_REJECTED",
};

export class RelayerError extends Error {
  readonly code: RelayerErrorCode;
  /** HTTP status, 0 when no response arrived. */
  readonly status: number;
  /** Set when the relayer did send a transaction (TX_PENDING, TX_FAILED): link it so the user can check. */
  readonly txHash: Hex | null;
  constructor(code: RelayerErrorCode, status: number, message?: string, txHash: Hex | null = null) {
    super(message ?? code);
    this.name = "RelayerError";
    this.code = code;
    this.status = status;
    this.txHash = txHash;
  }
}

export interface SessionResponse {
  session: Session;
  sig: Hex;
  /** The full F1 link. Shown and encoded exactly as returned: the website never builds or edits it. */
  qr: string;
  sessionId: string;
}

export interface StatusResponse {
  stamped: boolean;
  /** unix seconds, 0 = none */
  expiresAt: number;
  quotaLeft: number;
}

export interface RequestOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const SIG65 = /^0x[0-9a-fA-F]{130}$/;
const DECIMAL = /^\d{1,78}$/;
const SESSION_ID = /^[A-Za-z0-9_-]{6,64}$/;

async function request(url: string, init: RequestInit, opts: RequestOptions): Promise<unknown> {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    let res: Response;
    try {
      res = await doFetch(url, {
        ...init,
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch {
      if (timedOut) throw new RelayerError("TIMEOUT", 0, "the relayer did not answer in time");
      if (controller.signal.aborted) throw new RelayerError("ABORTED", 0);
      throw new RelayerError("NETWORK", 0, "the relayer can't be reached");
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (timedOut) throw new RelayerError("TIMEOUT", res.status);
      if (controller.signal.aborted) throw new RelayerError("ABORTED", res.status);
      body = null;
    }
    if (!res.ok) throw errorFromResponse(res.status, body);
    if (body === null) throw new RelayerError("BAD_RESPONSE", res.status, "response is not JSON");
    return body;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Maps an F6 error response to a typed error: {error, message?} (session, status) or {reason} (pay, fund).
 * Falls back to the HTTP status.
 */
export function errorFromResponse(status: number, body: unknown): RelayerError {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const error = typeof b.reason === "string" ? b.reason : typeof b.error === "string" ? b.error : "";
  const message = typeof b.message === "string" ? b.message.slice(0, 200) : undefined;
  const txHash = typeof b.txHash === "string" && BYTES32.test(b.txHash) ? (b.txHash as Hex) : null;
  const code = Object.hasOwn(RELAYER_ALIASES, error) ? RELAYER_ALIASES[error]! : error;
  if (KNOWN_CODES.has(code as RelayerErrorCode)) return new RelayerError(code as RelayerErrorCode, status, message, txHash);
  if (status === 429) return new RelayerError("RATE_LIMIT", status, message);
  if (status === 400) return new RelayerError("BAD_REQUEST", status, message);
  if (status === 404) return new RelayerError("NOT_FOUND", status, message);
  return new RelayerError("HTTP_ERROR", status, message);
}

export interface SessionRequest {
  wallet: Address;
  /** canonical decimal string */
  appId: string;
  chainId: ChainIdString;
}

/**
 * POST /session. The body is F0-encoded: appId and chainId are decimal strings (a JSON number gets 400).
 * The response is checked before any QR is shown: it must be for our wallet, app and chain, and its qr must pass
 * Watermark Tap's link rules and carry exactly the returned session and signature (otherwise BAD_RESPONSE).
 */
export async function createSession(
  relayerUrl: string,
  req: SessionRequest,
  opts: RequestOptions = {},
): Promise<SessionResponse> {
  const body = await request(
    `${relayerUrl}/session`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: req.wallet, appId: req.appId, chainId: req.chainId }),
    },
    opts,
  );
  return parseSessionResponse(body, req);
}

/** Validates a POST /session response. Throws BAD_RESPONSE with a short reason (no values) on any mismatch. */
export function parseSessionResponse(body: unknown, req: SessionRequest): SessionResponse {
  const bad = (why: string) => new RelayerError("BAD_RESPONSE", 200, why);
  if (!body || typeof body !== "object") throw bad("not an object");
  const b = body as Record<string, unknown>;
  const s = b.session as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") throw bad("no session");

  const { wallet, appId, nonce, expiresAt, validUntilMonth, chainId, registry } = s;
  if (typeof wallet !== "string" || !ADDRESS.test(wallet)) throw bad("session.wallet");
  if (typeof appId !== "string" || !DECIMAL.test(appId)) throw bad("session.appId");
  if (typeof nonce !== "string" || !BYTES32.test(nonce)) throw bad("session.nonce");
  if (typeof expiresAt !== "string" || !DECIMAL.test(expiresAt)) throw bad("session.expiresAt");
  if (typeof validUntilMonth !== "number" || !Number.isInteger(validUntilMonth)) throw bad("session.validUntilMonth");
  if (typeof chainId !== "string" || !DECIMAL.test(chainId)) throw bad("session.chainId");
  if (typeof registry !== "string" || !ADDRESS.test(registry)) throw bad("session.registry");
  if (typeof b.sig !== "string" || !SIG65.test(b.sig)) throw bad("sig");
  if (typeof b.qr !== "string") throw bad("qr");
  if (typeof b.sessionId !== "string" || !SESSION_ID.test(b.sessionId)) throw bad("sessionId");

  // The session must be for what we asked: our wallet, this app, this chain.
  if (wallet.toLowerCase() !== req.wallet.toLowerCase()) throw bad("wallet mismatch");
  if (BigInt(appId) !== BigInt(req.appId)) throw bad("appId mismatch");
  if (chainId !== req.chainId) throw bad("chainId mismatch");

  // The link must pass every rule of Watermark Tap's parser (a bad PROVER_URL would give a QR the app refuses)...
  const checked = checkFullTapLink(b.qr);
  if (!checked.ok) throw bad(checked.reason);
  const link = checked.link;
  // ...and carry exactly this signed session. The phone shows the last 4 characters of w, so w must equal
  // session.wallet byte for byte (EIP-55 case included).
  if (link.w !== wallet) throw bad("qr wallet mismatch");
  if (link.c !== chainId) throw bad("qr chain mismatch");
  if (BigInt(link.app) !== BigInt(appId)) throw bad("qr app mismatch");
  if (link.n.toLowerCase() !== nonce.toLowerCase()) throw bad("qr nonce mismatch");
  if (BigInt(link.e) !== BigInt(expiresAt)) throw bad("qr expiry mismatch");
  if (BigInt(link.v) !== BigInt(validUntilMonth)) throw bad("qr month mismatch");
  if (link.r.toLowerCase() !== registry.toLowerCase()) throw bad("qr registry mismatch");
  if (link.sig.toLowerCase() !== b.sig.toLowerCase()) throw bad("qr signature mismatch");

  return {
    session: {
      wallet: wallet as Address,
      appId,
      nonce: nonce as Hex,
      expiresAt,
      validUntilMonth,
      chainId,
      registry: registry as Address,
    },
    sig: b.sig as Hex,
    qr: b.qr,
    sessionId: b.sessionId,
  };
}

/** GET /status/:wallet?app=&chain=. Numbers are parsed leniently (F0 says strings, today's relayer sends numbers). */
export async function getStatus(
  relayerUrl: string,
  wallet: Address,
  appId: string,
  chainId: ChainIdString,
  opts: RequestOptions = {},
): Promise<StatusResponse> {
  const q = new URLSearchParams({ app: appId, chain: chainId });
  const body = await request(`${relayerUrl}/status/${encodeURIComponent(wallet)}?${q.toString()}`, { method: "GET" }, opts);
  return parseStatusResponse(body);
}

export function parseStatusResponse(body: unknown): StatusResponse {
  if (!body || typeof body !== "object") throw new RelayerError("BAD_RESPONSE", 200, "not an object");
  const b = body as Record<string, unknown>;
  if (typeof b.stamped !== "boolean") throw new RelayerError("BAD_RESPONSE", 200, "stamped");
  const num = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  // Only a literal `true` from the chain read counts as stamped.
  return { stamped: b.stamped === true, expiresAt: num(b.expiresAt), quotaLeft: num(b.quotaLeft) };
}

// ---- Gasless USDT payment (F6 /pay, /fund, /balance) ----

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const USDT_AMOUNT = /^\d{1,30}(\.\d{1,6})?$/;
/** POST /pay waits for the receipt, so give it longer than a read. */
export const PAY_TIMEOUT_MS = 90_000;

export interface TxResponse {
  txHash: Hex;
  /** Who sent the transaction (the relayer), when the relayer says so. */
  from: Address | null;
}

export interface BalanceResponse {
  /** USDT as a decimal string, e.g. "1.5" */
  usdt: string;
  quotaLeft: number;
}

export function parseTxResponse(body: unknown): TxResponse {
  if (!body || typeof body !== "object") throw new RelayerError("BAD_RESPONSE", 200, "not an object");
  const b = body as Record<string, unknown>;
  if (typeof b.txHash !== "string" || !TX_HASH.test(b.txHash)) throw new RelayerError("BAD_RESPONSE", 200, "txHash");
  const from = typeof b.from === "string" && ADDRESS.test(b.from) ? (b.from as Address) : null;
  return { txHash: b.txHash as Hex, from };
}

export function parseBalanceResponse(body: unknown): BalanceResponse {
  if (!body || typeof body !== "object") throw new RelayerError("BAD_RESPONSE", 200, "not an object");
  const b = body as Record<string, unknown>;
  if (typeof b.usdt !== "string" || !USDT_AMOUNT.test(b.usdt)) throw new RelayerError("BAD_RESPONSE", 200, "usdt");
  const q = Number(b.quotaLeft ?? 0);
  return { usdt: b.usdt, quotaLeft: Number.isFinite(q) && q >= 0 ? Math.floor(q) : 0 };
}

/**
 * POST /pay {intent, signature}. The relayer checks the stamp and quota, simulates, pays the gas and waits for the
 * receipt. The body holds a signature: never log it.
 */
export async function postPay(
  relayerUrl: string,
  body: { intent: unknown; signature: Hex },
  opts: RequestOptions = {},
): Promise<TxResponse> {
  const res = await request(
    `${relayerUrl}/pay`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    { timeoutMs: PAY_TIMEOUT_MS, ...opts },
  );
  return parseTxResponse(res);
}

/** POST /fund {wallet}: the business sends this stamped wallet some demo USDT (once per wallet per relayer run). */
export async function postFund(relayerUrl: string, wallet: Address, opts: RequestOptions = {}): Promise<TxResponse> {
  const res = await request(
    `${relayerUrl}/fund`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) },
    { timeoutMs: PAY_TIMEOUT_MS, ...opts },
  );
  return parseTxResponse(res);
}

/** GET /balance/:wallet → USDT balance and today's sponsored payments left. */
export async function getBalance(relayerUrl: string, wallet: Address, opts: RequestOptions = {}): Promise<BalanceResponse> {
  const res = await request(`${relayerUrl}/balance/${encodeURIComponent(wallet)}`, { method: "GET" }, opts);
  return parseBalanceResponse(res);
}
