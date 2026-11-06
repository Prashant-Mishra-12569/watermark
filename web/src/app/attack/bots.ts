/**
 * /attack: five throwaway bot wallets ask the relayer for every free perk (SITE_SPEC.md section 3 "/attack"; copy from
 * DESIGN_V2.md "/attack").
 *
 * Pure logic, no React: the configuration, the door states and their copy, the summary, and the run itself with
 * fetch, keys and clock injectable, so `node --test` runs it against a mocked fetch. Every request is real: POST /fund,
 * POST /pay with a real EIP-3009 signature (lib/usdt.ts domain, lib/pay.ts helpers), and POST /pass when PASS_LIVE.
 *
 * Bot keys live only inside runAttack, one at a time, and are never stored, logged or sent. Never logs a request
 * body, a signature or a key.
 */
import type { Address, Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildIntent, randomNonce, readPayConfig, signPayment } from "../../lib/pay.ts";
import { PAY_TIMEOUT_MS, RelayerError, postFund, postPay, type RequestOptions } from "../../lib/relayer.ts";
import { parseUsdt } from "../../lib/usdt.ts";

// ------------------------------------------------------------------ settings

export const BOT_COUNT = 5;
/** Each bot asks for a 1 USDT payment to the demo shop. */
export const BOT_PAY_USDT = "1";
const BOT_PAY_UNITS: bigint = parseUsdt(BOT_PAY_USDT)!;
/** "Wait a minute between runs": the relayer's limits are per IP per fixed one-minute window. */
export const COOLDOWN_MS = 60_000;
/** Retry the /health read this often while the relayer can't be reached. */
export const HEALTH_RETRY_MS = 10_000;
export const HEALTH_TIMEOUT_MS = 8_000;

export type Door = "fund" | "pay" | "pass";

/** DESIGN_V2.md "/attack" door names. */
export const DOOR_LABEL: Record<Door, string> = {
  fund: "Test USDT",
  pay: "Free payment",
  pass: "Genesis Pass",
};

/**
 * The relayer's per-IP limits per minute, by its defaults (relayer/src/config.ts): PAYS_PER_MINUTE_PER_IP = 10 for
 * /fund and for /pay (separate counters), PASSES_PER_MINUTE_PER_IP = 5 for /pass. Shown in the page's Details.
 */
export const PER_MINUTE: Record<Door, number> = { fund: 10, pay: 10, pass: 5 };

/** The doors each bot knocks on, in order. The pass door exists only when PASS_LIVE (hidden everywhere otherwise). */
export function doorsFor(passLive: boolean): Door[] {
  return passLive ? ["fund", "pay", "pass"] : ["fund", "pay"];
}

// ------------------------------------------------------------------ configuration

export interface AttackConfig {
  /** The relayer origin, no trailing slash. */
  relayerUrl: string;
  /** NEXT_PUBLIC_DEMO_SHOP: where each bot's 1 USDT payment would go. */
  demoShop: Address;
  passLive: boolean;
}

export type AttackConfigResult = { ok: true; config: AttackConfig } | { ok: false; problems: string[] };

/** Same default as lib/config.ts DEFAULT_RELAYER_URL. */
const DEFAULT_RELAYER_URL = "http://localhost:8788";

function parseRelayerUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
  } catch {
    return null;
  }
  return raw.replace(/\/+$/, "");
}

/** Reads NEXT_PUBLIC_RELAYER_URL (default http://localhost:8788) and NEXT_PUBLIC_DEMO_SHOP (required). */
export function readAttackConfig(
  env: { relayerUrl?: string | undefined; demoShop?: string | undefined },
  passLive: boolean,
): AttackConfigResult {
  const problems: string[] = [];
  const relayerUrl = parseRelayerUrl(env.relayerUrl?.trim() || DEFAULT_RELAYER_URL);
  if (!relayerUrl) problems.push("NEXT_PUBLIC_RELAYER_URL is not an http(s) URL.");
  const { demoShop } = readPayConfig({ demoShop: env.demoShop });
  if (!demoShop) problems.push("NEXT_PUBLIC_DEMO_SHOP isn't set to an address, so the bots have no shop to pay.");
  if (!relayerUrl || !demoShop) return { ok: false, problems };
  return { ok: true, config: { relayerUrl, demoShop, passLive } };
}

// ------------------------------------------------------------------ door states

export type DoorState =
  /** Not asked yet. */
  | { kind: "idle" }
  | { kind: "running" }
  /** 403 NOT_STAMPED: the defence worked. */
  | { kind: "refused" }
  /** 429 RATE_LIMIT: a second defence. */
  | { kind: "slowed" }
  /** Any 2xx: a bug, never hidden. txHash when the relayer sent one. */
  | { kind: "through"; txHash: Hex | null }
  /** Any other answer, e.g. "503 FUND_NOT_CONFIGURED". Not counted as a refusal. */
  | { kind: "other"; answer: string; txHash: Hex | null }
  /** No answer at all: nothing was tested. */
  | { kind: "network" };

