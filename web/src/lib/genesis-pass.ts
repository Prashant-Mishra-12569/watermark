/**
 * Watermark Genesis Pass: relayer calls, response checks, copy and the pass artwork. Pure logic, no React.
 *
 * The pass (contracts/src/WatermarkGenesisPass.sol) is 100 ERC-721 tokens, one per bank card, minted gas-free by the
 * relayer. Unlock: 1. the wallet is stamped in the live app (the contract checks it), 2. the wallet made one gas-free
 * payment through the live app's Sponsor (the relayer checks it from the Sponsor's events: a contract can't).
 */
import type { Address, Hex } from "viem";
import { passArtDataUri, passArtId } from "./pass-art.ts";
import { PAY_TIMEOUT_MS, RelayerError, request, type RelayerErrorCode, type RequestOptions } from "./relayer.ts";

export const PASS_MAX_SUPPLY = 100;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^\d{1,78}$/;
/** The only image form the page renders: a base64 SVG, shown with <img> (scripts inside an <img> SVG never run). */
const SVG_DATA_URI = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_CHARS = 64 * 1024;

export interface PassStatus {
  /** The WatermarkGenesisPass contract. */
  pass: Address;
  /** The stamp `mint` checks (read from the pass contract). */
  stamped: boolean;
  /** Unix seconds the stamp lasts until; 0 when not stamped (or an older relayer that doesn't send it). */
  stampExpiresAt: number;
  /** null = the relayer couldn't read the payment history right now. */
  paid: boolean | null;
  /** The wallet claimed a pass (kept even if it later gave the pass away). */
  claimed: boolean;
  tokenId: string | null;
  remaining: number;
  totalSupply: string;
  maxSupply: string;
  image: string | null;
}

/** GET /pass: the supply only (no wallet), for the landing counter and the /pass hero line. */
export interface PassSupply {
  pass: Address;
  remaining: number;
  totalSupply: string;
  maxSupply: string;
}

export interface ClaimResponse {
  txHash: Hex;
  tokenId: string;
  /** Who sent the mint and paid its gas (the relayer). */
  from: Address | null;
}

export function isSvgDataUri(s: unknown): s is string {
  return typeof s === "string" && s.length <= MAX_IMAGE_CHARS && SVG_DATA_URI.test(s);
}

function parseSupplyFields(b: Record<string, unknown>, bad: (why: string) => RelayerError): PassSupply {
  if (typeof b.pass !== "string" || !ADDRESS.test(b.pass)) throw bad("pass");
  if (typeof b.totalSupply !== "string" || !DECIMAL.test(b.totalSupply)) throw bad("totalSupply");
  if (typeof b.maxSupply !== "string" || !DECIMAL.test(b.maxSupply)) throw bad("maxSupply");
  const remaining = Number(b.remaining);
  if (typeof b.remaining !== "number" || !Number.isSafeInteger(remaining) || remaining < 0) throw bad("remaining");
  return { pass: b.pass as Address, remaining, totalSupply: b.totalSupply, maxSupply: b.maxSupply };
}

export function parsePassSupply(body: unknown): PassSupply {
  const bad = (why: string) => new RelayerError("BAD_RESPONSE", 200, why);
  if (!body || typeof body !== "object") throw bad("not an object");
  return parseSupplyFields(body as Record<string, unknown>, bad);
}

export function parsePassStatus(body: unknown): PassStatus {
  const bad = (why: string) => new RelayerError("BAD_RESPONSE", 200, why);
  if (!body || typeof body !== "object") throw bad("not an object");
  const b = body as Record<string, unknown>;
  const supply = parseSupplyFields(b, bad);
  if (typeof b.stamped !== "boolean" || typeof b.claimed !== "boolean") throw bad("stamped/claimed");
  if (b.paid !== null && typeof b.paid !== "boolean") throw bad("paid");
  if (b.tokenId !== null && (typeof b.tokenId !== "string" || !DECIMAL.test(b.tokenId))) throw bad("tokenId");
  if (b.claimed === true && b.tokenId === null) throw bad("claimed without tokenId");
  const exp = Number(b.stampExpiresAt ?? 0);
  return {
    ...supply,
    // Only literal `true` from the chain read counts.
    stamped: b.stamped === true,
    stampExpiresAt: b.stamped === true && Number.isSafeInteger(exp) && exp > 0 ? exp : 0,
    paid: b.paid as boolean | null,
    claimed: b.claimed === true,
    tokenId: b.tokenId as string | null,
    image: isSvgDataUri(b.image) ? b.image : null,
  };
}

export function parseClaimResponse(body: unknown): ClaimResponse {
  if (!body || typeof body !== "object") throw new RelayerError("BAD_RESPONSE", 200, "not an object");
  const b = body as Record<string, unknown>;
  if (typeof b.txHash !== "string" || !TX_HASH.test(b.txHash)) throw new RelayerError("BAD_RESPONSE", 200, "txHash");
  if (typeof b.tokenId !== "string" || !DECIMAL.test(b.tokenId)) throw new RelayerError("BAD_RESPONSE", 200, "tokenId");
  const from = typeof b.from === "string" && ADDRESS.test(b.from) ? (b.from as Address) : null;
  return { txHash: b.txHash as Hex, tokenId: b.tokenId, from };
}

