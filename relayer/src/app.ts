/** HTTP routes (interfaces F6). Request bodies are never logged. */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { bytesToHex, getAddress, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildVerifyLink,
  SESSION_TTL_SECONDS,
  sessionTypedData,
  sessionValidUntilMonth,
  type Session,
  type StampStatus,
} from "@watermark/sdk";
import type { Config } from "./config.ts";
import { RateLimiter, SessionStore } from "./limits.ts";
import type { ChainReader } from "./chain.ts";
import { MAX_STAMP_BODY_BYTES, parseStampRequest, StampService, TxQueues, type ChainWriter } from "./stamp.ts";
import {
  FundService,
  MAX_PAY_BODY_BYTES,
  parsePayRequest,
  PayService,
  SponsorDirectory,
  type FundWriter,
  type PayChain,
  type PayOutcome,
  type PayReader,
  type PayWriter,
} from "./pay.ts";
import { formatUsdt } from "./usdt.ts";

export interface AppDeps {
  config: Config;
  chain: ChainReader;
  /** Pays gas for POST /stamp. null/absent = /stamp answers 503 RELAYER_NOT_CONFIGURED. */
  writer?: ChainWriter | null;
  /** Chain reads for /pay, /fund and /balance. Absent = those routes answer 503 SPONSOR_NOT_CONFIGURED. */
  payReader?: PayReader | null;
  /** Pays gas for POST /pay (the same relayer key as `writer`). null/absent = /pay answers 503 RELAYER_NOT_CONFIGURED. */
  payWriter?: PayWriter | null;
  /** The business key for POST /fund. null/absent = /fund answers 503 FUND_NOT_CONFIGURED. */
  funder?: FundWriter | null;
  /** Client IP for rate limiting. Never trust X-Forwarded-For: there is no proxy in front. */
  clientIp: (c: Context) => string;
  nowMs?: () => number;
  randomBytes?: (n: number) => Uint8Array;
}

/** `0x12…abcd`: the only form of a wallet that may appear in logs. */
export function shortWallet(w: string): string {
  return w.length > 10 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w;
}

