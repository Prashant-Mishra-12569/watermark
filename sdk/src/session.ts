/**
 * Session helpers shared by the website, relayer, prover and SDK (interfaces F1).
 * The Android app and the contract implement the same rules. Keep them in sync.
 */
import { hexToBytes, sha256, type Address, type Hex } from "viem";

export const SESSION_TTL_SECONDS = 600;
export const STAMP_MONTHS = 3;

export function sessionDomain(chainId: number, registry: Address) {
  return { name: "Watermark", version: "1", chainId, verifyingContract: registry } as const;
}

export const SESSION_TYPES = {
  Session: [
    { name: "wallet", type: "address" },
    { name: "appId", type: "uint256" },
    { name: "nonce", type: "bytes32" },
    { name: "expiresAt", type: "uint64" },
    { name: "validUntilMonth", type: "uint32" },
    { name: "chainId", type: "uint256" },
    { name: "registry", type: "address" },
  ],
} as const;

/** UN (EMV tag 9F37) = first 4 bytes of SHA-256 over the 32 raw nonce bytes. Returns 8 hex chars, no 0x. */
export function deriveUn(nonce: Hex): string {
  const bytes = hexToBytes(nonce);
  if (bytes.length !== 32) throw new Error("nonce must be 32 bytes");
  return sha256(bytes).slice(2, 10);
}

/** Month index = (YYYY - 2000) * 12 + (MM - 1), in UTC. */
export function monthIndex(date: Date): number {
  return (date.getUTCFullYear() - 2000) * 12 + date.getUTCMonth();
}

/** validUntilMonth for a new session: the current month + STAMP_MONTHS. */
export function sessionValidUntilMonth(now: Date = new Date()): number {
  return monthIndex(now) + STAMP_MONTHS;
}
