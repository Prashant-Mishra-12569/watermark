import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ContractFunctionExecutionError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  HttpRequestError,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { recoverSessionSigner, sessionTypedData, type Session } from "@watermark/sdk";
import { registryAbi } from "./abi.ts";
import { createApp } from "./app.ts";
import { revertReason } from "./chain.ts";
import { loadConfig } from "./config.ts";
import {
  DailyBudget,
  gasLimitFor,
  isCanonicalSignature,
  parseStampRequest,
  SECP256K1_HALF_N,
  SerialQueue,
  StampRejected,
  type ChainWriter,
  type StampCall,
  type StampFees,
  type StampReceipt,
} from "./stamp.ts";

// Throwaway test keys, not used anywhere real.
const SIGNER_KEY = `0x${"42".repeat(32)}` as const;
const OTHER_KEY = `0x${"43".repeat(32)}` as const;
const RELAYER = "0x00000000000000000000000000000000000000EE" as Address;
const REGISTRY = "0x00000000000000000000000000000000000000AA" as Address;
const WALLET = "0x8943545177806ED17B9F23F0a21ee5948eCaa776" as Address;
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const GWEI = 1_000_000_000n;
const TX = `0x${"ab".repeat(32)}` as Hex;

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/** The malleable twin of a signature: s' = n - s, v flipped. Recovers to the same address. */
function highS(sig: Hex): Hex {
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = Number.parseInt(sig.slice(130, 132), 16);
  const flipped = v === 27 ? 28 : v === 28 ? 27 : v ^ 1;
  return `${sig.slice(0, 66)}${(SECP256K1_N - s).toString(16).padStart(64, "0")}${flipped.toString(16).padStart(2, "0")}` as Hex;
}

// ------------------------------------------------------------------ fakes

interface FakeOptions {
  simulate?: (call: StampCall) => Promise<void>;
  estimate?: bigint | (() => Promise<bigint>);
  fees?: StampFees;
  send?: (call: StampCall, gas: bigint) => Promise<Hex>;
  receipt?: (hash: Hex) => Promise<StampReceipt>;
}

function fakeWriter(o: FakeOptions = {}) {
  const log: string[] = [];
  const sent: { call: StampCall; gas: bigint; fees: StampFees }[] = [];
  let n = 0;
  const writer: ChainWriter = {
    address: RELAYER,
    async simulate(call) {
      log.push("simulate");
      await o.simulate?.(call);
    },
    async estimateGas() {
      log.push("estimate");
      return typeof o.estimate === "function" ? o.estimate() : (o.estimate ?? 2_500_000n);
    },
    async fees() {
      return o.fees ?? { maxFeePerGas: 5n * GWEI, maxPriorityFeePerGas: 1n };
    },
    async send(call, gas, fees) {
      log.push("send");
      sent.push({ call, gas, fees });
      if (o.send) return o.send(call, gas);
      return `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
    },
    async waitForReceipt(_c, hash) {
      log.push("receipt");
      return o.receipt ? o.receipt(hash) : { status: "success", costWei: 2_500_000n * 5n * GWEI };
    },
  };
  return { writer, log, sent };
}

function makeApp(env: Record<string, string> = {}, writer?: ChainWriter | null, now: () => number = () => NOW) {
  const config = loadConfig({
    SESSION_SIGNER_KEY: SIGNER_KEY,
    PROVER_URL: "http://192.168.1.2:8787",
    APP_IDS: "42",
    REGISTRY_ADDRESS: REGISTRY,
    STAMPS_PER_MINUTE_PER_IP: "1000",
    ...env,
  });
  return createApp({
    config,
    chain: { status: async () => ({ stamped: false, expiresAt: 0, quotaLeft: 0 }) },
    writer,
    clientIp: () => "10.0.0.1",
    nowMs: now,
  });
}

function session(over: Partial<Session> = {}): Session {
  return {
    wallet: WALLET,
    appId: "42",
    nonce: `0x${"11".repeat(32)}`,
    expiresAt: String(NOW / 1000 + 600),
    validUntilMonth: 325,
    chainId: "1874",
    registry: REGISTRY,
    ...over,
  };
}

async function body(over: Partial<Session> = {}, key: Hex = SIGNER_KEY) {
  const s = session(over);
  const sig = await privateKeyToAccount(key).signTypedData(sessionTypedData(s));
  return {
    session: s,
    sig,
    proof: `0x${"cd".repeat(64)}`,
    publicInputs: Array.from({ length: 6 }, (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}`),
  };
}