export function createApp(deps: AppDeps) {
  const { config, chain } = deps;
  const nowMs = deps.nowMs ?? Date.now;
  const randomBytes = deps.randomBytes ?? ((n: number) => crypto.getRandomValues(new Uint8Array(n)));
  const signer = privateKeyToAccount(config.sessionSignerKey);
  const limiter = new RateLimiter(config.sessionsPerMinutePerIp, nowMs);
  const store = new SessionStore(config.maxOpenSessions, () => Math.floor(nowMs() / 1000));
  const stampLimiter = new RateLimiter(config.stamp.perMinutePerIp, nowMs);
  // One send queue per chain for the relayer key, shared by stamps and payments (no nonce clashes between them).
  const txQueues = new TxQueues(config.stamp.maxQueue);
  const stamps = deps.writer
    ? new StampService(
        {
          appIds: config.appIds,
          chains: config.chains,
          sessionSigner: signer.address,
          budgetWei: config.stamp.budgetWei,
          maxGas: config.stamp.maxGas,
          maxQueue: config.stamp.maxQueue,
          receiptTimeoutMs: config.stamp.receiptTimeoutMs,
        },
        deps.writer,
        nowMs,
        txQueues,
      )
    : null;

  // Payments run on the chain that has a sponsor (Whitechain Sepolia; the devnet has none).
  const payChainCfg = [...config.chains.values()].find((c) => c.sponsor && c.usdt);
  const payChain = payChainCfg ? (payChainCfg as PayChain) : null;
  const sponsor = payChain && deps.payReader ? new SponsorDirectory(deps.payReader, payChain) : null;
  const pays =
    sponsor && deps.payReader && deps.payWriter
      ? new PayService(
          {
            maxGas: config.pay.maxGas,
            budgetWei: config.pay.budgetWei,
            receiptTimeoutMs: config.stamp.receiptTimeoutMs,
            maxRevertsPerWallet: config.pay.maxRevertsPerWallet,
          },
          sponsor,
          deps.payReader,
          deps.payWriter,
          txQueues,
          nowMs,
        )
      : null;
  const funds =
    sponsor && deps.funder
      ? new FundService(
          { amount: config.pay.demoFund, receiptTimeoutMs: config.stamp.receiptTimeoutMs, maxQueue: config.stamp.maxQueue },
          sponsor,
          deps.funder,
        )
      : null;
  const payLimiter = new RateLimiter(config.pay.perMinutePerIp, nowMs);
  const fundLimiter = new RateLimiter(config.pay.perMinutePerIp, nowMs);

  const refuse = (reason: string, wallet?: string) => {
    if (!config.demoMode) console.warn(`refused ${reason}${wallet ? ` ${shortWallet(wallet)}` : ""}`);
  };

  const app = new Hono();
  app.use("*", cors({ origin: config.corsOrigins, allowMethods: ["GET", "POST"] }));
  if (!config.demoMode) {
    app.use("*", async (c, next) => {
      await next();
      console.log(`${c.req.method} ${c.req.routePath} ${c.res.status}`);
    });
  }

  app.get("/health", (c) =>
    c.json({
      ok: true,
      sessionSigner: signer.address,
      relayer: deps.writer?.address ?? null,
      sponsor: payChain?.sponsor ?? null,
      business: deps.funder?.address ?? null,
    }),
  );

  /** A refusal or failure from pay.ts: log the reason and a truncated wallet, answer the outcome. */
  const answer = (c: Context, out: PayOutcome, wallet: string, okLog: string) => {
    if (out.logReason) refuse(out.logReason, wallet);
    else if (!config.demoMode) console.log(`${okLog} ${shortWallet(wallet)}`);
    return c.json(out.body, out.status);
  };
  const fail = (c: Context, status: 400 | 429 | 500 | 502 | 503, reason: string, extra: Record<string, string> = {}, wallet?: string) => {
    refuse(reason, wallet);
    return c.json({ reason, error: reason, ...extra }, status);
  };

  /** F6: POST /session { wallet, appId, chainId } → { session, sig, qr, sessionId }. No gas. */
  app.post("/session", async (c) => {
    if (!limiter.allow(deps.clientIp(c))) {
      refuse("RATE_LIMIT");
      return c.json({ error: "RATE_LIMIT" }, 429);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = parseSessionRequest(body);
    if ("error" in parsed) return c.json({ error: "BAD_REQUEST", message: parsed.error }, 400);
    const { wallet, appId, chainId } = parsed;

    if (!config.appIds.has(appId)) {
      refuse("UNKNOWN_APP", wallet);
      return c.json({ error: "UNKNOWN_APP" }, 404);
    }
    const chainCfg = config.chains.get(chainId);
    if (!chainCfg?.registry) return c.json({ error: "CHAIN_NOT_READY", message: "no registry on this chain yet" }, 503);

    const now = new Date(nowMs());
    const session: Session = {
      wallet,
      appId,
      nonce: bytesToHex(randomBytes(32)),
      expiresAt: String(Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS),
      validUntilMonth: sessionValidUntilMonth(now),
      chainId: String(chainId),
      registry: chainCfg.registry,
    };
    const sig = await signer.signTypedData(sessionTypedData(session));
    const sessionId = Buffer.from(randomBytes(16)).toString("base64url");
    if (!store.put(sessionId, { session, sig })) {
      refuse("BUSY", wallet);
      return c.json({ error: "BUSY" }, 503);
    }
    return c.json({ session, sig, qr: buildVerifyLink({ session, sig }, config.proverUrl), sessionId });
  });

  /** F6: GET /session/:id → { session, sig }. The QR fallback. */
  app.get("/session/:id", (c) => {
    const s = store.get(c.req.param("id"));
    if (!s) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(s);
  });

  /**
   * F6: POST /stamp { session, sig, proof, publicInputs } → { txHash }. Simulates first: a refused stamp spends no gas.
   * Called by the prover once a proof verifies (spec K layer 1). See stamp.ts for the flow and every refusal.
   */
  app.post(
    "/stamp",
    bodyLimit({ maxSize: MAX_STAMP_BODY_BYTES, onError: (c) => c.json({ error: "BAD_REQUEST", message: "body too large" }, 413) }),
    async (c) => {
      if (!stamps) return c.json({ error: "RELAYER_NOT_CONFIGURED" }, 503);
      if (!stampLimiter.allow(deps.clientIp(c))) {
        refuse("RATE_LIMIT");
        return c.json({ error: "RATE_LIMIT" }, 429);
      }
      const body = await c.req.json().catch(() => null);
      const parsed = parseStampRequest(body);
      if ("error" in parsed) {
        refuse("BAD_REQUEST");
        return c.json({ error: "BAD_REQUEST", message: parsed.error }, 400);
      }
      const wallet = parsed.session.wallet;
      try {
        const out = await stamps.handle(parsed);
        if (out.logReason) refuse(out.logReason, wallet);
        else if (!config.demoMode) console.log(`stamped ${shortWallet(wallet)}`);
        return c.json(out.body, out.status);
      } catch {
        refuse("INTERNAL", wallet);
        return c.json({ error: "INTERNAL" }, 500);
      }
    },
  );

  /**
   * F6: POST /pay { intent, signature } → { txHash } | 4xx/5xx { reason }. A gasless USDT payment: the relayer calls
   * WatermarkSponsor.relayPayment and pays the gas. See pay.ts for the flow and every refusal.
   */
  app.post(
    "/pay",
    bodyLimit({ maxSize: MAX_PAY_BODY_BYTES, onError: (c) => c.json({ reason: "BAD_REQUEST", error: "BAD_REQUEST", message: "body too large" }, 413) }),
    async (c) => {
      if (!sponsor) return fail(c, 503, "SPONSOR_NOT_CONFIGURED");
      if (!pays) return fail(c, 503, "RELAYER_NOT_CONFIGURED");
      if (config.pay.paused) return fail(c, 503, "PAUSED");
      const body = await c.req.json().catch(() => null);
      const parsed = parsePayRequest(body, Math.floor(nowMs() / 1000), config.pay.maxValue);
      if ("error" in parsed) return fail(c, 400, "BAD_REQUEST", { message: parsed.error });
      const wallet = parsed.intent.from;
      if (!payLimiter.allow(deps.clientIp(c))) return fail(c, 429, "RATE_LIMIT", {}, wallet);
      try {
        return answer(c, await pays.handle(parsed), wallet, "paid");
      } catch {
        return fail(c, 500, "INTERNAL", {}, wallet);
      }
    },
  );

  /** POST /fund { wallet } → { txHash }. Demo funding: the business sends DEMO_FUND_USDT to a stamped wallet, once. */
  app.post(
    "/fund",
    bodyLimit({ maxSize: 1024, onError: (c) => c.json({ reason: "BAD_REQUEST", error: "BAD_REQUEST", message: "body too large" }, 413) }),
    async (c) => {
      if (!deps.funder) return fail(c, 503, "FUND_NOT_CONFIGURED");
      if (!funds) return fail(c, 503, "SPONSOR_NOT_CONFIGURED");
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
      const w = body && typeof body === "object" ? body.wallet : undefined;
      if (typeof w !== "string" || !isAddress(w) || BigInt(w) === 0n)
        return fail(c, 400, "BAD_REQUEST", { message: "wallet must be a non-zero address" });
      const wallet = getAddress(w);
      if (!fundLimiter.allow(deps.clientIp(c))) return fail(c, 429, "RATE_LIMIT", {}, wallet);
      try {
        return answer(c, await funds.handle(wallet), wallet, "funded");
      } catch {
        return fail(c, 500, "INTERNAL", {}, wallet);
      }
    },
  );

  /**
   * GET /balance/:wallet → { usdt: "1.5", quotaLeft }. quotaLeft is 0 when the wallet is not stamped in the sponsor's
   * app, has used its reverted-relay allowance, or when no sponsor is configured yet.
   */
  app.get("/balance/:wallet", async (c) => {
    const w = c.req.param("wallet");
    if (!isAddress(w)) return c.json({ reason: "BAD_REQUEST", error: "BAD_REQUEST", message: "wallet" }, 400);
    const wallet = getAddress(w);
    const usdtChain = [...config.chains.values()].find((x) => x.usdt);
    if (!deps.payReader || !usdtChain?.usdt) return fail(c, 503, "SPONSOR_NOT_CONFIGURED");
    const reader = deps.payReader;
    const quota = async (): Promise<number> => {
      if (!sponsor || !payChain) return 0;
      if (pays?.revertLimitReached(wallet)) return 0;
      if (!(await sponsor.isStamped(wallet))) return 0;
      return reader.quotaLeft(payChain, wallet);
    };
    try {
      const [units, quotaLeft] = await Promise.all([reader.usdtBalance({ ...usdtChain, usdt: usdtChain.usdt }, wallet), quota()]);
      return c.json({ usdt: formatUsdt(units), quotaLeft });
    } catch {
      return c.json({ reason: "CHAIN_UNAVAILABLE", error: "CHAIN_UNAVAILABLE" }, 502);
    }
  });

  /** F6: GET /status/:wallet?app=<appId>&chain=<chainId> → { stamped, expiresAt, quotaLeft }. Reads the chain. */
  app.get("/status/:wallet", async (c) => {
    const wallet = c.req.param("wallet");
    const appId = c.req.query("app") ?? "";
    const chainId = Number(c.req.query("chain"));
    if (!isAddress(wallet)) return c.json({ error: "BAD_REQUEST", message: "wallet" }, 400);
    if (!isUint248(appId)) return c.json({ error: "BAD_REQUEST", message: "app" }, 400);
    const chainCfg = config.chains.get(chainId);
    if (!chainCfg) return c.json({ error: "BAD_REQUEST", message: "chain" }, 400);
    if (!chainCfg.registry) return c.json({ error: "CHAIN_NOT_READY", message: "no registry on this chain yet" }, 503);
    try {
      const status: StampStatus = await chain.status(chainCfg, getAddress(wallet), BigInt(appId));
      return c.json(status);
    } catch {
      return c.json({ error: "CHAIN_UNAVAILABLE" }, 502);
    }
  });

  return app;
}

function isUint248(s: unknown): s is string {
  return typeof s === "string" && /^\d{1,75}$/.test(s) && BigInt(s) < 1n << 248n;
}

function parseSessionRequest(
  body: unknown,
): { wallet: Address; appId: string; chainId: number } | { error: string } {
  if (!body || typeof body !== "object") return { error: "body must be JSON" };
  const b = body as Record<string, unknown>;
  if (typeof b.wallet !== "string" || !isAddress(b.wallet)) return { error: "wallet must be an address" };
  // The registry refuses a stamp for address(0) (ZeroWallet: it is also its "unbound nullifier" marker), so a session
  // for it could never be used. Refused here, before anything is signed.
  if (BigInt(b.wallet) === 0n) return { error: "wallet must not be the zero address" };
  if (!isUint248(b.appId)) return { error: "appId must be a 248-bit decimal string" };
  if (typeof b.chainId !== "string" || !/^\d+$/.test(b.chainId)) return { error: "chainId must be a decimal string" };
  const chainId = Number(b.chainId);
  if (chainId !== 1874 && chainId !== 1337) return { error: "chainId must be 1874 or 1337" };
  // Normalise to a canonical decimal (no leading zeros) so the signed value and the QR agree.
  return { wallet: getAddress(b.wallet), appId: BigInt(b.appId).toString(), chainId };
}
