import assert from "node:assert/strict";
import { before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { RegistryNotDeployedError, type Policy, type StampReader } from "@watermark/sdk";
import { fieldHex, initHash, rulesTree } from "@watermark/zk";
import type { Address } from "viem";
import { createServer } from "./server.ts";
import { checkWallet, checkWallets, draft, explain, integrationSnippet, ToolError, type ToolDeps } from "./tools.ts";

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

const deps = (over: Partial<ToolDeps> = {}): ToolDeps => ({
  registryFor: (chain) => {
    if (chain === "devnet") throw new RegistryNotDeployedError(chain);
    return REGISTRY;
  },
  getPolicy: (id) => (id === "12345" ? testPolicy : null),
  rulesRoot: async (leaves) => fieldHex(rulesTree(leaves.map((l) => ({ networkId: l.networkId, prefixLength: l.prefixLength, prefix: l.prefix }))).root),
  reader,
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
  assert.match(integrationSnippet(deps(), { language: "solidity", appId: "12345" }).code, /watermarkAppId = 12345;/);
  assert.match(integrationSnippet(deps(), { language: "typescript", appId: "12345" }).code, /checkMany/);
  assert.throws(() => integrationSnippet(deps(), { language: "solidity", appId: "1; drop" }), ToolError);
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
      "watermark_check_wallet",
      "watermark_check_wallets",
      "watermark_draft_policy",
      "watermark_explain_policy",
      "watermark_get_policy",
      "watermark_integration_snippet",
    ],
  );
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));

  const res = await client.callTool({ name: "watermark_check_wallet", arguments: { wallet: A, appId: "12345" } });
  const text = (res.content as { type: string; text: string }[])[0]!.text;
  assert.equal(JSON.parse(text).stamped, true);

  // An invalid prefix is rejected by the schema before any handler runs
  const bad = await client.callTool({
    name: "watermark_draft_policy",
    arguments: { networks: ["RUPAY"], prefixes: [{ network: "RUPAY", prefix: "9900010000" }] },
  });
  assert.equal(bad.isError, true);
  await client.close();
});
