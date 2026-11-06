/**
 * "Use my wallet": any EIP-1193 browser wallet (MetaMask, Rabby, Coinbase Wallet extension, Brave Wallet, ...).
 *
 * Pure logic, no React: discovery (EIP-6963 with a window.ethereum fallback), connecting, switching to Whitechain
 * Sepolia, signing the same EIP-3009 authorization the burner signs, and the remembered choice. Every provider call
 * goes through `request`, so the tests drive it with a mocked provider.
 *
 * The person never pays gas with their own wallet either: they sign a permission and the relayer sends it.
 * Never log accounts, typed data or signatures.
 */
import {
  getAddress,
  isAddress,
  recoverTypedDataAddress,
  serializeTypedData,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { whitechainSepolia } from "@watermark/sdk";
import type { KeyStorage } from "./burner.ts";
import type { PayRequestBody } from "./pay.ts";
import { transferAuthorizationTypedData, type PaymentIntent } from "./usdt.ts";

// ------------------------------------------------------------------ EIP-1193 and EIP-6963 shapes

export interface Eip1193RequestArgs {
  method: string;
  params?: readonly unknown[] | Record<string, unknown>;
}

type Listener = (payload: unknown) => void;

export interface Eip1193Provider {
  request(args: Eip1193RequestArgs): Promise<unknown>;
  on?(event: string, listener: Listener): unknown;
  removeListener?(event: string, listener: Listener): unknown;
}

/** EIP-6963 provider info. `rdns` identifies the wallet across reloads (e.g. "io.metamask"). */
export interface ProviderInfo {
  uuid: string;
  name: string;
  /** A data:image/... URI, or "" when the wallet gave none (window.ethereum fallback). */
  icon: string;
  rdns: string;
}

export interface ProviderDetail {
  info: ProviderInfo;
  provider: Eip1193Provider;
}

export const ANNOUNCE_EVENT = "eip6963:announceProvider";
export const REQUEST_EVENT = "eip6963:requestProvider";
/** The rdns we give a wallet found only as window.ethereum (it has no EIP-6963 announcement). */
export const LEGACY_RDNS = "window.ethereum";
/** How long the page waits for announcements before it decides "no wallet" or falls back to window.ethereum. */
export const DISCOVERY_WAIT_MS = 400;

const RDNS = /^[a-z0-9][a-z0-9.-]{0,99}$/i;

function isProvider(p: unknown): p is Eip1193Provider {
  return !!p && typeof p === "object" && typeof (p as { request?: unknown }).request === "function";
}

/** Checks an EIP-6963 announcement. The icon is kept only when it's an image data URI (shown in an <img>, CSP-safe). */
export function parseProviderDetail(detail: unknown): ProviderDetail | null {
  if (!detail || typeof detail !== "object") return null;
  const { info, provider } = detail as { info?: unknown; provider?: unknown };
  if (!isProvider(provider) || !info || typeof info !== "object") return null;
  const { uuid, name, icon, rdns } = info as Record<string, unknown>;
  if (typeof uuid !== "string" || !uuid || uuid.length > 100) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  if (typeof rdns !== "string" || !RDNS.test(rdns)) return null;
  const safeIcon = typeof icon === "string" && /^data:image\/(png|svg\+xml|webp|jpeg|gif);/i.test(icon) ? icon : "";
  return { info: { uuid, name: name.trim().slice(0, 40), icon: safeIcon, rdns }, provider };
}

/** window.ethereum as a provider entry, named from its flags (Rabby and Brave also set isMetaMask). */
export function legacyDetail(ethereum: unknown): ProviderDetail | null {
  if (!isProvider(ethereum)) return null;
  const f = ethereum as unknown as Record<string, unknown>;
  const name = f.isRabby
    ? "Rabby"
    : f.isBraveWallet
      ? "Brave Wallet"
      : f.isCoinbaseWallet
        ? "Coinbase Wallet"
        : f.isMetaMask
          ? "MetaMask"
          : "Browser wallet";
  return { info: { uuid: LEGACY_RDNS, name, icon: "", rdns: LEGACY_RDNS }, provider: ethereum };
}

/** Announced wallets (first per uuid); window.ethereum only when nothing announced itself, so nothing shows twice. */
export function mergeProviders(announced: readonly ProviderDetail[], legacy: ProviderDetail | null): ProviderDetail[] {
  const seen = new Set<string>();
  const out: ProviderDetail[] = [];
  for (const d of announced) {
    if (seen.has(d.info.uuid)) continue;
    seen.add(d.info.uuid);
    out.push(d);
  }
  if (out.length === 0 && legacy) out.push(legacy);
  return out;
}

export interface ProviderWatch {
  /** Asks wallets to announce again and re-checks window.ethereum (call after DISCOVERY_WAIT_MS). */
  rescan(): void;
  stop(): void;
}

/** EIP-6963 discovery on `target` (the window). Calls `onChange` with the current list every time it changes. */
export function watchProviders(
  target: EventTarget,
  onChange: (providers: ProviderDetail[]) => void,
  getLegacy: () => unknown,
): ProviderWatch {
  const announced: ProviderDetail[] = [];
  let stopped = false;
  const emit = () => {
    if (!stopped) onChange(mergeProviders(announced, legacyDetail(getLegacy())));
  };
  const onAnnounce = (event: Event) => {
    const d = parseProviderDetail((event as CustomEvent<unknown>).detail);
    if (!d || announced.some((a) => a.info.uuid === d.info.uuid)) return;
    announced.push(d);
    emit();
  };
  target.addEventListener(ANNOUNCE_EVENT, onAnnounce);
  const rescan = () => {
    if (stopped) return;
    target.dispatchEvent(new Event(REQUEST_EVENT));
    emit();
  };
  rescan();
  return {
    rescan,
    stop() {
      stopped = true;
      target.removeEventListener(ANNOUNCE_EVENT, onAnnounce);
    },
  };
}

export function pickProvider(providers: readonly ProviderDetail[], rdns: string): ProviderDetail | null {
  return providers.find((p) => p.info.rdns === rdns) ?? null;
}

/** The remembered wallet first (the one the person verified with), the rest in discovery order. */
export function sortProviders(providers: readonly ProviderDetail[], rememberedRdns: string | null): ProviderDetail[] {
  if (!rememberedRdns) return [...providers];
  return [
    ...providers.filter((p) => p.info.rdns === rememberedRdns),
    ...providers.filter((p) => p.info.rdns !== rememberedRdns),
  ];
}

// ------------------------------------------------------------------ errors

export type WalletErrorCode =
  | "USER_REJECTED" // 4001: the person said no in the wallet
  | "REQUEST_PENDING" // -32002: a wallet popup is already open
  | "UNAUTHORIZED" // 4100: the account isn't connected to this site
  | "UNSUPPORTED_METHOD" // 4200: the wallet can't do this (e.g. no eth_signTypedData_v4)
  | "DISCONNECTED" // 4900 / 4901
  | "NO_ACCOUNT" // the wallet returned no account (locked?)
  | "ACCOUNT_CHANGED" // the active account is no longer the one this page shows
  | "WRONG_CHAIN" // the wallet isn't on Whitechain Sepolia after the switch
  | "SIGNATURE_MISMATCH" // the signature doesn't recover to the account (e.g. a smart-contract wallet)
  | "FAILED";

export class WalletError extends Error {
  readonly code: WalletErrorCode;
  constructor(code: WalletErrorCode, message?: string) {
    super(message ?? code);
    this.name = "WalletError";
    this.code = code;
  }
}

/** Every numeric `code` in an error and its wrapped causes (MetaMask mobile nests 4902 in data.originalError). */
export function rpcErrorCodes(e: unknown): number[] {
  const codes: number[] = [];
  let cur: unknown = e;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const o = cur as { code?: unknown; data?: unknown; cause?: unknown };
    if (typeof o.code === "number") codes.push(o.code);
    const data = o.data as { originalError?: unknown } | undefined;
    cur = data && typeof data === "object" && data.originalError ? data.originalError : o.cause;
  }
  return codes;
}

