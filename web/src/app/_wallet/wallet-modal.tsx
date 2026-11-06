"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { chooserNoteCopy, noWalletFoundCopy } from "@/lib/messages.ts";
import type { ProviderDetail } from "@/lib/wallet.ts";
import { cx } from "../_site/cx";
import { CONNECT_COPY, wrapFocus } from "./connect-view";
import type { WalletApi } from "./use-wallet";
import { BrowserGlyph, WalletGlyph } from "./wallet-icons";

/** Everything Tab can reach inside the modal (disabled buttons are skipped by the selector). */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Phones and tablets: no browser extensions, so the "no wallet found" line says to open the page in a wallet app. */
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
 * "Connect a wallet": every browser wallet found (EIP-6963, window.ethereum fallback) and the browser wallet ("Use a
 * wallet in this browser", no install). A native <dialog> opened with showModal(): the page behind is inert, Esc
 * closes, Tab stays inside (wrapFocus), and it is labelled by its title. A bottom sheet on phones, a centred card from
 * 640px. Mounted only while open; it closes itself once a wallet is ready (the header button then shows it).
 *
 * Connecting only asks for the address (eth_requestAccounts): nothing is signed here.
 */
export function WalletModal({ wallet: w, onClose }: { wallet: WalletApi; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const subId = useId();
  const listId = useId();
  const touchOnly = useTouchOnly();
  const { view } = w;

  // Open as a modal on mount; lock the page's scroll while open.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    // Start on the first wallet (or the browser wallet when none is found): the close button stays one Shift+Tab away.
    d.querySelector<HTMLElement>("[data-first-option]")?.focus();
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
      if (d.open) d.close();
    };
  }, []);

  // A wallet is ready (chosen here, restored, or chosen on the page): the modal's job is done.
  const ready = view.kind === "ready";
  useEffect(() => {
    if (ready) onClose();
  }, [ready, onClose]);

  const onKeyDown = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    const next = wrapFocus(items.indexOf(document.activeElement as HTMLElement), items.length, e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
  };

  const connecting = view.kind === "connecting";
  const note =
    view.kind === "choose" && view.note
      ? chooserNoteCopy(view.note, view.remembered?.name ?? null, CONNECT_COPY.burnerShort)
      : view.kind === "burner-failed"
        ? { title: CONNECT_COPY.burnerFailed, next: "" }
        : null;
  const lastUsed = view.kind === "choose" ? (view.remembered?.rdns ?? null) : null;

  let wallets: ReactNode;
  if (view.kind === "connecting") {
    wallets = (
      <div className="flex min-h-14 items-center justify-between gap-3 rounded-inner bg-surface py-1.5 pl-4 pr-1.5">
        <p aria-live="polite" className="flex min-w-0 items-center gap-2.5 font-semibold">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-saffron motion-safe:animate-pulse" />
          <span className="truncate">Confirm in {view.name}…</span>
        </p>
        <button
          type="button"
          data-first-option
          onClick={w.cancelConnect}
          className="min-h-10 shrink-0 rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    );
  } else if (w.providers.length > 0) {
    wallets = (
      <ul aria-labelledby={listId} className="flex flex-col gap-1.5">
        {w.providers.map((p, i) => (
          <li key={p.info.uuid}>
            <ProviderRow detail={p} first={i === 0} lastUsed={p.info.rdns === lastUsed} onClick={() => void w.connect(p)} />
          </li>
        ))}
      </ul>
    );
  } else {
    wallets = (
      <p aria-live="polite" className="rounded-inner bg-surface px-4 py-3 text-sm leading-relaxed text-muted">
        {w.discoveryDone ? noWalletFoundCopy(touchOnly, CONNECT_COPY.burnerShort) : CONNECT_COPY.looking}
      </p>
    );
  }
  // With no wallet to pick (or one still being looked for), the browser wallet is the first option.
  const burnerFirst = !connecting && w.providers.length === 0;
  const burner = (
    <BurnerRow
      key="burner"
      first={burnerFirst}
      disabled={connecting || view.kind === "burner-failed"}
      onClick={w.chooseBurner}
    />
  );
  const yours = (
    <div key="yours" className="flex flex-col gap-2">
      <h3 id={listId} className="px-1 text-[13px] font-medium text-muted">
        {CONNECT_COPY.yours}
      </h3>
      {wallets}
    </div>
  );
  // A hairline "or" between the two kinds of wallet (decorative: the list and the button already say what they are).
  const or = (
    <div key="or" aria-hidden="true" className="flex items-center gap-3 px-1 text-xs font-medium text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={subId}
      onCancel={(e) => {
        // Esc: close through React, so the button's state and the dialog agree.
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        // Closed by the browser itself (not through onClose above). A stale close event from a remount finds the
        // dialog open again and is ignored.
        if (ref.current && !ref.current.open) onClose();
      }}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> itself (the panel fills it).
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "overflow-visible bg-transparent p-0 text-ink backdrop:bg-[rgb(10_10_10/0.42)]",
        // Phones: a sheet along the bottom edge. From 640px: a centred card.
        "m-0 mt-auto w-full max-w-full sm:m-auto sm:w-[420px] sm:max-w-[calc(100vw-2rem)]",
      )}
    >
      <div
        className={cx(
          "flex max-h-[88dvh] flex-col overflow-y-auto bg-white shadow-object motion-safe:animate-rise",
          "rounded-t-card px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-card sm:p-6",
        )}
      >
        {/* Phones: the sheet's grab bar (decorative; Esc, the close button and the backdrop close it). */}
        <span aria-hidden="true" className="mx-auto -mt-1 mb-4 block h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl font-semibold leading-tight tracking-[-0.02em] sm:text-[22px]">
              {CONNECT_COPY.title}
            </h2>
            <p id={subId} className="mt-1 max-w-[34ch] text-sm leading-relaxed text-muted sm:text-[15px]">
              {CONNECT_COPY.sub}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            <span className="sr-only">{CONNECT_COPY.close}</span>
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="block size-3.5">
              <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {note && (
          <div role="alert" className="mt-5 rounded-inner bg-note-bg px-4 py-3.5 text-note">
            <p className="font-semibold">{note.title}</p>
            {note.next && <p className="mt-1 text-sm leading-relaxed">{note.next}</p>}
          </div>
        )}

        {/* Reading and Tab order match what is seen: no CSS reordering. */}
        <div className="mt-5 flex flex-col gap-4">{burnerFirst ? [burner, or, yours] : [yours, or, burner]}</div>
      </div>
    </dialog>
  );
}

