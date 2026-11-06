import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import { verifyOda } from "@watermark/testcard";
import { fieldHex, initHash, poseidon2 } from "./hash.ts";
import { caLeaf, MerkleTree, nullifier, pack, RULES_TREE_DEPTH, CA_TREE_DEPTH, ruleLeaf } from "./tree.ts";

// Values computed by the circuit's own Noir code (circuits/src/zk.nr) for the synthetic test card,
// with networkId 1, filter leaf (6, "990001") and appId 12345. TS must reproduce them exactly.
const NOIR = {
  zero1: 0x0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1n,
  caRoot: 0x198ab4dd1b226ef292c9eba6eb4b1285e7216a51bb0ba872cf491bbe3ecbc3fen,
  rulesRoot: 0x08d09d15afbf7ceeb7a9d05802ab845bf6316bf9fdffd57f593a718ec89eb90fn, // rules tree depth 13
  nullifier: 0x23f0c97816e32b761ff5c1367ca6e57686fe46f390b969accc645a4990109259n,
};

const fixture = JSON.parse(
  readFileSync(new URL("../../testcard/fixtures/rupay-768.json", import.meta.url), "utf8"),
);
const caModulus = Buffer.from(fixture.caModulus, "hex");
const iccModulus = Buffer.from(verifyOda({ ...fixture.card, caModulus: fixture.caModulus }).iccModulus, "hex");

before(initHash);

test("Poseidon2(0, 0) matches the circuit", () => {
  assert.equal(poseidon2([0n, 0n]), NOIR.zero1);
});

test("CA root, rules root and nullifier match the circuit for the test card", () => {
  const ca = new MerkleTree(CA_TREE_DEPTH, [caLeaf(1, caModulus)]);
  const rules = new MerkleTree(RULES_TREE_DEPTH, [ruleLeaf(1, 6, "990001")]);
  assert.equal(fieldHex(ca.root), fieldHex(NOIR.caRoot));
  assert.equal(fieldHex(rules.root), fieldHex(NOIR.rulesRoot));
  assert.equal(fieldHex(nullifier(iccModulus, 12345n)), fieldHex(NOIR.nullifier));
});

test("pack splits into a length and 31-byte chunks", () => {
  assert.equal(pack(new Uint8Array(96)).length, 5);
  assert.equal(pack(new Uint8Array(248)).length, 9);
  assert.equal(pack(Uint8Array.of(1, 2))[1], 0x0102n);
});

test("Merkle paths verify for every leaf, and fail for the wrong leaf", () => {
  const leaves = [11n, 22n, 33n, 44n, 55n];
  const t = new MerkleTree(4, leaves);
  leaves.forEach((leaf, i) => assert.ok(MerkleTree.verify(leaf, t.path(i), t.root)));
  assert.ok(!MerkleTree.verify(99n, t.path(0), t.root));
});

test("a different app gives a different nullifier for the same card", () => {
  assert.notEqual(nullifier(iccModulus, 1n), nullifier(iccModulus, 2n));
});
