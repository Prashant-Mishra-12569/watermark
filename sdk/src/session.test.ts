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

test("a signed session recovers to its signer and round-trips through the deep link", async () => {
  const { privateKeyToAccount } = await import("viem/accounts");
  const { buildDeepLink, hashSession, recoverSessionSigner, sessionTypedData } = await import("./session.ts");
  const signer = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const session = {
    wallet: "0x8943545177806ED17B9F23F0a21ee5948eCaa776",
    appId: "123456789012345678901234567890",
    nonce: ZERO_NONCE,
    expiresAt: "1793000000",
    validUntilMonth: 325,
    chainId: "1874",
    registry: "0x00000000000000000000000000000000000000aa",
  } as const;
  const sig = await signer.signTypedData(sessionTypedData(session));
  assert.equal(await recoverSessionSigner(session, sig), signer.address);
  assert.equal(hashSession(session).length, 66);

  const url = new URL(buildDeepLink(session, sig, "http://192.168.1.2:8787"));
  assert.equal(url.protocol, "watermark:");
  assert.equal(url.searchParams.get("app"), session.appId);
  assert.equal(url.searchParams.get("v"), "325");
  assert.equal(url.searchParams.get("sig"), sig);
  assert.equal(url.searchParams.get("p"), "http://192.168.1.2:8787");
});