export type Tone = "muted" | "ok" | "note" | "error";

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
/** Only a plain relayer code is shown, never free text from a response. */
const CODE = /^[A-Z][A-Z0-9_]{0,39}$/;

const is2xx = (status: number) => status >= 200 && status < 300;

/** Classifies a raw HTTP answer (POST /pass, which this page calls with its own fetch). */
export function doorFromAnswer(status: number, body: unknown): DoorState {
  const b = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const txHash = typeof b.txHash === "string" && TX_HASH.test(b.txHash) ? (b.txHash as Hex) : null;
  if (is2xx(status)) return { kind: "through", txHash };
  const raw = typeof b.reason === "string" ? b.reason : typeof b.error === "string" ? b.error : "";
  const code = CODE.test(raw) ? raw : null;
  if (status === 403 && code === "NOT_STAMPED") return { kind: "refused" };
  if (status === 429 && code === "RATE_LIMIT") return { kind: "slowed" };
  return { kind: "other", answer: code ? `${status} ${code}` : String(status), txHash };
}

/** Classifies what lib/relayer.ts threw for POST /fund or POST /pay (or anything else that went wrong). */
export function doorFromError(err: unknown): DoorState {
  if (!(err instanceof RelayerError)) return { kind: "other", answer: "error in this browser", txHash: null };
  // A 2xx whose body didn't parse (BAD_RESPONSE) still got through.
  if (is2xx(err.status)) return { kind: "through", txHash: err.txHash };
  if (err.status === 0) {
    if (err.code === "NETWORK") return { kind: "network" };
    // TIMEOUT: the request went out but no answer came, so we can't call it refused or untested.
    return { kind: "other", answer: err.code, txHash: null };
  }
  if (err.status === 403 && err.code === "NOT_STAMPED") return { kind: "refused" };
  if (err.status === 429 && err.code === "RATE_LIMIT") return { kind: "slowed" };
  const answer = err.code === "HTTP_ERROR" ? String(err.status) : `${err.status} ${err.code}`;
  return { kind: "other", answer, txHash: err.txHash };
}

/**
 * The copy and tone for one door cell (DESIGN_V2.md "/attack" states; SITE_SPEC.md door-state table for the tones).
 * "ok" means the defence worked. The per-minute limit behind "Slowed down" is in the page's Details (PER_MINUTE).
 */
export function doorCopy(_door: Door, s: DoorState): { text: string; tone: Tone } {
  switch (s.kind) {
    case "idle":
      return { text: "Not asked yet", tone: "muted" };
    case "running":
      return { text: "Asking…", tone: "muted" };
    case "refused":
      return { text: "Refused: no stamp", tone: "ok" };
    case "slowed":
      return { text: "Slowed down: too many tries (a second guard)", tone: "note" };
    case "through":
      return { text: "Got through. That's a bug.", tone: "error" };
    case "other":
      return { text: `Other answer: ${s.answer}`, tone: "muted" };
    case "network":
      return { text: "Can't reach our server", tone: "note" };
  }
}

/** The Details line about the second guard (jargon is fine there): the relayer's per-minute limits, from PER_MINUTE. */
export function limitLine(passLive: boolean): string {
  const calls = `${PER_MINUTE.fund} /fund and ${PER_MINUTE.pay} /pay calls${passLive ? `, and ${PER_MINUTE.pass} /pass calls,` : ""}`;
  return `The relayer allows ${calls} a minute per IP. More gets 429 RATE_LIMIT, shown as "Slowed down".`;
}

// ------------------------------------------------------------------ bots and the summary

export interface BotView {
  /** 1-based. */
  n: number;
  address: Address;
  doors: { door: Door; state: DoorState }[];
}

export interface AttackSummary {
  /** Requests that got an answer (network errors left out). */
  answered: number;
  /** Refused before any transaction was sent: 403 NOT_STAMPED plus 429 RATE_LIMIT. */
  refused: number;
  through: number;
  other: number;
  network: number;
}

export function summarize(bots: readonly BotView[]): AttackSummary {
  const s: AttackSummary = { answered: 0, refused: 0, through: 0, other: 0, network: 0 };
  for (const bot of bots)
    for (const { state } of bot.doors) {
      if (state.kind === "refused" || state.kind === "slowed") s.refused++;
      else if (state.kind === "through") s.through++;
      else if (state.kind === "other") s.other++;
      else if (state.kind === "network") s.network++;
      else continue;
      if (state.kind !== "network") s.answered++;
    }
  return s;
}

/**
 * The summary lines (DESIGN_V2.md: "{r} of {t} tries refused. $0 moved. $0 in fees."). "$0 moved. $0 in fees." only
 * when every answered request was refused: any other answer (a timeout, a 5xx) can't prove that. Network errors are
 * left out of the counts and named.
 */