const post = (app: ReturnType<typeof makeApp>, b: unknown) =>
  app.request("/stamp", {
    method: "POST",
    body: typeof b === "string" ? b : JSON.stringify(b),
    headers: { "content-type": "application/json" },
  });

async function json(res: Response) {
  return (await res.json()) as Record<string, string>;
}

// ------------------------------------------------------------------ not configured

test("without RELAYER_PRIVATE_KEY, /stamp is 503 RELAYER_NOT_CONFIGURED and /session still works", async () => {
  const app = makeApp({}, null);
  const res = await post(app, await body());
  assert.equal(res.status, 503);
  assert.deepEqual(await json(res), { error: "RELAYER_NOT_CONFIGURED" });
  const s = await app.request("/session", {
    method: "POST",
    body: JSON.stringify({ wallet: WALLET, appId: "42", chainId: "1874" }),
    headers: { "content-type": "application/json" },
  });
  assert.equal(s.status, 200);
  assert.deepEqual(await (await app.request("/health")).json(), {
    ok: true,
    sessionSigner: privateKeyToAccount(SIGNER_KEY).address,
    relayer: null,
    sponsor: null,
    business: null,
  });
});

// ------------------------------------------------------------------ body validation

test("body validation: every malformed field is a 400 and never reaches the chain", async () => {
  const { writer, log } = fakeWriter();
  const app = makeApp({}, writer);
  const good = await body();
  const s = good.session as unknown as Record<string, unknown>;
  const bad: [string, unknown][] = [
    ["not JSON", "{nope"],
    ["array", [good]],
    ["null", null],
    ["missing proof", { ...good, proof: undefined }],
    ["session missing", { ...good, session: undefined }],
    ["session extra key", { ...good, session: { ...s, foo: "1" } }],
    ["session missing key", { ...good, session: { ...s, registry: undefined } }],
    ["wallet", { ...good, session: { ...s, wallet: "0x123" } }],
    ["wallet zero (SEC-1)", { ...good, session: { ...s, wallet: "0x0000000000000000000000000000000000000000" } }],
    ["appId as number", { ...good, session: { ...s, appId: 42 } }],
    ["appId 248 bits", { ...good, session: { ...s, appId: (1n << 248n).toString() } }],
    ["appId hex", { ...good, session: { ...s, appId: "0x2a" } }],
    ["nonce short", { ...good, session: { ...s, nonce: "0x1234" } }],
    ["nonce no 0x", { ...good, session: { ...s, nonce: "11".repeat(32) } }],
    ["expiresAt number", { ...good, session: { ...s, expiresAt: NOW / 1000 } }],
    ["expiresAt > uint64", { ...good, session: { ...s, expiresAt: (1n << 64n).toString() } }],
    ["validUntilMonth string", { ...good, session: { ...s, validUntilMonth: "325" } }],
    ["validUntilMonth float", { ...good, session: { ...s, validUntilMonth: 325.5 } }],
    ["validUntilMonth > uint32", { ...good, session: { ...s, validUntilMonth: 2 ** 32 } }],
    ["chainId number", { ...good, session: { ...s, chainId: 1874 } }],
    ["registry", { ...good, session: { ...s, registry: "nope" } }],
    ["sig 64 bytes", { ...good, sig: `0x${"aa".repeat(64)}` }],
    ["sig 66 bytes", { ...good, sig: `0x${"aa".repeat(66)}` }],
    ["sig not hex", { ...good, sig: `0x${"zz".repeat(65)}` }],
    ["proof empty", { ...good, proof: "0x" }],
    ["proof odd length", { ...good, proof: "0xabc" }],
    ["proof not hex", { ...good, proof: "0xzz" }],
    ["proof too large", { ...good, proof: `0x${"00".repeat(32 * 1024 + 1)}` }],
    ["publicInputs 5", { ...good, publicInputs: good.publicInputs.slice(0, 5) }],
    ["publicInputs 7", { ...good, publicInputs: [...good.publicInputs, good.publicInputs[0]] }],
    ["publicInput short", { ...good, publicInputs: [...good.publicInputs.slice(0, 5), "0x01"] }],
    ["publicInput number", { ...good, publicInputs: [...good.publicInputs.slice(0, 5), 1] }],
    ["publicInputs object", { ...good, publicInputs: { 0: "0x" } }],
  ];
  for (const [name, b] of bad) {
    const res = await post(app, b);
    assert.equal(res.status, 400, name);
    assert.equal((await json(res)).error, "BAD_REQUEST", name);
  }
  // An oversized body is cut off before it is parsed.
  const huge = await post(app, { ...good, proof: `0x${"00".repeat(200 * 1024)}` });
  assert.equal(huge.status, 413);
  assert.deepEqual(log, []);
});

