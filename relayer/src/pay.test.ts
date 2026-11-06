/** POST /pay, POST /fund and GET /balance (interfaces F6, F7). No network: every chain access is a fake. */
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
import { sponsorAbi } from "./abi.ts";
import { createApp } from "./app.ts";
import { payRevertReason } from "./chain.ts";
import { loadConfig } from "./config.ts";
import {
  intentTypedData,
  isUsdtSignature,
  parsePayRequest,
  PayRejected,
  refusalForRevert,
  type FundWriter,
  type PayCall,
  type PayReader,
  type PayWriter,
  type SponsorInfo,
} from "./pay.ts";
import type { ChainWriter, StampFees, StampReceipt } from "./stamp.ts";
import type { PaymentIntent } from "./usdt.ts";

// anvil accounts #0-#2: public test keys, never used on a real network.
const SIGNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const PAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const OTHER_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as const;
const PAYER = privateKeyToAccount(PAYER_KEY).address;
const SHOP = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const RELAYER = "0x00000000000000000000000000000000000000eE" as Address;
const BUSINESS = "0x00000000000000000000000000000000000000bb" as Address;
const REGISTRY = "0x00000000000000000000000000000000000000AA" as Address;
const SPONSOR = "0x00000000000000000000000000000000000000cc" as Address;
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as Address;
const APP_ID = 42n;
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const NOW_S = NOW / 1000;
const GWEI = 1_000_000_000n;

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

// ------------------------------------------------------------------ fakes

interface Fakes {
  stamped?: boolean;
  quota?: number;
  balance?: bigint;
  readFails?: boolean;
  infoFails?: number;
  simulate?: (call: PayCall) => Promise<void>;
  estimate?: bigint;
  fees?: StampFees;
  send?: () => Promise<Hex>;
  receipt?: () => Promise<StampReceipt>;
  fundSimulate?: () => Promise<void>;
  fundSend?: () => Promise<Hex>;
  fundReceipt?: () => Promise<StampReceipt>;
}

