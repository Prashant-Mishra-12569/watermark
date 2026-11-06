/**
 * Prover HTTP API (interfaces F3). Request bodies, card fields and witnesses are never logged.
 * One proof at a time, with a short queue. Card data lives only in memory and is wiped after each job.
 */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { deriveUn, hashSession, recoverSessionSigner, type Envelope, type ProveError, type ProveJob } from "@watermark/sdk";
import { buildCircuitInputs, PolicyError, type InputMap } from "@watermark/zk";
import { OdaError } from "@watermark/testcard";
import type { Config } from "./config.ts";
import { openEnvelope } from "./envelope.ts";

export interface Proof {
  proof: `0x${string}`;
  publicInputs: `0x${string}`[];
  provingMs: number;
}

export interface AppDeps {
  config: Config;
  prove: (inputs: InputMap) => Promise<Proof>;
  /** Sends the proof to the relayer's POST /stamp and returns the tx hash. */
  stamp: (body: unknown) => Promise<`0x${string}`>;
  nowMs?: () => number;
}

interface Job extends ProveJob {
  sessionHash: string;
  createdAt: number;
}

const HEX = /^0x[0-9a-fA-F]*$/;

function parseEnvelope(body: unknown): Envelope | null {
  const b = body as Partial<Envelope> | null;
  const s = b?.session;
  if (!b || b.v !== 1 || !s) return null;
  const strings = [b.sig, b.ek, b.iv, b.ct, s.nonce, s.wallet, s.registry];
  if (strings.some((x) => typeof x !== "string" || !HEX.test(x))) return null;
  if (![s.appId, s.expiresAt, s.chainId].every((x) => typeof x === "string" && /^\d{1,78}$/.test(x))) return null;
  if (typeof s.validUntilMonth !== "number") return null;
  return b as Envelope;
}

const CARD_KEYS = [
  "aid", "un", "caIndex", "issuerCert", "issuerRem", "issuerExp", "iccCert", "iccRem", "iccExp", "staticData", "sdad", "termData",
] as const;
type CardFields = Record<(typeof CARD_KEYS)[number], string>;

/** The decrypted F2 payload: only the fields the circuit uses, all hex, lower-cased. */
function parseCard(plain: Buffer): CardFields {
  const c = JSON.parse(plain.toString("utf8")) as Record<string, unknown>;
  const out = {} as CardFields;
  for (const k of CARD_KEYS) {
    const v = c[k];
    if (typeof v !== "string" || !/^[0-9a-fA-F]*$/.test(v)) throw new Error("bad card field");
    out[k] = v.toLowerCase();
  }
  return out;
}

export function createApp(deps: AppDeps) {
  const { config } = deps;
  const nowMs = deps.nowMs ?? Date.now;
  const jobs = new Map<string, Job>();
  const bySession = new Set<string>();
  const queue: (() => Promise<void>)[] = [];
  let running = false;

  const pump = async () => {
    if (running) return;
    running = true;
    while (queue.length) await queue.shift()!();
    running = false;
  };

  const app = new Hono();
  app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST"] }));

  app.get("/health", (c) => c.json({ ok: true, apps: [...config.apps.keys()], queue: queue.length }));

  app.post("/prove", async (c) => {
    const env = parseEnvelope(await c.req.json().catch(() => null));
    if (!env) return c.json({ error: "BAD_ENVELOPE" }, 400);
    const s = env.session;

    if (Number(s.expiresAt) <= Math.floor(nowMs() / 1000)) return c.json({ error: "SESSION_EXPIRED" }, 410);
    let signer: string;
    try {
      signer = await recoverSessionSigner({ session: s, sig: env.sig });
    } catch {
      return c.json({ error: "BAD_SESSION_SIG" }, 401);
    }
    if (!config.sessionSigners.has(signer)) return c.json({ error: "BAD_SESSION_SIG" }, 401);
    if (!config.apps.has(s.appId)) return c.json({ error: "BAD_ENVELOPE", message: "unknown app" }, 400);

    const sessionHash = hashSession(s);
    if (bySession.has(sessionHash)) return c.json({ error: "SESSION_USED" }, 409);
    if (queue.length >= config.maxQueue) return c.json({ error: "BUSY" }, 503);

    // Decrypt now so a wrong key, moved ciphertext or wrong UN is refused synchronously (F3).
    let plain: Buffer;
    try {
      plain = openEnvelope(env, config.decryptKey);
    } catch {
      return c.json({ error: "BAD_ENVELOPE", message: "decryption failed" }, 400);
    }
    let card: CardFields;
    try {
      card = parseCard(plain);
    } catch {
      plain.fill(0);
      return c.json({ error: "BAD_ENVELOPE" }, 400);
    }
    plain.fill(0);
    if (card.un !== deriveUn(s.nonce) || !card.termData.startsWith(card.un)) return c.json({ error: "UN_MISMATCH" }, 422);

    bySession.add(sessionHash);
    const jobId = randomUUID();
    const job: Job = { status: "queued", sessionHash, createdAt: nowMs() };
    jobs.set(jobId, job);

    queue.push(async () => {
      job.status = "running";
      try {
        const caIndex = config.caIndexByKey.get(`${card.aid.slice(0, 10).toUpperCase()}:${card.caIndex.toUpperCase()}`);
        if (caIndex === undefined) throw new PolicyError("UNSUPPORTED_CARD");
        const app = config.apps.get(s.appId)!;
        const built = buildCircuitInputs({
          tap: card,
          caIndex,
          cas: config.cas,
          rules: app.rules,
          appId: app.appId,
          validUntilMonth: s.validUntilMonth,
        });
        const proof = await deps.prove(built.inputs);
        if (!config.demoMode) console.log(`proved in ${proof.provingMs} ms`);
        job.txHash = await deps.stamp({ session: s, sig: env.sig, proof: proof.proof, publicInputs: proof.publicInputs });
        job.status = "done";
      } catch (e) {
        job.status = "error";
        job.error = errorCode(e);
      } finally {
        // Best effort: drop every reference to the card data. JS strings can't be zeroed.
        for (const k of CARD_KEYS) card[k] = "";
      }
    });
    void pump();
    return c.json({ jobId }, 202);
  });

  app.get("/prove/:jobId", (c) => {
    const job = jobs.get(c.req.param("jobId"));
    if (!job) return c.json({ error: "NOT_FOUND" }, 404);
    const { status, txHash, error } = job;
    return c.json({ status, ...(txHash ? { txHash } : {}), ...(error ? { error } : {}) });
  });

  return app;
}

function errorCode(e: unknown): ProveError {
  if (e instanceof PolicyError) {
    if (e.code === "NOT_IN_POLICY") return "NOT_IN_POLICY";
    if (e.code === "EXPIRES_TOO_SOON") return "EXPIRES_TOO_SOON";
    return "BAD_CARD";
  }
  if (e instanceof OdaError) return "BAD_CARD";
  if (e instanceof Error && e.message.startsWith("STAMP_")) return "STAMP_REJECTED";
  return "BAD_CARD";
}
