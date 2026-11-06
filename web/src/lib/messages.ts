/**
 * Plain-language copy for /verify and /pay (DESIGN_V2.md voice: short lines, plain words, say what to do next; "fee"
 * not "gas"; "our server" not "relayer"). Operator hints (env names, the relayer) live in `hint` / `detail`, which
 * the pages show only in small print or a "Details" disclosure. Pure logic, no React.
 */
import type { RelayerErrorCode } from "./relayer.ts";
import { formatUsdt } from "./usdt.ts";
import { shortAddress } from "./view.ts";
import type { WalletErrorCode } from "./wallet.ts";

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
        title: "Can't reach our server right now.",
        hint: `Check that the relayer is running at ${ctx.relayerUrl} and that this page's address is listed in its CORS_ORIGINS.`,
      };
    case "RATE_LIMIT":
      return {
        title: "Too many tries from this network. We'll try again in a minute.",
        hint: "The relayer allows a few new QR codes per minute per network.",
      };
    case "BUSY":
      return { title: "We're busy right now. Trying again soon.", hint: "Too many open sessions on the relayer." };
    case "UNKNOWN_APP":
      return {
        title: "This app isn't set up yet.",
        hint: `Add app ID ${ctx.appId} to the relayer's APP_IDS, or fix NEXT_PUBLIC_APP_ID.`,
      };
    case "CHAIN_NOT_READY":
      return {
        title: `Stamps aren't live on ${ctx.chainName} yet.`,
        hint: "The relayer has no stamp registry address for this chain (REGISTRY_ADDRESS or DEVNET_REGISTRY_ADDRESS).",
      };
    case "BAD_REQUEST":
      return { title: "We couldn't make a QR code for this page.", hint: "Check NEXT_PUBLIC_APP_ID and NEXT_PUBLIC_CHAIN_ID." };
    case "BAD_RESPONSE":
      return {
        title: "We got an answer we didn't expect, so there's no QR code.",
        hint:
          "The session must be for this wallet, app and chain, and its link must open in Watermark Tap: check the relayer's PROVER_URL looks like http://<mac-lan-ip>:8787 and that the relayer and website versions match.",
      };
    default:
      return { title: "Something went wrong making your QR code.", hint: "Try again in a moment." };
  }
}

/** A calm, non-blocking note while /status can't be read. The QR code keeps working. */
export function statusNoteCopy(code: RelayerErrorCode): string {
  switch (code) {
    case "CHAIN_UNAVAILABLE":
      return "Can't read the network right now. Your QR code still works. We'll keep checking.";
    case "CHAIN_NOT_READY":
      return "Stamps aren't live on this network yet, so your result can't show here. Your QR code still works.";
    case "NETWORK":
    case "TIMEOUT":
      return "Can't reach our server to check your stamp. Your QR code still works. We'll keep checking.";
    default:
      return "Can't check your stamp right now. Your QR code still works. We'll keep checking.";
  }
}

export interface PayErrorCopy {
  /** What the payer reads: calm, plain, no codes. */
  title: string;
  /** What to do next. */
  next: string;
  /** True when the payment might have gone through anyway, so the page checks the balance before a retry. */
  maybeSent?: boolean;
  /** For whoever runs the demo (env names, the relayer). Shown only inside a "Details" disclosure. */
  detail?: string;
}