test("body validation normalises: EIP-55 addresses, canonical decimals, lowercase hex", async () => {
  const good = await body();
  // Extra top-level keys (e.g. a forwarded /session response's qr and sessionId) are ignored and not passed on.
  const extra = parseStampRequest({ ...good, qr: "watermark://verify?…", sessionId: "abc" });
  assert.ok(!("error" in extra));
  assert.deepEqual(Object.keys(extra), ["session", "sig", "proof", "publicInputs"]);
  const p = parseStampRequest({
    ...good,
    session: { ...good.session, wallet: WALLET.toLowerCase(), appId: "042", nonce: good.session.nonce.toUpperCase().replace("0X", "0x") },
    proof: "0xABCD",
  });
  assert.ok(!("error" in p));
  assert.equal(p.session.wallet, WALLET);
  assert.equal(p.session.appId, "42");
  assert.equal(p.session.nonce, good.session.nonce);
  assert.equal(p.proof, "0xabcd");
});

// ------------------------------------------------------------------ refusals before the chain

test("refusals before any RPC: unknown app, chain without registry, wrong registry, bad signature", async () => {
  const { writer, log } = fakeWriter();
  const app = makeApp({}, writer);

  let res = await post(app, await body({ appId: "7" }));
  assert.equal(res.status, 404);
  assert.deepEqual(await json(res), { error: "UNKNOWN_APP" });

  res = await post(app, await body({ chainId: "1337" }));
  assert.equal(res.status, 503);
  assert.equal((await json(res)).error, "CHAIN_NOT_READY");

  res = await post(app, await body({ chainId: "1" }));
  assert.equal(res.status, 400);

  res = await post(app, await body({ registry: "0x00000000000000000000000000000000000000bb" }));
  assert.equal(res.status, 422);
  assert.deepEqual(await json(res), { error: "STAMP_REJECTED", reason: "WrongRegistry" });

  res = await post(app, await body({}, OTHER_KEY));
  assert.equal(res.status, 401);
  assert.deepEqual(await json(res), { error: "BAD_SIGNATURE" });

  // A signature over a different session (tampered wallet) recovers to someone else.
  const b = await body();
  res = await post(app, { ...b, session: { ...b.session, wallet: "0x0000000000000000000000000000000000000001" } });
  assert.equal(res.status, 401);

  // Garbage that does not recover at all.
  res = await post(app, { ...b, sig: `0x${"00".repeat(65)}` });
  assert.equal(res.status, 401);

  // XL-3: the high-s twin of a valid signature recovers to the same signer in viem, but the registry refuses it.
  const high = highS(b.sig);
  assert.equal(await recoverSessionSigner({ session: b.session, sig: high }), privateKeyToAccount(SIGNER_KEY).address);
  res = await post(app, { ...b, sig: high });
  assert.equal(res.status, 401);
  assert.deepEqual(await json(res), { error: "BAD_SIGNATURE" });

  // v outside {0, 1, 27, 28} is refused as the registry does.
  res = await post(app, { ...b, sig: `${b.sig.slice(0, 130)}1d` });
  assert.equal(res.status, 401);

  assert.deepEqual(log, []);
});

