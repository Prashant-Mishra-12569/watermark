/**
 * The silent browser wallet: a local private key, one per appId (docs/PRIVACY.md: "One wallet per app").
 * Kept in localStorage so reloads, the return from the phone and later pages (/pay signs EIP-3009 with it)
 * reuse the same stamped wallet. It never holds WBT and needs no funding.
 *
 * Never log, render or export the key. Callers only get a viem account, which does not expose it.
 */
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Hex } from "viem";

export const BURNER_STORAGE_KEY = "watermark.burner.v1";

/** The subset of the Web Storage API we use. Injectable for tests and for browsers that block storage. */
export interface KeyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Burner {
  account: PrivateKeyAccount;
  /** false when storage is blocked (e.g. some private modes): the wallet lasts only until the page closes. */
  persistent: boolean;
  /** true when this call made a new key. */
  created: boolean;
}

interface StoredWallets {
  v: 1;
  /** appId (canonical decimal) → private key */
  wallets: Record<string, Hex>;
}

const KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/** Used when storage throws: the wallet survives React remounts but not a reload. */
const memoryWallets = new Map<string, Hex>();

/** window.localStorage, or null when touching it throws (blocked cookies, sandboxed frames). */
export function browserStorage(): KeyStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readAll(storage: KeyStorage | null): StoredWallets | null {
  if (!storage) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(BURNER_STORAGE_KEY);
  } catch {
    return null;
  }
  const empty: StoredWallets = { v: 1, wallets: {} };
  if (!raw) return empty;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return empty;
    const wallets = (parsed as { wallets?: unknown }).wallets;
    if (!wallets || typeof wallets !== "object") return empty;
    const clean: Record<string, Hex> = {};
    for (const [appId, key] of Object.entries(wallets as Record<string, unknown>)) {
      if (typeof key === "string" && KEY_PATTERN.test(key)) clean[appId] = key as Hex;
    }
    return { v: 1, wallets: clean };
  } catch {
    return empty; // corrupt JSON: start a fresh map rather than failing the page
  }
}

/** Writes and reads back, so a storage that silently drops writes counts as not persistent. */
function writeAll(storage: KeyStorage | null, data: StoredWallets): boolean {
  if (!storage) return false;
  try {
    const json = JSON.stringify(data);
    storage.setItem(BURNER_STORAGE_KEY, json);
    return storage.getItem(BURNER_STORAGE_KEY) === json;
  } catch {
    return false;
  }
}

/** Loads this app's wallet, or creates and saves one. Never throws because of storage. */
export function loadOrCreateBurner(
  appId: string,
  storage: KeyStorage | null,
  generate: () => Hex = generatePrivateKey,
): Burner {
  const stored = readAll(storage);
  const existing = stored?.wallets[appId];
  if (existing) return { account: privateKeyToAccount(existing), persistent: true, created: false };

  const remembered = memoryWallets.get(appId);
  if (remembered) return { account: privateKeyToAccount(remembered), persistent: false, created: false };

  const key = generate();
  if (!KEY_PATTERN.test(key)) throw new Error("generated key is not 32 bytes");
  const persistent = stored !== null && writeAll(storage, { v: 1, wallets: { ...stored.wallets, [appId]: key } });
  if (!persistent) memoryWallets.set(appId, key);
  return { account: privateKeyToAccount(key), persistent, created: true };
}

/** True when this browser already has a wallet for this app (read only: never creates one). */
export function hasBurner(appId: string, storage: KeyStorage | null): boolean {
  return !!readAll(storage)?.wallets[appId] || memoryWallets.has(appId);
}

/**
 * Forgets this app's wallet so the next load creates a new one ("same card, new wallet" demo beat).
 * The UI must confirm first: a stamped wallet can't be recovered afterwards.
 */
export function forgetBurner(appId: string, storage: KeyStorage | null): void {
  memoryWallets.delete(appId);
  const stored = readAll(storage);
  if (!stored || !(appId in stored.wallets)) return;
  const wallets = { ...stored.wallets };
  delete wallets[appId];
  writeAll(storage, { v: 1, wallets });
}

/** Test hook: clears the in-memory fallback. */
export function resetMemoryWalletsForTests(): void {
  memoryWallets.clear();
}