/** Why a payment (or the demo top-up) didn't go through. Covers every F6 refusal reason and the client-side codes. */
export function payErrorCopy(code: RelayerErrorCode, ctx: { payMaxUsdt: string }): PayErrorCopy {
  switch (code) {
    case "NOT_STAMPED":
      return { title: "This wallet has no stamp yet.", next: "Stamp it first. It takes 2 minutes." };
    case "QUOTA_USED":
      return {
        title: "You've used today's free payments.",
        next: "Nothing was charged. They come back tomorrow (UTC).",
      };
    case "BUDGET_CAP":
      return {
        title: "The shop's free payments are used up for today.",
        next: "Nothing was charged. Try again tomorrow.",
      };
    case "GAS_CAP":
      return {
        title: "The network fee is too high right now.",
        next: "Nothing was charged. Try again in a minute.",
        detail: "The relayer's gas cap (GAS_CAP) refused this payment.",
      };
    case "RATE_LIMIT":
      return { title: "Too many tries in a short time.", next: "Wait a minute, then try again." };
    case "BAD_SIGNATURE":
      return {
        title: "Your signature didn't check out. Nothing was sent.",
        next: "Reload the page and try again. If it keeps happening, check your computer's clock.",
      };
    case "PAUSED":
      return { title: "Payments are paused for a moment.", next: "Nothing was charged. Try again in a few minutes." };
    case "SPONSOR_NOT_CONFIGURED":
      return {
        title: "Free payments aren't switched on yet.",
        next: "Nothing was sent. The team running this demo needs to finish setting it up.",
        detail: "The relayer has no SPONSOR_ADDRESS. Add it to the repo-root .env and restart the relayer.",
      };
    case "FUND_NOT_CONFIGURED":
      return {
        title: "Test USDT isn't switched on yet.",
        next: "Nothing was sent. The team running this demo needs to finish setting it up.",
        detail: "The relayer has no BUSINESS_PRIVATE_KEY. Add it to the repo-root .env and restart the relayer.",
      };
    case "ALREADY_FUNDED":
      return {
        title: "This wallet already got its test USDT.",
        next: "It can take a few seconds to show. Tap Refresh.",
      };
    case "INSUFFICIENT_FUNDS":
      return { title: "You don't have enough test USDT for this.", next: "Try a smaller amount." };
    case "BAD_REQUEST":
      return {
        title: "We couldn't accept these payment details.",
        next: `Check the amount (up to ${ctx.payMaxUsdt} USDT) and the shop. Check your computer's clock too.`,
      };
    case "TX_FAILED":
      return {
        title: "The payment didn't go through.",
        next: "Your balance didn't change. Check it, then try again.",
      };
    case "TX_PENDING":
      return {
        title: "Sent, but not confirmed yet.",
        next: "Open the link below. Check your balance before you try again.",
        maybeSent: true,
      };
    case "NONCE_USED":
      return {
        title: "This signature was already used.",
        next: "The payment may have gone through. Check your balance before you try again.",
        maybeSent: true,
      };
    case "PAY_REJECTED":
      return {
        title: "The network would refuse this payment. Nothing was sent.",
        next: "Check the amount and the shop, then try again.",
      };
    case "BUSY":
      return { title: "We're busy with other payments.", next: "Nothing was sent. Try again in a few seconds." };
    case "FUND_EMPTY":
      return {
        title: "We've run out of test USDT.",
        next: "Nothing was sent. Please tell the team running this demo.",
        detail: "The business wallet needs a USDT top-up.",
      };
    case "CHAIN_UNAVAILABLE":
      return { title: "Can't reach the network right now.", next: "Nothing was sent. Try again in a moment." };
    case "NETWORK":
      return {
        title: "Can't reach our server.",
        next: "Check your internet. Then check your balance before you try again.",
        maybeSent: true,
      };
    case "TIMEOUT":
    case "ABORTED":
      return {
        title: "Our server took too long to answer.",
        next: "The payment may still go through. Check your balance before you try again.",
        maybeSent: true,
      };
    case "BAD_RESPONSE":
      return {
        title: "We got an answer we didn't expect.",
        next: "Check your balance before you try again.",
        maybeSent: true,
        detail: "The relayer's answer didn't parse. The relayer and website versions may not match.",
      };
    default:
      return {
        title: "Something went wrong on our side.",
        next: "Check your balance, then try again in a moment.",
        maybeSent: true,
      };
  }
}

export interface WalletErrorCopy {
  title: string;
  next: string;
}

