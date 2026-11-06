import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { RULES_TREE_DEPTH } from "./tree.ts";

type Leaf = { networkId: number; prefixLength: number; prefix: string; category?: string };
const live = JSON.parse(readFileSync(new URL("../../../policies/live.json", import.meta.url), "utf8")) as {
  appId: string;
  leaves: Leaf[];
};

test("the live filter has no prepaid and no uncategorised card ranges", () => {
  // Prepaid cards are sold over the counter with little KYC; one person could buy many and stamp many wallets.
  assert.deepEqual(live.leaves.filter((l) => !l.category), []);
  assert.deepEqual(live.leaves.filter((l) => /PREPAID/i.test(l.category!)), []);
});

test("every live leaf is a unique 6-digit RuPay prefix and the list fits the rules tree", () => {
  for (const l of live.leaves) {
    assert.equal(l.networkId, 1);
    assert.equal(l.prefixLength, 6);
    assert.match(l.prefix, /^\d{6}$/);
  }
  assert.equal(new Set(live.leaves.map((l) => l.prefix)).size, live.leaves.length);
  assert.ok(live.leaves.length <= 2 ** RULES_TREE_DEPTH);
});

test("the live policy names the app registered on-chain", () => {
  const d = JSON.parse(readFileSync(new URL("../../../deployments/whitechain.json", import.meta.url), "utf8"));
  assert.equal(live.appId, d.liveAppId);
});
