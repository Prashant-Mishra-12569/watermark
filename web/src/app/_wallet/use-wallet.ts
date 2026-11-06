"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Address } from "viem";
import { browserStorage, forgetBurner, hasBurner, loadOrCreateBurner, type Burner } from "@/lib/burner.ts";
import type { ChooserNote } from "@/lib/messages.ts";
import { signPayment, type PayRequestBody } from "@/lib/pay.ts";
import type { PaymentIntent } from "@/lib/usdt.ts";
import {
  DISCOVERY_WAIT_MS,
  loadWalletChoice,
  nextAccount,
  parseChainIdValue,
  pickProvider,
  requestAccount,
  saveWalletChoice,
  signTransferWithProvider,
  silentAccount,
  sortProviders,
  subscribeProvider,
  toWalletError,
  watchProviders,
  type ProviderDetail,
} from "@/lib/wallet.ts";

/** The wallet a page works with: today's burner, or the person's own browser wallet. */
export interface ActiveWallet {
  kind: "burner" | "injected";
  address: Address;
  /** false only for a burner in a browser that doesn't save data. */
  persistent: boolean;
  /** "MetaMask", "Rabby", ... or "this browser's wallet". */
  name: string;
  /** EIP-6963 icon (data URI) or "". */
  icon: string;
  /**
   * EIP-3009 authorization for POST /pay. Burner: local, no popup. Injected: the wallet asks the person.
   * `isCurrent` returns false once the calling flow is gone; an injected wallet then never opens the signature popup.
   */
  signPayment(intent: PaymentIntent, opts?: { isCurrent?: () => boolean }): Promise<PayRequestBody>;
}

/** The wallet this browser chose before (shown first, and named in the chooser's note). */
export interface RememberedWallet {
  rdns: string;
  name: string | null;
}

export type WalletView =
  | { kind: "loading" }
  | { kind: "choose"; note: ChooserNote | null; remembered: RememberedWallet | null }
  | { kind: "connecting"; name: string }
  | { kind: "ready"; wallet: ActiveWallet }
  | { kind: "burner-failed" };

interface InjectedWallet extends ActiveWallet {
  kind: "injected";
  detail: ProviderDetail;
}

function burnerWallet(b: Burner): ActiveWallet {
  return {
    kind: "burner",
    address: b.account.address,
    persistent: b.persistent,
    name: "this browser's wallet",
    icon: "",
    signPayment: (intent) => signPayment(b.account, intent),
  };
}

function injectedWallet(detail: ProviderDetail, address: Address): InjectedWallet {
  return {
    kind: "injected",
    address,
    persistent: true,
    name: detail.info.name,
    icon: detail.info.icon,
    detail,
    signPayment: (intent, opts) => signTransferWithProvider(detail.provider, address, intent, { isCurrent: opts?.isCurrent }),
  };
}

function rememberedOf(detail: ProviderDetail): RememberedWallet {
  return { rdns: detail.info.rdns, name: detail.info.name };
}

/**
 * Wallet choice for /verify and /pay. Restores the remembered choice (a browser that already has a burner for this
 * app and never chose keeps using it), discovers browser wallets (EIP-6963, window.ethereum fallback), and follows
 * accountsChanged / chainChanged / disconnect. A changed account gives a new ActiveWallet object, so pages that key
 * their flow on the address start over for that account.
 */