/** Why connecting or signing with the person's own wallet didn't work. Nothing is ever sent in these cases. */
export function walletErrorCopy(code: WalletErrorCode): WalletErrorCopy {
  switch (code) {
    case "USER_REJECTED":
      return { title: "You cancelled in your wallet.", next: "Nothing was sent. Try again when you're ready." };
    case "REQUEST_PENDING":
      return { title: "Your wallet already has a request open.", next: "Open your wallet. Finish it or close it." };
    case "UNAUTHORIZED":
    case "NO_ACCOUNT":
      return { title: "Your wallet didn't share an account.", next: "Unlock your wallet, then connect again." };
    case "UNSUPPORTED_METHOD":
      return {
        title: "This wallet can't sign this kind of payment.",
        next: "Try MetaMask or Rabby, or continue without a wallet.",
      };
    case "DISCONNECTED":
      return { title: "Your wallet disconnected.", next: "Open your wallet, then connect again." };
    case "ACCOUNT_CHANGED":
      return {
        title: "Your wallet switched accounts.",
        next: "Nothing was signed. This page now uses the account your wallet shows.",
      };
    case "WRONG_CHAIN":
      return {
        title: "Your wallet is on another network.",
        next: "Switch it to Whitechain Sepolia, then try again. Nothing was sent.",
      };
    case "SIGNATURE_MISMATCH":
      return {
        title: "This wallet's signature won't work for a no-fee payment.",
        next: "Smart wallets don't work yet. Use a regular account, or continue without a wallet.",
      };
    default:
      return { title: "Your wallet couldn't finish that.", next: "Nothing was sent. Try again, or reload the page." };
  }
}

/** Why the wallet chooser is showing: a wallet error, or the remembered wallet is locked / not in this browser. */
export type ChooserNote = WalletErrorCode | "LOCKED" | "NOT_FOUND";

/** The browser-wallet (burner) button on /verify and /pay. */
export const DEFAULT_BURNER_LABEL = "Continue without a wallet";

/**
 * The note above "Choose a wallet". `walletName` is the remembered wallet ("MetaMask"), or null when unknown.
 * LOCKED and NOT_FOUND say plainly that "Continue without a wallet" is a different wallet, so someone who verified
 * with MetaMask isn't nudged into an unverified one.
 */
export function chooserNoteCopy(
  note: ChooserNote,
  walletName: string | null,
  /** The browser-wallet button's label on this page ("Use this browser" on /verify, /pay and the pass walk). */
  burnerLabel: string = DEFAULT_BURNER_LABEL,
): WalletErrorCopy {
  const name = walletName ?? "Your wallet";
  const other = `"${burnerLabel}" uses a different wallet. It won't have ${walletName ?? "your wallet"}'s stamp.`;
  switch (note) {
    case "LOCKED":
      return {
        title: `${name} is locked or not connected.`,
        next: `Unlock it, then choose Connect ${walletName ?? "your wallet"}. ${other}`,
      };
    case "NOT_FOUND":
      return {
        title: `We couldn't find ${walletName ?? "your wallet"} in this browser.`,
        next: `Turn it on and reload, or open this page where you use it. ${other}`,
      };
    default:
      return walletErrorCopy(note);
  }
}

/**
 * "No wallet found" under "Use my wallet". Phone browsers (Android Chrome, iOS Safari) have no extensions, so they get
 * "open this page in your wallet app's browser" instead of "install MetaMask".
 */
export function noWalletFoundCopy(mobile: boolean, burnerLabel: string = DEFAULT_BURNER_LABEL): string {
  const fallback = burnerLabel === DEFAULT_BURNER_LABEL ? "continue without a wallet" : `choose "${burnerLabel}"`;
  return mobile
    ? `No wallet in this browser. ${fallback[0]!.toUpperCase()}${fallback.slice(1)}, or open this page in your wallet app's browser (MetaMask, Rabby, Coinbase Wallet).`
    : `No browser wallet found. Install one (for example MetaMask), reload this page, or ${fallback}.`;
}

/**
 * Explains the raw fields the wallet popup shows for an EIP-3009 permission (it is not a Permit, so wallets show
 * `value` in base units and `validBefore` as a Unix time). Built from the same amount, recipient and window as the
 * intent, so it matches the popup.
 */