/** "This chain isn't in the wallet yet": 4902, or the message some wallets send instead. */
export function isUnknownChainError(e: unknown): boolean {
  if (rpcErrorCodes(e).includes(4902)) return true;
  const msg = e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : "";
  return /unrecognized chain|chain .*not (been )?added|unknown chain/i.test(msg);
}

export function toWalletError(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  const codes = rpcErrorCodes(e);
  const has = (c: number) => codes.includes(c);
  if (has(4001)) return new WalletError("USER_REJECTED");
  if (has(-32002)) return new WalletError("REQUEST_PENDING");
  if (has(4100)) return new WalletError("UNAUTHORIZED");
  if (has(4200)) return new WalletError("UNSUPPORTED_METHOD");
  if (has(4900) || has(4901)) return new WalletError("DISCONNECTED");
  return new WalletError("FAILED");
}

// ------------------------------------------------------------------ accounts

/** The wallet's account list, EIP-55, invalid entries dropped. */
export function parseAccounts(result: unknown): Address[] {
  if (!Array.isArray(result)) return [];
  return result.filter((a): a is string => typeof a === "string" && isAddress(a, { strict: false })).map((a) => getAddress(a));
}

/** Opens the wallet's connect prompt and returns the selected account (EIP-55: the same last 4 the phone shows). */
export async function requestAccount(provider: Eip1193Provider): Promise<Address> {
  let result: unknown;
  try {
    result = await provider.request({ method: "eth_requestAccounts" });
  } catch (e) {
    throw toWalletError(e);
  }
  const first = parseAccounts(result)[0];
  if (!first) throw new WalletError("NO_ACCOUNT");
  return first;
}

