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

import { buildVerifyLink, hashSession, recoverSessionSigner } from "./session.ts";
import { DEV_SESSION_SIGNER, signSessionDev } from "./dev.ts";
import type { Session } from "./types.ts";

/** Fixed session shared with the Android SessionVerifier test (cross-language vector). */
export const VECTOR_SESSION: Session = {
  wallet: "0x00000000000000000000000000000000000ab1e5",
  appId: "12345",
  nonce: `0x${"11".repeat(32)}`,
  expiresAt: "1893456000",
  validUntilMonth: 325,
  chainId: "1874",
  registry: "0x0000000000000000000000000000000000000001",
};

test("dev signer signs a session that recovers to its address", async () => {
  const signed = await signSessionDev(VECTOR_SESSION);
  assert.equal(await recoverSessionSigner(signed), DEV_SESSION_SIGNER);
  console.log("VECTOR digest", hashSession(VECTOR_SESSION));
  console.log("VECTOR sig", signed.sig);
});

test("a changed field breaks the signature", async () => {
  const signed = await signSessionDev(VECTOR_SESSION);
  const tampered = { ...signed, session: { ...signed.session, wallet: "0x00000000000000000000000000000000000bad00" as const } };
  assert.notEqual(await recoverSessionSigner(tampered), DEV_SESSION_SIGNER);
});

test("the verify link carries every F1 field", async () => {
  const link = buildVerifyLink(await signSessionDev(VECTOR_SESSION), "http://10.0.0.2:8787");
  const q = new URL(link.replace("watermark://", "http://")).searchParams;
  assert.deepEqual([...q.keys()], ["w", "app", "n", "e", "v", "c", "r", "sig", "p"]);
  assert.equal(q.get("p"), "http://10.0.0.2:8787");
});

test("the fallback link carries only the session id and the relayer URL", async () => {
  const { buildFallbackLink } = await import("./session.ts");
  const q = new URL(buildFallbackLink("abc_123", "http://10.0.0.2:8788").replace("watermark://", "http://")).searchParams;
  assert.deepEqual([...q.keys()], ["id", "p"]);
  assert.equal(q.get("id"), "abc_123");
  assert.equal(q.get("p"), "http://10.0.0.2:8788");
});