/** One wallet in the list: a 36px icon, the name and a chevron, at the same height for every kind of wallet. */
const ROW =
  "group/row flex min-h-[60px] w-full min-w-0 items-center gap-3 rounded-inner border border-line bg-white py-2.5 pl-3 pr-3.5 text-left transition-colors hover:border-[#cfcfcf] hover:bg-surface focus-visible:border-ink disabled:pointer-events-none disabled:opacity-40";
const ROW_ICON = "grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px]";

function ProviderRow({
  detail,
  first,
  lastUsed,
  onClick,
}: {
  detail: ProviderDetail;
  first: boolean;
  lastUsed: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} data-first-option={first || undefined} className={ROW}>
      {detail.info.icon ? (
        // A data: URI from the wallet's EIP-6963 announcement (allowed by img-src data:); never a remote URL.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={detail.info.icon} alt="" width={36} height={36} className={cx(ROW_ICON, "object-contain")} />
      ) : (
        <span aria-hidden="true" className={cx(ROW_ICON, "bg-surface text-ink")}>
          <WalletGlyph className="size-[18px]" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{detail.info.name}</span>
      {lastUsed && (
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted group-hover/row:bg-white">
          {CONNECT_COPY.lastUsed}
        </span>
      )}
      <Chevron />
    </button>
  );
}

function BurnerRow({ first, disabled, onClick }: { first: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-first-option={first || undefined} className={ROW}>
      <span aria-hidden="true" className={cx(ROW_ICON, "bg-ink text-white")}>
        <BrowserGlyph className="size-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold leading-snug">{CONNECT_COPY.burner}</span>
        <span className="text-[13px] leading-snug text-muted">{CONNECT_COPY.burnerBody}</span>
      </span>
      <Chevron />
    </button>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className="block size-4 shrink-0 text-muted transition-transform duration-150 motion-safe:group-hover/row:translate-x-0.5"
    >
      <path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
