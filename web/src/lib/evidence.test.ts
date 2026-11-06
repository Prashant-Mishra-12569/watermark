import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCKSCOUT_VERIFIED,
  EF_ADMITTED_BLOCK,
  EF_ADMITTED_TX,
  EVIDENCE,
  FIRST_PAYMENT_TX,
  FIRST_STAMP_TX,
  LIVE_APP_PAYMENT_TX,
  PROOF_PAYMENT,
  buildEvidence,
  type Evidence,
  type EvidenceInput,
} from "./evidence.ts";
import { ADDR, REPO_URL, isTxHash } from "./site.ts";

const ALLOWED_HOSTS: Record<Evidence["chain"], string[]> = {
  whitechain: ["https://explorer.testnet.whitechain.io/", `${REPO_URL}/`],
  altmempool: ["https://explorer.altmempool.wtf/", `${REPO_URL}/`],
};

const base: EvidenceInput = {
  passAddress: null,
  livePaymentTx: null,
  verified: { registry: true, router: true, sponsor: false, genesisPass: false },
};
const byId = (rows: Evidence[] | readonly Evidence[], id: string): Evidence => {
  const row = rows.find((r) => r.id === id);
  assert.ok(row, `row ${id} exists`);
  return row;
};

function checkInvariants(rows: readonly Evidence[]) {
  const ids = rows.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const r of rows) {
    if (r.value === null) {
      // Never hidden: an empty value says so, with an honest chip, and links nowhere.
      assert.equal(r.href, null, r.id);
      assert.ok(r.status === "not-recorded" || r.status === "not-deployed", r.id);
    } else {
      assert.ok(r.href, `${r.id} has a link`);
      assert.notEqual(r.status, "not-recorded", r.id);
      assert.notEqual(r.status, "not-deployed", r.id);
    }
    for (const href of [r.href, ...(r.links ?? []).map((l) => l.href)]) {
      if (href === null) continue;
      assert.ok(
        ALLOWED_HOSTS[r.chain].some((h) => href.startsWith(h)),
        `${r.id} links to its own chain's explorer or the repo: ${href}`,
      );
    }
    if (r.value && r.value.startsWith("0x") && r.value.length === 66) assert.ok(isTxHash(r.value), r.id);
  }
}

test("the build's rows hold every invariant", () => {
  checkInvariants(EVIDENCE);
  assert.deepEqual(
    EVIDENCE.map((r) => r.id),
    ["contracts", "stamp", "payment-first", "payment-live", "zero-gas", "pass", "ef-tx", "ef-design"],
  );
});

test("values are exactly the recorded ones (SITE_SPEC.md FACTS OVERRIDE)", () => {
  assert.equal(FIRST_STAMP_TX, "0xd7e0166584dbb3b404d2b81308b5b69c94fa52b4d2d0da6a66759a52bb86bc07");
  assert.equal(FIRST_PAYMENT_TX, "0x298d3d178794b988aee4286db9591e6b9a8c1d2ad5008b69fd231460c7477c69");
  assert.equal(EF_ADMITTED_TX, "0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93");
  assert.equal(EF_ADMITTED_BLOCK, 3699);
  const ef = byId(EVIDENCE, "ef-tx");
  assert.equal(
    ef.href,
    "https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc",
  );
  assert.equal(ef.detail, "block 3699");
  assert.equal(ef.status, "admitted");
  assert.equal(byId(EVIDENCE, "ef-design").status, null);
});

test("the first stamp and first payment are LIVE and labelled as the first live app", () => {
  for (const id of ["stamp", "payment-first"]) {
    const r = byId(EVIDENCE, id);
    assert.equal(r.status, "live");
    assert.equal(r.note, "first live app (before the stricter filter)");
  }
  const zeroGas = byId(EVIDENCE, "zero-gas");
  assert.equal(zeroGas.value, `sent by relayer …${ADDR.relayer.slice(-4)}`);
  assert.equal(zeroGas.value, "sent by relayer …a9Ba");
});

