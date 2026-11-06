/**
 * The header's Connect wallet button and its modal: words, the network dot and keyboard focus. Pure logic, no React,
 * so it runs under node --test. connect-button.tsx and wallet-modal.tsx render it.
 */
import { whitechainSepolia } from "@watermark/sdk";
import { shortAddress } from "../../lib/view.ts";

/** The modal's words (SITE_FINAL.md "Words": plain and short). */
export const CONNECT_COPY = {
  button: "Connect wallet",
  connecting: "Connecting…",
  title: "Connect a wallet",
  sub: "Your stamp and your NFT go to this wallet. Connecting only shares your address.",
  yours: "Your browser wallets",
  looking: "Looking for browser wallets…",
  burner: "Use a wallet in this browser",
  burnerBody: "No install. Free, kept on this device.",
  /** The burner's name in the chooser's notes ("…uses a different wallet"). */
  burnerShort: "Use a wallet in this browser",
  burnerFailed: "This browser couldn't make a wallet. Use a browser wallet instead.",
  lastUsed: "Last used",
  close: "Close",
  copy: "Copy address",
  copied: "Copied",
  copyManual: "Press ⌘C / Ctrl+C to copy.",
  switchChain: "Switch to Whitechain",
  switching: "Check your wallet…",
  disconnect: "Disconnect",
} as const;

/** Where the wallet is: on Whitechain Sepolia, on another network, or not known yet. */
export type NetworkState = "whitechain" | "other" | "unknown";

/**
 * The browser wallet has no network of its own: it only signs for Whitechain Sepolia, so it counts as on it. Someone's
 * own wallet is on whatever chain it reports (null until it answers eth_chainId).
 */
export function networkState(
  kind: "burner" | "injected",
  chainId: number | null,
  target: number = whitechainSepolia.id,
): NetworkState {
  if (kind === "burner") return "whitechain";
  if (chainId === null) return "unknown";
  return chainId === target ? "whitechain" : "other";
}

export const NETWORK_LABEL: Record<NetworkState, string> = {
  whitechain: "Whitechain Sepolia",
  other: "Another network",
  unknown: "Checking network…",
};

/** The dot's fill: green ok, amber for "switch first", grey while unknown (functional states only). */
export const NETWORK_DOT: Record<NetworkState, string> = {
  whitechain: "bg-leaf",
  other: "bg-note",
  unknown: "bg-[#c4c4c4]",
};

/** "MetaMask", or "In this browser" for the browser wallet. */
export function walletTitle(wallet: { kind: "burner" | "injected"; name: string }): string {
  return wallet.kind === "burner" ? "In this browser" : wallet.name;
}

/** "0x1234…abcd" (EIP-55 as given: the same characters the phone shows). */
export function accountLabel(address: string): string {
  return shortAddress(address);
}

/** The button's screen-reader name when connected: what it shows, then where. */
export function accountName(args: { title: string; address: string; network: NetworkState }): string {
  return `Wallet ${accountLabel(args.address)}, ${args.title}, ${NETWORK_LABEL[args.network]}`;
}

/** The menu offers "Switch to Whitechain" only for someone's own wallet on another network. */
export function canSwitchChain(kind: "burner" | "injected", network: NetworkState): boolean {
  return kind === "injected" && network === "other";
}

/**
 * Tab inside the modal. `index` is the focused element among the modal's `count` focusable ones (-1: focus is
 * outside them). Returns the index to move to (the caller prevents the default), or null to let the browser move.
 */
export function wrapFocus(index: number, count: number, backwards: boolean): number | null {
  if (count <= 0) return null;
  if (index < 0 || index >= count) return backwards ? count - 1 : 0;
  if (!backwards && index === count - 1) return 0;
  if (backwards && index === 0) return count - 1;
  return null;
}

/** Arrow keys, Home and End inside the account menu. null: not a key the menu handles. */
export function menuFocus(index: number, count: number, key: string): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowDown":
      return index < 0 ? 0 : (index + 1) % count;
    case "ArrowUp":
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
