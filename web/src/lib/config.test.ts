import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPassFlow,
  otherAppIds,
  parseAppId,
  parseChainId,
  parseHttpUrl,
  parseTapHttpUrl,
  readPaySetup,
  readVerifySetup,
  readWebConfig,
  sponsorAppProblem,
} from "./config.ts";
import { LIVE_APP, PREVIOUS_LIVE_APP, SPONSOR_APP_ID, TEST_APP } from "./site.ts";

test("parseAppId accepts 248-bit decimals and canonicalises them", () => {
  assert.equal(parseAppId("12345"), "12345");
  assert.equal(parseAppId(" 0012345 "), "12345");
  const max = ((1n << 248n) - 1n).toString();
  assert.equal(parseAppId(max), max); // 75 digits, exact
  assert.equal(parseAppId((1n << 248n).toString()), null);
  assert.equal(parseAppId("12e3"), null);
  assert.equal(parseAppId("-1"), null);
  assert.equal(parseAppId(""), null);
  assert.equal(parseAppId(undefined), null);
});

test("parseChainId defaults to 1874 and only allows 1874 or 1337", () => {
  assert.equal(parseChainId(undefined), "1874");
  assert.equal(parseChainId(""), "1874");
  assert.equal(parseChainId("1337"), "1337");
  assert.equal(parseChainId("2625"), null); // viem's whitechainTestnet: never
});

test("parseHttpUrl", () => {
  assert.equal(parseHttpUrl("http://192.168.1.2:8788/"), "http://192.168.1.2:8788");
  assert.equal(parseHttpUrl("ftp://x"), null);
  assert.equal(parseHttpUrl("localhost:8788"), null);
});

test("readWebConfig: defaults, missing appId, query overrides", () => {
  const ok = readWebConfig({ appId: "12345" });
  assert.deepEqual(ok, {
    ok: true,
    config: { relayerUrl: "http://localhost:8788", relayerLanUrl: null, appId: "12345", chainId: "1874" },
  });

  const missing = readWebConfig({});
  assert.equal(missing.ok, false);
  assert.match(!missing.ok ? missing.problems.join(" ") : "", /NEXT_PUBLIC_APP_ID is not set/);

  const devnet = readWebConfig({ appId: "12345" }, { chain: "1337", app: "777" });
  assert.equal(devnet.ok && devnet.config.chainId, "1337");
  assert.equal(devnet.ok && devnet.config.appId, "777");

  assert.equal(readWebConfig({ appId: "12345" }, { app: "abc" }).ok, false);
  assert.equal(readWebConfig({ appId: "12345", chainId: "1" }).ok, false);
  assert.equal(readWebConfig({ appId: "12345", relayerLanUrl: "nope" }).ok, false);
});

test("NEXT_PUBLIC_RELAYER_LAN_URL must be a URL Watermark Tap's parser accepts, and is normalized", () => {
  assert.equal(parseTapHttpUrl("http://192.168.1.2:8788"), "http://192.168.1.2:8788");
  assert.equal(parseTapHttpUrl("http://192.168.1.2:8788/"), "http://192.168.1.2:8788");
  assert.equal(parseTapHttpUrl("http://Mac-mini.local:8788"), "http://mac-mini.local:8788");
  // The app compares the scheme case-sensitively: return the lowercased form, never the raw input.
  assert.equal(parseTapHttpUrl("HTTP://192.168.1.2:8788"), "http://192.168.1.2:8788");
  // Missing "//": the raw form is opaque to java.net.URI, so the QR carries the normalized form instead.
  assert.equal(parseTapHttpUrl("http:192.168.1.2:8788"), "http://192.168.1.2:8788");
  // java.net.URI has no host for this one: the app answers "bad url".
  assert.equal(parseTapHttpUrl("http://my_mac:8788"), null);
  // A raw space breaks java.net.URI; the normalized form is escaped, which it accepts.
  assert.equal(parseTapHttpUrl("http://192.168.1.2:8788/a b"), "http://192.168.1.2:8788/a%20b");
  assert.equal(parseTapHttpUrl("192.168.1.2:8788"), null);

  const lan = readWebConfig({ appId: "12345", relayerLanUrl: "HTTP://192.168.1.2:8788/" });
  assert.equal(lan.ok && lan.config.relayerLanUrl, "http://192.168.1.2:8788");
  assert.equal(readWebConfig({ appId: "12345", relayerLanUrl: "http://my_mac:8788" }).ok, false);
});

