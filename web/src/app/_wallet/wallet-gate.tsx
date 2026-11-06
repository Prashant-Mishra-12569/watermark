"use client";

import { useEffect, useState, type ReactNode } from "react";
import { chooserNoteCopy, noWalletFoundCopy } from "@/lib/messages.ts";
import type { ProviderDetail } from "@/lib/wallet.ts";
import { useWallet, type ActiveWallet } from "./use-wallet";

export interface WalletControls {
  /** Demo tools on /verify: replace the burner (only offered while the burner is in use). */
  newBurner: () => void;
  /** The external wallet's active chain, or null (burner, or not known yet). */
  chainId: number | null;
  /**
   * Re-reads the external wallet's account after a payment found it changed or missing (wallets that don't emit
   * accountsChanged). The page then restarts for the wallet's account, or goes back to the choice. No-op for the burner.
   */
  resync: () => void;
}

/** Phones and tablets: no browser extensions, so "install MetaMask" can't be followed there. */
function useTouchOnly(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    try {
      setTouch(window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(any-pointer: fine)").matches);
    } catch {
      setTouch(false);
    }
  }, []);
  return touch;
}

/**
 * Shows "Use my wallet" / "Continue without a wallet" until there is a wallet, then a one-line "switch wallet" bar
 * and the page's flow. The flow is rendered by `children` and should be keyed on the address, so a changed account
 * starts over.
 */
export function WalletGate({
  appId,
  purpose,
  children,
}: {
  appId: string;
  /** Changes the copy: /verify only connects, /pay also signs. */
  purpose: "verify" | "pay";
  children: (wallet: ActiveWallet, controls: WalletControls) => ReactNode;
}) {
  const w = useWallet(appId);
  const { view } = w;
  const touchOnly = useTouchOnly();

  if (view.kind === "loading") return <p className="py-10 text-lg text-muted">Loading your wallet…</p>;

  if (view.kind === "burner-failed") {
    return (
      <div role="alert" className="space-y-2 rounded-xl bg-error-bg p-5 text-error">
        <p>This browser couldn&apos;t create a wallet.</p>
        <button type="button" className="font-semibold underline" onClick={w.switchWallet}>
          Use my own wallet instead
        </button>
      </div>
    );
  }

  if (view.kind === "ready") {
    return (
      <div className="flex flex-col gap-3">
        <WalletBar wallet={view.wallet} onSwitch={w.switchWallet} />
        {children(view.wallet, { newBurner: w.newBurner, chainId: w.chainId, resync: w.resync })}
      </div>
    );
  }

  const note = view.kind === "choose" && view.note ? chooserNoteCopy(view.note, view.remembered?.name ?? null) : null;
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Choose a wallet</h1>
        <p className="text-sm text-muted">
          {purpose === "verify"
            ? "The card stamp goes to the wallet you pick. You never pay gas."
            : "Pay from the wallet you verified. You never pay gas."}
        </p>
      </div>

      {note && (
        <div role="alert" className="rounded-xl bg-note-bg px-4 py-3 text-note">
          <p className="font-semibold">{note.title}</p>
          <p className="text-sm">{note.next}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-4">
          <p className="text-lg font-semibold">Use my wallet</p>
          <p className="text-sm text-muted">
            MetaMask, Rabby, Coinbase Wallet, Brave or any browser wallet.{" "}
            {purpose === "verify"
              ? "Connecting only shares your address."
              : "You'll sign a payment permission. No gas, nothing is sent until you confirm."}
          </p>
          {view.kind === "connecting" ? (
            <div className="space-y-2">
              <p aria-live="polite">Confirm in {view.name}…</p>
              <button type="button" className="text-sm underline" onClick={w.cancelConnect}>
                Cancel
              </button>
            </div>
          ) : w.providers.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {w.providers.map((p) => (
                <li key={p.info.uuid}>
                  <ProviderButton detail={p} onClick={() => void w.connect(p)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm" aria-live="polite">
              {w.discoveryDone ? noWalletFoundCopy(touchOnly) : "Looking for browser wallets…"}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface px-4 py-4">
          <p className="text-lg font-semibold">Continue without a wallet</p>
          <p className="text-sm text-muted">
            We make a private wallet in this browser. Nothing to install, no popups. It stays in this browser only.
          </p>
          <button
            type="button"
            onClick={w.chooseBurner}
            disabled={view.kind === "connecting"}
            className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 font-semibold text-accent-text hover:opacity-90 disabled:opacity-50"
          >
            Continue without a wallet
          </button>
        </div>
      </div>
    </section>
  );
}

function ProviderButton({ detail, onClick }: { detail: ProviderDetail; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 w-full items-center gap-3 rounded-lg border border-line bg-bg px-3 font-semibold hover:opacity-90"
    >
      {detail.info.icon ? (
        // A data: URI from the wallet's EIP-6963 announcement (allowed by img-src data:); never a remote URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={detail.info.icon} alt="" width={24} height={24} className="h-6 w-6" />
      ) : (
        <span aria-hidden="true" className="inline-block h-6 w-6 rounded-full border border-line" />
      )}
      <span>Connect {detail.info.name}</span>
    </button>
  );
}

function WalletBar({ wallet, onSwitch }: { wallet: ActiveWallet; onSwitch: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span className="inline-flex items-center gap-2">
        {wallet.icon && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.icon} alt="" width={16} height={16} className="h-4 w-4" />
        )}
        Using {wallet.kind === "injected" ? <strong className="text-text">{wallet.name}</strong> : wallet.name}
      </span>
      <button type="button" className="underline" onClick={onSwitch}>
        {wallet.kind === "injected" ? "Switch wallet / disconnect" : "Use my own wallet instead"}
      </button>
    </p>
  );
}