test("isCanonicalSignature mirrors the registry's _recover: low s, v in {0, 1, 27, 28}", async () => {
  const { sig } = await body();
  assert.ok(isCanonicalSignature(sig));
  assert.ok(!isCanonicalSignature(highS(sig)));
  const r = sig.slice(0, 66);
  const atHalf = `${r}${SECP256K1_HALF_N.toString(16).padStart(64, "0")}` as const;
  assert.ok(isCanonicalSignature(`${atHalf}1b`));
  assert.ok(!isCanonicalSignature(`${r}${(SECP256K1_HALF_N + 1n).toString(16).padStart(64, "0")}1b`));
  for (const v of ["00", "01", "1b", "1c"]) assert.ok(isCanonicalSignature(`${atHalf}${v}`), v);
  for (const v of ["02", "1a", "1d", "ff"]) assert.ok(!isCanonicalSignature(`${atHalf}${v}`), v);
  assert.ok(!isCanonicalSignature(`0x${"aa".repeat(64)}`));
});

test("rate-limited per IP", async () => {
  const { writer } = fakeWriter();
  const app = makeApp({ STAMPS_PER_MINUTE_PER_IP: "2" }, writer);
  const b = await body();
  assert.equal((await post(app, b)).status, 200);
  assert.equal((await post(app, b)).status, 200);
  const res = await post(app, b);
  assert.equal(res.status, 429);
  assert.deepEqual(await json(res), { error: "RATE_LIMIT" });
});

// ------------------------------------------------------------------ refusals from the chain

test("a reverting simulation is 422 STAMP_REJECTED with the error name, and nothing is sent", async () => {
  const { writer, log } = fakeWriter({
    simulate: async () => {
      throw new StampRejected("UnMismatch");
    },
  });
  const res = await post(makeApp({}, writer), await body());
  assert.equal(res.status, 422);
  assert.deepEqual(await json(res), { error: "STAMP_REJECTED", reason: "UnMismatch" });
  assert.deepEqual(log, ["simulate"]);
});

test("a revert at estimateGas is also STAMP_REJECTED; an RPC failure is 502 CHAIN_UNAVAILABLE", async () => {
  const est = fakeWriter({
    estimate: async () => {
      throw new StampRejected("SessionAlreadyUsed");
    },
  });
  let res = await post(makeApp({}, est.writer), await body());
  assert.equal(res.status, 422);
  assert.deepEqual(await json(res), { error: "STAMP_REJECTED", reason: "SessionAlreadyUsed" });
  assert.ok(!est.log.includes("send"));

  const down = fakeWriter({
    simulate: async () => {
      throw new Error("fetch failed");
    },
  });
  res = await post(makeApp({}, down.writer), await body());
  assert.equal(res.status, 502);
  assert.deepEqual(await json(res), { error: "CHAIN_UNAVAILABLE" });
  assert.ok(!down.log.includes("send"));
});

test("GAS_CAP: an estimate above MAX_GAS_PER_STAMP is refused before sending", async () => {
  const { writer, log } = fakeWriter({ estimate: 3_500_001n });
  const res = await post(makeApp({}, writer), await body());
  assert.equal(res.status, 422);
  assert.deepEqual(await json(res), { error: "GAS_CAP" });
  assert.ok(!log.includes("send"));

  // Exactly at the cap is allowed, and the gas limit never goes above the cap.
  const ok = fakeWriter({ estimate: 3_500_000n });
  assert.equal((await post(makeApp({}, ok.writer), await body())).status, 200);
  assert.equal(ok.sent[0]!.gas, 3_500_000n);

  // A custom cap.
  const low = fakeWriter({ estimate: 2_000_000n });
  assert.equal((await post(makeApp({ MAX_GAS_PER_STAMP: "1999999" }, low.writer), await body())).status, 422);

  // The payment cap (MAX_GAS_PER_PAY, 300k) never applies to stamps: a real ~2.9M-gas stamp still goes through.
  const real = fakeWriter({ estimate: 2_900_000n });
  assert.equal((await post(makeApp({ MAX_GAS_PER_PAY: "300000" }, real.writer), await body())).status, 200);
});

