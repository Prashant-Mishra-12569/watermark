/**
 * The landing page's Evidence rows: every claim, one click from a chain. Values come from SITE_SPEC.md's FACTS
 * OVERRIDE and deployments/*.json only; nothing here is typed from memory.
 *
 * Rules: a row is never hidden. A row without a value shows "not recorded yet" (or "not deployed yet") with a
 * NOT RECORDED / NOT DEPLOYED chip. A chip says VERIFIED only after a human has seen "verified" on Blockscout.
 *
 * Pure data: runs under `node --test` (evidence.test.ts checks the invariants).
 */

import devnet from "../../../deployments/devnet.json" with { type: "json" };
import {
  ADDR,
  DOCS,
  PASS_ADDRESS,
  PREVIOUS_LIVE_LABEL,
  addressUrl,
  altmempoolTxUrl,
  isTxHash,
  last4,
  txUrl,
  type Address,
  type Hex,
} from "./site.ts";

// ------------------------------------------------------------------ the lines humans change

/**
 * The gas-free USDT payment on the CURRENT live app (main flow): README.md "Gasless USDT payment" (block 12,381,397).
 * On the explorer: status success, sent by the relayer (…a9Ba) to the current Sponsor (0x21b6…939a), 1 USDT moved.
 * null means "not recorded yet"; the value is the tx hash (66 characters).
 */
export const LIVE_APP_PAYMENT_TX: Hex | null = "0xb848b7c8c589335d17ab1570f0cb1765325a1d065e58a2f9447e9d333e376879";

/**
 * Set a flag to true only after the contract has been seen verified on Blockscout.
 * Registry and Router: verified per README.md and docs/INTEGRATE.md. Sponsor (0x21b6…939a): verified per README.md
 * ("WatermarkSponsor deployed and verified"), and Blockscout's API reports it fully verified (WatermarkSponsor,
 * solc 0.8.30, verified 2026-11-06 14:50 UTC).
 */
export const BLOCKSCOUT_VERIFIED = {
  registry: true,
  router: true,
  sponsor: true,
  genesisPass: true, // Blockscout: "Pass - Verified" at deploy (forge --verify), re-checked 7 Nov 00:10 IST
} as const satisfies Record<string, boolean>;

// ------------------------------------------------------------------ recorded facts (SITE_SPEC.md FACTS OVERRIDE)

/** First real-card stamp, under the first live app. Sent by the relayer (tx.from checked on-chain). */
export const FIRST_STAMP_TX: Hex = "0xd7e0166584dbb3b404d2b81308b5b69c94fa52b4d2d0da6a66759a52bb86bc07";
/** First gas-free USDT payment, under the first live app. Sent by the relayer to the previous Sponsor. */
export const FIRST_PAYMENT_TX: Hex = "0x298d3d178794b988aee4286db9591e6b9a8c1d2ad5008b69fd231460c7477c69";
/** EIP-8141 frame tx sponsored by our paymaster, admitted and mined on the alt-mempool devnet. */
export const EF_ADMITTED_TX: Hex = devnet.altMempool.admittedTx as Hex;
export const EF_ADMITTED_BLOCK: number = devnet.altMempool.admittedTxBlock;

// ------------------------------------------------------------------ types

export type EvidenceStatus =
  | "live"
  | "testnet"
  | "devnet"
  | "admitted"
  | "verified"
  | "deployed"
  | "planned"
  | "foundry"
  | "not-recorded"
  | "not-deployed";

export interface EvidenceLink {
  label: string;
  href: string;
}

export interface Evidence {
  /** Stable key, e.g. "payment-live". */
  id: string;
  label: string;
  /** Small print under the label, e.g. "first live app (before the stricter filter)". */
  note?: string;
  chain: "whitechain" | "altmempool";
  /** A tx hash, an address, or short text. null: not recorded yet (the row still shows). */
  value: string | null;
  /** Where the value links to. null exactly when value is null, or for plain text with no link. */
  href: string | null;
  /** Shown after the value, e.g. "block 3699". */
  detail?: string;
  /** Rows that point at several things (the contracts row). Rendered instead of the value. */
  links?: EvidenceLink[];
  /** What an empty value says. Default "not recorded yet". */
  empty?: string;
  /** null: no chip (the design doc row). */
  status: EvidenceStatus | null;
}

export interface EvidenceInput {
  passAddress: Address | null;
  livePaymentTx: Hex | null;
  verified: { registry: boolean; router: boolean; sponsor: boolean; genesisPass: boolean };
}

// ------------------------------------------------------------------ the rows