function fakes(o: Fakes = {}) {
  const log: string[] = [];
  const reads: string[] = [];
  const sent: { call: PayCall; gas: bigint; fees: StampFees }[] = [];
  const simulated: { gas: bigint; fees: StampFees }[] = [];
  const funded: { to: Address; amount: bigint }[] = [];
  let infoFails = o.infoFails ?? 0;
  let n = 0;
  const info: SponsorInfo = { appId: APP_ID, registry: REGISTRY, relayer: RELAYER, usdt: USDT };
  const reader: PayReader = {
    async sponsorInfo(c) {
      reads.push(`info:${c.sponsor}`);
      if (infoFails-- > 0) throw new Error("rpc down");
      return info;
    },
    async isStamped(_c, registry, wallet, appId) {
      reads.push(`isStamped:${registry}:${wallet}:${appId}`);
      if (o.readFails) throw new Error("rpc down");
      return o.stamped ?? true;
    },
    async quotaLeft() {
      reads.push("quotaLeft");
      if (o.readFails) throw new Error("rpc down");
      return o.quota ?? 20;
    },
    async usdtBalance(c, wallet) {
      reads.push(`balance:${c.usdt}:${wallet}`);
      if (o.readFails) throw new Error("rpc down");
      return o.balance ?? 1_500_000n;
    },
  };
  const writer: PayWriter = {
    address: RELAYER,
    async fees() {
      log.push("fees");
      return o.fees ?? { maxFeePerGas: 5n * GWEI, maxPriorityFeePerGas: 1n };
    },
    async simulate(call, gas, fees) {
      log.push("simulate");
      simulated.push({ gas, fees });
      await o.simulate?.(call);
    },
    async estimateGas() {
      log.push("estimate");
      return o.estimate ?? 110_000n;
    },
    async send(call, gas, fees) {
      log.push("send");
      sent.push({ call, gas, fees });
      if (o.send) return o.send();
      return `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
    },
    async waitForReceipt() {
      log.push("receipt");
      return o.receipt ? o.receipt() : { status: "success", costWei: 107_000n * 5n * GWEI };
    },
  };
  const funder: FundWriter = {
    address: BUSINESS,
    async simulate() {
      log.push("fund:simulate");
      await o.fundSimulate?.();
    },
    async send(_c, to, amount) {
      log.push("fund:send");
      funded.push({ to, amount });
      if (o.fundSend) return o.fundSend();
      return `0x${"f".repeat(63)}${funded.length}` as Hex;
    },
    async waitForReceipt() {
      return o.fundReceipt ? o.fundReceipt() : { status: "success", costWei: 1n };
    },
  };
  return { reader, writer, funder, log, reads, sent, simulated, funded };
}

interface MakeOpts {
  env?: Record<string, string>;
  f?: ReturnType<typeof fakes>;
  payWriter?: PayWriter | null;
  funder?: FundWriter | null;
  stampWriter?: ChainWriter | null;
  now?: () => number;
  ip?: () => string;
}

function makeApp(o: MakeOpts = {}) {
  const f = o.f ?? fakes();
  const config = loadConfig({
    SESSION_SIGNER_KEY: SIGNER_KEY,
    PROVER_URL: "http://192.168.1.2:8787",
    APP_IDS: "42",
    REGISTRY_ADDRESS: REGISTRY,
    SPONSOR_ADDRESS: SPONSOR,
    PAYS_PER_MINUTE_PER_IP: "1000",
    ...o.env,
  });
  const app = createApp({
    config,
    chain: { status: async () => ({ stamped: true, expiresAt: 0, quotaLeft: 0 }) },
    writer: o.stampWriter ?? null,
    payReader: f.reader,
    payWriter: o.payWriter === undefined ? f.writer : o.payWriter,
    funder: o.funder === undefined ? f.funder : o.funder,
    clientIp: o.ip ?? (() => "10.0.0.1"),
    nowMs: o.now ?? (() => NOW),
  });
  return { app, f };
}

function intent(over: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    from: PAYER,
    to: SHOP,
    value: "1000000",
    validAfter: "0",
    validBefore: String(NOW_S + 900),
    nonce: `0x${"5a".repeat(32)}`,
    ...over,
  };
}

async function payBody(over: Partial<PaymentIntent> = {}, key: Hex = PAYER_KEY, chainId = 1874) {
  const i = intent(over);
  const signature = await privateKeyToAccount(key).signTypedData(intentTypedData(i, chainId, USDT));
  return { intent: i, signature };
}

const send = (app: ReturnType<typeof makeApp>["app"], path: string, b: unknown) =>
  app.request(path, {
    method: "POST",
    body: typeof b === "string" ? b : JSON.stringify(b),
    headers: { "content-type": "application/json" },
  });
const pay = (app: ReturnType<typeof makeApp>["app"], b: unknown) => send(app, "/pay", b);
const json = async (r: Response) => (await r.json()) as Record<string, string>;

/** The malleable twin of a signature: s' = n - s, v flipped. Recovers to the same address. */
function highS(sig: Hex): Hex {
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = Number.parseInt(sig.slice(130, 132), 16);
  return `${sig.slice(0, 66)}${(SECP256K1_N - s).toString(16).padStart(64, "0")}${(v === 27 ? 28 : 27).toString(16)}` as Hex;
}

// ------------------------------------------------------------------ POST /pay: the happy path

test("POST /pay relays a signed intent: fees → estimate → simulate → send → receipt, and the payer pays no gas", async () => {
  const { app, f } = makeApp();
  const res = await pay(app, await payBody());
  assert.equal(res.status, 200);
  // `from` is the relayer: it paid the gas, not the payer.
  assert.deepEqual(await json(res), { txHash: `0x${"1".padStart(64, "0")}`, from: RELAYER });
  assert.deepEqual(f.log, ["fees", "estimate", "simulate", "send", "receipt"]);
  // Simulated exactly as sent (SPONSOR-1, PAY-DRAIN-2): the real fee fields and the same gas limit, estimate + 20 %.
  assert.deepEqual(f.simulated, [{ gas: 132_000n, fees: { maxFeePerGas: 5n * GWEI, maxPriorityFeePerGas: 1n } }]);
  assert.equal(f.sent[0]!.gas, 132_000n);
  assert.equal(f.sent[0]!.call.chain.sponsor, SPONSOR);
  assert.equal(f.sent[0]!.call.intent.from, PAYER);
  // Stamped is checked in the sponsor's own app, on the sponsor's own registry.
  assert.ok(f.reads.includes(`isStamped:${REGISTRY}:${PAYER}:42`));
});

test("POST /pay normalises the body (lowercase addresses in, EIP-55 out; uppercase hex accepted)", async () => {
  const { app, f } = makeApp();
  const b = await payBody();
  const res = await pay(app, {
    intent: { ...b.intent, from: b.intent.from.toLowerCase(), to: b.intent.to.toLowerCase(), nonce: b.intent.nonce.toUpperCase().replace("0X", "0x") },
    signature: b.signature.toUpperCase().replace("0X", "0x"),
  });
  assert.equal(res.status, 200);
  assert.equal(f.sent[0]!.call.intent.to, SHOP);
});

test("the sponsor's immutables are read once and cached; a failed read is retried on the next request", async () => {
  const f = fakes({ infoFails: 1 });
  const { app } = makeApp({ f });
  const first = await pay(app, await payBody());
  assert.equal(first.status, 502);
  assert.equal((await json(first)).reason, "CHAIN_UNAVAILABLE");
  assert.equal((await pay(app, await payBody({ nonce: `0x${"01".repeat(32)}` }))).status, 200);
  assert.equal((await pay(app, await payBody({ nonce: `0x${"02".repeat(32)}` }))).status, 200);
  assert.equal(f.reads.filter((r) => r.startsWith("info:")).length, 2);
});

// ------------------------------------------------------------------ not configured / paused

test("POST /pay answers 503 SPONSOR_NOT_CONFIGURED until SPONSOR_ADDRESS is set, and RELAYER_NOT_CONFIGURED without a relayer key", async () => {
  const none = makeApp({ env: { SPONSOR_ADDRESS: "" } });
  const r1 = await pay(none.app, await payBody());
  assert.equal(r1.status, 503);
  assert.deepEqual(await json(r1), { reason: "SPONSOR_NOT_CONFIGURED", error: "SPONSOR_NOT_CONFIGURED" });
  const noKey = makeApp({ payWriter: null });
  const r2 = await pay(noKey.app, await payBody());
  assert.equal(r2.status, 503);
  assert.equal((await json(r2)).reason, "RELAYER_NOT_CONFIGURED");
  assert.deepEqual(noKey.f.log, []);
});

test("PAY_PAUSED=true refuses every payment PAUSED", async () => {
  const { app, f } = makeApp({ env: { PAY_PAUSED: "true" } });
  const r = await pay(app, await payBody());
  assert.equal(r.status, 503);
  assert.equal((await json(r)).reason, "PAUSED");
  assert.deepEqual(f.log, []);
});

// ------------------------------------------------------------------ validation

test("POST /pay refuses malformed intents with 400 BAD_REQUEST before any RPC", async () => {
  const { app, f } = makeApp();
  const ok = await payBody();
  const bad: [unknown, RegExp][] = [
    ["not json", /JSON object/],
    [{ signature: ok.signature }, /intent must be an object/],
    [{ intent: { ...ok.intent, extra: "1" }, signature: ok.signature }, /exactly/],
    [{ intent: { ...ok.intent, value: undefined }, signature: ok.signature }, /exactly/],
    [{ intent: { ...ok.intent, from: "0x123" }, signature: ok.signature }, /from must be an address/],
    [{ intent: { ...ok.intent, from: "0x0000000000000000000000000000000000000000" }, signature: ok.signature }, /from must not be the zero/],
    [{ intent: { ...ok.intent, to: "0x0000000000000000000000000000000000000000" }, signature: ok.signature }, /to must not be the zero/],
    [{ intent: { ...ok.intent, to: PAYER.toLowerCase() }, signature: ok.signature }, /to must not be intent.from/],
    [{ intent: { ...ok.intent, value: 1000000 }, signature: ok.signature }, /value must be a uint256 decimal/],
    [{ intent: { ...ok.intent, value: "1.5" }, signature: ok.signature }, /value must be a uint256 decimal/],
    [{ intent: { ...ok.intent, value: "0" }, signature: ok.signature }, /more than 0/],
    [{ intent: { ...ok.intent, value: "5000001" }, signature: ok.signature }, /PAY_MAX_USDT/],
    [{ intent: { ...ok.intent, validAfter: String(NOW_S + 1) }, signature: ok.signature }, /validAfter is in the future/],
    [{ intent: { ...ok.intent, validBefore: String(NOW_S) }, signature: ok.signature }, /validBefore has passed/],
    [{ intent: { ...ok.intent, validBefore: String(NOW_S + 3601) }, signature: ok.signature }, /within 1 hour/],
    [{ intent: { ...ok.intent, nonce: "0x1234" }, signature: ok.signature }, /nonce must be bytes32/],
    [{ intent: ok.intent, signature: "0x1234" }, /65 bytes/],
  ];
  for (const [b, msg] of bad) {
    const r = await pay(app, b);
    assert.equal(r.status, 400, JSON.stringify(b));
    const out = await json(r);
    assert.equal(out.reason, "BAD_REQUEST");
    assert.equal(out.error, "BAD_REQUEST");
    assert.match(out.message!, msg);
  }
  assert.deepEqual(f.log, []);
  assert.deepEqual(f.reads, []);
});

test("PAY_MAX_USDT sets the per-payment limit; exactly the limit and validBefore = now + 1 h are accepted", async () => {
  const { app } = makeApp({ env: { PAY_MAX_USDT: "0.5" } });
  assert.equal((await pay(app, await payBody({ value: "500001" }))).status, 400);
  assert.equal((await pay(app, await payBody({ value: "500000", validBefore: String(NOW_S + 3600) }))).status, 200);
  assert.ok(!("error" in parsePayRequest({ intent: intent({ value: "5000000" }), signature: `0x${"1b".repeat(65)}` }, NOW_S, 5_000_000n)));
});

test("a body over 4 KB is refused 413", async () => {
  const { app } = makeApp();
  const r = await pay(app, JSON.stringify({ pad: "x".repeat(5000) }));
  assert.equal(r.status, 413);
});

// ------------------------------------------------------------------ signature

test("BAD_SIGNATURE: wrong signer, high s, v = 0, or signed for another chain, all before any RPC", async () => {
  const { app, f } = makeApp();
  const wrongSigner = await payBody({}, OTHER_KEY);
  const good = await payBody();
  const v0 = `${good.signature.slice(0, 130)}${(Number.parseInt(good.signature.slice(130), 16) - 27).toString(16).padStart(2, "0")}` as Hex;
  const otherChain = await payBody({}, PAYER_KEY, 1);
  for (const b of [wrongSigner, { ...good, signature: highS(good.signature) }, { ...good, signature: v0 }, otherChain]) {
    const r = await pay(app, b);
    assert.equal(r.status, 401);
    assert.equal((await json(r)).reason, "BAD_SIGNATURE");
  }
  assert.deepEqual(f.log, []);
  assert.deepEqual(f.reads, []);
  assert.ok(isUsdtSignature(good.signature));
  assert.ok(!isUsdtSignature(highS(good.signature)));
});

// ------------------------------------------------------------------ off-chain gates

test("NOT_STAMPED (403) and QUOTA_USED (429) are answered from reads, without simulating", async () => {
  const ns = makeApp({ f: fakes({ stamped: false }) });
  const r1 = await pay(ns.app, await payBody());
  assert.equal(r1.status, 403);
  assert.equal((await json(r1)).reason, "NOT_STAMPED");
  assert.deepEqual(ns.f.log, []);

  const q = makeApp({ f: fakes({ quota: 0 }) });
  const r2 = await pay(q.app, await payBody());
  assert.equal(r2.status, 429);
  assert.equal((await json(r2)).reason, "QUOTA_USED");
  assert.deepEqual(q.f.log, []);
});

test("RPC trouble during the reads or the simulation is 502 CHAIN_UNAVAILABLE, and nothing is sent", async () => {
  const down = makeApp({ f: fakes({ readFails: true }) });
  const r1 = await pay(down.app, await payBody());
  assert.equal(r1.status, 502);
  assert.equal((await json(r1)).reason, "CHAIN_UNAVAILABLE");
  const simDown = makeApp({ f: fakes({ simulate: async () => { throw new HttpRequestError({ url: "http://x" }); } }) });
  const r2 = await pay(simDown.app, await payBody());
  assert.equal(r2.status, 502);
  assert.ok(!simDown.f.log.includes("send"));
});

// ------------------------------------------------------------------ simulated reverts

test("a reverted simulation is mapped to an F6 reason, with the revert as `detail`, and nothing is sent", async () => {
  const cases: [string, number, string][] = [
    ["NotStamped", 403, "NOT_STAMPED"],
    ["QuotaUsed", 429, "QUOTA_USED"],
    ["TetherToken: auth invalid", 409, "NONCE_USED"],
    ["TetherToken: invalid signature", 401, "BAD_SIGNATURE"],
    ["ECRecover: invalid signature 's'", 401, "BAD_SIGNATURE"],
    ["ERC20: transfer amount exceeds balance", 422, "INSUFFICIENT_USDT"],
    ["TetherToken: auth expired", 400, "BAD_REQUEST"],
    ["AuthorizationNotYetValid", 400, "BAD_REQUEST"],
    ["NotRelayer", 422, "PAY_REJECTED"],
    ["TetherToken: from is blocked", 422, "PAY_REJECTED"],
    ["0xdeadbeef", 422, "PAY_REJECTED"],
  ];
  for (const [revert, status, reason] of cases) {
    const { app, f } = makeApp({ f: fakes({ simulate: async () => { throw new PayRejected(revert); } }) });
    const r = await pay(app, await payBody());
    assert.equal(r.status, status, revert);
    const out = await json(r);
    assert.equal(out.reason, reason, revert);
    assert.equal(out.detail, revert);
    assert.deepEqual(f.log, ["fees", "estimate", "simulate"]);
  }
  // Only printable ASCII, at most 120 characters, ever reaches the response or a log.
  assert.equal(refusalForRevert(`bad\u0000${"x".repeat(200)}`).body.detail!.length, 120);
  assert.ok(!refusalForRevert("bad\u0000").body.detail!.includes("\u0000"));
});

test("payRevertReason gives the sponsor's error name, USDT's revert string, a Panic code, or null for RPC failures", () => {
  const wrap = (data: Hex) =>
    new ContractFunctionExecutionError(
      new ContractFunctionRevertedError({ abi: sponsorAbi, data, functionName: "relayPayment" }),
      { abi: sponsorAbi, functionName: "relayPayment", args: [] },
    );
  const ns = encodeErrorResult({ abi: sponsorAbi, errorName: "NotStamped", args: [PAYER, APP_ID] });
  assert.equal(payRevertReason(wrap(ns)), "NotStamped");
  assert.equal(payRevertReason(wrap(encodeErrorResult({ abi: sponsorAbi, errorName: "QuotaUsed", args: [PAYER, 20] }))), "QuotaUsed");
  // Error(string), as USDT reverts and the sponsor bubbles up unchanged.
  const str = encodeErrorResult({
    abi: [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }],
    errorName: "Error",
    args: ["TetherToken: auth invalid"],
  });
  assert.equal(payRevertReason(wrap(str)), "TetherToken: auth invalid");
  const panic = encodeErrorResult({
    abi: [{ type: "error", name: "Panic", inputs: [{ name: "code", type: "uint256" }] }],
    errorName: "Panic",
    args: [0x11n],
  });
  assert.equal(payRevertReason(wrap(panic)), "Panic(17)");
  assert.equal(payRevertReason(wrap("0xdeadbeef")), "0xdeadbeef");
  assert.equal(payRevertReason(new HttpRequestError({ url: "http://x", details: "fetch failed" })), null);
  assert.equal(payRevertReason(new Error("x")), null);
});

// ------------------------------------------------------------------ gas cap and budget

test("GAS_CAP: an estimate above MAX_GAS_PER_PAY is refused 422 and nothing is sent", async () => {
  const { app, f } = makeApp({ f: fakes({ estimate: 300_001n }) });
  const r = await pay(app, await payBody());
  assert.equal(r.status, 422);
  assert.equal((await json(r)).reason, "GAS_CAP");
  assert.ok(!f.log.includes("send"));
  // A lower MAX_GAS_PER_PAY caps the padded limit, and the simulation runs with that same capped limit.
  const low = makeApp({ env: { MAX_GAS_PER_PAY: "120000" } });
  assert.equal((await pay(low.app, await payBody())).status, 200);
  assert.equal(low.f.simulated[0]!.gas, 120_000n);
  assert.equal(low.f.sent[0]!.gas, 120_000n);
});

test("BUDGET_CAP: DAILY_BUDGET_WEI is reserved at the worst case, separately from the stamp budget, and resets at 00:00 UTC", async () => {
  // Worst case per payment: 132,000 gas × 5 gwei = 660,000 gwei. Room for exactly one.
  let now = NOW;
  const { app, f } = makeApp({ env: { DAILY_BUDGET_WEI: String(1_000_000n * GWEI), STAMP_BUDGET_WEI: "0" }, now: () => now });
  assert.equal((await pay(app, await payBody({ nonce: `0x${"01".repeat(32)}` }))).status, 200);
  // The receipt charged the real 535,000 gwei; 465,000 left is below the next worst case.
  const r = await pay(app, await payBody({ nonce: `0x${"02".repeat(32)}` }));
  assert.equal(r.status, 503);
  assert.equal((await json(r)).reason, "BUDGET_CAP");
  assert.equal(f.sent.length, 1);
  now = NOW + 86_400_000;
  const tomorrow = await payBody({ nonce: `0x${"03".repeat(32)}`, validBefore: String(Math.floor(now / 1000) + 600) });
  assert.equal((await pay(app, tomorrow)).status, 200);
});

// ------------------------------------------------------------------ rate limit, queue

test("RATE_LIMIT: PAYS_PER_MINUTE_PER_IP valid requests per IP per minute; other IPs are not affected", async () => {
  let ip = "10.0.0.1";
  const { app } = makeApp({ env: { PAYS_PER_MINUTE_PER_IP: "2" }, ip: () => ip });
  for (let i = 0; i < 2; i++) assert.equal((await pay(app, await payBody({ nonce: `0x${String(i).repeat(64)}` }))).status, 200);
  const r = await pay(app, await payBody({ nonce: `0x${"9".repeat(64)}` }));
  assert.equal(r.status, 429);
  assert.equal((await json(r)).reason, "RATE_LIMIT");
  ip = "10.0.0.2";
  assert.equal((await pay(app, await payBody({ nonce: `0x${"8".repeat(64)}` }))).status, 200);
});

test("payments share the relayer's send queue with stamps: a payment waits for the stamp in flight (one nonce sequence)", async () => {
  let releaseStamp!: () => void;
  const stampDone = new Promise<void>((r) => (releaseStamp = r));
  const order: string[] = [];
  const stampWriter: ChainWriter = {
    address: RELAYER,
    simulate: async () => {},
    estimateGas: async () => 2_500_000n,
    fees: async () => ({ maxFeePerGas: GWEI, maxPriorityFeePerGas: 1n }),
    async send() {
      order.push("stamp:send");
      await stampDone;
      return `0x${"aa".repeat(32)}`;
    },
    async waitForReceipt() {
      order.push("stamp:receipt");
      return { status: "success", costWei: 1n };
    },
  };
  const f = fakes();
  const origFees = f.writer.fees.bind(f.writer);
  f.writer.fees = async (c) => {
    order.push("pay:fees");
    return origFees(c);
  };
  // The stamp app shares nothing with this one except what createApp builds: so drive both through one app.
  const { app } = makeApp({ f, stampWriter, env: { APP_IDS: "42" } });
  const sessionRes = await send(app, "/session", { wallet: PAYER, appId: "42", chainId: "1874" });
  const { session, sig } = (await sessionRes.json()) as { session: unknown; sig: Hex };
  const stamp = send(app, "/stamp", {
    session,
    sig,
    proof: `0x${"cd".repeat(64)}`,
    publicInputs: Array.from({ length: 6 }, (_, i) => `0x${(i + 1).toString(16).padStart(64, "0")}`),
  });
  await new Promise((r) => setTimeout(r, 20));
  const payment = pay(app, await payBody());
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(order, ["stamp:send"]);
  releaseStamp();
  assert.equal((await stamp).status, 200);
  assert.equal((await payment).status, 200);
  assert.deepEqual(order, ["stamp:send", "stamp:receipt", "pay:fees"]);
});

test("BUSY when STAMP_MAX_QUEUE payments are already waiting on the chain's queue", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const { app } = makeApp({ env: { STAMP_MAX_QUEUE: "1" }, f: fakes({ send: async () => { await gate; return `0x${"01".repeat(32)}`; } }) });
  const first = pay(app, await payBody({ nonce: `0x${"01".repeat(32)}` }));
  await new Promise((r) => setTimeout(r, 20));
  const second = await pay(app, await payBody({ nonce: `0x${"02".repeat(32)}` }));
  assert.equal(second.status, 503);
  assert.equal((await json(second)).reason, "BUSY");
  release();
  assert.equal((await first).status, 200);
});

// ------------------------------------------------------------------ after sending

test("send failure is 502 PAY_SEND_FAILED and gives the reservation back", async () => {
  let fail = true;
  const budget = String(700_000n * GWEI); // one worst case (660,000 gwei) fits
  const { app } = makeApp({
    env: { DAILY_BUDGET_WEI: budget },
    f: fakes({ send: async () => { if (fail) throw new Error("nonce too low"); return `0x${"02".repeat(32)}`; } }),
  });
  const r = await pay(app, await payBody());
  assert.equal(r.status, 502);
  assert.equal((await json(r)).reason, "PAY_SEND_FAILED");
  fail = false;
  assert.equal((await pay(app, await payBody({ nonce: `0x${"03".repeat(32)}` }))).status, 200);
});

test("no receipt in time is 504 PAY_PENDING { txHash }, charged at the worst case", async () => {
  const { app } = makeApp({ env: { DAILY_BUDGET_WEI: String(700_000n * GWEI) }, f: fakes({ receipt: async () => ({ status: "timeout" }) }) });
  const r = await pay(app, await payBody());
  assert.equal(r.status, 504);
  const out = await json(r);
  assert.equal(out.reason, "PAY_PENDING");
  assert.match(out.txHash!, /^0x[0-9a-f]{64}$/);
  assert.equal((await json(await pay(app, await payBody({ nonce: `0x${"04".repeat(32)}` })))).reason, "BUDGET_CAP");
});

test("SPONSOR-1: after PAY_MAX_REVERTS_PER_WALLET mined reverts a wallet is refused QUOTA_USED for the rest of the UTC day", async () => {
  let now = NOW;
  const f = fakes({ receipt: async () => ({ status: "reverted", costWei: 100_000n * GWEI }) });
  const { app } = makeApp({ f, now: () => now });
  for (let i = 1; i <= 2; i++) {
    const r = await pay(app, await payBody({ nonce: `0x${String(i).repeat(64)}` }));
    assert.equal(r.status, 502);
    const out = await json(r);
    assert.equal(out.reason, "PAY_REVERTED");
    assert.match(out.txHash!, /^0x/);
  }
  const before = f.log.length;
  const r = await pay(app, await payBody({ nonce: `0x${"3".repeat(64)}` }));
  assert.equal(r.status, 429);
  assert.deepEqual(await json(r), { reason: "QUOTA_USED", error: "QUOTA_USED", detail: "REVERTED_RELAYS" });
  assert.equal(f.log.length, before, "refused before any chain access");
  // GET /balance shows no quota for that wallet either.
  assert.equal(((await (await app.request(`/balance/${PAYER}`)).json()) as { quotaLeft: number }).quotaLeft, 0);
  now = NOW + 86_400_000;
  const tomorrow = await payBody({ nonce: `0x${"4".repeat(64)}`, validBefore: String(Math.floor(now / 1000) + 600) });
  assert.equal((await pay(app, tomorrow)).status, 502); // allowed again (and reverts again in this fake)
});

// ------------------------------------------------------------------ logs

test("logs hold only the reason and a truncated wallet: never the signature, the intent or the recipient", async () => {
  const lines: string[] = [];
  const orig = { warn: console.warn, log: console.log };
  console.warn = (...a: unknown[]) => lines.push(a.join(" "));
  console.log = (...a: unknown[]) => lines.push(a.join(" "));
  try {
    const { app } = makeApp({ env: { DEMO_MODE: "false" }, f: fakes({ simulate: async () => { throw new PayRejected("TetherToken: auth invalid"); } }) });
    const b = await payBody();
    await pay(app, b);
    await pay(app, { ...b, signature: "0x12" });
  } finally {
    console.warn = orig.warn;
    console.log = orig.log;
  }
  const all = lines.join("\n");
  assert.match(all, /refused NONCE_USED:TetherToken: auth invalid 0x70…79C8/);
  assert.match(all, /refused BAD_REQUEST/);
  const b = await payBody();
  for (const secret of [b.signature.slice(2, 20), b.intent.nonce.slice(2, 20), SHOP.slice(2, 12), PAYER.slice(2, 12)])
    assert.ok(!all.toLowerCase().includes(secret.toLowerCase()), secret);
});

// ------------------------------------------------------------------ POST /fund

test("POST /fund sends DEMO_FUND_USDT from the business to a stamped wallet, once per wallet per run", async () => {
  const { app, f } = makeApp({ env: { DEMO_FUND_USDT: "2" } });
  const r = await send(app, "/fund", { wallet: PAYER.toLowerCase() });
  assert.equal(r.status, 200);
  const body = await json(r);
  assert.match(body.txHash!, /^0x[0-9a-f]{64}$/);
  assert.equal(body.from, BUSINESS, "the business sends the demo USDT and pays its own gas");
  assert.deepEqual(f.funded, [{ to: PAYER, amount: 2_000_000n }]);
  assert.deepEqual(f.log, ["fund:simulate", "fund:send"]);
  const again = await send(app, "/fund", { wallet: PAYER });
  assert.equal(again.status, 409);
  assert.equal((await json(again)).reason, "ALREADY_FUNDED");
  assert.equal(f.funded.length, 1);
});

test("POST /fund: FUND_NOT_CONFIGURED, SPONSOR_NOT_CONFIGURED, a bad wallet and NOT_STAMPED send nothing", async () => {
  const noKey = makeApp({ funder: null });
  assert.equal((await json(await send(noKey.app, "/fund", { wallet: PAYER }))).reason, "FUND_NOT_CONFIGURED");
  const noSponsor = makeApp({ env: { SPONSOR_ADDRESS: "" } });
  const r = await send(noSponsor.app, "/fund", { wallet: PAYER });
  assert.equal(r.status, 503);
  assert.equal((await json(r)).reason, "SPONSOR_NOT_CONFIGURED");
  const { app, f } = makeApp({ f: fakes({ stamped: false }) });
  for (const w of [undefined, "0x12", "0x0000000000000000000000000000000000000000"])
    assert.equal((await send(app, "/fund", { wallet: w })).status, 400);
  const ns = await send(app, "/fund", { wallet: PAYER });
  assert.equal(ns.status, 403);
  assert.equal((await json(ns)).reason, "NOT_STAMPED");
  assert.deepEqual(f.funded, []);
});

test("POST /fund: an empty business wallet is 503 FUND_EMPTY, and a failed send can be retried", async () => {
  let empty = true;
  let sendFails = true;
  const { app, f } = makeApp({
    f: fakes({
      fundSimulate: async () => { if (empty) throw new PayRejected("ERC20: transfer amount exceeds balance"); },
      fundSend: async () => { if (sendFails) throw new Error("rpc"); return `0x${"0f".repeat(32)}`; },
    }),
  });
  const r1 = await send(app, "/fund", { wallet: PAYER });
  assert.equal(r1.status, 503);
  assert.equal((await json(r1)).reason, "FUND_EMPTY");
  empty = false;
  const r2 = await send(app, "/fund", { wallet: PAYER });
  assert.equal(r2.status, 502);
  assert.equal((await json(r2)).reason, "FUND_SEND_FAILED");
  sendFails = false;
  assert.equal((await send(app, "/fund", { wallet: PAYER })).status, 200);
  assert.equal(f.funded.length, 2);
});

test("POST /fund: two parallel requests for one wallet send once", async () => {
  const { app, f } = makeApp();
  const [a, b] = await Promise.all([send(app, "/fund", { wallet: PAYER }), send(app, "/fund", { wallet: PAYER })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(f.funded.length, 1);
});

// ------------------------------------------------------------------ GET /balance

test("GET /balance/:wallet → { usdt (decimal string), quotaLeft }", async () => {
  const { app, f } = makeApp({ f: fakes({ balance: 1_500_000n, quota: 17 }) });
  const r = await app.request(`/balance/${PAYER.toLowerCase()}`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { usdt: "1.5", quotaLeft: 17 });
  assert.ok(f.reads.includes(`balance:${USDT}:${PAYER}`));

  const notStamped = makeApp({ f: fakes({ stamped: false, balance: 0n }) });
  assert.deepEqual(await (await notStamped.app.request(`/balance/${PAYER}`)).json(), { usdt: "0", quotaLeft: 0 });
  // Before the sponsor is deployed: the balance still works, quotaLeft is 0.
  const noSponsor = makeApp({ env: { SPONSOR_ADDRESS: "" }, f: fakes({ balance: 2_000_000n }) });
  assert.deepEqual(await (await noSponsor.app.request(`/balance/${PAYER}`)).json(), { usdt: "2", quotaLeft: 0 });

  assert.equal((await app.request("/balance/0x12")).status, 400);
  const down = makeApp({ f: fakes({ readFails: true }) });
  const d = await down.app.request(`/balance/${PAYER}`);
  assert.equal(d.status, 502);
  assert.equal((await json(d)).reason, "CHAIN_UNAVAILABLE");
});

// ------------------------------------------------------------------ config

test("config: payment settings have the agreed defaults and refuse bad values", () => {
  const base = { SESSION_SIGNER_KEY: SIGNER_KEY, PROVER_URL: "x", APP_IDS: "1" };
  const c = loadConfig(base);
  assert.equal(c.pay.maxValue, 5_000_000n);
  assert.equal(c.pay.demoFund, 2_000_000n);
  assert.equal(c.pay.perMinutePerIp, 10);
  assert.equal(c.pay.maxRevertsPerWallet, 2);
  assert.equal(c.pay.paused, false);
  assert.equal(c.businessKey, null);
  assert.equal(c.chains.get(1874)!.usdt, USDT);
  assert.equal(c.chains.get(1874)!.sponsor, null);
  assert.equal(c.chains.get(1337)!.usdt, null);
  const blank = loadConfig({ ...base, PAY_MAX_USDT: "", DEMO_FUND_USDT: "", BUSINESS_PRIVATE_KEY: "" });
  assert.equal(blank.pay.maxValue, 5_000_000n);
  assert.equal(loadConfig({ ...base, PAY_MAX_USDT: "0.25" }).pay.maxValue, 250_000n);
  assert.equal(loadConfig({ ...base, BUSINESS_PRIVATE_KEY: OTHER_KEY }).businessKey, OTHER_KEY);
  assert.equal(loadConfig({ ...base, SPONSOR_ADDRESS: SPONSOR.toLowerCase() }).chains.get(1874)!.sponsor, SPONSOR);
  assert.throws(() => loadConfig({ ...base, PAY_MAX_USDT: "0" }), /PAY_MAX_USDT/);
  assert.throws(() => loadConfig({ ...base, PAY_MAX_USDT: "1.0000001" }), /PAY_MAX_USDT/);
  assert.throws(() => loadConfig({ ...base, DEMO_FUND_USDT: "two" }), /DEMO_FUND_USDT/);
  assert.throws(() => loadConfig({ ...base, BUSINESS_PRIVATE_KEY: "0x12" }), /BUSINESS_PRIVATE_KEY/);
  assert.throws(() => loadConfig({ ...base, PAYS_PER_MINUTE_PER_IP: "0" }), /PAYS_PER_MINUTE_PER_IP/);
  assert.throws(() => loadConfig({ ...base, SPONSOR_ADDRESS: "0x12" }), /SPONSOR_ADDRESS/);
});
