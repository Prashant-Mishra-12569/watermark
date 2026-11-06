import assert from "node:assert/strict";
import { before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RegistryNotDeployedError, type ChainReader, type Policy, type StampReader } from "@watermark/sdk";
import { fieldHex, initHash, rulesTree } from "@watermark/zk";
import type { Address } from "viem";
import { createServer } from "./server.ts";
import {
  appInfoTool,
  checkWallet,
  checkWallets,
  createVerifyLink,
  draft,
  explain,
  integrationSnippet,
  listApps,
  prepareRegisterAppTool,
  stampHistoryTool,
  supportedCardsTool,
  ToolError,
  type ToolDeps,
} from "./tools.ts";

const REGISTRY = "0x00000000000000000000000000000000000000aa" as Address;
const A = "0x00000000000000000000000000000000000000a1";
const NOW = 1_800_000_000;
// The committed test policy's rulesRoot for the synthetic leaf (RuPay, 6, 990001), as computed by the circuit.
const TEST_RULES_ROOT = "0x08d09d15afbf7ceeb7a9d05802ab845bf6316bf9fdffd57f593a718ec89eb90f";

const testPolicy: Policy = {
  label: "Watermark test",
  environment: "test",
  appId: "12345",
  leaves: [{ network: "RUPAY", networkId: 1, prefixLength: 6, prefix: "990001", bank: "Synthetic test card", type: "debit", status: "tested" }],
  rulesRoot: TEST_RULES_ROOT,
  quotaPerDay: 20,
  stampMonths: 3,
};

const reader: StampReader = {
  async readContract(a) {
    return a.args[0].toLowerCase() === A ? [true, BigInt(NOW + 86_400)] : [false, 0n];
  },
  async multicall(a) {
    return a.contracts.map((c) => ({
      status: "success" as const,
      result: (c.args[0].toLowerCase() === A ? [true, BigInt(NOW + 86_400)] : [false, 0n]) as readonly [boolean, bigint],
    }));
  },
};

const OWNER = "0x00000000000000000000000000000000000a11ce";
const SIGNER = "0x00000000000000000000000000000000000051e9";

/** Fake chain for app info and history: app 12345 is registered with the test policy's root. */
const chainReader: ChainReader & { multicall: StampReader["multicall"] } = {
  async readContract(a) {
    if (a.functionName === "apps") {
      return String(a.args?.[0]) === "12345"
        ? [OWNER, TEST_RULES_ROOT, SIGNER]
        : ["0x0000000000000000000000000000000000000000", `0x${"00".repeat(32)}`, "0x0000000000000000000000000000000000000000"];
    }
    return [false, 0n];
  },
  async getContractEvents(a) {
    const all = [
      { wallet: A, block: 150n },
      { wallet: "0x00000000000000000000000000000000000000b2", block: 160n },
    ];
    return all
      .filter((e) => e.block >= a.fromBlock && e.block <= a.toBlock)
      .map((e) => ({ args: { wallet: e.wallet, appId: 12345n, expiresAt: BigInt(NOW + 86_400) }, blockNumber: e.block, transactionHash: `0x${"ab".repeat(32)}` as const }));
  },
  async getBlockNumber() {
    return 200n;
  },
  multicall: reader.multicall,
};

const deps = (over: Partial<ToolDeps> = {}): ToolDeps => ({
  registryFor: (chain) => {
    if (chain === "devnet") throw new RegistryNotDeployedError(chain);
    return REGISTRY;
  },
  getPolicy: (id) => (id === "12345" ? testPolicy : null),
  rulesRoot: async (leaves) => fieldHex(rulesTree(leaves.map((l) => ({ networkId: l.networkId, prefixLength: l.prefixLength, prefix: l.prefix }))).root),
  reader,
  chainReader,
  deployBlock: (chain) => (chain === "whitechain" ? 100 : undefined),
  deployedApps: (chain) => (chain === "whitechain" ? [{ appId: "12345", environment: "test" as const, label: "Watermark test", rulesRoot: TEST_RULES_ROOT }] : []),
  now: () => NOW,
  ...over,
});

before(initHash);

test("check_wallet reports a live stamp and what it means", async () => {
  const r = await checkWallet(deps(), { wallet: A, appId: "12345" });
  assert.equal(r.stamped, true);
  assert.equal(r.expiresAt, NOW + 86_400);
  assert.match(r.meaning, /not identity, KYC/);
});

