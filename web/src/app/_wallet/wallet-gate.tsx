"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { chooserNoteCopy, noWalletFoundCopy, walletGateCopy, type WalletPurpose } from "@/lib/messages.ts";
import type { ProviderDetail } from "@/lib/wallet.ts";
import { cx } from "../_site/cx";
import { PillButton } from "../_site/pill-button";
import { useWallet, type ActiveWallet } from "./use-wallet";
import { BrowserGlyph, WalletAvatar, WalletGlyph } from "./wallet-icons";

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
  /** Back to the wallet choice (what the WalletBar's button does), for pages that place the bar themselves. */
  switchWallet: () => void;
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
 * Shows the wallet choice ("In this browser" / "My wallet") until there is a wallet, then a one-line "switch wallet"
 * bar and the page's flow. The flow is rendered by `children` and should be keyed on the address, so a changed
 * account starts over. purpose "pass" (/verify?next=pass and /pass) uses the drop walk's copy (pages can reword the
 * question with `title` and `sub`).
 *
 * Layout options (all optional, so existing pages keep their look):
 * - `intro`: the page's own heading block (its h1), shown above the choice while loading and choosing. The choice's
 *   question then becomes an h2.
 * - `aside`: an object shown beside the choice from 900px up (hidden on smaller screens), like the home hero's two
 *   columns.
 * - `hideBar`: the page renders <WalletBar> itself (controls.switchWallet is its button).
 * - `title` / `sub`: replace the question and its line (the Genesis Drop steps word it for the drop).
 */
