import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount } from "viem/accounts";
import { deriveUn, recoverSessionSigner, type Session } from "@watermark/sdk";
import { createApp, shortWallet } from "./app.ts";
import { loadConfig } from "./config.ts";
import type { ChainReader } from "./chain.ts";

// Throwaway test key, not used anywhere real.
const SIGNER_KEY = `0x${"42".repeat(32)}` as const;
const SIGNER = privateKeyToAccount(SIGNER_KEY).address;
const REGISTRY = "0x00000000000000000000000000000000000000AA";
const WALLET = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);

function makeApp(env: Record<string, string> = {}, chain?: ChainReader) {
  const config = loadConfig({
    SESSION_SIGNER_KEY: SIGNER_KEY,
    PROVER_URL: "http://192.168.1.2:8787",
    APP_IDS: "42",
    REGISTRY_ADDRESS: REGISTRY,
    SESSIONS_PER_MINUTE_PER_IP: "3",
    ...env,
  });
  return createApp({
    config,
    chain: chain ?? { status: async () => ({ stamped: true, expiresAt: 1800000000, quotaLeft: 20 }) },
    clientIp: () => "10.0.0.1",
    nowMs: () => NOW,
  });
}

const post = (app: ReturnType<typeof makeApp>, body: unknown) =>
  app.request("/session", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

test("POST /session returns a session signed by the session signer, and a matching QR", async () => {
  const app = makeApp();
  const res = await post(app, { wallet: WALLET.toLowerCase(), appId: "42", chainId: "1874" });
  assert.equal(res.status, 200);
  const { session, sig, qr, sessionId } = (await res.json()) as { session: Session; sig: `0x${string}`; qr: string; sessionId: string };

  assert.equal(session.wallet, WALLET); // EIP-55 on output (F0)
  assert.equal(session.appId, "42");
  assert.equal(session.chainId, "1874");
  assert.equal(session.registry, REGISTRY);
  assert.equal(session.expiresAt, String(NOW / 1000 + 600));
  assert.equal(session.validUntilMonth, 325); // Nov 2026 = 322, + 3
  assert.match(session.nonce, /^0x[0-9a-f]{64}$/);
  assert.equal(deriveUn(session.nonce).length, 8);
  assert.equal(await recoverSessionSigner({ session, sig }), SIGNER);

  const url = new URL(qr);
  assert.equal(url.searchParams.get("n"), session.nonce);
  assert.equal(url.searchParams.get("r"), REGISTRY);
  assert.equal(url.searchParams.get("p"), "http://192.168.1.2:8787");

  const again = await app.request(`/session/${sessionId}`);
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { session, sig });
});

test("POST /session refuses bad input, unknown apps and chains without a registry", async () => {
  const app = makeApp({ SESSIONS_PER_MINUTE_PER_IP: "100" });
  assert.equal((await post(app, { wallet: "0x123", appId: "42", chainId: "1874" })).status, 400);
  assert.equal((await post(app, { wallet: WALLET, appId: 42, chainId: "1874" })).status, 400); // F0: decimal string
  assert.equal((await post(app, { wallet: WALLET, appId: (1n << 248n).toString(), chainId: "1874" })).status, 400);
  assert.equal((await post(app, { wallet: WALLET, appId: "42", chainId: "1" })).status, 400);
  assert.equal((await post(app, { wallet: WALLET, appId: "7", chainId: "1874" })).status, 404);
  const devnet = await post(app, { wallet: WALLET, appId: "42", chainId: "1337" });
  assert.equal(devnet.status, 503);
  assert.equal(((await devnet.json()) as { error: string }).error, "CHAIN_NOT_READY");
});

test("POST /session is rate-limited per IP", async () => {
  const app = makeApp();
  const body = { wallet: WALLET, appId: "42", chainId: "1874" };
  for (let i = 0; i < 3; i++) assert.equal((await post(app, body)).status, 200);
  assert.equal((await post(app, body)).status, 429);
});

test("GET /session/:id is 404 for an unknown id", async () => {
  assert.equal((await makeApp().request("/session/nope")).status, 404);
});

test("GET /status reads the chain and validates its query", async () => {
  const app = makeApp();
  const ok = await app.request(`/status/${WALLET}?app=42&chain=1874`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { stamped: true, expiresAt: 1800000000, quotaLeft: 20 });
  assert.equal((await app.request(`/status/${WALLET}?app=42&chain=5`)).status, 400);
  assert.equal((await app.request(`/status/nope?app=42&chain=1874`)).status, 400);
  assert.equal((await app.request(`/status/${WALLET}?app=42&chain=1337`)).status, 503);

  const down = makeApp({}, { status: async () => { throw new Error("rpc down"); } });
  assert.equal((await down.request(`/status/${WALLET}?app=42&chain=1874`)).status, 502);
});

test("config refuses to start without its secrets", () => {
  assert.throws(() => loadConfig({ PROVER_URL: "x", APP_IDS: "1" }), /SESSION_SIGNER_KEY/);
  assert.throws(() => loadConfig({ SESSION_SIGNER_KEY: SIGNER_KEY, APP_IDS: "1" }), /PROVER_URL/);
  assert.throws(() => loadConfig({ SESSION_SIGNER_KEY: SIGNER_KEY, PROVER_URL: "x" }), /APP_IDS/);
});

test("logs only ever see a truncated wallet", () => {
  assert.equal(shortWallet(WALLET), "0x89…a776");
});
