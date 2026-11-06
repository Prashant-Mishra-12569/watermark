import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAppId, parseChainId, parseHttpUrl, parseTapHttpUrl, readWebConfig } from "./config.ts";

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