export function walletPopupHint(args: { value: bigint; to: string; validitySeconds: number }): string {
  const minutes = Math.round(args.validitySeconds / 60);
  return (
    `Your wallet shows the amount in USDT's smallest unit (1 USDT = 1000000), so ${formatUsdt(args.value)} USDT shows as ` +
    `value ${args.value.toString()}. It goes to ${shortAddress(args.to)} ("to") and expires in ${minutes} minutes ("validBefore").`
  );
}

// ---- Wallet chooser copy per page (WalletGate) ----

/** Which page the wallet chooser is on: /verify only connects, /pay also signs, the pass walk (/verify?next=pass, /pass) only connects. */
export type WalletPurpose = "verify" | "pay" | "pass";

export interface WalletGateCopy {
  title: string;
  sub: string;
  own: { title: string; body: string };
  burner: { title: string; body: string; button: string };
  /** Phones and tablets have no wallet extensions: show the browser wallet first there. */
  burnerFirstOnTouch: boolean;
  /** Show the browser wallet ("Easiest") first on every device (DESIGN_V2 "/verify" wallet choice order). */
  burnerFirst?: boolean;
}

/**
 * DESIGN_V2 "/verify" wallet choice: the two options read the same on /verify and on the pass walk. The browser
 * wallet's button says "Use this browser" on every page, /pay included, so the wallet picked at step 1 has the same
 * name, in the same place, at step 2.
 */
const V2_OWN = { title: "My wallet", body: "MetaMask or similar. You only share your address." } as const;
const V2_BURNER = { title: "In this browser", body: "Easiest. Nothing to install.", button: "Use this browser" } as const;

export function walletGateCopy(purpose: WalletPurpose): WalletGateCopy {
  switch (purpose) {
    case "pass":
      return {
        title: "Where should we keep your pass?",
        sub: "Your stamp and your pass go to the wallet you pick. You pay no fees.",
        own: { ...V2_OWN },
        burner: { ...V2_BURNER },
        burnerFirstOnTouch: true,
        burnerFirst: true,
      };
    case "pay":
      // The same order and button as /verify (the browser wallet first), so step 2 shows the wallet from step 1 where
      // step 1 showed it.
      return {
        title: "Which wallet will you pay from?",
        sub: "Pick the wallet you stamped. You pay no fees.",
        own: { title: V2_OWN.title, body: "MetaMask or similar. You sign each payment. Nothing is sent until you do." },
        burner: { title: V2_BURNER.title, body: "The wallet this browser keeps for you. Nothing to install.", button: V2_BURNER.button },
        burnerFirstOnTouch: true,
        burnerFirst: true,
      };
    case "verify":
      return {
        title: "Where should we keep your stamp?",
        sub: "Your stamp goes to the wallet you pick.",
        own: { ...V2_OWN },
        burner: { ...V2_BURNER },
        burnerFirstOnTouch: true,
        burnerFirst: true,
      };
  }
}

// ---- Shared relayer line (SITE_SPEC.md section 2) ----

/** Codes that mean the relayer itself can't be reached (down, wrong URL, CORS, no answer in time). */
export function isRelayerDown(code: RelayerErrorCode): boolean {
  return code === "NETWORK" || code === "TIMEOUT";
}

/** Every page says this while the relayer is unreachable and a retry is scheduled ("our server": no jargon). */
export function relayerDownCopy(secondsLeft: number): string {
  const n = Number.isFinite(secondsLeft) ? Math.max(0, Math.ceil(secondsLeft)) : 0;
  return `Can't reach our server. Trying again in ${n}s.`;
}

// ---- /verify ----

/**
 * The note on /verify when the page's app isn't the live app (a ?app= link, or a test setup). Only on Whitechain:
 * free payments and the Genesis Pass exist there only. The Genesis Pass is named only while it is live.
 */
