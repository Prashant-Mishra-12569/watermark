import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import whitechain from "../../../../deployments/whitechain.json" with { type: "json" };
import { RelayerError } from "../../lib/relayer.ts";
import { WALLET_PLACEHOLDER, describe, formatUntil, readWallet, viewFromError, viewFromStatus } from "./checker.ts";
import { SOLIDITY_GATE, TYPESCRIPT_CHECK } from "./snippets.ts";

const integrate = readFileSync(new URL("../../../../docs/INTEGRATE.md", import.meta.url), "utf8");

/** The bodies of every ```lang fence in INTEGRATE.md. */
function fences(lang: string): string[] {
  const re = new RegExp("```" + lang + "\\n([\\s\\S]*?)\\n```", "g");
  return [...integrate.matchAll(re)].map((m) => m[1] ?? "");
}

test("the Gate it code is INTEGRATE.md's, verbatim", () => {
  assert.ok(fences("solidity").includes(SOLIDITY_GATE), "Solidity block drifted from docs/INTEGRATE.md");
  assert.ok(fences("ts").includes(TYPESCRIPT_CHECK), "TypeScript block drifted from docs/INTEGRATE.md");
});

test("the TypeScript block uses the live registry and the Sponsor's (live) appId", () => {
  assert.ok(TYPESCRIPT_CHECK.includes(`const registry = "${whitechain.registry}";`));
  assert.ok(TYPESCRIPT_CHECK.includes(`const appId = "${whitechain.sponsorAppId}";`));
  assert.ok(!TYPESCRIPT_CHECK.includes(whitechain.previousLive.liveAppId), "never the superseded app");
});

test("checker input: empty, not an address, bad checksum, valid", () => {
  assert.deepEqual(readWallet("  "), { ok: false, view: { kind: "empty" } });
  assert.deepEqual(readWallet("0x123"), { ok: false, view: { kind: "invalid", why: "format" } });
  assert.deepEqual(readWallet(`0x${"g".repeat(40)}`), { ok: false, view: { kind: "invalid", why: "format" } });
  // The relayer's EIP-55 address with one letter's case flipped.
  assert.deepEqual(readWallet("0xF95E3C36020286117f1c3cd8Efd57Fcfb2e2a9Ba"), {
    ok: false,
    view: { kind: "invalid", why: "checksum" },
  });
  assert.deepEqual(readWallet(" 0xf95E3C36020286117f1c3cd8Efd57Fcfb2e2a9Ba "), {
    ok: true,
    wallet: "0xf95E3C36020286117f1c3cd8Efd57Fcfb2e2a9Ba",
  });
  assert.equal(readWallet("0xf95e3c36020286117f1c3cd8efd57fcfb2e2a9ba").ok, true, "all lowercase is fine");
});

test("checker answers use DESIGN_V2.md's copy and tones", () => {
  assert.equal(WALLET_PLACEHOLDER, "Paste a wallet address (0x…)");
  assert.deepEqual(describe({ kind: "empty" }), { text: "Read-only. Nothing is signed or sent.", tone: "muted" });
  assert.deepEqual(describe({ kind: "invalid", why: "format" }), {
    text: "That isn't a wallet address. It needs 0x and 40 hex characters.",
    tone: "error",
  });
  assert.deepEqual(describe({ kind: "invalid", why: "checksum" }), {
    text: "That address has a typo. Its checksum doesn't match.",
    tone: "error",
  });
  assert.deepEqual(describe({ kind: "loading" }), { text: "Checking Whitechain…", tone: "muted" });

  const expiresAt = Date.UTC(2027, 1, 1) / 1000; // 1 February 2027 00:00 UTC
  const stamped = viewFromStatus({ stamped: true, expiresAt, quotaLeft: 20 });
  assert.deepEqual(describe(stamped), { text: "Stamped until 1 February 2027. Your app would let it in.", tone: "ok" });
  assert.deepEqual(describe(viewFromStatus({ stamped: false, expiresAt: 0, quotaLeft: 0 })), {
    text: "No stamp. Your app would keep it out.",
    tone: "note",
  });
  assert.equal(formatUntil(0), "");
  assert.equal(describe(viewFromStatus({ stamped: true, expiresAt: 0, quotaLeft: 0 })).text, "Stamped. Your app would let it in.");
});

test("no answer means unreachable; any other answer still means nothing was checked", () => {
  const unreachable = "Couldn't reach our server. Nothing was checked.";
  assert.equal(describe(viewFromError(new RelayerError("NETWORK", 0))).text, unreachable);
  assert.equal(describe(viewFromError(new RelayerError("TIMEOUT", 0))).text, unreachable);
  assert.equal(describe(viewFromError(new TypeError("fetch failed"))).text, unreachable);
  const refused = describe(viewFromError(new RelayerError("CHAIN_UNAVAILABLE", 502)));
  assert.equal(refused.tone, "error");
  assert.match(refused.text, /Nothing was checked\.$/);
  assert.notEqual(refused.text, unreachable, "the server did answer, so don't say it couldn't be reached");
});
