import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFallbackLink, buildVerifyLink, type Session } from "@watermark/sdk";
import type { Hex } from "viem";
import { checkFullTapLink, isShortTapLink, isTapHttpUrl } from "./tap-link.ts";

const session: Session = {
  wallet: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  appId: "12345",
  nonce: `0x${"ab".repeat(32)}` as Hex,
  expiresAt: "1800000000",
  validUntilMonth: 325,
  chainId: "1874",
  registry: "0x0000000000000000000000000000000000000001",
};
const sig = `0x${"cd".repeat(65)}` as Hex;
const link = (p: string, s: Session = session) => buildVerifyLink({ session: s, sig }, p);

test("a relayer link with a LAN PROVER_URL passes Watermark Tap's rules", () => {
  const r = checkFullTapLink(link("http://192.168.1.2:8787"));
  assert.ok(r.ok);
  assert.equal(r.ok && r.link.w, session.wallet);
  assert.equal(r.ok && r.link.p, "http://192.168.1.2:8787");
  assert.ok(checkFullTapLink(link("https://prover.example/api")).ok);
  assert.ok(checkFullTapLink(link("http://Mac-mini.local:8787")).ok);
});

test("a 75-digit (248-bit) appId stays valid", () => {
  const appId = ((1n << 248n) - 1n).toString();
  const r = checkFullTapLink(link("http://192.168.1.2:8787", { ...session, appId }));
  assert.equal(r.ok && r.link.app, appId);
  assert.equal(checkFullTapLink(link("http://192.168.1.2:8787", { ...session, appId: (1n << 248n).toString() })).ok, false);
});

test("PROVER_URL values the app answers with \"bad url\" are refused", () => {
  for (const p of ["192.168.1.2:8787", "HTTP://192.168.1.2:8787", "http://mac_book:8787", "localhost:8787", "http:192.168.1.2:8787"]) {
    const r = checkFullTapLink(link(p));
    assert.equal(r.ok, false, p);
    assert.match(!r.ok ? r.reason : "", /PROVER_URL/, p);
  }
});

test("missing or malformed parameters are refused", () => {
  const good = link("http://192.168.1.2:8787");
  for (const k of ["w", "app", "n", "e", "v", "c", "r", "sig", "p"]) {
    const u = new URL(good.replace("watermark://", "http://"));
    u.searchParams.delete(k);
    assert.equal(checkFullTapLink(`watermark://verify?${u.searchParams.toString()}`).ok, false, k);
  }
  assert.equal(checkFullTapLink(link("http://192.168.1.2:8787", { ...session, chainId: "2625" })).ok, false);
  assert.equal(checkFullTapLink(good.replace("watermark://verify?", "watermark://other?")).ok, false);
  assert.equal(checkFullTapLink(`${good}&w=${session.wallet}`).ok, false); // duplicate key
});

test("short links: only an id plus a URL the app can read", () => {
  assert.ok(isShortTapLink(buildFallbackLink("AbCdEfGhIjKl", "http://192.168.1.2:8788")));
  assert.equal(isShortTapLink(buildFallbackLink("AbCdEfGhIjKl", "HTTP://192.168.1.2:8788")), false);
  assert.equal(isShortTapLink(buildFallbackLink("abc", "http://192.168.1.2:8788")), false);
  assert.equal(checkFullTapLink(buildFallbackLink("AbCdEfGhIjKl", "http://192.168.1.2:8788")).ok, false);
});

test("isTapHttpUrl", () => {
  assert.ok(isTapHttpUrl("http://192.168.1.2:8788"));
  assert.ok(isTapHttpUrl("http://localhost:8788"));
  assert.equal(isTapHttpUrl("http://999.1.1.1:8788"), false);
  assert.equal(isTapHttpUrl("http://192.168.1.2:port"), false);
  assert.equal(isTapHttpUrl("http://host/a b"), false);
});
