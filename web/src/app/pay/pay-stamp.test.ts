import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address } from "viem";
import { RelayerError } from "../../lib/relayer.ts";
import { otherAppIds } from "../../lib/config.ts";
import { PREVIOUS_LIVE_APP, SPONSOR_APP_ID, TEST_APP } from "../../lib/site.ts";
import { freePaymentsLine, PAY_STAMP_LABEL, quotaUsedUp, readPayStamp, stampRetryDelay, type PayStampView } from "./pay-stamp.ts";

const RELAYER = "http://localhost:8788";
const wallet = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as Address;
const SPONSOR = SPONSOR_APP_ID;
const TEST = TEST_APP.appId;
const PREVIOUS = PREVIOUS_LIVE_APP.appId;

/** A relayer whose GET /status answers per app: true / false, or "down" for a 502 CHAIN_UNAVAILABLE. */
function statusRelayer(stampedFor: Record<string, boolean | "down">, calls: string[] = []): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    assert.match(u.pathname, /^\/status\//);
    const app = u.searchParams.get("app") ?? "";
    calls.push(app);
    const answer = stampedFor[app] ?? false;
    if (answer === "down") return new Response(JSON.stringify({ error: "CHAIN_UNAVAILABLE" }), { status: 502 });
    // Like the relayer: quotaLeft 0 for a wallet that isn't stamped.
    const body = answer ? { stamped: true, expiresAt: 1801000000, quotaLeft: 20 } : { stamped: false, expiresAt: 0, quotaLeft: 0 };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const read = (relayerFetch: typeof fetch, others: readonly string[] = [TEST, PREVIOUS]) =>
  readPayStamp(RELAYER, wallet, SPONSOR, others, "1874", { fetch: relayerFetch });

test("pay stamp: a stamp for the Sponsor's app is Verified, with no extra reads", async () => {
  const calls: string[] = [];
  assert.deepEqual(await read(statusRelayer({ [SPONSOR]: true }, calls)), { kind: "stamped", expiresAt: 1801000000 });
  assert.deepEqual(calls, [SPONSOR]);
});

test("pay stamp (bug fix): a stamp for ?app= or another app is never Verified", async () => {
  // The wallet came from /verify?app=<test app> and is stamped only there.
  const otherApps = otherAppIds(SPONSOR, [TEST, TEST, PREVIOUS]);
  const calls: string[] = [];
  const s = await read(statusRelayer({ [TEST]: true }, calls), otherApps);
  assert.deepEqual(s, { kind: "other-app" });
  assert.equal(calls[0], SPONSOR, "the Sponsor's app is read first");
  assert.equal(PAY_STAMP_LABEL[s.kind], "Stamp is for another app");
  assert.doesNotMatch(PAY_STAMP_LABEL[s.kind], /Stamped|✓/);
  // The first live app (before the stricter filter) is "another app" too.
  assert.deepEqual(await read(statusRelayer({ [PREVIOUS]: true })), { kind: "other-app" });
});

test("pay stamp: no stamp anywhere is not-stamped; other apps' errors never turn it into a yes", async () => {
  assert.deepEqual(await read(statusRelayer({})), { kind: "not-stamped" });
  assert.deepEqual(await read(statusRelayer({ [TEST]: "down", [PREVIOUS]: "down" })), { kind: "not-stamped" });
  // Nothing else to ask: plain not-stamped, one read.
  const calls: string[] = [];
  assert.deepEqual(await read(statusRelayer({}, calls), []), { kind: "not-stamped" });
  assert.deepEqual(calls, [SPONSOR]);
  // The Sponsor's own app in the list is never read twice.
  const again: string[] = [];
  await read(statusRelayer({}, again), [SPONSOR, TEST]);
  assert.deepEqual(again, [SPONSOR, TEST]);
});

test("pay stamp: the Sponsor's app read failing throws its code (the page retries)", async () => {
  await assert.rejects(read(statusRelayer({ [SPONSOR]: "down", [TEST]: true })), (e: unknown) => {
    assert.ok(e instanceof RelayerError);
    assert.equal(e.code, "CHAIN_UNAVAILABLE");
    return true;
  });
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  await assert.rejects(read(down), (e: unknown) => e instanceof RelayerError && e.code === "NETWORK");
});

test("pay stamp (bug fix): quotaLeft 0 for a wallet without the Sponsor's stamp is never '0 free payments left'", () => {
  for (const kind of ["checking", "not-stamped", "other-app", "error"] as PayStampView[]) {
    assert.equal(freePaymentsLine(kind, 0), null, kind);
    assert.equal(quotaUsedUp(kind, 0), false, kind);
  }
  assert.equal(freePaymentsLine("stamped", 0), "0 free payments left today");
  assert.equal(freePaymentsLine("stamped", 1), "1 free payment left today");
  assert.equal(freePaymentsLine("stamped", 19), "19 free payments left today");
  assert.equal(freePaymentsLine("stamped", null), null, "no balance read yet");
  assert.equal(quotaUsedUp("stamped", 0), true);
  assert.equal(quotaUsedUp("stamped", 3), false);
  // Only the Sponsor's stamp reads "Stamped ✓".
  for (const [kind, label] of Object.entries(PAY_STAMP_LABEL)) assert.equal(/^Stamped|✓/.test(label), kind === "stamped", kind);
  assert.equal(PAY_STAMP_LABEL.stamped, "Stamped ✓");
});

test("stampRetryDelay: the relayer or chain being away retries by itself with backoff; bad requests don't", () => {
  assert.equal(stampRetryDelay("NETWORK", 0), 5_000);
  assert.equal(stampRetryDelay("NETWORK", 1), 10_000);
  assert.equal(stampRetryDelay("TIMEOUT", 2), 20_000);
  assert.equal(stampRetryDelay("CHAIN_UNAVAILABLE", 9), 30_000);
  assert.equal(stampRetryDelay("HTTP_ERROR", 0), 5_000);
  assert.equal(stampRetryDelay("BAD_REQUEST", 0), null);
  assert.equal(stampRetryDelay("CHAIN_NOT_READY", 0), null);
  assert.equal(stampRetryDelay("BAD_RESPONSE", 0), null);
});