test("the main-flow payment is NOT RECORDED until its one line is filled", () => {
  if (LIVE_APP_PAYMENT_TX === null) {
    const r = byId(EVIDENCE, "payment-live");
    assert.equal(r.value, null);
    assert.equal(r.status, "not-recorded");
    assert.equal(byId(EVIDENCE, "zero-gas").href?.endsWith(FIRST_PAYMENT_TX), true);
    assert.equal(PROOF_PAYMENT.txHash, FIRST_PAYMENT_TX);
  } else {
    // Recorded (README.md: the live app's main-flow payment): the row is LIVE and every proof points at it, unlabelled.
    assert.ok(isTxHash(LIVE_APP_PAYMENT_TX));
    assert.equal(byId(EVIDENCE, "payment-live").status, "live");
    assert.equal(byId(EVIDENCE, "zero-gas").href?.endsWith(LIVE_APP_PAYMENT_TX), true);
    assert.equal(PROOF_PAYMENT.txHash, LIVE_APP_PAYMENT_TX);
    assert.equal(PROOF_PAYMENT.note, null);
  }
  // Filling LIVE_APP_PAYMENT_TX is the whole change: the row turns LIVE and the 0-gas row follows it.
  const tx = `0x${"ab".repeat(32)}` as const;
  const filled = buildEvidence({ ...base, livePaymentTx: tx });
  checkInvariants(filled);
  assert.equal(byId(filled, "payment-live").value, tx);
  assert.equal(byId(filled, "payment-live").status, "live");
  assert.equal(byId(filled, "payment-live").href, `https://explorer.testnet.whitechain.io/tx/${tx}`);
  assert.equal(byId(filled, "zero-gas").href, `https://explorer.testnet.whitechain.io/tx/${tx}`);
  // A malformed value is treated as not recorded, never linked.
  const bad = buildEvidence({ ...base, livePaymentTx: "0x1234" });
  checkInvariants(bad);
  assert.equal(byId(bad, "payment-live").status, "not-recorded");
});

test("contracts: DEPLOYED until every one is seen verified; all three are verified now", () => {
  assert.equal(BLOCKSCOUT_VERIFIED.sponsor, true, "README.md: WatermarkSponsor deployed and verified");
  const pending = byId(buildEvidence(base), "contracts");
  assert.equal(pending.status, "deployed");
  assert.equal(pending.note, "Registry and Router verified on Blockscout; Sponsor verification pending.");
  const now = byId(EVIDENCE, "contracts");
  assert.equal(now.status, "verified");
  assert.equal(now.note, "All verified on Blockscout.");
  assert.deepEqual(
    now.links?.map((l) => l.label),
    ["Registry", "Router", "Sponsor"],
  );
  assert.ok(now.links?.[2]?.href.endsWith(ADDR.sponsor), "links the CURRENT sponsor");
  const all = buildEvidence({ ...base, verified: { ...base.verified, sponsor: true } });
  assert.equal(byId(all, "contracts").status, "verified");
  const none = buildEvidence({ ...base, verified: { registry: false, router: false, sponsor: false, genesisPass: false } });
  assert.equal(byId(none, "contracts").status, "deployed");
});

test("Genesis Pass row: NOT DEPLOYED without an address, DEPLOYED (not VERIFIED) with one", () => {
  const off = byId(buildEvidence(base), "pass");
  assert.equal(off.status, "not-deployed");
  assert.equal(off.empty, "not deployed yet");
  const addr = "0x1111111111111111111111111111111111111111" as const;
  const on = buildEvidence({ ...base, passAddress: addr });
  checkInvariants(on);
  assert.equal(byId(on, "pass").status, "deployed");
  assert.equal(byId(on, "pass").href, `https://explorer.testnet.whitechain.io/address/${addr}`);
  const verified = buildEvidence({ ...base, passAddress: addr, verified: { ...base.verified, genesisPass: true } });
  assert.equal(byId(verified, "pass").status, "verified");
});