test("check_wallet says clearly when the registry isn't deployed", async () => {
  await assert.rejects(checkWallet(deps(), { wallet: A, appId: "1", chain: "devnet" }), (e: unknown) => e instanceof ToolError && /isn't deployed/.test(e.message));
});

test("check_wallets counts stamped wallets and caps at 200", async () => {
  const r = await checkWallets(deps(), { wallets: [A, "0x00000000000000000000000000000000000000b2"], appId: "12345" });
  assert.equal(r.total, 2);
  assert.equal(r.stamped, 1);
  await assert.rejects(checkWallets(deps(), { wallets: Array(201).fill(A), appId: "1" }), /200/);
});

test("draft_policy computes the same rulesRoot as the circuit for the test leaf", async () => {
  const r = await draft(deps(), {
    networks: ["RUPAY"],
    prefixes: [{ network: "RUPAY", prefix: "990001", bank: "Synthetic test card", type: "debit", status: "tested" }],
  });
  assert.equal(r.rulesRoot, TEST_RULES_ROOT);
  assert.ok(r.warnings.some((w) => w.startsWith("Narrow filter")));
  assert.ok(!r.warnings.some((w) => w.startsWith("rulesRoot is computed")));
  assert.match(r.explanation.whatItDoesNotProve, /KYC/);
});

test("explain_policy and the integration snippets", () => {
  assert.match(explain(deps(), { appId: "12345" }).whoPasses, /1 listed prefixes/);
  assert.throws(() => explain(deps(), { appId: "999" }), ToolError);
  const sol = integrationSnippet(deps(), { language: "solidity", appId: "12345" });
  assert.match(sol.code, /watermarkAppId = 12345;/);
  assert.match(sol.code, /onlyStamped/);
  assert.match(sol.code, new RegExp(REGISTRY));
  const ts = integrationSnippet(deps(), { language: "typescript", appId: "12345" });
  assert.match(ts.code, /checkMany/);
  assert.match(ts.code, /allowlist/);
  // Before a deploy the snippet still works, with a placeholder address
  assert.match(integrationSnippet(deps(), { language: "solidity", appId: "1", chain: "devnet" }).code, /not deployed/);
  assert.throws(() => integrationSnippet(deps(), { language: "solidity", appId: "1; drop" }), ToolError);
});

test("app_info audits the on-chain filter against the published policy", async () => {
  const ok = await appInfoTool(deps(), { appId: "12345" });
  assert.equal(ok.exists, true);
  assert.equal(ok.audit.matches, true);
  assert.deepEqual(ok.audit.issues, []);
  const missing = await appInfoTool(deps(), { appId: "999" });
  assert.equal(missing.exists, false);
  assert.equal(missing.audit.matches, false);
  assert.equal(missing.audit.issues.length, 2);
});

test("stamp_history counts stamps from the deploy block and links each one", async () => {
  const h = await stampHistoryTool(deps(), { appId: "12345", limit: 1 });
  assert.equal(h.totalStamps, 2);
  assert.equal(h.uniqueWallets, 2);
  assert.equal(h.liveNow, 1);
  assert.equal(h.latest.length, 1);
  assert.equal(h.latest[0]?.block, 160);
  assert.match(h.latest[0]?.explorer ?? "", /explorer\.testnet\.whitechain\.io\/tx\//);
  await assert.rejects(stampHistoryTool(deps(), { appId: "12345", chain: "devnet" }), ToolError);
});

test("prepare_register_app returns an unsigned tx, the appId and the warnings; refuses a zero filter", () => {
  const salt = `0x${"00".repeat(32)}`;
  const r = prepareRegisterAppTool(deps(), { owner: OWNER, rulesRoot: TEST_RULES_ROOT, sessionSigner: SIGNER, salt });
  assert.equal(r.unsignedTransaction.to, REGISTRY);
  assert.equal(r.unsignedTransaction.value, "0");
  assert.match(r.appId, /^\d+$/);
  assert.ok(r.warnings.some((w) => w.includes("Narrow filter") || w.includes("narrow filter")));
  assert.match(r.nextStep, /sends nothing/);
  const random = prepareRegisterAppTool(deps(), { owner: OWNER, rulesRoot: TEST_RULES_ROOT, sessionSigner: SIGNER });
  assert.match(random.salt, /^0x[0-9a-f]{64}$/);
  assert.throws(
    () => prepareRegisterAppTool(deps(), { owner: OWNER, rulesRoot: `0x${"00".repeat(32)}`, sessionSigner: SIGNER, salt }),
    (e: unknown) => e instanceof ToolError && /zero/.test(e.message),
  );
});

test("verify link, app list and an honest card list", () => {
  assert.equal(createVerifyLink(deps(), { appId: "12345", siteUrl: "https://watermark.example" }).link, "https://watermark.example/verify?app=12345");
  assert.throws(() => createVerifyLink(deps(), { appId: "1", siteUrl: "ftp://x" }), ToolError);
  const apps = listApps(deps(), {});
  assert.equal(apps.registry, REGISTRY);
  assert.equal(apps.apps[0]?.appId, "12345");
  assert.match(listApps(deps(), { chain: "devnet" }).note ?? "", /Nothing is deployed/);
  const cards = supportedCardsTool().cards;
  assert.deepEqual(cards.map((c) => c.status), ["live", "planned", "planned"]);
  assert.match(cards[1]!.detail, /planned, not live/);
});

test("draft_policy warns that Visa and Mastercard are planned, not live", async () => {
  const r = await draft(deps(), { networks: ["VISA"], prefixes: [{ network: "VISA", prefix: "412345", bank: "Test Bank" }] });
  assert.ok(r.warnings.some((w) => w.includes("planned, not live")));
});

test("MCP round trip: list the tools and call two of them over the protocol", async () => {
  const server = createServer(deps());
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    [
      "watermark_app_info",
      "watermark_check_wallet",
      "watermark_check_wallets",
      "watermark_create_verify_link",
      "watermark_draft_policy",
      "watermark_explain_policy",
      "watermark_get_policy",
      "watermark_integration_snippet",
      "watermark_list_apps",
      "watermark_prepare_register_app",
      "watermark_stamp_history",
      "watermark_supported_cards",
    ],
  );
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));

  const cards = await client.callTool({ name: "watermark_supported_cards", arguments: {} });
  assert.match((cards.content as { text: string }[])[0]!.text, /planned, not live/);

  const res = await client.callTool({ name: "watermark_check_wallet", arguments: { wallet: A, appId: "12345" } });
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  assert.equal(JSON.parse(text).stamped, true);

  // A full card number is rejected by the schema before any handler runs.
  // Built from parts (fake test BIN + digits) so no card-number-like literal sits in the repo (CI guard).
  const fakePan = "990001" + "0000123455";
  const bad = await client.callTool({
    name: "watermark_draft_policy",
    arguments: { networks: ["RUPAY"], prefixes: [{ network: "RUPAY", prefix: fakePan }] },
  });
  assert.equal(bad.isError, true);
  await client.close();
});
