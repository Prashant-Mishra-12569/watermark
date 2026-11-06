/** Small display helpers for /verify. Pure logic, no React. */
import { altmempoolDevnet, whitechainSepolia } from "@watermark/sdk";
import type { ChainIdString } from "./config.ts";

/**
 * The 4 characters the Tap app shows as "Wallet ending XXXX". Case-sensitive: pass session.wallet (EIP-55)
 * exactly as the relayer returned it, which is also the link's w parameter.
 */
export function walletLast4(wallet: string): string {
  return wallet.slice(-4);
}

/** Chains come from @watermark/sdk (never viem's whitechainTestnet, which is chain 2625). */
export function chainFor(chainId: ChainIdString) {
  return chainId === "1337" ? altmempoolDevnet : whitechainSepolia;
}

export function chainName(chainId: ChainIdString): string {
  return chainFor(chainId).name;
}

/** Explorer page for an address on the configured chain. */
export function explorerAddressUrl(chainId: ChainIdString, address: string): string {
  const base = chainFor(chainId).blockExplorers.default.url.replace(/\/+$/, "");
  return `${base}/address/${address}`;
}

/** Whole seconds until a unix-seconds deadline (a decimal string or number), never negative. */
export function secondsLeft(expiresAt: string | number, nowMs: number): number {
  const deadline = Number(expiresAt);
  if (!Number.isFinite(deadline)) return 0;
  return Math.max(0, Math.floor(deadline - nowMs / 1000));
}

/** Whole seconds until a deadline in ms on this device's clock, never negative. */
export function secondsUntil(deadlineMs: number, nowMs: number): number {
  return Number.isFinite(deadlineMs) ? Math.max(0, Math.floor((deadlineMs - nowMs) / 1000)) : 0;
}

/** 600 → "10:00", 9 → "0:09". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "31 January 2027" in UTC (a stamp lasts until the end of its validUntilMonth). Empty for 0. */
export function formatStampExpiry(expiresAt: number): string {
  if (!expiresAt || !Number.isFinite(expiresAt)) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(expiresAt * 1000),
  );
}

/** "watermark://verify?w=0xAb…&app=1…" → keeps the start and the end, for a one-line preview. */
export function truncateMiddle(s: string, head = 32, tail = 12): string {
  return s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`;
}

/** Explorer page for a transaction on the configured chain. */
export function explorerTxUrl(chainId: ChainIdString, txHash: string): string {
  const base = chainFor(chainId).blockExplorers.default.url.replace(/\/+$/, "");
  return `${base}/tx/${txHash}`;
}

/** "0xf95E…a9Ba" for showing who sent a transaction. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}
