/** Timing rules for /verify: polling, backoff and session refresh. Pure functions so they can be tested. */
import type { RelayerErrorCode } from "./relayer.ts";

export const STATUS_POLL_MS = 3_000;
/** The relayer allows 10 sessions per IP per fixed 60 s window, so wait a full window plus a margin. */
export const RATE_LIMIT_RETRY_MS = 61_000;
export const BUSY_RETRY_MS = 30_000;
/**
 * Swap in a new QR this long before the old session expires. Watermark Tap refuses a tap after expiresAt, and
 * proving and stamping come after the tap, so a QR on screen always has at least 2 minutes left.
 */
export const REFRESH_LEAD_SECONDS = 120;
/** Never refresh a session automatically sooner than this after it arrived (guards against loops). */
export const MIN_AUTO_REFRESH_MS = 30_000;
/** Allowed gap between this device's clock and the relayer's before the page stops trusting its own clock. */
export const CLOCK_SLACK_MS = 60_000;
/** Wait this long for the first /status answer before opening a session (an already-stamped wallet needs none). */
export const FIRST_STATUS_WAIT_MS = 2_000;

/** Delay before the next /status poll: 3 s while healthy, backing off to 10 s after errors. */
export function statusPollDelay(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return STATUS_POLL_MS;
  return Math.min(10_000, 5_000 + (consecutiveErrors - 1) * 2_500);
}

/**
 * Automatic retry delay after a failed POST /session, or null for "only when the user asks"
 * (config problems like UNKNOWN_APP won't fix themselves, and retrying them would only burn the rate limit).
 */
export function sessionRetryDelay(code: RelayerErrorCode, attempt: number): number | null {
  switch (code) {
    case "RATE_LIMIT":
      return RATE_LIMIT_RETRY_MS;
    case "BUSY":
      return BUSY_RETRY_MS;
    case "NETWORK":
    case "TIMEOUT":
      return Math.min(30_000, 5_000 * 2 ** Math.max(0, attempt));
    default:
      return null;
  }
}

/**
 * When a session expires, on this device's clock, measured from when it arrived (receivedAtMs) rather than from the
 * relayer's absolute expiresAt. The relayer's lifetime (expiresAt minus our clock at arrival) is trusted only when it
 * is plausible (more than 0 and at most ttlSeconds plus a minute); otherwise this device's clock is off and the
 * session is assumed to live ttlSeconds from arrival. `clockSkewed` tells the page to say so.
 */
export function localSessionDeadline(
  expiresAt: string | number,
  receivedAtMs: number,
  ttlSeconds: number,
): { deadlineMs: number; clockSkewed: boolean } {
  const lifetimeMs = Number(expiresAt) * 1000 - receivedAtMs;
  const plausible = Number.isFinite(lifetimeMs) && lifetimeMs > 0 && lifetimeMs <= ttlSeconds * 1000 + CLOCK_SLACK_MS;
  return plausible
    ? { deadlineMs: receivedAtMs + lifetimeMs, clockSkewed: false }
    : { deadlineMs: receivedAtMs + ttlSeconds * 1000, clockSkewed: true };
}

/**
 * Milliseconds until a session should be replaced: REFRESH_LEAD_SECONDS before its local deadline, but never sooner
 * than MIN_AUTO_REFRESH_MS after it arrived, so a wrong clock or a short-lived session can't make the page loop.
 */
export function sessionRefreshDelay(deadlineMs: number, receivedAtMs: number, nowMs: number): number {
  const due = Math.max(deadlineMs - REFRESH_LEAD_SECONDS * 1000, receivedAtMs + MIN_AUTO_REFRESH_MS);
  return Math.max(0, due - nowMs);
}
