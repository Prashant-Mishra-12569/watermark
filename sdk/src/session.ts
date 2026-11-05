/**
 * Session helpers shared by the website, relayer, prover and SDK (interfaces F1).
 * The Android app and the contract implement the same rules. Keep them in sync.
 */
import { hashTypedData, hexToBytes, recoverTypedDataAddress, sha256, type Address, type Hex } from "viem";
import type { Session, SignedSession } from "./types.ts";

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

/** EIP-712 typed data for a session, in the shape viem's signTypedData / hashTypedData expect. */
export function sessionTypedData(s: Session) {
  return {
    domain: sessionDomain(Number(s.chainId), s.registry),
    types: SESSION_TYPES,
    primaryType: "Session",
    message: {
      wallet: s.wallet,
      appId: BigInt(s.appId),
      nonce: s.nonce,
      expiresAt: BigInt(s.expiresAt),
      validUntilMonth: s.validUntilMonth,
      chainId: BigInt(s.chainId),
      registry: s.registry,
    },
  } as const;
}

/** The EIP-712 digest the session signer signs. Also the AES-GCM AAD for the F2 envelope. */
export function hashSession(s: Session): Hex {
  return hashTypedData(sessionTypedData(s));
}

export async function recoverSessionSigner(signed: SignedSession): Promise<Address> {
  return recoverTypedDataAddress({ ...sessionTypedData(signed.session), signature: signed.sig });
}

/** watermark://verify link for the QR (interfaces F1). */
export function buildVerifyLink(signed: SignedSession, proverUrl: string): string {
  const s = signed.session;
  const q = new URLSearchParams({
    w: s.wallet,
    app: s.appId,
    n: s.nonce,
    e: s.expiresAt,
    v: String(s.validUntilMonth),
    c: s.chainId,
    r: s.registry,
    sig: signed.sig,
    p: proverUrl,
  });
  return `watermark://verify?${q.toString()}`;
}

/** F1 fallback when the full QR is too dense to scan: the app fetches GET /session/:id from the relayer. */
export function buildFallbackLink(sessionId: string, relayerUrl: string): string {
  const q = new URLSearchParams({ id: sessionId, p: relayerUrl });
  return `watermark://verify?${q.toString()}`;
}