test("gas limit = estimate + 20 %, capped", () => {
  assert.equal(gasLimitFor(1_000_000n, 3_500_000n), 1_200_000n);
  assert.equal(gasLimitFor(3_000_000n, 3_500_000n), 3_500_000n);
});

test("BUDGET_CAP: the daily stamp budget reserves the worst case, settles the real cost, and resets at 00:00 UTC", async () => {
  // estimate 2.5M → gas limit 3M; maxFee 5 gwei → worst case 0.015 WBT. Real cost 0.0125 WBT.
  const worst = 3_000_000n * 5n * GWEI;
  const real = 2_500_000n * 5n * GWEI;
  let now = NOW;
  const { writer, log } = fakeWriter();
  const app = makeApp({ STAMP_BUDGET_WEI: (worst + real).toString() }, writer, () => now);

  assert.equal((await post(app, await body())).status, 200); // spent: real; left: worst
  assert.equal((await post(app, await body())).status, 200); // left == worst exactly: allowed
  const res = await post(app, await body());
  assert.equal(res.status, 503);
  assert.deepEqual(await json(res), { error: "BUDGET_CAP" });
  assert.equal(log.filter((x) => x === "send").length, 2);

  now += 86_400_000; // next UTC day
  assert.equal((await post(app, await body())).status, 200);

  // A budget too small for even one stamp.
  const tiny = fakeWriter();
  assert.equal((await post(makeApp({ STAMP_BUDGET_WEI: (worst - 1n).toString() }, tiny.writer), await body())).status, 503);
  assert.ok(!tiny.log.includes("send"));
});

test("DailyBudget: release returns a reservation, a pending tx keeps it", () => {
  const b = new DailyBudget(100n, () => NOW);
  assert.ok(b.reserve(60n));
  assert.equal(b.left(), 40n);
  assert.ok(!b.reserve(41n));
  b.release(60n);
  assert.equal(b.left(), 100n);
  assert.ok(b.reserve(60n));
  b.settle(60n, 60n);
  assert.equal(b.left(), 40n);
});

// ------------------------------------------------------------------ sending