export function appNoteCopy(args: {
  appId: string;
  chainId: string;
  liveAppId: string;
  previousLiveAppId: string;
  previousLiveLabel: string;
  liveLabel: string;
  passLive: boolean;
}): string | null {
  if (args.chainId !== "1874" || args.appId === args.liveAppId) return null;
  const what = args.appId === args.previousLiveAppId ? `This is the ${args.previousLiveLabel}.` : "This is a test app.";
  const perks = args.passLive ? "Free payments and the Genesis Pass accept" : "Free payments accept";
  return `${what} ${perks} only stamps for the live app, ${args.liveLabel}.`;
}

/** "Valid until 31 January 2027." (DESIGN_V2 "/verify" Success), or "" when the expiry is unknown. */
export function verifiedUntilCopy(expiryText: string): string {
  return expiryText ? `Valid until ${expiryText}.` : "";
}

/**
 * The /verify page (DESIGN_V2 "/verify"). Headlines mark their one serif word with *asterisks* (Headline renders it).
 * `check(last4)` is step 2; `strong` is the wallet ending the phone shows, case-sensitive.
 */
export const QR_STEPS = {
  title: "Stamp your *wallet*.",
  stamped: "You're *stamped*.",
  lead: "Scan this with the Watermark phone app.",
  scan: "The phone scans this code.",
  check: (last4: string) => ({ before: "Check the phone shows your wallet ending ", strong: last4, after: "." }),
  hold: "Hold your card on the back of the phone.",
  waiting: "Waiting for your tap…",
  waitingNote: "It takes about 10 seconds after you tap.",
} as const;

export const TAPPED_NOTHING_HAPPENED = {
  summary: "Tapped but nothing happened?",
  body: "Only RuPay cards work today. Used this card on another wallet? Use that wallet. Phone lost internet? Tap again.",
  /** This page only sees a stamp arrive, never why one didn't: say so. */
  note: "Prepaid cards don't count. This page sees a stamp arrive, but not why one didn't.",
} as const;

/** DESIGN_V2 "/verify" receipt: "You: tapped a card, signed nothing, paid $0." · "Us: put it on-chain and paid the fee." */
export const VERIFY_RECEIPT = {
  you: "Tapped a card, signed nothing, paid $0.",
  /** Linked to the relayer's address from GET /health (/status returns no tx hash). */
  relayer: "Put it on-chain and paid the fee.",
} as const;

// ---- /pay ----

/** Why the payment form isn't shown: no stamp for the Sponsor's app (DESIGN_V2 "/pay", "Not stamped"). */
export function payNoStampCopy(kind: "not-stamped" | "other-app", liveLabel: string): { title: string; next: string } {
  return kind === "other-app"
    ? {
        title: "This wallet's stamp won't work here.",
        next: `Its stamp is for another app. Free payments only take stamps for the live app, ${liveLabel}.`,
      }
    : {
        title: "This wallet has no stamp yet.",
        next: "Stamp it first. It takes 2 minutes.",
      };
}

/** "1 free payment left today" / "19 free payments left today". Only for a wallet stamped for the Sponsor's app. */
export function freePaymentsLeftCopy(quotaLeft: number): string {
  return quotaLeft === 1 ? "1 free payment left today" : `${quotaLeft} free payments left today`;
}

/**
 * The receipt rows after "Paid." (DESIGN_V2 "/pay" Success). `quotaLeft` is null until a balance read after the
 * payment answered, so the count is never the one from before the payment.
 */
export const PAY_RECEIPT = {
  you: (amountUsdt: string) => `You signed for ${amountUsdt} USDT. You paid $0.`,
  relayer: "We sent it and paid the fee.",
  business: (quotaLeft: number | null) =>
    quotaLeft === null
      ? "The business checked your stamp on-chain."
      : `The business checked your stamp on-chain. ${freePaymentsLeftCopy(quotaLeft)}.`,
  shop: (amountUsdt: string) => `The shop got ${amountUsdt} USDT.`,
  explorer: "See it on the explorer",
} as const;
