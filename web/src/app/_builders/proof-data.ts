/**
 * The builders page's "See it *yourself*." receipts: five real public records, each one tap from an explorer. Every
 * value comes from lib/evidence.ts and lib/site.ts (deployments/*.json), never typed here. Pure data: runs under
 * `node --test` (builders.test.ts checks the honesty rules).
 *
 * Rules: a contract reads "Verified" only when BLOCKSCOUT_VERIFIED says a human saw it verified; the payment card
 * points at the live app's payment once lib/evidence.ts records it, and at the first one (with its label) until then.
 */

import {
  BLOCKSCOUT_VERIFIED,
  EF_ADMITTED_BLOCK,
  EF_ADMITTED_TX,
  PROOF_PAYMENT,
  PROOF_STAMP,
  type EvidenceStatus,
} from "../../lib/evidence.ts";
import { ADDR, PREVIOUS_LIVE_LABEL, addressUrl, altmempoolTxUrl, type Hex } from "../../lib/site.ts";

export interface ProofReceipt {
  /** Stable key. */
  id: "stamp" | "payment" | "ef" | "sponsor" | "registry";
  /** Where it lives, in plain words and short enough for a phone's card: "Whitechain testnet". */
  kicker: string;
  /** What happened, plain English. */
  title: string;
  /** The receipt's "total" line: a label and a short value ("Wallet paid" · "$0"). */
  total: { label: string; value: string };
  /** A tx hash or an address (shown short, in mono). */
  ref: Hex;
  /** Where "Check it" goes. Always https. */
  href: string;
  /** Small print in plain words, e.g. "Made under our first card list, which also allowed prepaid cards." */
  note: string | null;
  status: EvidenceStatus;
}

export interface ProofInput {
  payment: { txHash: Hex; href: string; note: string | null };
  stamp: { txHash: Hex; href: string; note: string };
  efTx: Hex;
  efBlock: number;
  verified: { registry: boolean; sponsor: boolean };
}

const WHITECHAIN = "Whitechain testnet";
const CONTRACT = "Contract on Whitechain";

/**
 * lib/site.ts's PREVIOUS_LIVE_LABEL ("first live app (before the stricter filter)") in words a company reads at a
 * glance (deployments/whitechain.json previousLive: its filter also accepted prepaid card ranges).
 */
export const FIRST_LIST_NOTE = "Made under our first card list, which also allowed prepaid cards.";
const plain = (note: string | null): string | null => (note === PREVIOUS_LIVE_LABEL ? FIRST_LIST_NOTE : note);

/** Build the cards from explicit inputs (tests use this); PROOF_RECEIPTS below is the build's own. */
export function buildProofReceipts(input: ProofInput): ProofReceipt[] {
  return [
    {
      id: "stamp",
      kicker: WHITECHAIN,
      title: "A real bank card stamped a wallet",
      // docs/PRIVACY.md: on-chain there is a proof, a one-way card ID, the wallet and an expiry month.
      total: { label: "Card number on-chain", value: "None" },
      ref: input.stamp.txHash,
      href: input.stamp.href,
      note: plain(input.stamp.note),
      status: "live",
    },
    {
      // The amount is not in our recorded facts, so the title names the token, not a number.
      id: "payment",
      kicker: `${WHITECHAIN} · USDT`,
      title: "A wallet paid in USDT with $0 in fees",
      total: { label: "Fees the wallet paid", value: "$0" },
      ref: input.payment.txHash,
      href: input.payment.href,
      note: plain(input.payment.note),
      status: "live",
    },
    {
      id: "ef",
      kicker: "Ethereum testnet",
      title: "An app paid the fee for a stamped wallet",
      // docs/EF_ALTMEMPOOL.md: the paymaster paid the gas; the wallet's balance and nonce stayed 0.
      total: { label: "Fee the wallet paid", value: "0 ETH" },
      ref: input.efTx,
      href: altmempoolTxUrl(input.efTx),
      note: `Admitted by the network and mined in block ${input.efBlock.toLocaleString("en-US")}.`,
      status: "admitted",
    },
    {
      id: "sponsor",
      kicker: CONTRACT,
      title: "A contract caps the free payments",
      total: { label: "Per wallet, per day", value: "20" },
      ref: ADDR.sponsor,
      href: addressUrl(ADDR.sponsor),
      note: input.verified.sponsor ? "Source code verified on Blockscout." : "Verification on Blockscout pending.",
      status: input.verified.sponsor ? "verified" : "deployed",
    },
    {
      id: "registry",
      kicker: CONTRACT,
      title: "The public list of stamps",
      total: { label: "Who can read it", value: "Anyone" },
      ref: ADDR.registry,
      href: addressUrl(ADDR.registry),
      note: input.verified.registry ? "Source code verified on Blockscout." : "Verification on Blockscout pending.",
      status: input.verified.registry ? "verified" : "deployed",
    },
  ];
}

export const PROOF_RECEIPTS: readonly ProofReceipt[] = buildProofReceipts({
  payment: PROOF_PAYMENT,
  stamp: PROOF_STAMP,
  efTx: EF_ADMITTED_TX,
  efBlock: EF_ADMITTED_BLOCK,
  verified: { registry: BLOCKSCOUT_VERIFIED.registry, sponsor: BLOCKSCOUT_VERIFIED.sponsor },
});
