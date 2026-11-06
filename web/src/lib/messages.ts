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

export interface PayErrorCopy {
  /** What the payer reads: calm, plain, no codes. */
  title: string;
  /** What to do next. */
  next: string;
  /** True when the payment might have gone through anyway, so the page checks the balance before a retry. */
  maybeSent?: boolean;
}

/** Why a payment (or the demo top-up) didn't go through. Covers every F6 refusal reason and the client-side codes. */
export function payErrorCopy(code: RelayerErrorCode, ctx: { payMaxUsdt: string }): PayErrorCopy {
  switch (code) {
    case "NOT_STAMPED":
      return { title: "This wallet isn't verified yet.", next: "Verify it with a card tap first, then come back to pay." };
    case "QUOTA_USED":
      return {
        title: "You've used today's free payments for this wallet.",
        next: "The free allowance resets tomorrow (UTC). Nothing was charged.",
      };
    case "BUDGET_CAP":
      return {
        title: "The shop's free-payment budget for today is used up.",
        next: "Nothing was charged. Please try again tomorrow.",
      };
    case "GAS_CAP":
      return {
        title: "This payment would cost the relayer more than it allows.",
        next: "Nothing was charged. Try a smaller amount, or try again in a moment.",
      };
    case "RATE_LIMIT":
      return { title: "Too many tries in a short time.", next: "Wait a minute, then try again." };
    case "BAD_SIGNATURE":
      return {
        title: "The payment approval didn't check out, so nothing was sent.",
        next: "Reload the page and try again. If it keeps happening, check this computer's date and time.",
      };
    case "PAUSED":
      return { title: "Payments are paused for a moment.", next: "Nothing was charged. Please try again a little later." };
    case "SPONSOR_NOT_CONFIGURED":
      return {
        title: "Gasless payments aren't switched on yet.",
        next: "The relayer has no SPONSOR_ADDRESS. Add it to the repo-root .env and restart the relayer.",
      };
    case "FUND_NOT_CONFIGURED":
      return {
        title: "The shop can't hand out demo USDT right now.",
        next: "The relayer has no BUSINESS_PRIVATE_KEY. Add it to the repo-root .env and restart the relayer.",
      };
    case "ALREADY_FUNDED":
      return {
        title: "This wallet already got its demo USDT.",
        next: "It may take a few seconds to show. Refresh the balance.",
      };
    case "INSUFFICIENT_FUNDS":
      return { title: "Your USDT balance is too low for this payment.", next: "Try a smaller amount." };
    case "BAD_REQUEST":
      return {
        title: "The payment details weren't accepted.",
        next: `Check the amount (up to ${ctx.payMaxUsdt} USDT) and the recipient, and that this computer's clock is right.`,
      };
    case "TX_FAILED":
      return {
        title: "The payment was sent but didn't go through on the chain.",
        next: "Your balance is unchanged. Check it, then try again.",
      };
    case "TX_PENDING":
      return {
        title: "The payment was sent, but Whitechain hasn't confirmed it yet.",
        next: "Follow the transaction link below, and check your balance before trying again.",
        maybeSent: true,
      };
    case "NONCE_USED":
      return {
        title: "This payment approval was already used.",
        next: "It may already have gone through. Check your balance before trying again.",
        maybeSent: true,
      };
    case "PAY_REJECTED":
      return {
        title: "Whitechain would refuse this transfer, so nothing was sent.",
        next: "Nothing was charged. Check the amount and the recipient, then try again.",
      };
    case "BUSY":
      return { title: "The relayer is busy with other payments.", next: "Nothing was sent. Try again in a few seconds." };
    case "FUND_EMPTY":
      return {
        title: "The shop has run out of demo USDT.",
        next: "Nothing was sent. The shop needs to top up its business wallet.",
      };
    case "CHAIN_UNAVAILABLE":
      return { title: "Can't reach Whitechain right now.", next: "Nothing was sent. Try again in a moment." };
    case "NETWORK":
      return {
        title: "Can't reach the Watermark relayer.",
        next: "Check your connection, then check your balance before trying again.",
        maybeSent: true,
      };
    case "TIMEOUT":
    case "ABORTED":
      return {
        title: "The relayer took too long to answer.",
        next: "The payment may still go through. Check your balance before trying again.",
        maybeSent: true,
      };
    case "BAD_RESPONSE":
      return {
        title: "The relayer's answer didn't make sense to this page.",
        next: "Check your balance before trying again. The relayer and website versions may not match.",
        maybeSent: true,
      };
    default:
      return {
        title: "Something went wrong on the relayer.",
        next: "Check your balance, then try again in a moment.",
        maybeSent: true,
      };
  }
}
