/**
 * Shared types. They mirror docs/interfaces.md exactly. Change both together, by agreement.
 * JSON encoding rules (F0): uint256/uint64 are decimal strings, bytes are 0x-hex.
 */
import type { Address, Hex } from "viem";

/** F1 · Signed off-chain by the app's sessionSigner (EIP-712, domain "Watermark" v1). */
export interface Session {
  wallet: Address;
  appId: string; // uint256, decimal string (248-bit)
  nonce: Hex; // bytes32
  expiresAt: string; // uint64 unix seconds, decimal string
  validUntilMonth: number; // uint32 month index, see monthIndex()
  chainId: string; // uint256, decimal string
  registry: Address;
}

export interface SignedSession {
  session: Session;
  sig: Hex;
}

export type SigPath = "GPO_FDDA" | "GENAC_CDA" | "INTERNAL_AUTH";

/** F2 · Plain card payload. Only ever exists in memory and inside the encrypted envelope. */
export interface CardData {
  aid: string;
  un: string; // 8 hex chars
  caIndex: string;
  issuerCert: string;
  issuerRem: string;
  issuerExp: string;
  iccCert: string;
  iccRem: string;
  iccExp: string;
  staticData: string;
  sdad: string;
  sigPath: SigPath;
  termData: string;
}

/** F2 · Encrypted envelope: RSA-OAEP-256 wrapped AES-256-GCM key, AAD = session EIP-712 hash. */
export interface Envelope {
  v: 1;
  session: Session;
  sig: Hex;
  ek: Hex;
  iv: Hex; // 12 bytes
  ct: Hex; // ciphertext || 16-byte GCM tag
}

/** F3 · Prover API. */
export type ProveRejection =
  | "BAD_ENVELOPE"
  | "BAD_SESSION_SIG"
  | "SESSION_EXPIRED"
  | "SESSION_USED"
  | "UN_MISMATCH"
  | "BUSY";

export type ProveError =
  | "NOT_IN_POLICY"
  | "EXPIRES_TOO_SOON"
  | "BAD_CARD"
  /** The chain refused the stamp: this card is already linked to another wallet in this app (one card, one wallet). */
  | "CARD_ALREADY_LINKED"
  | "DECRYPT_FAILED"
  | "STAMP_REJECTED";

export interface ProveJob {
  status: "queued" | "running" | "done" | "error";
  txHash?: Hex;
  error?: ProveError;
}

/** F4 · Public inputs, in this fixed order. Each is one bytes32 big-endian field element. */
export const PUBLIC_INPUT_ORDER = [
  "caRoot",
  "rulesRoot",
  "appId",
  "un",
  "nullifier",
  "validUntilMonth",
] as const;

export type PublicInputs = readonly [Hex, Hex, Hex, Hex, Hex, Hex];

export interface StampRequest {
  session: Session;
  sig: Hex;
  proof: Hex;
  publicInputs: PublicInputs;
}

/** F6 · Relayer. */
export type RefusalReason =
  | "NOT_STAMPED"
  | "QUOTA_USED"
  | "BUDGET_CAP"
  | "GAS_CAP"
  | "RATE_LIMIT"
  | "BAD_SIGNATURE"
  | "PAUSED";

export interface StampStatus {
  stamped: boolean;
  expiresAt: number; // unix seconds, 0 = none
  quotaLeft: number;
}

export interface AppStats {
  budgetLeftWei: string;
  refusedByReason: Partial<Record<RefusalReason, number>>;
}

/** F7 · Plan A: EIP-3009 transferWithAuthorization. */
export interface PaymentIntent {
  from: Address;
  to: Address;
  value: string; // USDT base units (6 decimals), decimal string
  validAfter: string;
  validBefore: string;
  nonce: Hex; // bytes32
}

/** F8 · Policy file. */
export type Network = "RUPAY" | "VISA" | "MASTERCARD";
export const NETWORK_ID: Record<Network, number> = { RUPAY: 1, VISA: 2, MASTERCARD: 3 };

export interface PolicyLeaf {
  network: Network;
  networkId: number;
  prefixLength: 6 | 8;
  prefix: string;
  bank: string;
  type: "debit" | "credit" | "prepaid";
  status: "tested" | "listed";
}

export interface Policy {
  label: string;
  environment: "live" | "test";
  appId: string;
  leaves: PolicyLeaf[];
  rulesRoot: Hex;
  quotaPerDay: number;
  stampMonths: number;
}