export function useWallet(appId: string) {
  const [providers, setProviders] = useState<ProviderDetail[]>([]);
  const [discoveryDone, setDiscoveryDone] = useState(false);
  const [view, setView] = useState<WalletView>({ kind: "loading" });
  const [chainId, setChainId] = useState<number | null>(null);
  const restored = useRef(false);
  /** Bumped by every connect, cancel and disconnect: a late wallet answer for an older attempt is ignored. */
  const attempt = useRef(0);

  // Discovery runs for the page's lifetime: an extension can announce itself late.
  useEffect(() => {
    const watch = watchProviders(window, setProviders, () => (window as { ethereum?: unknown }).ethereum);
    const t = setTimeout(() => {
      watch.rescan();
      setDiscoveryDone(true);
    }, DISCOVERY_WAIT_MS);
    return () => {
      clearTimeout(t);
      watch.stop();
    };
  }, []);

  const loadBurner = useCallback(() => {
    try {
      setView({ kind: "ready", wallet: burnerWallet(loadOrCreateBurner(appId, browserStorage())) });
    } catch {
      setView({ kind: "burner-failed" });
    }
  }, [appId]);

  const activate = useCallback((detail: ProviderDetail, address: Address) => {
    setView({ kind: "ready", wallet: injectedWallet(detail, address) });
    saveWalletChoice(browserStorage(), { kind: "injected", rdns: detail.info.rdns, name: detail.info.name });
  }, []);


  // Restore the remembered choice once. An external wallet is reconnected silently (eth_accounts, no popup).
  useEffect(() => {
    if (restored.current) return;
    const storage = browserStorage();
    const choice = loadWalletChoice(storage) ?? (hasBurner(appId, storage) ? { kind: "burner" as const } : null);
    if (!choice || choice.kind === "ask") {
      restored.current = true;
      setView({ kind: "choose", note: null, remembered: null });
      return;
    }
    if (choice.kind === "burner") {
      restored.current = true;
      loadBurner();
      return;
    }
    const detail = pickProvider(providers, choice.rdns);
    if (!detail && !discoveryDone) return; // wait for the wallet to announce itself
    restored.current = true;
    if (!detail) {
      // The remembered wallet isn't in this browser (extension off, other browser): say so, don't just show the choice.
      setView({ kind: "choose", note: "NOT_FOUND", remembered: { rdns: choice.rdns, name: choice.name ?? null } });
      return;
    }
    const mine = ++attempt.current;
    setView({ kind: "connecting", name: detail.info.name });
    void silentAccount(detail.provider).then((address) => {
      if (mine !== attempt.current) return;
      if (address) activate(detail, address);
      // Locked or no longer connected: say which wallet, and that one click reconnects it.
      else setView({ kind: "choose", note: "LOCKED", remembered: rememberedOf(detail) });
    });
  }, [appId, providers, discoveryDone, loadBurner, activate]);

  /** "Use my wallet": opens the wallet's connect prompt. Only eth_requestAccounts, no signature. */
  const connect = useCallback(
    async (detail: ProviderDetail) => {
      const mine = ++attempt.current;
      setView({ kind: "connecting", name: detail.info.name });
      try {
        const address = await requestAccount(detail.provider);
        if (mine === attempt.current) activate(detail, address);
      } catch (e) {
        if (mine === attempt.current) setView({ kind: "choose", note: toWalletError(e).code, remembered: rememberedOf(detail) });
      }
    },
    [activate],
  );

  /** "Continue without a wallet": today's burner. */
  const chooseBurner = useCallback(() => {
    attempt.current++;
    saveWalletChoice(browserStorage(), { kind: "burner" });
    loadBurner();
  }, [loadBurner]);

  /** "Switch wallet": back to the choice. MetaMask also forgets this site's permission (best effort). */
  const switchWallet = useCallback(() => {
    attempt.current++;
    if (view.kind === "ready" && view.wallet.kind === "injected") {
      const { provider } = (view.wallet as InjectedWallet).detail;
      provider.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }).catch(() => {});
    }
    saveWalletChoice(browserStorage(), { kind: "ask" });
    setView({ kind: "choose", note: null, remembered: null });
  }, [view]);

  /** Demo tools: a new burner for this app (the old one can't be recovered). */
  const newBurner = useCallback(() => {
    forgetBurner(appId, browserStorage());
    loadBurner();
  }, [appId, loadBurner]);

  const cancelConnect = useCallback(() => {
    attempt.current++;
    setView({ kind: "choose", note: null, remembered: null });
  }, []);

  // Follow the external wallet: another account restarts the page for it, a locked wallet goes back to the choice.
  const injected = view.kind === "ready" && view.wallet.kind === "injected" ? (view.wallet as InjectedWallet) : null;

  /**
   * Re-reads the external wallet's account (eth_accounts, no popup) after a payment found it changed or missing, for
   * wallets that don't emit accountsChanged. Another account: the page restarts for it. None: back to the choice with
   * "locked". Same account: nothing changes. A no-op for the burner.
   */
  const resync = useCallback(async () => {
    if (!injected) return;
    const mine = ++attempt.current;
    const address = await silentAccount(injected.detail.provider);
    if (mine !== attempt.current) return;
    if (!address) setView({ kind: "choose", note: "LOCKED", remembered: rememberedOf(injected.detail) });
    else if (address !== injected.address) activate(injected.detail, address);
  }, [injected, activate]);
  useEffect(() => {
    if (!injected) {
      setChainId(null);
      return;
    }
    let stopped = false;
    const { provider } = injected.detail;
    provider
      .request({ method: "eth_chainId" })
      .then((c) => !stopped && setChainId(parseChainIdValue(c)))
      .catch(() => {});
    const unsubscribe = subscribeProvider(provider, {
      onAccounts: (accounts) => {
        if (stopped) return;
        const next = nextAccount(injected.address, accounts);
        if (next.kind === "switched") activate(injected.detail, next.address);
        else if (next.kind === "gone") {
          // MetaMask locking itself, or the site's permission removed.
          attempt.current++;
          setView({ kind: "choose", note: "LOCKED", remembered: rememberedOf(injected.detail) });
        }
      },
      onChain: (c) => !stopped && setChainId(c),
      // Only real disconnects arrive here: subscribeProvider drops MetaMask's recoverable 1013.
      onDisconnect: () => {
        if (stopped) return;
        attempt.current++;
        setView({ kind: "choose", note: "DISCONNECTED", remembered: rememberedOf(injected.detail) });
      },
    });
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [injected, activate]);

  const rememberedRdns = view.kind === "choose" ? (view.remembered?.rdns ?? null) : null;
  const sortedProviders = useMemo(() => sortProviders(providers, rememberedRdns), [providers, rememberedRdns]);

  return useMemo(
    () => ({
      view,
      providers: sortedProviders,
      discoveryDone,
      chainId,
      connect,
      chooseBurner,
      switchWallet,
      newBurner,
      cancelConnect,
      resync,
    }),
    [view, sortedProviders, discoveryDone, chainId, connect, chooseBurner, switchWallet, newBurner, cancelConnect, resync],
  );
}
