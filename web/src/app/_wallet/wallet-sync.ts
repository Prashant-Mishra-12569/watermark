/**
 * Keeps every useWallet on a page in step. The header's Connect button and the page's WalletGate (/verify, /pay,
 * /pass) each run their own useWallet, and both read and write the same remembered choice (WALLET_CHOICE_KEY in
 * lib/wallet.ts). A choice made in one is told to the others on this bus: connecting in the header means the page
 * uses that wallet, and disconnecting sends the page back to its wallet choice. A reload or another page gets the
 * same result from the remembered choice.
 *
 * Pure: no React, no window, so it runs under node --test. Only a person's own action is published (connect, the
 * browser wallet, disconnect, a new browser wallet); each useWallet restores and follows its wallet's events itself.
 */
import type { Address } from "viem";
import type { ProviderDetail } from "../../lib/wallet.ts";

export type WalletSyncMessage =
  /** The browser wallet was chosen. `fresh`: a new one was just made ("same card, new wallet"), so reload it. */
  | { kind: "burner"; fresh: boolean }
  /** The person's own wallet connected (the same provider object every useWallet on the page discovered). */
  | { kind: "injected"; detail: ProviderDetail; address: Address }
  /** Disconnected: back to the wallet choice. */
  | { kind: "ask" };

export type WalletSyncListener = (msg: WalletSyncMessage) => void;

export interface WalletBus {
  /** A new id for one useWallet. */
  nextId(): number;
  /** Tells every other subscriber. The sender (`from`) never hears its own message. */
  publish(from: number, msg: WalletSyncMessage): void;
  /** Returns the unsubscribe function. */
  subscribe(id: number, listener: WalletSyncListener): () => void;
}

export function createWalletBus(): WalletBus {
  const listeners = new Map<number, WalletSyncListener>();
  let ids = 0;
  return {
    nextId: () => ++ids,
    publish(from, msg) {
      // A copy: a listener may unsubscribe (or subscribe) while we deliver.
      for (const [id, listener] of [...listeners]) {
        if (id === from) continue;
        try {
          listener(msg);
        } catch {
          // One broken listener must not stop the others.
        }
      }
    },
    subscribe(id, listener) {
      listeners.set(id, listener);
      return () => {
        if (listeners.get(id) === listener) listeners.delete(id);
      };
    },
  };
}

/** The page's bus. Module scope: the header and the page are in the same client bundle, so they share it. */
export const walletBus: WalletBus = createWalletBus();

/** What a useWallet shows now, reduced to what syncStep needs. */
export type SyncCurrent =
  | { kind: "loading" | "choose" | "connecting" | "burner-failed" }
  | { kind: "ready"; wallet: "burner"; address: string }
  | { kind: "ready"; wallet: "injected"; address: string; rdns: string };

/**
 * keep: already showing that (same wallet object, so a page flow keyed on it doesn't restart). load-burner: load this
 * page's browser wallet. activate: use the message's own wallet and account. choose: show the wallet choice.
 */
export type SyncStep = "keep" | "load-burner" | "activate" | "choose";

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What a useWallet showing `current` does when another one on the page publishes `msg`. */
export function syncStep(current: SyncCurrent, msg: WalletSyncMessage): SyncStep {
  switch (msg.kind) {
    case "burner":
      return current.kind === "ready" && current.wallet === "burner" && !msg.fresh ? "keep" : "load-burner";
    case "injected":
      return current.kind === "ready" &&
        current.wallet === "injected" &&
        current.rdns === msg.detail.info.rdns &&
        sameAddress(current.address, msg.address)
        ? "keep"
        : "activate";
    case "ask":
      // Already choosing: keep its note ("MetaMask is locked") rather than clearing it.
      return current.kind === "choose" ? "keep" : "choose";
  }
}