test("success: 200 { txHash }, with the session passed to stamp() unchanged and gas = estimate + 20 %", async () => {
  const { writer, log, sent } = fakeWriter();
  const b = await body();
  const res = await post(makeApp({}, writer), b);
  assert.equal(res.status, 200);
  const out = await json(res);
  assert.match(out.txHash ?? "", /^0x[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(out), ["txHash"]);
  assert.deepEqual(log, ["simulate", "estimate", "send", "receipt"]);
  assert.equal(sent[0]!.gas, 3_000_000n);
  assert.deepEqual(sent[0]!.call.session, b.session);
  assert.equal(sent[0]!.call.sig, b.sig);
  assert.deepEqual(sent[0]!.call.publicInputs, b.publicInputs);
  assert.equal(sent[0]!.call.chain.registry, REGISTRY);
  assert.equal(sent[0]!.call.chain.chainId, 1874);
});

test("a mined but reverted stamp is 502 STAMP_REVERTED with its txHash", async () => {
  const { writer } = fakeWriter({ send: async () => TX, receipt: async () => ({ status: "reverted", costWei: 1n }) });
  const res = await post(makeApp({}, writer), await body());
  assert.equal(res.status, 502);
  assert.deepEqual(await json(res), { error: "STAMP_REVERTED", txHash: TX });
});

test("no receipt in time is 504 STAMP_PENDING with its txHash, and the worst case stays charged", async () => {
  const worst = 3_000_000n * 5n * GWEI;
  const { writer, log } = fakeWriter({ send: async () => TX, receipt: async () => ({ status: "timeout" }) });
  const app = makeApp({ STAMP_BUDGET_WEI: (2n * worst - 1n).toString() }, writer);
  const res = await post(app, await body());
  assert.equal(res.status, 504);
  assert.deepEqual(await json(res), { error: "STAMP_PENDING", txHash: TX });
  assert.equal((await post(app, await body())).status, 503); // budget left < worst
  assert.equal(log.filter((x) => x === "send").length, 1);
});

test("a failed send is 502 STAMP_SEND_FAILED and gives its reservation back", async () => {
  const worst = 3_000_000n * 5n * GWEI;
  let fail = true;
  const { writer } = fakeWriter({
    send: async () => {
      if (fail) throw new Error("insufficient funds");
      return TX;
    },
  });
  const app = makeApp({ STAMP_BUDGET_WEI: worst.toString() }, writer);
  const res = await post(app, await body());
  assert.equal(res.status, 502);
  assert.deepEqual(await json(res), { error: "STAMP_SEND_FAILED" });
  fail = false;
  assert.equal((await post(app, await body())).status, 200);
});

// ------------------------------------------------------------------ the queue

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test("the per-chain queue runs one stamp at a time, in order, from simulate to receipt", async () => {
  const receipts = [deferred<StampReceipt>(), deferred<StampReceipt>(), deferred<StampReceipt>()];
  let inFlight = 0;
  let maxInFlight = 0;
  let i = 0;
  const order: string[] = [];
  const { writer } = fakeWriter({
    simulate: async (call) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      order.push(`sim:${call.session.nonce.slice(-2)}`);
    },
    receipt: async () => {
      const r = await receipts[i++]!.promise;
      inFlight--;
      return r;
    },
  });
  const app = makeApp({}, writer);
  const reqs = ["01", "02", "03"].map(async (n) => post(app, await body({ nonce: `0x${"11".repeat(31)}${n}` })));

  // Let the first job reach its receipt wait; the others must still be queued.
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(order, ["sim:01"]);
  for (const d of receipts) {
    d.resolve({ status: "success", costWei: 1n });
    await new Promise((r) => setTimeout(r, 20));
  }
  const res = await Promise.all(reqs);
  assert.deepEqual(res.map((r) => r.status), [200, 200, 200]);
  assert.deepEqual(order, ["sim:01", "sim:02", "sim:03"]);
  assert.equal(maxInFlight, 1);
});

test("a full queue answers 503 BUSY; a failed job does not block the next", async () => {
  const gate = deferred<StampReceipt>();
  const { writer } = fakeWriter({ receipt: () => gate.promise });
  const app = makeApp({ STAMP_MAX_QUEUE: "2" }, writer);
  const a = post(app, await body());
  const b = post(app, await body());
  await new Promise((r) => setTimeout(r, 30));
  const c = await post(app, await body());
  assert.equal(c.status, 503);
  assert.deepEqual(await json(c), { error: "BUSY" });
  gate.resolve({ status: "success", costWei: 1n });
  assert.deepEqual([(await a).status, (await b).status], [200, 200]);

  const q = new SerialQueue(5);
  const failed = q.run(async () => {
    throw new Error("boom");
  });
  await assert.rejects(failed!);
  assert.equal(await q.run(async () => "next"), "next");
  assert.equal(q.size, 0);
});

test("chains have separate queues", async () => {
  const gate = deferred<StampReceipt>();
  const seen: number[] = [];
  const { writer } = fakeWriter({
    simulate: async (call) => {
      seen.push(call.chain.chainId);
    },
    receipt: async (h) => (h.endsWith("1") ? gate.promise : { status: "success", costWei: 1n }),
  });
  const app = makeApp({ DEVNET_REGISTRY_ADDRESS: REGISTRY }, writer);
  const slow = post(app, await body());
  await new Promise((r) => setTimeout(r, 30));
  const fast = await post(app, await body({ chainId: "1337" }));
  assert.equal(fast.status, 200); // not stuck behind the 1874 stamp
  gate.resolve({ status: "success", costWei: 1n });
  assert.equal((await slow).status, 200);
  assert.deepEqual(seen, [1874, 1337]);
});

