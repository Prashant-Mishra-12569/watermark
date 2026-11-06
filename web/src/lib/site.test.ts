import { test } from "node:test";
import assert from "node:assert/strict";
import { altmempoolDevnet, whitechainSepolia, USDT_WHITECHAIN } from "@watermark/sdk";
import whitechain from "../../../deployments/whitechain.json" with { type: "json" };
import {
  ADDR,
  ALTMEMPOOL_EXPLORER,
  LIVE_APP,
  PASS_FLOW,
  PASS_LIVE,
  PREVIOUS_LIVE_APP,
  SPONSOR_APP_ID,
  TEST_APP,
  WHITECHAIN_EXPLORER,
  altmempoolTxUrl,
  headerModeFor,
  isDropWalk,
  isAddress,
  isCurrent,
  last4,
  parsePassAddress,
  shortAppId,
  shortHex,
} from "./site.ts";

test("appIds and roots come from deployments/whitechain.json, and the live app is the Sponsor's app", () => {
  assert.equal(LIVE_APP.appId, whitechain.liveAppId);
  assert.equal(LIVE_APP.rulesRoot, whitechain.liveRulesRoot);
  assert.equal(SPONSOR_APP_ID, whitechain.sponsorAppId);
  assert.equal(LIVE_APP.appId, SPONSOR_APP_ID, "decision 1: the live app is the one the Sponsor is bound to");
  assert.equal(LIVE_APP.sponsor, whitechain.sponsor);
  assert.equal(TEST_APP.appId, whitechain.appId);
  assert.equal(PREVIOUS_LIVE_APP.appId, whitechain.previousLive.liveAppId);
  assert.equal(PREVIOUS_LIVE_APP.sponsor, whitechain.previousLive.sponsor);
  assert.notEqual(LIVE_APP.appId, PREVIOUS_LIVE_APP.appId);
  assert.notEqual(LIVE_APP.sponsor.toLowerCase(), PREVIOUS_LIVE_APP.sponsor.toLowerCase());
});

test("demo app 2 (3086…909) is never part of the site's data", () => {
  const appIds = [LIVE_APP.appId, TEST_APP.appId, PREVIOUS_LIVE_APP.appId, SPONSOR_APP_ID];
  for (const id of appIds) assert.ok(!(id.startsWith("3086") && id.endsWith("909")), id);
});

test("every address is a 0x address, and USDT is the official one", () => {
  for (const [name, a] of Object.entries(ADDR)) assert.ok(isAddress(a), name);
  assert.equal(ADDR.usdt.toLowerCase(), USDT_WHITECHAIN.toLowerCase());
  assert.equal(ADDR.usdt, "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7");
});

test("explorer bases match the sdk's chains (site.ts keeps a copy so pages don't pull viem)", () => {
  assert.equal(WHITECHAIN_EXPLORER, whitechainSepolia.blockExplorers.default.url);
  assert.equal(ALTMEMPOOL_EXPLORER, altmempoolDevnet.blockExplorers.default.url);
  assert.equal(whitechainSepolia.id, 1874);
});

test("the alt-mempool link is exactly the admitted-tx link in SITE_SPEC.md", () => {
  assert.equal(
    altmempoolTxUrl("0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93"),
    "https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc",
  );
});

test("display helpers", () => {
  assert.equal(shortHex("0xd7e0166584dbb3b404d2b81308b5b69c94fa52b4d2d0da6a66759a52bb86bc07"), "0xd7e0…bc07");
  assert.equal(shortHex("0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6"), "0x9989…8Fd6");
  assert.equal(shortHex("0x1234"), "0x1234");
  assert.equal(last4(ADDR.relayer), "…a9Ba");
  assert.equal(shortAppId(whitechain.previousLive.liveAppId), "2457…106");
  assert.equal(shortAppId(whitechain.appId), "2426…656");
});

test("PASS_LIVE needs a real address; the test run has none", () => {
  assert.equal(parsePassAddress(undefined), null);
  assert.equal(parsePassAddress(""), null);
  assert.equal(parsePassAddress("  "), null);
  assert.equal(parsePassAddress("0x123"), null);
  assert.equal(parsePassAddress(`0x${"0".repeat(40)}`), null);
  assert.equal(parsePassAddress(" 0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6 "), "0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6");
  if (process.env.NEXT_PUBLIC_GENESIS_PASS_ADDRESS === undefined) assert.equal(PASS_LIVE, false);
});

test("the Genesis Drop walk: /pass, then step 1 on /verify and step 2 on /pay, both in pass mode", () => {
  assert.deepEqual(PASS_FLOW, { hub: "/pass", step1: "/verify?next=pass", step2: "/pay?next=pass" });
  assert.deepEqual(headerModeFor("/verify", new URL(PASS_FLOW.step1, "http://x").searchParams.get("next")), {
    mode: "flow",
    step: 1,
  });
  assert.deepEqual(headerModeFor("/pay", new URL(PASS_FLOW.step2, "http://x").searchParams.get("next")), {
    mode: "flow",
    step: 2,
  });
});

test("header mode: flow only on the drop's steps (?next=pass on /verify and /pay), open or not", () => {
  assert.deepEqual(headerModeFor("/", null), { mode: "site" });
  // The drop page has the site nav; its checklist carries the steps.
  assert.deepEqual(headerModeFor("/pass", null), { mode: "site" });
  assert.deepEqual(headerModeFor("/pass", "pass"), { mode: "site" });
  assert.deepEqual(headerModeFor("/verify", "pass"), { mode: "flow", step: 1 });
  assert.deepEqual(headerModeFor("/pay", "pass"), { mode: "flow", step: 2 });
  assert.deepEqual(headerModeFor("/pay/", "pass"), { mode: "flow", step: 2 });
  // Plain /verify and /pay are the pages a company sends its own users to: no drop.
  assert.deepEqual(headerModeFor("/verify", null), { mode: "site" });
  assert.deepEqual(headerModeFor("/verify", "other"), { mode: "site" });
  assert.deepEqual(headerModeFor("/attack", "pass"), { mode: "site" });
  assert.equal(isDropWalk("pass"), true);
  assert.equal(isDropWalk(null), false);
  assert.equal(isDropWalk("PASS"), false);
});

test("isCurrent", () => {
  assert.equal(isCurrent("/pay", "/pay"), true);
  assert.equal(isCurrent("/pay/x", "/pay"), true);
  assert.equal(isCurrent("/payments", "/pay"), false);
  assert.equal(isCurrent(null, "/pay"), false);
});