function contractsRow(verified: EvidenceInput["verified"]): Evidence {
  const contracts = [
    { label: "Registry", address: ADDR.registry, ok: verified.registry },
    { label: "Router", address: ADDR.router, ok: verified.router },
    { label: "Sponsor", address: ADDR.sponsor, ok: verified.sponsor },
  ];
  const done = contracts.filter((c) => c.ok).map((c) => c.label);
  const pending = contracts.filter((c) => !c.ok).map((c) => c.label);
  const and = (xs: string[]) => xs.join(" and ");
  const note =
    pending.length === 0
      ? "All verified on Blockscout."
      : done.length === 0
        ? "Verification on Blockscout pending."
        : `${and(done)} verified on Blockscout; ${and(pending)} verification pending.`;
  return {
    id: "contracts",
    label: "Contracts on Whitechain Sepolia",
    note,
    chain: "whitechain",
    value: "Registry, Router, Sponsor",
    href: addressUrl(ADDR.registry),
    links: contracts.map((c) => ({ label: c.label, href: addressUrl(c.address) })),
    status: pending.length === 0 ? "verified" : "deployed",
  };
}

/** Build the rows from explicit inputs (tests use this); EVIDENCE below is the build's own. */
export function buildEvidence(input: EvidenceInput): Evidence[] {
  const live = input.livePaymentTx && isTxHash(input.livePaymentTx) ? input.livePaymentTx : null;
  // The 0-gas row points at the newest recorded payment: the live app's once recorded, the first one until then.
  const zeroGasTx = live ?? FIRST_PAYMENT_TX;

  return [
    contractsRow(input.verified),
    {
      id: "stamp",
      label: "Real-card stamp",
      note: PREVIOUS_LIVE_LABEL,
      chain: "whitechain",
      value: FIRST_STAMP_TX,
      href: txUrl(FIRST_STAMP_TX),
      status: "live",
    },
    {
      id: "payment-first",
      label: "Gas-free USDT payment",
      note: PREVIOUS_LIVE_LABEL,
      chain: "whitechain",
      value: FIRST_PAYMENT_TX,
      href: txUrl(FIRST_PAYMENT_TX),
      status: "live",
    },
    {
      id: "payment-live",
      label: "Gas-free USDT payment (main flow)",
      note: "current live app",
      chain: "whitechain",
      value: live,
      href: live ? txUrl(live) : null,
      status: live ? "live" : "not-recorded",
    },
    {
      id: "zero-gas",
      label: "The payer paid 0 gas",
      note: live ? "same tx as the main-flow payment" : "same tx as the first payment",
      chain: "whitechain",
      value: `sent by relayer ${last4(ADDR.relayer)}`,
      href: txUrl(zeroGasTx),
      status: "live",
    },
    {
      id: "pass",
      label: "Genesis Pass contract",
      chain: "whitechain",
      value: input.passAddress,
      href: input.passAddress ? addressUrl(input.passAddress) : null,
      empty: "not deployed yet",
      status: input.passAddress ? (input.verified.genesisPass ? "verified" : "deployed") : "not-deployed",
    },
    {
      id: "ef-tx",
      label: "EF: admitted sponsored frame tx",
      chain: "altmempool",
      value: EF_ADMITTED_TX,
      href: altmempoolTxUrl(EF_ADMITTED_TX),
      detail: `block ${EF_ADMITTED_BLOCK}`,
      status: "admitted",
    },
    {
      id: "ef-design",
      label: "EF: design and trade-offs",
      chain: "altmempool",
      value: "EF_ALTMEMPOOL.md",
      href: DOCS.efAltmempool,
      status: null,
    },
  ];
}

export const EVIDENCE: readonly Evidence[] = buildEvidence({
  passAddress: PASS_ADDRESS,
  livePaymentTx: LIVE_APP_PAYMENT_TX,
  verified: BLOCKSCOUT_VERIFIED,
});

/**
 * A real stamped wallet's gas-free payment, for /attack's contrast row ("A wallet with a real card's stamp gets
 * through: see the payment ↗"): the live app's once recorded, otherwise the first one with its label.
 */
export const PROOF_PAYMENT: { txHash: Hex; href: string; note: string | null } = LIVE_APP_PAYMENT_TX
  ? { txHash: LIVE_APP_PAYMENT_TX, href: txUrl(LIVE_APP_PAYMENT_TX), note: null }
  : { txHash: FIRST_PAYMENT_TX, href: txUrl(FIRST_PAYMENT_TX), note: PREVIOUS_LIVE_LABEL };

/** The hero's proof line: "A real card's stamp, on-chain: 0xd7e0…bc07 ↗". */
export const PROOF_STAMP: { txHash: Hex; href: string; note: string } = {
  txHash: FIRST_STAMP_TX,
  href: txUrl(FIRST_STAMP_TX),
  note: PREVIOUS_LIVE_LABEL,
};
