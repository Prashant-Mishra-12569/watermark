/**
 * Review (drain and abuse lens) of POST /pay: regression tests for PAY-DRAIN-1 and PAY-DRAIN-2, which pin the fixes.
 * No network: every chain access is a fake. Keys are public anvil test keys.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { intentTypedData, type FundWriter, type PayReader, type PayWriter, type SponsorInfo } from "./pay.ts";
import type { StampFees, StampReceipt } from "./stamp.ts";
import type { PaymentIntent } from "./usdt.ts";

// anvil accounts #0 and #1: public test keys, never used on a real network.
const SIGNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
const PAYER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;
const PAYER = privateKeyToAccount(PAYER_KEY).address;
const SHOP = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const RELAYER = "0x00000000000000000000000000000000000000eE" as Address;
const REGISTRY = "0x00000000000000000000000000000000000000AA" as Address;
const SPONSOR = "0x00000000000000000000000000000000000000cc" as Address;
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as Address;
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const NOW_S = NOW / 1000;
const GWEI = 1_000_000_000n;

interface Fakes {
  receipt?: () => Promise<StampReceipt>;
  estimate?: bigint;
}

function fakes(o: Fakes = {}) {
  const sent: { gas: bigint; fees: StampFees; nonce: Hex }[] = [];
  const simulated: { gas: bigint; fees: StampFees }[] = [];
  let n = 0;
  const info: SponsorInfo = { appId: 42n, registry: REGISTRY, relayer: RELAYER, usdt: USDT };
  const reader: PayReader = {
    sponsorInfo: async () => info,
    isStamped: async () => true,
    quotaLeft: async () => 20,
    usdtBalance: async () => 2_000_000n,
  };
  const writer: PayWriter = {
    address: RELAYER,
    fees: async () => ({ maxFeePerGas: 5n * GWEI, maxPriorityFeePerGas: 1n }),
    async simulate(_call, gas, fees) {
      simulated.push({ gas, fees });
    },
    estimateGas: async () => o.estimate ?? 110_000n,
    async send(call, gas, fees) {
      sent.push({ gas, fees, nonce: call.intent.nonce });
      return `0x${(++n).toString(16).padStart(64, "0")}` as Hex;
    },
    waitForReceipt: async () => (o.receipt ? o.receipt() : { status: "success", costWei: 107_000n * 5n * GWEI }),
  };
  const funder: FundWriter = {
    address: "0x00000000000000000000000000000000000000bb",
    simulate: async () => {},
    send: async () => `0x${"f".repeat(64)}`,
    waitForReceipt: async () => ({ status: "success", costWei: 1n }),
  };
  return { reader, writer, funder, sent, simulated };
}

function makeApp(f: ReturnType<typeof fakes>, env: Record<string, string> = {}, ip: () => string = () => "10.0.0.1") {
  const config = loadConfig({
    SESSION_SIGNER_KEY: SIGNER_KEY,
    PROVER_URL: "http://192.168.1.2:8787",
    APP_IDS: "42",
    REGISTRY_ADDRESS: REGISTRY,
    SPONSOR_ADDRESS: SPONSOR,
    ...env,
  });
  return createApp({
    config,
    chain: { status: async () => ({ stamped: true, expiresAt: 0, quotaLeft: 0 }) },
    writer: null,
    payReader: f.reader,
    payWriter: f.writer,
    funder: f.funder,
    clientIp: ip,
    nowMs: () => NOW,
  });
}

async function payBody(nonceByte: number, over: Partial<PaymentIntent> = {}) {
  const intent: PaymentIntent = {
    from: PAYER,
    to: SHOP,
    value: "1",
    validAfter: "0",
    validBefore: String(NOW_S + 900),
    nonce: `0x${nonceByte.toString(16).padStart(2, "0").repeat(32)}` as Hex,
    ...over,
  };
  const signature = await privateKeyToAccount(PAYER_KEY).signTypedData(intentTypedData(intent, 1874, USDT));
  return { intent, signature };
}

const pay = (app: ReturnType<typeof makeApp>, b: unknown) =>
  app.request("/pay", { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json" } });

// ------------------------------------------------------------------ PAY-DRAIN-1

test("PAY-DRAIN-1: concurrent /pay requests from one wallet cannot get past PAY_MAX_REVERTS_PER_WALLET", async () => {
  // A stamped wallet whose relays pass eth_call but revert when mined (README "SPONSOR-1": e.g. an EIP-7702 delegated
  // burner, whose USDT signature check goes through ERC-1271). Each mined revert costs the relayer gas and no quota.
  // A real receipt takes a block or more: hold it until every request below has been accepted into the send queue.
  let mine!: () => void;
  const blockMined = new Promise<void>((r) => (mine = r));
  const f = fakes({
    receipt: async () => {
      await blockMined;
      return { status: "reverted", costWei: 132_000n * 5n * GWEI };
    },
  });
  // Defaults: PAY_MAX_REVERTS_PER_WALLET=2 and PAYS_PER_MINUTE_PER_IP=10. One IP is enough.
  const app = makeApp(f);
  const bodies = await Promise.all(Array.from({ length: 10 }, (_, i) => payBody(i + 1)));
  const inFlight = bodies.map((b) => pay(app, b));
  await new Promise((r) => setTimeout(r, 50));
  mine();
  const results = await Promise.all(inFlight);
  const reasons = await Promise.all(results.map(async (r) => ((await r.json()) as { reason?: string }).reason));

  // Before the fix the limit was checked only in handle(), before the job was queued, so all 10 relays were mined and
  // reverted (10x the configured limit; 20x with a second IP, up to STAMP_MAX_QUEUE). It is now checked again inside
  // the serial send queue.
  assert.equal(
    f.sent.length,
    2,
    `relayer sent ${f.sent.length} relays for one wallet that reverted on chain; PAY_MAX_REVERTS_PER_WALLET is 2 (reasons: ${reasons.join(",")})`,
  );
  assert.equal(reasons.filter((r) => r === "QUOTA_USED").length, 8);
});

// ------------------------------------------------------------------ PAY-DRAIN-2

test("PAY-DRAIN-2: the simulation runs with the gas limit the relay is sent with (no gasleft() difference to key on)", async () => {
  const f = fakes({ estimate: 110_000n });
  const app = makeApp(f);
  const r = await pay(app, await payBody(1));
  assert.equal(r.status, 200);
  // Before the fix: simulated with MAX_GAS_PER_PAY (300,000) but sent with estimate + 20 % (132,000). An ERC-1271 / EIP-7702
  // wallet that answers "valid" only when gasleft() is high passes the simulation and reverts when mined, every time.
  assert.equal(f.simulated[0]!.gas, f.sent[0]!.gas, "simulated gas limit differs from the gas limit that was sent");
});
