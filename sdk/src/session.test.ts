import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveUn, monthIndex, sessionValidUntilMonth } from "./session.ts";

const ZERO_NONCE = `0x${"00".repeat(32)}` as const;

test("deriveUn takes the first 4 bytes of sha256(nonce)", () => {
  // sha256 of 32 zero bytes = 66687aad f862bd77...
  assert.equal(deriveUn(ZERO_NONCE), "66687aad");
});

test("deriveUn rejects a nonce that isn't 32 bytes", () => {
  assert.throws(() => deriveUn("0x1234"));
});

test("monthIndex matches the F1 formula", () => {
  assert.equal(monthIndex(new Date(Date.UTC(2000, 0, 1))), 0);
  assert.equal(monthIndex(new Date(Date.UTC(2026, 10, 6))), 322); // Nov 2026
  assert.equal(monthIndex(new Date(Date.UTC(2026, 11, 31, 23, 59))), 323); // Dec 2026
  assert.equal(monthIndex(new Date(Date.UTC(2027, 0, 1))), 324); // year boundary
});

test("a new session is valid for the current month + 3", () => {
  assert.equal(sessionValidUntilMonth(new Date(Date.UTC(2026, 10, 6))), 325);
});