// ------------------------------------------------------------------ logging

test("logs never contain the body: only the reason and a truncated wallet", async () => {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const capture = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  console.log = console.warn = console.error = console.info = capture;
  const b = await body();
  try {
    let n = 0;
    const { writer } = fakeWriter({
      simulate: async () => {
        if (n++ === 1) throw new StampRejected("InvalidProof");
      },
    });
    const app = makeApp({ DEMO_MODE: "false" }, writer);
    assert.equal((await post(app, b)).status, 200);
    assert.equal((await post(app, b)).status, 422);
    assert.equal((await post(app, { ...b, proof: "0x" })).status, 400);
    assert.equal((await post(app, await body({ appId: "7" }))).status, 404);
    assert.equal((await post(app, await body({}, OTHER_KEY))).status, 401);
  } finally {
    Object.assign(console, orig);
  }
  const all = lines.join("\n");
  assert.ok(lines.length > 0, "something was logged");
  for (const secret of [b.proof.slice(2, 20), b.sig.slice(2, 20), b.session.nonce.slice(2, 20), WALLET, WALLET.toLowerCase(), b.publicInputs[5]!.slice(-10)]) {
    assert.ok(!all.includes(secret), `log leaked ${secret.slice(0, 12)}`);
  }
  assert.match(all, /0x89…a776/);
  assert.match(all, /refused STAMP_REJECTED:InvalidProof 0x89…a776/);
  assert.match(all, /refused BAD_SIGNATURE 0x89…a776/);
});

test("DEMO_MODE (the default) logs nothing at all", async () => {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn };
  console.log = console.warn = (...a: unknown[]) => void lines.push(a.map(String).join(" "));
  try {
    const { writer } = fakeWriter({ simulate: async () => Promise.reject(new StampRejected("InvalidProof")) });
    const app = makeApp({}, writer);
    await post(app, await body());
    await post(app, { nope: 1 });
  } finally {
    Object.assign(console, orig);
  }
  assert.deepEqual(lines, []);
});

// ------------------------------------------------------------------ viem revert decoding

test("revertReason names a registry custom error, falls back to the selector, and ignores RPC failures", () => {
  const wrap = (data: Hex) =>
    new ContractFunctionExecutionError(
      new ContractFunctionRevertedError({ abi: registryAbi, data, functionName: "stamp" }),
      { abi: registryAbi, functionName: "stamp", args: [] },
    );
  const un = encodeErrorResult({ abi: registryAbi, errorName: "UnMismatch", args: [1n, 2n] });
  assert.equal(revertReason(wrap(un)), "UnMismatch");
  assert.equal(revertReason(wrap(encodeErrorResult({ abi: registryAbi, errorName: "InvalidProof" }))), "InvalidProof");
  assert.equal(revertReason(wrap(encodeErrorResult({ abi: registryAbi, errorName: "ZeroWallet" }))), "ZeroWallet");
  // A verifier error from a registry without the try/catch (none deployed) would still be reported, by selector.
  assert.equal(revertReason(wrap("0x9fc3a218")), "0x9fc3a218");
  assert.equal(revertReason(wrap("0xdeadbeef")), "0xdeadbeef");
  assert.equal(revertReason(new HttpRequestError({ url: "http://x", details: "fetch failed" })), null);
  assert.equal(revertReason(new Error("x")), null);
});

