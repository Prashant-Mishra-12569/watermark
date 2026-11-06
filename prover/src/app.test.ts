import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { type Session } from "@watermark/sdk";
import { initHash } from "@watermark/zk";
import { signSessionDev, DEV_SESSION_SIGNER } from "../../sdk/src/dev.ts";
import { createApp, type AppDeps } from "./app.ts";
import type { Config } from "./config.ts";
import { sealEnvelope } from "./envelope.ts";

const fixture = JSON.parse(readFileSync(new URL("../../tools/testcard/fixtures/rupay-768.json", import.meta.url), "utf8"));
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
const NOW = Date.UTC(2026, 10, 6) ; // 6 Nov 2026

// The fixture card signed the UN of this nonce (0x11…11 → 02d449a3).
const session = (over: Partial<Session> = {}): Session => ({
  wallet: "0x00000000000000000000000000000000000ab1e5",
  appId: "12345",
  nonce: `0x${"11".repeat(32)}`,
  expiresAt: String(NOW / 1000 + 600),
  validUntilMonth: 325,
  chainId: "1874",
  registry: "0x0000000000000000000000000000000000000001",
  ...over,
});

const config = (rules = [{ networkId: 1, prefixLength: 6 as const, prefix: "990001" }]): Config => ({
  port: 0,
  decryptKey: privateKey,
  circuitPath: "",
  relayerUrl: undefined,
  sessionSigners: new Set([DEV_SESSION_SIGNER]),
  cas: [{ networkId: 1, modulus: fixture.caModulus }],
  caIndexByKey: new Map([[`A000000524:${fixture.caIndex}`, 0]]),
  apps: new Map([["12345", { appId: 12345n, rules }]]),
  maxQueue: 3,
  demoMode: true,
});

function harness(cfg = config()) {
  const proved: unknown[] = [];
  const stamped: unknown[] = [];
  const deps: AppDeps = {
    config: cfg,
    nowMs: () => NOW,
    prove: async (inputs) => {
      proved.push(inputs);
      return { proof: "0xabcd", publicInputs: ["0x01"], provingMs: 1 };
    },
    stamp: async (body) => {
      stamped.push(body);
      return "0x" + "77".repeat(32) as `0x${string}`;
    },
  };
  return { app: createApp(deps), proved, stamped };
}

const card = (un = fixture.card.un as string) => Buffer.from(JSON.stringify({ ...fixture.card, un, termData: un }));

async function post(app: ReturnType<typeof createApp>, body: unknown) {
  const res = await app.request("/prove", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
  return { status: res.status, json: (await res.json()) as Record<string, string> };
}

async function waitJob(app: ReturnType<typeof createApp>, id: string) {
  for (let i = 0; i < 100; i++) {
    const j = (await (await app.request(`/prove/${id}`)).json()) as Record<string, string>;
    if (j.status === "done" || j.status === "error") return j;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("job never finished");
}

before(initHash);

test("a valid envelope is decrypted, proved and stamped", async () => {
  const h = harness();
  const s = session();
  const { sig } = await signSessionDev(s);
  const r = await post(h.app, sealEnvelope(s, sig, card(), publicKey));
  assert.equal(r.status, 202);
  const job = await waitJob(h.app, r.json.jobId!);
  assert.equal(job.status, "done");
  assert.equal(job.txHash, "0x" + "77".repeat(32));
  assert.equal(h.proved.length, 1);
  const inputs = h.proved[0] as Record<string, unknown>;
  assert.equal(inputs.un, "0x02d449a3");
  assert.equal(inputs.app_id, "0x" + (12345).toString(16).padStart(64, "0"));
});

test("the same session can only be used once", async () => {
  const h = harness();
  const s = session();
  const { sig } = await signSessionDev(s);
  assert.equal((await post(h.app, sealEnvelope(s, sig, card(), publicKey))).status, 202);
  assert.equal((await post(h.app, sealEnvelope(s, sig, card(), publicKey))).json.error, "SESSION_USED");
});

test("a session from another signer is refused", async () => {
  const h = harness();
  const s = session();
  const { sig } = await signSessionDev(s, "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const r = await post(h.app, sealEnvelope(s, sig, card(), publicKey));
  assert.equal(r.status, 401);
  assert.equal(r.json.error, "BAD_SESSION_SIG");
});

test("an expired session is refused", async () => {
  const h = harness();
  const s = session({ expiresAt: String(NOW / 1000 - 1) });
  const { sig } = await signSessionDev(s);
  assert.equal((await post(h.app, sealEnvelope(s, sig, card(), publicKey))).status, 410);
});

test("a ciphertext moved to another session fails to decrypt", async () => {
  const h = harness();
  const a = session();
  const b = session({ wallet: "0x00000000000000000000000000000000000bad00" });
  const sa = await signSessionDev(a);
  const sb = await signSessionDev(b);
  const moved = { ...sealEnvelope(a, sa.sig, card(), publicKey), session: b, sig: sb.sig };
  const r = await post(h.app, moved);
  assert.equal(r.status, 400);
  assert.equal(r.json.message, "decryption failed");
  assert.equal(h.proved.length, 0);
});

test("card data with another session's UN is refused", async () => {
  const h = harness();
  const s = session({ nonce: `0x${"22".repeat(32)}` });
  const { sig } = await signSessionDev(s);
  const r = await post(h.app, sealEnvelope(s, sig, card(), publicKey));
  assert.equal(r.status, 422);
  assert.equal(r.json.error, "UN_MISMATCH");
});

test("a card outside the app's filter ends in NOT_IN_POLICY and is never proved", async () => {
  const h = harness(config([{ networkId: 1, prefixLength: 6, prefix: "123456" }]));
  const s = session();
  const { sig } = await signSessionDev(s);
  const r = await post(h.app, sealEnvelope(s, sig, card(), publicKey));
  const job = await waitJob(h.app, r.json.jobId!);
  assert.equal(job.error, "NOT_IN_POLICY");
  assert.equal(h.proved.length, 0);
});

test("garbage is refused without detail", async () => {
  const h = harness();
  assert.equal((await post(h.app, { v: 1 })).json.error, "BAD_ENVELOPE");
});