export function WalletGate({
  appId,
  purpose,
  children,
  intro,
  aside,
  hideBar = false,
  title,
  sub,
}: {
  appId: string;
  /** Changes the copy: /verify and the pass walk only connect, /pay also signs. */
  purpose: WalletPurpose;
  children: (wallet: ActiveWallet, controls: WalletControls) => ReactNode;
  intro?: ReactNode;
  aside?: ReactNode;
  hideBar?: boolean;
  title?: string;
  sub?: string;
}) {
  const w = useWallet(appId);
  const { view } = w;
  const touchOnly = useTouchOnly();
  const copy = walletGateCopy(purpose);
  const questionId = useId();

  if (view.kind === "ready") {
    return (
      <div className="flex flex-col gap-3">
        {!hideBar && <WalletBar wallet={view.wallet} onSwitch={w.switchWallet} />}
        {children(view.wallet, {
          newBurner: w.newBurner,
          chainId: w.chainId,
          resync: w.resync,
          switchWallet: w.switchWallet,
        })}
      </div>
    );
  }

  if (view.kind === "loading") {
    return (
      <div className="flex flex-col">
        {intro}
        <p className={cx("text-lg text-muted", intro ? "mt-10" : "py-10")}>Loading your wallet…</p>
      </div>
    );
  }

  if (view.kind === "burner-failed") {
    return (
      <div className="flex flex-col">
        {intro}
        <div role="alert" className={cx("flex flex-col items-start gap-2 rounded-inner bg-error-bg px-5 py-4 text-error", intro ? "mt-10" : null)}>
          <p className="font-semibold">This browser couldn&apos;t make a wallet.</p>
          <button
            type="button"
            className="min-h-11 font-semibold underline decoration-current/40 underline-offset-4"
            onClick={w.switchWallet}
          >
            Use my own wallet instead
          </button>
        </div>
      </div>
    );
  }

  // The page's h1 is in `intro` when given; otherwise the question is the page's h1 (as before).
  const Question = intro ? "h2" : "h1";
  const OptionTitle = intro ? "h3" : "h2";
  const note =
    view.kind === "choose" && view.note ? chooserNoteCopy(view.note, view.remembered?.name ?? null, copy.burner.button) : null;

  const ownCard = (
    <OptionCard key="own" icon={<WalletGlyph className="size-5" />} title={copy.own.title} body={copy.own.body} as={OptionTitle}>
      {view.kind === "connecting" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p
            aria-live="polite"
            className="inline-flex min-h-12 max-w-full items-center gap-2.5 rounded-full border border-line bg-white px-5 font-semibold"
          >
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-saffron motion-safe:animate-pulse" />
            <span className="truncate">Confirm in {view.name}…</span>
          </p>
          <button
            type="button"
            className="min-h-11 text-sm text-muted underline decoration-current/40 underline-offset-4 hover:text-ink"
            onClick={w.cancelConnect}
          >
            Cancel
          </button>
        </div>
      ) : w.providers.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {w.providers.map((p) => (
            <li key={p.info.uuid}>
              <ProviderButton detail={p} onClick={() => void w.connect(p)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-muted" aria-live="polite">
          {w.discoveryDone ? noWalletFoundCopy(touchOnly, copy.burner.button) : "Looking for browser wallets…"}
        </p>
      )}
    </OptionCard>
  );

  const burnerCard = (
    <OptionCard key="burner" icon={<BrowserGlyph className="size-5" />} title={copy.burner.title} body={copy.burner.body} as={OptionTitle}>
      <PillButton onClick={w.chooseBurner} disabled={view.kind === "connecting"}>
        {copy.burner.button}
      </PillButton>
    </OptionCard>
  );

  // The browser wallet ("Easiest") comes first on /verify, /pay and the pass walk, and on phones and tablets (they can't
  // install a wallet extension). It is first in the DOM too, so the reading and tab order match what is seen.
  const burnerFirst = copy.burnerFirst === true || (copy.burnerFirstOnTouch && touchOnly);
  return (
    <section
      aria-labelledby={questionId}
      className={cx(
        "grid items-center gap-12",
        aside
          ? "min-[56.25rem]:grid-cols-[minmax(0,1fr)_minmax(0,280px)] min-[56.25rem]:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:gap-16"
          : null,
      )}
    >
      <div className="flex min-w-0 flex-col">
        {intro}
        <Question
          id={questionId}
          className={cx(
            "font-semibold tracking-[-0.025em]",
            // Under the page's h1: the gap shrinks on a short laptop screen, so the wallet cards start on the first screen.
            intro ? "mt-[clamp(20px,4svh,40px)] text-2xl leading-tight sm:text-[28px]" : "text-[28px] leading-tight sm:text-[34px]",
          )}
        >
          {title ?? copy.title}
        </Question>
        <p className="mt-2 text-base text-muted sm:text-lg">{sub ?? copy.sub}</p>

        {note && (
          <div role="alert" className="mt-5 rounded-inner bg-note-bg px-5 py-4 text-note">
            <p className="font-semibold">{note.title}</p>
            <p className="mt-1 text-sm leading-relaxed">{note.next}</p>
          </div>
        )}

        <ul className="mt-[clamp(16px,3svh,24px)] grid gap-3 sm:grid-cols-2 sm:gap-4">{burnerFirst ? [burnerCard, ownCard] : [ownCard, burnerCard]}</ul>
      </div>
      {aside && (
        <div aria-hidden="true" className="hidden min-w-0 justify-center min-[56.25rem]:flex">
          {aside}
        </div>
      )}
    </section>
  );
}

/** One wallet option: a round icon, a title, one line and its action at the bottom. */
function OptionCard({
  icon,
  title,
  body,
  as: Title,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  as: "h2" | "h3";
  children: ReactNode;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-4 rounded-card bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-float ring-1 ring-black/[0.04]"
        >
          {icon}
        </span>
        <div className="min-w-0 pt-0.5">
          <Title className="text-lg font-semibold leading-snug tracking-[-0.02em] sm:text-xl">{title}</Title>
          <p className="mt-0.5 text-[15px] leading-relaxed text-muted">{body}</p>
        </div>
      </div>
      <div className="mt-auto pt-1">{children}</div>
    </li>
  );
}

function ProviderButton({ detail, onClick }: { detail: ProviderDetail; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 max-w-full min-w-0 select-none items-center gap-2.5 rounded-full border border-line bg-white py-1.5 pl-2 pr-5 text-left font-semibold tracking-[-0.01em] whitespace-nowrap transition-[background-color,border-color,transform] duration-150 hover:border-[#cfcfcf] hover:bg-[#fafaf9] active:scale-[0.98]"
    >
      {detail.info.icon ? (
        // A data: URI from the wallet's EIP-6963 announcement (allowed by img-src data:); never a remote URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={detail.info.icon} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full object-contain" />
      ) : (
        <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-ink">
          <WalletGlyph className="size-4" />
        </span>
      )}
      <span className="min-w-0 truncate">Connect {detail.info.name}</span>
    </button>
  );
}

/** "Using this browser's wallet · Use my own wallet instead". Exported for pages that place it themselves (hideBar). */
export function WalletBar({
  wallet,
  onSwitch,
  className,
}: {
  wallet: ActiveWallet;
  onSwitch: () => void;
  className?: string;
}) {
  return (
    <div className={cx("flex min-w-0 flex-wrap items-center gap-x-3 text-sm", className)}>
      {/* The same small pill as the header's wallet button: icon, then words. */}
      <span className="inline-flex min-h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3.5">
        <WalletAvatar wallet={wallet} className="size-7" />
        <span className="min-w-0 truncate">
          Using {wallet.kind === "injected" ? <strong className="font-semibold">{wallet.name}</strong> : wallet.name}
        </span>
      </span>
      <button
        type="button"
        className="min-h-11 text-muted underline decoration-current/40 underline-offset-4 hover:text-ink"
        onClick={onSwitch}
      >
        {/* Short, so the bar stays on one line at 390px. It goes back to the choice ("In this browser" / "My wallet"). */}
        Switch wallet
      </button>
    </div>
  );
}