/** The connected account without a prompt (eth_accounts), or null when there is none or the call fails. */
export async function silentAccount(provider: Eip1193Provider): Promise<Address | null> {
  try {
    return parseAccounts(await provider.request({ method: "eth_accounts" }))[0] ?? null;
  } catch {
    return null;
  }
}

export type AccountChange = { kind: "same" } | { kind: "switched"; address: Address } | { kind: "gone" };

/** What an accountsChanged event means for the page showing `current`. */
export function nextAccount(current: Address, accounts: unknown): AccountChange {
  const first = parseAccounts(accounts)[0];
  if (!first) return { kind: "gone" };
  return first === getAddress(current) ? { kind: "same" } : { kind: "switched", address: first };
}

// ------------------------------------------------------------------ chain

type ChainLike = typeof whitechainSepolia;

/** "0x752" → 1874. Accepts a hex string, a decimal string or a number; anything else is null. */
export function parseChainIdValue(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  const n = /^0x[0-9a-f]{1,12}$/i.test(s) ? Number.parseInt(s, 16) : /^\d{1,12}$/.test(s) ? Number(s) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * wallet_addEthereumChain parameters from @watermark/sdk (never viem's whitechainTestnet, which is chain 2625).
 * The official RPC goes first: the wallet uses the first one.
 */
export function addChainParams(chain: ChainLike = whitechainSepolia) {
  const http = chain.rpcUrls.default.http;
  const official = http.filter((u) => /(^|\.)testnet\.whitechain\.io/.test(new URL(u).hostname));
  return {
    chainId: toHex(chain.id),
    chainName: chain.name,
    nativeCurrency: { ...chain.nativeCurrency },
    rpcUrls: [...official, ...http.filter((u) => !official.includes(u))],
    blockExplorerUrls: [chain.blockExplorers.default.url],
  };
}

async function walletChainId(provider: Eip1193Provider): Promise<number | null> {
  try {
    return parseChainIdValue(await provider.request({ method: "eth_chainId" }));
  } catch (e) {
    throw toWalletError(e);
  }
}

/**
 * Makes the wallet's active chain `chain` (wallets refuse typed data whose domain chainId isn't the active one).
 * Switch first; on 4902 add the chain (the wallet then offers to switch) and switch again if it didn't.
 */
export async function ensureChain(provider: Eip1193Provider, chain: ChainLike = whitechainSepolia): Promise<void> {
  if ((await walletChainId(provider)) === chain.id) return;
  const chainId = toHex(chain.id);
  const switchChain = () => provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  try {
    await switchChain();
  } catch (e) {
    if (!isUnknownChainError(e)) throw toWalletError(e);
    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [addChainParams(chain)] });
    } catch (addError) {
      throw toWalletError(addError);
    }
    if ((await walletChainId(provider)) !== chain.id) {
      try {
        await switchChain();
      } catch (e2) {
        throw toWalletError(e2);
      }
    }
  }
  if ((await walletChainId(provider)) !== chain.id) throw new WalletError("WRONG_CHAIN");
}