/** GET /pass: how many are left (no wallet). 503 PASS_NOT_CONFIGURED until the relayer has GENESIS_PASS_ADDRESS. */
export async function getPassSupply(relayerUrl: string, opts: RequestOptions = {}): Promise<PassSupply> {
  const body = await request(`${relayerUrl}/pass`, { method: "GET" }, opts);
  return parsePassSupply(body);
}

/** GET /pass/:wallet: the two tasks, the claim, the supply and (once claimed) the on-chain artwork. */
export async function getPass(relayerUrl: string, wallet: Address, opts: RequestOptions = {}): Promise<PassStatus> {
  const body = await request(`${relayerUrl}/pass/${encodeURIComponent(wallet)}`, { method: "GET" }, opts);
  return parsePassStatus(body);
}

/** POST /pass {wallet}: the relayer checks both tasks, mints the pass to this wallet and pays the gas. */
export async function claimPass(relayerUrl: string, wallet: Address, opts: RequestOptions = {}): Promise<ClaimResponse> {
  const body = await request(
    `${relayerUrl}/pass`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) },
    { timeoutMs: PAY_TIMEOUT_MS, ...opts },
  );
  return parseClaimResponse(body);
}

// ------------------------------------------------------------------ copy (SITE_FINAL.md "Page 2: Genesis Drop")

/**
 * Every line /pass shows. The page is "the Watermark Genesis Drop": our own free NFT drop that uses the service. The
 * NFT itself is the Watermark Genesis Pass (its on-chain name), so the art and the alt text keep "Genesis Pass".
 * Plain words: "verify with your card", "fee", never "gas", "relayer" or "real person" (only `gated` quotes the
 * contract, inside the Details disclosure).
 */
export const PASS_COPY = {
  eyebrow: "Watermark Genesis Drop",
  eyebrowTail: "protected by Watermark",
  /** The H1, with *real* as the serif italic word (Headline renders it). */
  title: "A free NFT for *real* cardholders.",
  sub: "We're launching Watermark with 100 free NFTs. No fee to pay: we cover it. To stop bots from taking them, you verify once with your bank card.",
  facts: ["Free", "No fee", "Only 100 will ever exist", "One per bank card"],
  left: (remaining: number) => `${remaining} left`,
  /** Shown in the counter's place while the live count can't be read (never a placeholder number). */
  supplyFallback: "Only 100 will ever exist.",
  notConfigured: "The drop opens soon. You can verify your wallet now.",
  notConfiguredButton: "Verify my wallet",
  /** The wallet choice on /pass (WalletGate title / sub), worded for the drop. */
  walletTitle: "Where should we send your NFT?",
  walletSub: "Your stamp and your NFT go to the wallet you pick. You never pay a fee.",
  loading: "Checking your wallet…",
  unreachable: (seconds: number) => `Can't reach our server. Trying again in ${seconds}s.`,
  /** The checklist heading, with *three* as the serif italic word. */
  stepsTitle: "Claim it in *three* steps.",
  step1Title: "Verify with your card",
  step1Body: "Tap your RuPay bank card on the Watermark phone app, once. Your wallet gets a stamp. Your card number is never stored.",
  step1Button: "Verify with my card",
  step1Done: (date: string) => (date ? `Verified. Your stamp lasts until ${date}.` : "Verified."),
  step1Hint: "Already verified this card with another wallet? Use that wallet. One card, one NFT.",
  step2Title: "Send one free test payment",
  /** Says why the step is there, in the step itself (the "Why a test payment?" answer stays below). */
  step2Body: "Send one test USDT payment. You only sign, and we pay the fee. It shows your stamp unlocks payments with no fees.",
  step2Button: "Make the payment",
  step2Unknown: "Can't check payments right now. You can still try to claim.",
  step2Done: "Paid, with $0 in fees.",
  step3Title: "Claim your NFT",
  step3Body: "We mint it to your wallet. You sign nothing and pay nothing.",
  step3Locked: "Finish steps 1 and 2 first.",
  step3Button: "Claim my NFT. It's free.",
  claiming: "Minting your NFT… about 10 seconds. You sign nothing. We pay the fee.",
  /** The success headline, with *yours* as the serif italic word. */
  success: (tokenId: string) => `NFT #${tokenId} is *yours*.`,
  successLine: "It's in your wallet now. You paid $0.",
  burner: "Your NFT lives in this browser's wallet. Don't clear site data or use private mode.",
  alreadyClaimed: (tokenId: string | null) =>
    tokenId ? `This wallet already has NFT #${tokenId}.` : "This wallet already has its NFT.",
  soldOut: "All 100 NFTs are claimed. You can still verify your wallet.",
  /** The closing note: why a bank card, and the way to the builders page. */
  noteTitle: "Why the *card*?",
  noteBody: "Wallets are free to make, so bots make thousands. Bank cards aren't.",
  noteBody2: "This drop is protected by Watermark, the same check any company can add.",
  noteLink: "See how it works",
  gated:
    "Step 1 is checked on-chain by the NFT contract. Step 2 is checked by our relayer from the Sponsor's PaymentRelayed events, not on-chain.",
} as const;

