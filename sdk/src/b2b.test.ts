import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import {
  appInfo,
  computeAppId,
  draftPolicy,
  prepareRegisterApp,
  stampHistory,
  supportedCards,
  VISA_MASTERCARD_NOT_LIVE,
  type ChainReader,
} from "./client.ts";
import { auditApp, deployedApps, policyForApp, stampHistory as nodeStampHistory } from "./node.ts";
import { WATERMARK_REGISTRY_ABI } from "./registry.ts";

const REGISTRY = "0x00000000000000000000000000000000000000aa" as Address;
const OWNER = "0x00000000000000000000000000000000000a11ce";
const SIGNER = "0x00000000000000000000000000000000000051e9";
const W1 = "0x00000000000000000000000000000000000000a1";
const W2 = "0x00000000000000000000000000000000000000b2";
const ROOT = `0x${"12".repeat(32)}` as Hex;
const NOW = 1_800_000_000;

interface FakeEvent {
  wallet: string;
  appId: bigint;
  expiresAt: number;
  block: number;
}

/** A fake chain with apps, Stamped events and isStamped answers. Records every getLogs range. */
function fakeChain(opts: { apps?: Record<string, [string, Hex, string]>; events?: FakeEvent[]; head?: bigint; live?: string[] }) {
  const ranges: [bigint, bigint][] = [];
  const reader: ChainReader & { multicall: unknown } = {
    async readContract(a) {
      if (a.functionName === "apps") {
        const r = opts.apps?.[String(a.args?.[0])];
        return r ?? ["0x0000000000000000000000000000000000000000", `0x${"00".repeat(32)}`, "0x0000000000000000000000000000000000000000"];
      }
      if (a.functionName === "isStamped") {
        const w = String(a.args?.[0]).toLowerCase();
        return (opts.live ?? []).includes(w) ? [true, BigInt(NOW + 100)] : [false, 0n];
      }
      throw new Error(`unexpected ${a.functionName}`);
    },
    async getContractEvents(a) {
      ranges.push([a.fromBlock, a.toBlock]);
      return (opts.events ?? [])
        .filter((e) => BigInt(e.block) >= a.fromBlock && BigInt(e.block) <= a.toBlock)
        .map((e) => ({
          args: { wallet: e.wallet, appId: e.appId, expiresAt: BigInt(e.expiresAt) },
          blockNumber: BigInt(e.block),
          transactionHash: `0x${e.block.toString(16).padStart(64, "0")}` as Hex,
        }));
    },
    async getBlockNumber() {
      return opts.head ?? 1000n;
    },
    multicall: async (a: { contracts: { args: [string, bigint] }[] }) =>
      a.contracts.map((c) => ({
        status: "success" as const,
        result: ((opts.live ?? []).includes(c.args[0].toLowerCase()) ? [true, BigInt(NOW + 100)] : [false, 0n]) as readonly [boolean, bigint],
      })),
  };
  return { reader, ranges };
}

test("appInfo reads the on-chain app and says when it doesn't exist", async () => {
  const { reader } = fakeChain({ apps: { "7": [OWNER, ROOT, SIGNER] } });
  const a = await appInfo("7", { registry: REGISTRY, client: reader });
  assert.equal(a.exists, true);
  assert.equal(a.rulesRoot, ROOT);
  assert.equal((await appInfo("8", { registry: REGISTRY, client: reader })).exists, false);
});

test("stampHistory reads Stamped events in chunks from the deploy block", async () => {
  const events: FakeEvent[] = [
    { wallet: W1, appId: 7n, expiresAt: NOW + 100, block: 120 },
    { wallet: W2, appId: 7n, expiresAt: NOW - 1, block: 330 }, // expired
    { wallet: W1, appId: 7n, expiresAt: NOW + 100, block: 999 }, // renewal
    { wallet: W2, appId: 8n, expiresAt: NOW + 100, block: 500 }, // another app: ignored
  ];
  const { reader, ranges } = fakeChain({ events, head: 1000n, live: [W1] });
  const h = await stampHistory("7", { registry: REGISTRY, client: reader, fromBlock: 100n, chunk: 300, now: () => NOW });
  assert.deepEqual(ranges, [[100n, 399n], [400n, 699n], [700n, 999n], [1000n, 1000n]]);
  assert.equal(h.total, 3);
  assert.equal(h.uniqueWallets, 2);
  assert.equal(h.checked, 2);
  assert.equal(h.active, 1); // W1 live, W2 expired
  assert.deepEqual(h.stamps.map((s) => s.block), [999, 330, 120]); // newest first
  assert.equal(h.stamps[0]?.wallet, getAddress(W1));
});