// ------------------------------------------------------------------ signing

const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_N = SECP256K1_N >> 1n;

/**
 * A 65-byte signature in the form the relayer and USDT accept (v 27/28, low s), or null.
 * Some wallets (hardware via MetaMask) return v 0/1; a high s is flipped to the equivalent low one.
 */
export function normalizeSignature(raw: unknown): Hex | null {
  if (typeof raw !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(raw)) return null;
  const r = raw.slice(2, 66).toLowerCase();
  let s = BigInt(`0x${raw.slice(66, 130)}`);
  let v = Number.parseInt(raw.slice(130, 132), 16);
  if (v === 0 || v === 1) v += 27;
  if (v !== 27 && v !== 28) return null;
  if (s === 0n || s >= SECP256K1_N) return null;
  if (s > SECP256K1_HALF_N) {
    s = SECP256K1_N - s;
    v = v === 27 ? 28 : 27;
  }
  return `0x${r}${s.toString(16).padStart(64, "0")}${v.toString(16)}` as Hex;
}

/** EIP712Domain for USDT_DOMAIN's four fields (eth_signTypedData_v4 wants it listed in `types`). */
const EIP712_DOMAIN_TYPES = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

/** The eth_signTypedData_v4 payload: the burner's typed data plus EIP712Domain, uint256 values as decimal strings. */
export function typedDataJson(intent: PaymentIntent): string {
  const td = transferAuthorizationTypedData(intent);
  return serializeTypedData({
    ...td,
    // Kept a JSON number at runtime (what wallets expect); viem's types want a bigint once EIP712Domain is listed.
    domain: { ...td.domain, chainId: td.domain.chainId as unknown as bigint },
    types: { EIP712Domain: EIP712_DOMAIN_TYPES, ...td.types },
  });
}

/**
 * Throws unless `from` is still the wallet's active account: NO_ACCOUNT when the wallet shares none (locked, or the
 * site's permission was removed), ACCOUNT_CHANGED when it now shows another one.
 */
async function assertActiveAccount(provider: Eip1193Provider, from: Address): Promise<void> {
  const current = await silentAccount(provider);
  if (!current) throw new WalletError("NO_ACCOUNT");
  if (current !== from) throw new WalletError("ACCOUNT_CHANGED");
}

export interface SignOptions {
  chain?: ChainLike;
  /**
   * false once the page has moved on (e.g. it remounted for another account while a wallet popup was open).
   * Checked right before the signature popup, so a stale flow never opens one.
   */
  isCurrent?: () => boolean;
}

/**
 * Signs the EIP-3009 authorization with an external wallet and returns the POST /pay body.
 * Never signs for a stale account: `account` must still be the wallet's active account, both before and after the
 * network switch (the person can change accounts while the switch/add-network popup is open). The signature must
 * recover to `account`, otherwise the relayer would refuse it (it accepts plain EOA signatures only).
 */