/** "How we gated this": the lines of WatermarkGenesisPass.mint that check the stamp (the test checks them against the .sol). */
export const PASS_GATE_CODE = [
  "// WatermarkGenesisPass.mint(to), on-chain",
  "(bool ok, uint64 expiresAt) = registry.isStamped(to, appId);",
  "if (!ok) revert NotStamped(to);",
].join("\n");

export interface PassErrorCopy {
  text: string;
  /** The NFT may have been minted anyway: the page reads the status again before offering a retry. */
  maybeSent?: boolean;
}

/** Plain copy for every way a claim (or a status read) can fail. No raw codes. NETWORK uses PASS_COPY.unreachable. */
export function passErrorCopy(code: RelayerErrorCode, tokenId: string | null = null): PassErrorCopy {
  switch (code) {
    case "PASS_NOT_CONFIGURED":
      return { text: PASS_COPY.notConfigured };
    case "CLAIM_PENDING":
    case "TX_PENDING":
      return { text: "Your NFT is on its way. This page updates by itself.", maybeSent: true };
    case "ALREADY_CLAIMED":
      return { text: PASS_COPY.alreadyClaimed(tokenId) };
    case "NOT_STAMPED":
      return { text: "This wallet isn't verified yet. Verify with your card first. It takes 2 minutes." };
    case "NO_PAYMENT":
      return { text: "We can't see your free payment yet. If you just paid, wait 30 seconds and try again." };
    case "SOLD_OUT":
      return { text: PASS_COPY.soldOut };
    case "RATE_LIMIT":
    case "BUSY":
      return { text: "Too many requests right now. Try again in a minute." };
    case "NETWORK":
      return { text: "Can't reach our server.", maybeSent: true };
    case "TIMEOUT":
    case "ABORTED":
      return { text: "Our server is taking a while. Your NFT may still arrive. This page updates by itself.", maybeSent: true };
    case "SPONSOR_NOT_CONFIGURED":
    case "RELAYER_NOT_CONFIGURED":
      return { text: "We can't mint NFTs right now. Nothing was sent." };
    case "PASS_REJECTED":
      return { text: "The NFT contract would refuse this, so nothing was sent. Try again in a minute." };
    case "GAS_CAP":
      return { text: "This mint would cost more in fees than we allow. Nothing was sent." };
    case "BUDGET_CAP":
      return { text: "Today's fee budget for the drop is used up. Nothing was sent. Try again tomorrow." };
    case "CHAIN_UNAVAILABLE":
      return { text: "Can't reach the network right now. Nothing was sent. Try again in a minute." };
    case "TX_FAILED":
      return { text: "The mint failed on-chain, so no NFT was made. Try again in a minute." };
    case "BAD_REQUEST":
      return { text: "Our server didn't accept this request. Reload the page and try again." };
    default:
      return { text: "Something went wrong on our side. This page checks your wallet again.", maybeSent: true };
  }
}

// ------------------------------------------------------------------ artwork

/*
 * The pass artwork (the Mumbai stamp) lives in ./pass-art.ts: a port of contracts/script/pass-art/generator.mjs with
 * no imports, so PassArt can use it without pulling in the relayer client. pass-art.test.ts pins it byte for byte to
 * the generator and to the fixtures WatermarkPassRenderer.t.sol checks the contract against.
 */

/** data:image/svg+xml;base64 of the pass artwork for a token id (a canonical decimal string, 1..100), or null. */
export function passSvgDataUri(tokenId: string): string | null {
  return passArtId(tokenId) === null ? null : passArtDataUri(tokenId);
}

// ------------------------------------------------------------------ checklist

/** What the checklist shows for each step. */
export type StepState = "done" | "todo" | "unknown";

export function passSteps(s: PassStatus | null): { verify: StepState; pay: StepState; claim: StepState } {
  if (!s) return { verify: "unknown", pay: "unknown", claim: "unknown" };
  return {
    verify: s.stamped ? "done" : "todo",
    pay: s.paid === null ? "unknown" : s.paid ? "done" : "todo",
    claim: s.claimed ? "done" : "todo",
  };
}

/**
 * Claim is offered when the wallet is stamped, hasn't claimed, passes are left, and the payment is seen or can't be
 * checked right now ("You can still try to claim": the relayer checks it again and refuses NO_PAYMENT).
 */
export function canClaim(s: PassStatus | null): boolean {
  return !!s && s.stamped && s.paid !== false && !s.claimed && s.remaining > 0;
}

/** The header's "Step n of 3": 1 until stamped, 2 until paid, then 3 (claim). null while nothing is known. */
export function flowStepOf(s: PassStatus | null): 1 | 2 | 3 | null {
  if (!s) return null;
  if (s.claimed) return 3;
  if (!s.stamped) return 1;
  return s.paid === false ? 2 : 3;
}