test("config: RELAYER_PRIVATE_KEY is optional but must be a key; stamp caps have safe defaults", () => {
  const base = { SESSION_SIGNER_KEY: SIGNER_KEY, PROVER_URL: "x", APP_IDS: "1" };
  const c = loadConfig(base);
  assert.equal(c.relayerKey, null);
  assert.equal(c.stamp.maxGas, 3_500_000n);
  assert.equal(c.stamp.budgetWei, 100_000_000_000_000_000n);
  assert.equal(c.stamp.receiptTimeoutMs, 90_000);
  assert.equal(c.pay.maxGas, 300_000n);
  assert.equal(c.pay.budgetWei, 100_000_000_000_000_000n);
  assert.deepEqual(c.warnings, []);
  // Empty values (as in .env.example) mean the default.
  const blank = loadConfig({ ...base, STAMP_BUDGET_WEI: "", DAILY_BUDGET_WEI: "", MAX_GAS_PER_STAMP: "", MAX_GAS_PER_PAY: "" });
  assert.equal(blank.stamp.budgetWei, 100_000_000_000_000_000n);
  assert.equal(blank.pay.maxGas, 300_000n);
  assert.equal(loadConfig({ ...base, RELAYER_PRIVATE_KEY: OTHER_KEY }).relayerKey, OTHER_KEY);
  assert.throws(() => loadConfig({ ...base, RELAYER_PRIVATE_KEY: "0x1234" }), /RELAYER_PRIVATE_KEY/);
  assert.throws(() => loadConfig({ ...base, STAMP_BUDGET_WEI: "1e18" }), /STAMP_BUDGET_WEI/);
  assert.throws(() => loadConfig({ ...base, MAX_GAS_PER_STAMP: "0" }), /MAX_GAS_PER_STAMP/);
  assert.throws(() => loadConfig({ ...base, MAX_GAS_PER_PAY: "0" }), /MAX_GAS_PER_PAY/);
  assert.throws(() => loadConfig({ ...base, DAILY_BUDGET_WEI: "-1" }), /DAILY_BUDGET_WEI/);
  assert.equal(loadConfig({ ...base, STAMP_BUDGET_WEI: "0" }).stamp.budgetWei, 0n);
});

test("config: stamp and payment caps and budgets are separate", () => {
  const base = { SESSION_SIGNER_KEY: SIGNER_KEY, PROVER_URL: "x", APP_IDS: "1" };
  const c = loadConfig({ ...base, MAX_GAS_PER_STAMP: "4000000", MAX_GAS_PER_PAY: "250000", STAMP_BUDGET_WEI: "7", DAILY_BUDGET_WEI: "9" });
  assert.deepEqual(
    { stampGas: c.stamp.maxGas, payGas: c.pay.maxGas, stampWei: c.stamp.budgetWei, payWei: c.pay.budgetWei },
    { stampGas: 4_000_000n, payGas: 250_000n, stampWei: 7n, payWei: 9n },
  );
});

test("config: the old MAX_GAS_PER_TX / STAMP_MAX_GAS names still work, with a warning, and never override the new ones", () => {
  const base = { SESSION_SIGNER_KEY: SIGNER_KEY, PROVER_URL: "x", APP_IDS: "1" };
  // MAX_GAS_PER_TX (main's .env.example) maps to the payment cap only; stamps keep their own cap.
  const old = loadConfig({ ...base, MAX_GAS_PER_TX: "300000" });
  assert.equal(old.pay.maxGas, 300_000n);
  assert.equal(old.stamp.maxGas, 3_500_000n);
  assert.equal(old.warnings.length, 1);
  assert.match(old.warnings[0]!, /MAX_GAS_PER_TX was renamed to MAX_GAS_PER_PAY/);

  const both = loadConfig({ ...base, MAX_GAS_PER_TX: "1", MAX_GAS_PER_PAY: "200000", STAMP_MAX_GAS: "1", MAX_GAS_PER_STAMP: "3000000" });
  assert.equal(both.pay.maxGas, 200_000n);
  assert.equal(both.stamp.maxGas, 3_000_000n);
  assert.equal(both.warnings.length, 2);
  assert.ok(both.warnings.every((w) => /is ignored/.test(w)));

  assert.equal(loadConfig({ ...base, STAMP_MAX_GAS: "3200000" }).stamp.maxGas, 3_200_000n);
  assert.throws(() => loadConfig({ ...base, STAMP_MAX_GAS: "0" }), /MAX_GAS_PER_STAMP/);
});
