/**
 * Which stamp /pay trusts. Pure apart from the relayer reads, whose fetch tests inject.
 *
 * Only the Sponsor's app counts: the relayer refuses POST /pay with NOT_STAMPED and the Sponsor contract reverts
 * NotStamped for any other app's stamp. So a stamp for ?app=, the test app or the first live app is never shown as
 * "Verified" here. When the Sponsor's app has no stamp, those other apps are read only to explain why.
 */
import type { Address } from "viem";
import type { ChainIdString } from "../../lib/config.ts";
import { freePaymentsLeftCopy } from "../../lib/messages.ts";
import { getStatus, type RelayerErrorCode, type RequestOptions } from "../../lib/relayer.ts";

export type PayStamp =
  | { kind: "stamped"; expiresAt: number }
  /** No stamp for the Sponsor's app, but one for another app (a test app, the first live app...). */
  | { kind: "other-app" }
  | { kind: "not-stamped" };

/**
 * Reads the wallet's stamp for the Sponsor's app; throws that read's RelayerError. Only when it says "not stamped",
 * the other apps are read in parallel. Their errors are ignored: they never turn a "no" into a "yes".
 */
export async function readPayStamp(
  relayerUrl: string,
  wallet: Address,
  sponsorAppId: string,
  otherAppIds: readonly string[],
  chainId: ChainIdString,
  opts: RequestOptions = {},
): Promise<PayStamp> {
  const own = await getStatus(relayerUrl, wallet, sponsorAppId, chainId, opts);
  if (own.stamped) return { kind: "stamped", expiresAt: own.expiresAt };
  const others = otherAppIds.filter((id) => id !== sponsorAppId);
  if (others.length === 0) return { kind: "not-stamped" };
  const reads = await Promise.allSettled(others.map((id) => getStatus(relayerUrl, wallet, id, chainId, opts)));
  return reads.some((r) => r.status === "fulfilled" && r.value.stamped) ? { kind: "other-app" } : { kind: "not-stamped" };
}

/**
 * When to read the stamp again by itself after a failed read, or null for "only when the person asks" (a bad request
 * or a missing registry won't fix itself). The relayer or chain being away backs off 5 s, 10 s, 20 s, then 30 s.
 */
export function stampRetryDelay(code: RelayerErrorCode, attempt: number): number | null {
  switch (code) {
    case "NETWORK":
    case "TIMEOUT":
    case "CHAIN_UNAVAILABLE":
    case "HTTP_ERROR":
      return Math.min(30_000, 5_000 * 2 ** Math.max(0, attempt));
    default:
      return null;
  }
}

/** Everything the stamp cell on /pay can show. */
export type PayStampView = PayStamp["kind"] | "checking" | "error";

/** Only a stamp for the Sponsor's app reads "Stamped ✓" (DESIGN_V2: "stamp", never "verified"). */
export const PAY_STAMP_LABEL: Readonly<Record<PayStampView, string>> = {
  checking: "Checking…",
  stamped: "Stamped ✓",
  "not-stamped": "No stamp yet",
  "other-app": "Stamp is for another app",
  error: "Can't check right now",
};

/**
 * "19 free payments left today", or null. GET /balance answers quotaLeft 0 for a wallet without the Sponsor's stamp,
 * which doesn't mean "0 left", so the count is shown only for a stamped wallet.
 */
export function freePaymentsLine(kind: PayStampView, quotaLeft: number | null | undefined): string | null {
  return kind === "stamped" && typeof quotaLeft === "number" ? freePaymentsLeftCopy(quotaLeft) : null;
}

/** "No free payments left today" applies only to a stamped wallet whose quota is really used up. */
export function quotaUsedUp(kind: PayStampView, quotaLeft: number | null | undefined): boolean {
  return kind === "stamped" && quotaLeft === 0;
}