test("stampHistory handles an empty range and requires a start block", async () => {
  const { reader, ranges } = fakeChain({ head: 50n });
  const h = await stampHistory("7", { registry: REGISTRY, client: reader, fromBlock: 100n });
  assert.equal(h.total, 0);
  assert.equal(h.checked, 0);
  assert.equal(ranges.length, 0);
  await assert.rejects(stampHistory("7", { registry: REGISTRY, client: reader }), /fromBlock/);
});

test("prepareRegisterApp returns an unsigned registerApp tx and the appId the registry computes", () => {
  const salt = `0x${"00".repeat(32)}` as Hex;
  const r = prepareRegisterApp({ owner: OWNER, salt, rulesRoot: ROOT, sessionSigner: SIGNER, registry: REGISTRY });
  assert.equal(r.tx.to, REGISTRY);
  assert.equal(r.tx.value, "0");
  assert.equal(r.tx.chainId, 1874);
  const call = decodeFunctionData({ abi: WATERMARK_REGISTRY_ABI, data: r.tx.data });
  assert.equal(call.functionName, "registerApp");
  assert.deepEqual(call.args, [salt, ROOT, getAddress(SIGNER)]);
  assert.equal(r.appId, computeAppId(OWNER, salt).toString());
  assert.ok(BigInt(r.appId) < 1n << 248n);
  assert.ok(r.warnings.some((w) => w.includes("immutable")));
});

test("prepareRegisterApp refuses what the registry would revert on", () => {
  const salt = `0x${"01".repeat(32)}` as Hex;
  const zero = `0x${"00".repeat(32)}` as Hex;
  assert.throws(() => prepareRegisterApp({ owner: OWNER, salt, rulesRoot: zero, sessionSigner: SIGNER, registry: REGISTRY }), /zero/);
  assert.throws(
    () => prepareRegisterApp({ owner: OWNER, salt, rulesRoot: ROOT, sessionSigner: "0x0000000000000000000000000000000000000000", registry: REGISTRY }),
    /zero address/,
  );
  assert.throws(() => prepareRegisterApp({ owner: OWNER, salt: "0x12" as Hex, rulesRoot: ROOT, sessionSigner: SIGNER, registry: REGISTRY }), /salt/);
});

test("supportedCards is honest: RuPay live, Visa and Mastercard planned", () => {
  const c = supportedCards();
  assert.deepEqual(c.map((x) => [x.network, x.status]), [["RUPAY", "live"], ["VISA", "planned"], ["MASTERCARD", "planned"]]);
  const p = draftPolicy({ networks: ["VISA"], prefixes: [{ network: "VISA", prefix: "412345", bank: "Test Bank" }] });
  assert.ok(p.warnings.includes(VISA_MASTERCARD_NOT_LIVE));
  const rupay = draftPolicy({ networks: ["RUPAY"], prefixes: [{ network: "RUPAY", prefix: "990001", bank: "Test Bank" }] });
  assert.ok(!rupay.warnings.includes(VISA_MASTERCARD_NOT_LIVE));
});

test("node: deployed apps, audit and history start at the deploy block", async () => {
  const root = mkdtempSync(join(tmpdir(), "wm-b2b-"));
  mkdirSync(join(root, "deployments"));
  mkdirSync(join(root, "policies"));
  writeFileSync(
    join(root, "deployments", "whitechain.json"),
    JSON.stringify({ chainId: 1874, registry: REGISTRY, appId: "7", rulesRoot: ROOT, liveAppId: "9", liveRulesRoot: ROOT, blockNumber: 100 }),
  );
  // The live policy has no appId filled in yet: it's matched through the deployment's live mapping
  writeFileSync(join(root, "policies", "test.json"), JSON.stringify({ label: "T", environment: "test", appId: "7", leaves: [], rulesRoot: ROOT }));
  writeFileSync(join(root, "policies", "live.json"), JSON.stringify({ label: "L", environment: "live", appId: "", leaves: [], rulesRoot: `0x${"34".repeat(32)}` }));

  assert.deepEqual(deployedApps("whitechain", root).map((a) => [a.appId, a.environment, a.label]), [["7", "test", "T"], ["9", "live", "L"]]);
  assert.equal(policyForApp("9", "whitechain", root)?.label, "L");

  const { reader, ranges } = fakeChain({ apps: { "7": [OWNER, ROOT, SIGNER], "9": [OWNER, ROOT, SIGNER] }, head: 150n });
  const ok = await auditApp("7", { client: reader }, root);
  assert.equal(ok.matches, true);
  const bad = await auditApp("9", { client: reader }, root);
  assert.equal(bad.matches, false);
  assert.match(bad.issues[0] ?? "", /differs/);

  await nodeStampHistory("7", { client: reader }, root);
  assert.equal(ranges[0]?.[0], 100n);
});
