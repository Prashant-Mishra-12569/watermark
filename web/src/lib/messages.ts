/** Plain-language copy for relayer errors on /verify. Pure logic, no React. */
import type { RelayerErrorCode } from "./relayer.ts";

export interface SessionErrorCopy {
  /** What the person in front of the screen reads. */
  title: string;
  /** A hint for whoever runs the demo. */
  hint: string;
}

/** Why there is no QR code yet. Never shown together with a QR from a missing or invalid session. */
export function sessionErrorCopy(
  code: RelayerErrorCode,
  ctx: { relayerUrl: string; appId: string; chainName: string },
): SessionErrorCopy {
  switch (code) {
    case "NETWORK":
    case "TIMEOUT":
    case "ABORTED":
      return {
        title: "Can't reach the Watermark relayer right now.",
        hint: `Check that the relayer is running at ${ctx.relayerUrl} and that this page's address is listed in its CORS_ORIGINS.`,
      };
    case "RATE_LIMIT":
      return {
        title: "Too many tries from this network. Trying again in a minute.",
        hint: "The relayer allows a few new QR codes per minute per network.",
      };
    case "BUSY":
      return { title: "The relayer is busy. Trying again shortly.", hint: "Too many open sessions on the relayer." };
    case "UNKNOWN_APP":
      return {
        title: "This app isn't set up on the relayer.",
        hint: `Add app ID ${ctx.appId} to the relayer's APP_IDS, or fix NEXT_PUBLIC_APP_ID.`,
      };
    case "CHAIN_NOT_READY":
      return {
        title: `Watermark isn't live on ${ctx.chainName} yet.`,
        hint: "The relayer has no stamp registry address for this chain (REGISTRY_ADDRESS or DEVNET_REGISTRY_ADDRESS).",
      };
    case "BAD_REQUEST":
      return { title: "The relayer didn't accept this request.", hint: "Check NEXT_PUBLIC_APP_ID and NEXT_PUBLIC_CHAIN_ID." };
    case "BAD_RESPONSE":
      return {
        title: "The relayer's answer didn't match this page, so no QR code is shown.",
        hint:
          "The session must be for this wallet, app and chain, and its link must open in Watermark Tap: check the relayer's PROVER_URL looks like http://<mac-lan-ip>:8787 and that the relayer and website versions match.",
      };
    default:
      return { title: "Something went wrong getting a QR code.", hint: "Try again in a moment." };
  }
}

/** A calm, non-blocking note while /status can't be read. The QR code keeps working. */
export function statusNoteCopy(code: RelayerErrorCode): string {
  switch (code) {
    case "CHAIN_UNAVAILABLE":
      return "Can't read the chain right now. Your QR code still works; we'll keep checking.";
    case "CHAIN_NOT_READY":
      return "The stamp registry isn't live on this chain yet, so the result can't show here. Your QR code still works.";
    case "NETWORK":
    case "TIMEOUT":
      return "Can't reach the relayer to check your stamp. Your QR code still works; we'll keep checking.";
    default:
      return "Can't check your stamp right now. Your QR code still works; we'll keep checking.";
  }
}
