import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestCard, generateKeys, luhnDigit, testPan } from "./card.ts";
import { mmyyToMonth, OdaError, verifyOda, type OdaFailure } from "./verify.ts";

const keys = generateKeys();
const card = createTestCard({}, keys);
const UN = "1a2b3c4d";
const OTHER_UN = "deadbeef";

function input(tap = card.tap(UN)) {
  return { ...tap, caModulus: card.caModulus };
}

function flipByte(h: string, at: number): string {
  const b = Buffer.from(h, "hex");
  b[at] = b[at]! ^ 0x01;
  return b.toString("hex");
}

function expectFailure(fn: () => unknown, ...codes: OdaFailure[]) {
  assert.throws(fn, (e: unknown) => e instanceof OdaError && codes.includes(e.code));
}

test("real-size chain verifies with the session UN", () => {
  const r = verifyOda(input());
  assert.equal(r.pan, card.pan);
  assert.equal(r.issuerId, card.pan.slice(0, 6));
  assert.equal(r.dynamicDataLength, 25);
  assert.equal(r.iccModulus.length, 96 * 2);
});

test("sizes match the real RuPay cards", () => {
  const tap = card.tap(UN);
  assert.equal(card.caModulus.length / 2, 248);
  assert.equal(tap.issuerCert.length / 2, 248);
  assert.equal(tap.iccCert.length / 2, 176);
  assert.equal(tap.sdad.length / 2, 96);
  assert.equal(tap.staticData.length / 2, 183);
  assert.equal(tap.issuerRem, "");
  assert.equal(tap.iccRem, "");
});

test("replay: the same signature with a different UN fails", () => {
  const tap = card.tap(UN);
  expectFailure(() => verifyOda({ ...input(tap), un: OTHER_UN, termData: OTHER_UN }), "SDAD_HASH");
});

test("a UN that doesn't match termData fails", () => {
  expectFailure(() => verifyOda({ ...input(), un: OTHER_UN }), "UN_MISMATCH");
});

test("each fresh tap produces a different signature", () => {
  assert.notEqual(card.tap(UN).sdad, card.tap(UN).sdad);
});

test("one flipped byte in the signature fails", () => {
  const tap = card.tap(UN);
  expectFailure(() => verifyOda({ ...input(tap), sdad: flipByte(tap.sdad, 40) }), "SDAD_HEADER", "SDAD_HASH", "BAD_LENGTH");
});

test("one flipped byte in the bank certificate fails", () => {
  const tap = card.tap(UN);
  expectFailure(
    () => verifyOda({ ...input(tap), issuerCert: flipByte(tap.issuerCert, 100) }),
    "ISSUER_HEADER",
    "ISSUER_HASH",
    "BAD_LENGTH",
  );
});

test("one flipped byte in the card certificate fails", () => {
  const tap = card.tap(UN);
  expectFailure(
    () => verifyOda({ ...input(tap), iccCert: flipByte(tap.iccCert, 60) }),
    "ICC_HEADER",
    "ICC_HASH",
    "BAD_LENGTH",
  );
});

test("tampered static data fails the card certificate hash", () => {
  const tap = card.tap(UN);
  expectFailure(() => verifyOda({ ...input(tap), staticData: flipByte(tap.staticData, 10) }), "ICC_HASH");
});

test("an exponent other than 3 is rejected", () => {
  expectFailure(() => verifyOda({ ...input(), iccExp: "010001" }), "BAD_EXPONENT");
  expectFailure(() => verifyOda({ ...input(), issuerExp: "010001" }), "BAD_EXPONENT");
});

test("the wrong CA key fails", () => {
  const other = createTestCard();
  expectFailure(() => verifyOda({ ...input(), caModulus: other.caModulus }), "ISSUER_HEADER", "ISSUER_HASH", "BAD_LENGTH");
});

test("an issuerId that isn't a prefix of the PAN fails", () => {
  const bad = createTestCard({ issuerIdDigits: "990002" }, keys);
  expectFailure(() => verifyOda({ ...bad.tap(UN), caModulus: bad.caModulus }), "PAN_MISMATCH");
});

test("validity is the earlier of the two certificate expiries", () => {
  const c = createTestCard({ issuerExpiryMMYY: "0628", iccExpiryMMYY: "1229" }, keys);
  const r = verifyOda({ ...c.tap(UN), caModulus: c.caModulus });
  assert.equal(r.validThroughMonth, mmyyToMonth("0628"));
});

test("MMYY converts with the F1 month formula", () => {
  assert.equal(mmyyToMonth("1126"), 322); // Nov 2026
  assert.equal(mmyyToMonth("0127"), 324); // Jan 2027
});

test("the synthetic PAN is Luhn-valid and uses the fake BIN", () => {
  const pan = testPan();
  assert.equal(pan.length, 16);
  assert.ok(pan.startsWith("990001"));
  assert.equal(luhnDigit(pan.slice(0, -1)), pan.at(-1));
});

test("the committed fixture still verifies", async () => {
  const { readFile } = await import("node:fs/promises");
  const f = JSON.parse(await readFile(new URL("../fixtures/rupay-768.json", import.meta.url), "utf8"));
  const r = verifyOda({ ...f.card, caModulus: f.caModulus });
  assert.equal(r.issuerId, f.expected.issuerId);
  assert.equal(r.validThroughMonth, f.expected.validThroughMonth);
});
