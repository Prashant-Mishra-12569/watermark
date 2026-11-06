import { test } from "node:test";
import assert from "node:assert/strict";
import { chainName, explorerAddressUrl, explorerTxUrl, formatCountdown, formatStampExpiry, secondsLeft, shortAddress, truncateMiddle, walletLast4 } from "./view.ts";
import {
  localSessionDeadline,
  MIN_AUTO_REFRESH_MS,
  RATE_LIMIT_RETRY_MS,
  REFRESH_LEAD_SECONDS,
  sessionRefreshDelay,
  sessionRetryDelay,
  statusPollDelay,
  STATUS_POLL_MS,
} from "./timing.ts";
import { sessionErrorCopy, statusNoteCopy } from "./messages.ts";

test("walletLast4 is case-sensitive and matches the link's w parameter", () => {
  assert.equal(walletLast4("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"), "5Bdf");
});

test("explorer links come from the sdk chains, never viem's whitechainTestnet", () => {
  const a = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf";
  assert.equal(explorerAddressUrl("1874", a), `https://explorer.testnet.whitechain.io/address/${a}`);
  assert.equal(explorerAddressUrl("1337", a), `https://explorer.altmempool.wtf/address/${a}`);
  assert.equal(chainName("1874"), "Whitechain Sepolia");
});

test("countdown helpers", () => {
  const now = 1_800_000_000 * 1000;
  assert.equal(secondsLeft(String(1_800_000_600), now), 600);
  assert.equal(secondsLeft(String(1_799_999_000), now), 0);
  assert.equal(secondsLeft("nope", now), 0);
  assert.equal(formatCountdown(600), "10:00");
  assert.equal(formatCountdown(9), "0:09");
});

test("stamp expiry is shown as a UTC date", () => {
  // 2027-01-31T23:59:59Z
  assert.equal(formatStampExpiry(Date.UTC(2027, 0, 31, 23, 59, 59) / 1000), "31 January 2027");
  assert.equal(formatStampExpiry(0), "");
});

test("truncateMiddle keeps both ends", () => {
  const link = `watermark://verify?w=0x${"a".repeat(40)}&sig=0x${"b".repeat(130)}`;
  const t = truncateMiddle(link, 20, 8);
  assert.equal(t.length, 29);
  assert.ok(t.startsWith("watermark://verify?w"));
  assert.equal(truncateMiddle("short"), "short");
});

test("status polling backs off on errors", () => {
  assert.equal(statusPollDelay(0), STATUS_POLL_MS);
  assert.ok(statusPollDelay(1) > STATUS_POLL_MS);
  assert.equal(statusPollDelay(50), 10_000);
});

test("session retry: wait a full rate-limit window, never auto-retry config errors", () => {
  assert.ok(sessionRetryDelay("RATE_LIMIT", 0)! >= 60_000);
  assert.equal(sessionRetryDelay("RATE_LIMIT", 0), RATE_LIMIT_RETRY_MS);
  assert.equal(sessionRetryDelay("UNKNOWN_APP", 0), null);
  assert.equal(sessionRetryDelay("CHAIN_NOT_READY", 0), null);
  assert.equal(sessionRetryDelay("BAD_RESPONSE", 0), null);
  assert.equal(sessionRetryDelay("NETWORK", 0), 5_000);
  assert.equal(sessionRetryDelay("NETWORK", 10), 30_000);
});

test("a new session is requested 2 minutes before the old one expires", () => {
  const now = 1_800_000_000 * 1000;
  const { deadlineMs, clockSkewed } = localSessionDeadline(String(1_800_000_600), now, 600);
  assert.equal(clockSkewed, false);
  assert.equal(deadlineMs, now + 600_000);
  assert.ok(REFRESH_LEAD_SECONDS >= 60, "a QR scanned late must still leave time to tap and prove");
  assert.equal(sessionRefreshDelay(deadlineMs, now, now), 600_000 - REFRESH_LEAD_SECONDS * 1000);
});

test("a wrong device clock can't make the page loop (refresh is timed from arrival)", () => {
  const now = 1_800_000_000 * 1000;
  // This device is 15 min ahead: the relayer's expiresAt is already in our past.
  const ahead = localSessionDeadline(String(1_800_000_600 - 900), now, 600);
  assert.deepEqual(ahead, { deadlineMs: now + 600_000, clockSkewed: true });
  assert.equal(sessionRefreshDelay(ahead.deadlineMs, now, now), 600_000 - REFRESH_LEAD_SECONDS * 1000);
  // This device is 15 min behind: expiresAt looks 25 min away.
  const behind = localSessionDeadline(String(1_800_000_600 + 900), now, 600);
  assert.deepEqual(behind, { deadlineMs: now + 600_000, clockSkewed: true });
  // Small skew is tolerated and the relayer's lifetime is kept.
  assert.equal(localSessionDeadline(String(1_800_000_600 - 30), now, 600).clockSkewed, false);
  // Even a session that is about to expire is never replaced sooner than MIN_AUTO_REFRESH_MS after it arrived.
  assert.equal(sessionRefreshDelay(now + 5_000, now, now), MIN_AUTO_REFRESH_MS);
  assert.equal(sessionRefreshDelay(now + 5_000, now, now + 60_000), 0); // overdue: refresh now, once
});

test("every error code has calm copy", () => {
  const ctx = { relayerUrl: "http://localhost:8788", appId: "12345", chainName: "Whitechain Sepolia" };
  assert.match(sessionErrorCopy("UNKNOWN_APP", ctx).hint, /12345/);
  assert.match(sessionErrorCopy("NETWORK", ctx).hint, /CORS_ORIGINS/);
  assert.match(sessionErrorCopy("CHAIN_NOT_READY", ctx).title, /Whitechain Sepolia/);
  assert.match(statusNoteCopy("CHAIN_UNAVAILABLE"), /still works/);
});

test("tx explorer links and short addresses for the Paid view", () => {
  const tx = `0x${"ab".repeat(32)}`;
  assert.equal(explorerTxUrl("1874", tx), `https://explorer.testnet.whitechain.io/tx/${tx}`);
  assert.equal(shortAddress("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"), "0x7E5F…5Bdf");
});
