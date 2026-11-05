/** HTTP routes (interfaces F6). Request bodies are never logged. */
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { bytesToHex, getAddress, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  buildDeepLink,
  SESSION_TTL_SECONDS,
  sessionTypedData,
  sessionValidUntilMonth,
  type Session,
  type StampStatus,
} from "@watermark/sdk";
import type { Config } from "./config.ts";
import { RateLimiter, SessionStore } from "./limits.ts";
import type { ChainReader } from "./chain.ts";

export interface AppDeps {
  config: Config;
  chain: ChainReader;
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

  app.get("/health", (c) => c.json({ ok: true, sessionSigner: signer.address }));

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
    return c.json({ session, sig, qr: buildDeepLink(session, sig, config.proverUrl), sessionId });
  });

  /** F6: GET /session/:id → { session, sig }. The QR fallback. */
  app.get("/session/:id", (c) => {
    const s = store.get(c.req.param("id"));
    if (!s) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(s);
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
  if (!isUint248(b.appId)) return { error: "appId must be a 248-bit decimal string" };
  if (typeof b.chainId !== "string" || !/^\d+$/.test(b.chainId)) return { error: "chainId must be a decimal string" };
  const chainId = Number(b.chainId);
  if (chainId !== 1874 && chainId !== 1337) return { error: "chainId must be 1874 or 1337" };
  // Normalise to a canonical decimal (no leading zeros) so the signed value and the QR agree.
  return { wallet: getAddress(b.wallet), appId: BigInt(b.appId).toString(), chainId };
}
