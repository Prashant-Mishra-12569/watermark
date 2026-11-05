/**
 * Session helpers shared by the website, relayer, prover and SDK (interfaces F1).
 * The Android app and the contract implement the same rules. Keep them in sync.
 */
import {
  hashTypedData,
  hexToBytes,
  recoverTypedDataAddress,
  sha256,
  type Address,
  type Hex,
} from "viem";
import type { Session } from "./types.ts";

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

/** EIP-712 typed data for a session (F1). Converts the F0 JSON strings to the values viem signs. */
export function sessionTypedData(session: Session) {
  return {
    domain: sessionDomain(Number(session.chainId), session.registry),
    types: SESSION_TYPES,
    primaryType: "Session",
    message: {
      wallet: session.wallet,
      appId: BigInt(session.appId),
      nonce: session.nonce,
      expiresAt: BigInt(session.expiresAt),
      validUntilMonth: session.validUntilMonth,
      chainId: BigInt(session.chainId),
      registry: session.registry,
    },
  } as const;
}

/** The 32-byte EIP-712 hash of a session. Also the AAD of the F2 envelope. */
export function hashSession(session: Session): Hex {
  return hashTypedData(sessionTypedData(session));
}

/** Recovers the address that signed a session. Compare it with the app's sessionSigner. */
export function recoverSessionSigner(session: Session, sig: Hex): Promise<Address> {
  return recoverTypedDataAddress({ ...sessionTypedData(session), signature: sig });
}

/** F1 deep link with the full signed session, put in the QR. */
export function buildDeepLink(session: Session, sig: Hex, proverUrl: string): string {
  const q = new URLSearchParams({
    w: session.wallet,
    app: session.appId,
    n: session.nonce,
    e: session.expiresAt,
    v: String(session.validUntilMonth),
    c: session.chainId,
    r: session.registry,
    sig,
    p: proverUrl,
  });
  return `watermark://verify?${q.toString()}`;
}

/** F1 fallback when the full QR is too dense: the app fetches GET /session/:id from the relayer. */
export function buildFallbackLink(sessionId: string, relayerUrl: string): string {
  const q = new URLSearchParams({ id: sessionId, p: relayerUrl });
  return `watermark://verify?${q.toString()}`;
}