export async function signTransferWithProvider(
  provider: Eip1193Provider,
  account: Address,
  intent: PaymentIntent,
  { chain = whitechainSepolia, isCurrent = () => true }: SignOptions = {},
): Promise<PayRequestBody> {
  const from = getAddress(account);
  if (getAddress(intent.from) !== from) throw new WalletError("ACCOUNT_CHANGED");
  await assertActiveAccount(provider, from);
  await ensureChain(provider, chain);
  // The switch/add popups can stay open for a while: check again right before the signature popup.
  if (!isCurrent()) throw new WalletError("ACCOUNT_CHANGED");
  await assertActiveAccount(provider, from);
  if (!isCurrent()) throw new WalletError("ACCOUNT_CHANGED");

  let raw: unknown;
  try {
    raw = await provider.request({ method: "eth_signTypedData_v4", params: [from, typedDataJson(intent)] });
  } catch (e) {
    throw toWalletError(e);
  }
  const signature = normalizeSignature(raw);
  if (!signature) throw new WalletError("SIGNATURE_MISMATCH");
  let signer: Address;
  try {
    signer = await recoverTypedDataAddress({ ...transferAuthorizationTypedData(intent), signature });
  } catch {
    throw new WalletError("SIGNATURE_MISMATCH");
  }
  if (signer !== from) throw new WalletError("SIGNATURE_MISMATCH");
  return { intent, signature };
}

// ------------------------------------------------------------------ events

export interface ProviderHandlers {
  onAccounts(accounts: unknown): void;
  onChain(chainId: number | null): void;
  onDisconnect(): void;
}

/**
 * MetaMask's "Disconnected from chain. Attempting to connect." (EIP-1193 code 1013): it reconnects by itself, e.g.
 * right after a switch to a network whose RPC is still loading. Not a real disconnect (wagmi ignores it too).
 */
export function isRecoverableDisconnect(e: unknown): boolean {
  return rpcErrorCodes(e).includes(1013);
}

/**
 * accountsChanged / chainChanged / disconnect. Returns the unsubscribe function (a no-op for wallets without `on`).
 * A recoverable disconnect (1013) is not passed on; 4900 / 4901 / 1011 and the rest are.
 */
export function subscribeProvider(provider: Eip1193Provider, handlers: ProviderHandlers): () => void {
  if (typeof provider.on !== "function") return () => {};
  const onAccounts: Listener = (a) => handlers.onAccounts(a);
  const onChain: Listener = (c) => handlers.onChain(parseChainIdValue(c));
  const onDisconnect: Listener = (e) => {
    if (!isRecoverableDisconnect(e)) handlers.onDisconnect();
  };
  provider.on("accountsChanged", onAccounts);
  provider.on("chainChanged", onChain);
  provider.on("disconnect", onDisconnect);
  return () => {
    provider.removeListener?.("accountsChanged", onAccounts);
    provider.removeListener?.("chainChanged", onChain);
    provider.removeListener?.("disconnect", onDisconnect);
  };
}

// ------------------------------------------------------------------ the remembered choice (per browser)

export const WALLET_CHOICE_KEY = "watermark.wallet.v1";

/**
 * burner: today's silent wallet. injected: an external wallet, by rdns (plus its display name, so the page can say
 * "MetaMask is locked" before the wallet has announced itself). ask: show the choice again.
 */
export type WalletChoice = { kind: "burner" } | { kind: "injected"; rdns: string; name?: string } | { kind: "ask" };

/** A wallet name safe to show from storage: printable, trimmed, at most 40 characters. */
function cleanName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = [...v]
    .filter((c) => c >= " " && c !== "\u007f")
    .join("")
    .trim()
    .slice(0, 40);
  return s || null;
}

/** The saved choice, or null when this browser never chose (or storage is blocked or corrupt). Never throws. */
export function loadWalletChoice(storage: KeyStorage | null): WalletChoice | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WALLET_CHOICE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { v?: unknown; kind?: unknown; rdns?: unknown; name?: unknown };
    if (p?.v !== 1) return null;
    if (p.kind === "burner" || p.kind === "ask") return { kind: p.kind };
    if (p.kind === "injected" && typeof p.rdns === "string" && RDNS.test(p.rdns)) {
      const name = cleanName(p.name);
      return name ? { kind: "injected", rdns: p.rdns, name } : { kind: "injected", rdns: p.rdns };
    }
    return null;
  } catch {
    return null;
  }
}

/** Saves the choice. A convenience only: blocked storage just means the page asks again next time. */
export function saveWalletChoice(storage: KeyStorage | null, choice: WalletChoice): void {
  if (!storage) return;
  try {
    storage.setItem(WALLET_CHOICE_KEY, JSON.stringify({ v: 1, ...choice }));
  } catch {
    // ignore
  }
}