export function summaryLines(s: AttackSummary): { text: string; tone: Tone }[] {
  const lines: { text: string; tone: Tone }[] = [];
  const t = s.answered;
  const refusedOfTotal = `${s.refused} of ${t} ${t === 1 ? "try" : "tries"} refused.`;
  if (s.through > 0) {
    lines.push({ text: `${s.through} got through. That's a bug.`, tone: "error" });
    lines.push({ text: refusedOfTotal, tone: "muted" });
  } else if (t > 0 && s.refused === t) {
    lines.push({ text: `${refusedOfTotal} $0 moved. $0 in fees.`, tone: "ok" });
  } else if (t > 0) {
    lines.push({ text: refusedOfTotal, tone: "muted" });
  }
  if (s.network > 0) lines.push({ text: `${s.network} couldn't reach our server.`, tone: "note" });
  return lines;
}

// ------------------------------------------------------------------ requests

/** Builds RequestOptions without undefined keys: postPay/postFund spread opts over their 90 s default timeout. */
function requestOptions(o: { fetch?: typeof fetch | undefined; signal?: AbortSignal | undefined; timeoutMs?: number | undefined }) {
  const opts: RequestOptions = {};
  if (o.fetch) opts.fetch = o.fetch;
  if (o.signal) opts.signal = o.signal;
  if (o.timeoutMs !== undefined) opts.timeoutMs = o.timeoutMs;
  return opts;
}

/**
 * POST /pass {wallet} with this page's own fetch (SITE_SPEC.md: /attack calls /pass itself). Returns the door state;
 * throws RelayerError ABORTED only when the caller's signal aborted.
 */
export async function postPass(relayerUrl: string, wallet: Address, opts: RequestOptions = {}): Promise<DoorState> {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, opts.timeoutMs ?? PAY_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await doFetch(`${relayerUrl}/pass`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet }),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
    } catch {
      if (timedOut) return { kind: "other", answer: "TIMEOUT", txHash: null };
      if (controller.signal.aborted) throw new RelayerError("ABORTED", 0);
      return { kind: "network" };
    }
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return doorFromAnswer(res.status, body);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/** GET /health: true when the relayer answers at all (any status), false when nothing comes back. */
export async function relayerReachable(relayerUrl: string, opts: RequestOptions = {}): Promise<boolean> {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? HEALTH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await doFetch(`${relayerUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

// ------------------------------------------------------------------ the run

export interface RunDeps {
  config: AttackConfig;
  /** Called with a new array after every change, for React state. */
  onUpdate?: (bots: readonly BotView[]) => void;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Request timeout; default lib/relayer.ts PAY_TIMEOUT_MS (the relayer waits for a receipt on success). */
  timeoutMs?: number;
  /** Bot key source; default viem generatePrivateKey. */
  newKey?: () => Hex;
  /** Clock for the authorization's validBefore. */
  nowMs?: () => number;
  /** EIP-3009 nonce source; default lib/pay.ts randomNonce. */
  nonce?: () => Hex;
}

type BotAccount = ReturnType<typeof privateKeyToAccount>;

async function knock(door: Door, account: BotAccount, deps: RunDeps): Promise<DoorState> {
  const { relayerUrl, demoShop } = deps.config;
  const opts = requestOptions(deps);
  try {
    switch (door) {
      case "fund": {
        const tx = await postFund(relayerUrl, account.address, opts);
        return { kind: "through", txHash: tx.txHash };
      }
      case "pay": {
        const intent = buildIntent({
          from: account.address,
          to: demoShop,
          value: BOT_PAY_UNITS,
          nowMs: (deps.nowMs ?? Date.now)(),
          nonce: (deps.nonce ?? randomNonce)(),
        });
        const tx = await postPay(relayerUrl, await signPayment(account, intent), opts);
        return { kind: "through", txHash: tx.txHash };
      }
      case "pass":
        return await postPass(relayerUrl, account.address, opts);
    }
  } catch (err) {
    return doorFromError(err);
  }
}

/**
 * Runs the bots one after another; each knocks on its doors in order (fund, pay, then pass when live). Stops quietly
 * when the signal aborts. Returns the final tiles.
 */
export async function runAttack(deps: RunDeps): Promise<BotView[]> {
  const doors = doorsFor(deps.config.passLive);
  let bots: BotView[] = [];
  const emit = () => deps.onUpdate?.(bots);
  const set = (i: number, door: Door, state: DoorState) => {
    bots = bots.map((b, j) => (j !== i ? b : { ...b, doors: b.doors.map((d) => (d.door === door ? { door, state } : d)) }));
    emit();
  };

  for (let i = 0; i < BOT_COUNT; i++) {
    if (deps.signal?.aborted) return bots;
    // The key exists only in this iteration: it signs one authorization and is dropped.
    const account = privateKeyToAccount((deps.newKey ?? generatePrivateKey)());
    bots = [...bots, { n: i + 1, address: account.address, doors: doors.map((door) => ({ door, state: { kind: "idle" } })) }];
    emit();
    for (const door of doors) {
      if (deps.signal?.aborted) return bots;
      set(i, door, { kind: "running" });
      const state = await knock(door, account, deps);
      if (deps.signal?.aborted) return bots;
      set(i, door, state);
    }
  }
  return bots;
}