test("a bad ?chain= value is never echoed onto the page", () => {
  const crafted = "Your wallet was hacked. Call +1 555 0100";
  const r = readWebConfig({ appId: "12345" }, { chain: crafted });
  assert.equal(r.ok, false);
  const text = !r.ok ? r.problems.join(" ") : "";
  assert.ok(!text.includes("hacked"), text);
  assert.match(text, /\?chain= value/);
  // The operator's own env value may be echoed.
  const env = readWebConfig({ appId: "12345", chainId: "2625" });
  assert.match(!env.ok ? env.problems.join(" ") : "", /"2625"/);
});

// ---- /verify and /pay setup (SITE_SPEC.md section 3) ----

const LIVE = LIVE_APP.appId;
const TEST = TEST_APP.appId;
const env = { appId: LIVE, chainId: "1874" };
const appOf = (r: { config: ReturnType<typeof readWebConfig> }) => (r.config.ok ? r.config.config.appId : null);
const chainOf = (r: { config: ReturnType<typeof readWebConfig> }) => (r.config.ok ? r.config.config.chainId : null);

test("?next=pass is the pass walk only while the pass is live", () => {
  assert.equal(isPassFlow("pass", true), true);
  assert.equal(isPassFlow("pass", false), false, "PASS_LIVE off: nothing links to a dead page");
  assert.equal(isPassFlow("PASS", true), false);
  assert.equal(isPassFlow(null, true), false);
  assert.equal(isPassFlow("", true), false);
});

test("/verify?next=pass ignores ?app= and ?chain= and forces the live app on Whitechain", () => {
  const site = { liveAppId: LIVE, passLive: true };
  const walk = readVerifySetup({ appId: TEST, chainId: "1874" }, { app: TEST, chain: "1337", next: "pass" }, site);
  assert.equal(walk.passFlow, true);
  assert.equal(appOf(walk), LIVE);
  assert.equal(chainOf(walk), "1874");
  // Even an invalid ?app= can't break the walk: it is never read.
  assert.equal(appOf(readVerifySetup(env, { app: "nope", next: "pass" }, site)), LIVE);

  // Without the walk, ?app= and ?chain= work as before.
  const plain = readVerifySetup(env, { app: TEST, chain: "1337" }, site);
  assert.equal(plain.passFlow, false);
  assert.equal(appOf(plain), TEST);
  assert.equal(chainOf(plain), "1337");
  // PASS_LIVE off: ?next=pass is ignored, so ?app= still applies.
  const off = readVerifySetup(env, { app: TEST, next: "pass" }, { liveAppId: LIVE, passLive: false });
  assert.equal(off.passFlow, false);
  assert.equal(appOf(off), TEST);
});

test("/pay (bug fix): always the Sponsor's app from NEXT_PUBLIC_APP_ID; ?app= and ?chain= are ignored", () => {
  const site = { liveAppId: LIVE, passLive: false };
  for (const app of [TEST, PREVIOUS_LIVE_APP.appId, "12345", "not-an-id", null]) {
    const r = readPaySetup(env, { app, chain: "1337" } as { app: string | null }, site);
    assert.equal(appOf(r), LIVE, String(app));
    assert.equal(chainOf(r), "1874");
  }
  // The pass walk forces the live app, so step 2 uses the same browser wallet as step 1.
  const walk = readPaySetup({ appId: TEST }, { app: TEST, next: "pass" }, { liveAppId: LIVE, passLive: true });
  assert.equal(walk.passFlow, true);
  assert.equal(appOf(walk), LIVE);
  // Unset NEXT_PUBLIC_APP_ID is still a setup problem, not a silent fallback to ?app=.
  assert.equal(readPaySetup({}, { app: TEST }, site).config.ok, false);
});

test("sponsorAppProblem: says so when NEXT_PUBLIC_APP_ID isn't the Sponsor's app (Whitechain only)", () => {
  assert.equal(LIVE, SPONSOR_APP_ID, "decision 1: the live app is the Sponsor's app");
  const base = { relayerUrl: "http://localhost:8788", relayerLanUrl: null };
  assert.equal(sponsorAppProblem({ ...base, appId: LIVE, chainId: "1874" }, SPONSOR_APP_ID), null);
  assert.match(sponsorAppProblem({ ...base, appId: TEST, chainId: "1874" }, SPONSOR_APP_ID) ?? "", /sponsorAppId/);
  assert.equal(sponsorAppProblem({ ...base, appId: TEST, chainId: "1337" }, SPONSOR_APP_ID), null);
});

test("otherAppIds: valid, canonical, deduplicated, never the Sponsor's own app", () => {
  assert.deepEqual(otherAppIds(LIVE, [TEST, ` ${TEST} `, LIVE, null, undefined, "abc", PREVIOUS_LIVE_APP.appId]), [
    TEST,
    PREVIOUS_LIVE_APP.appId,
  ]);
  assert.deepEqual(otherAppIds(LIVE, []), []);
});
