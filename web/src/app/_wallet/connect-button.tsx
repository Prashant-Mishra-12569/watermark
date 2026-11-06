"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { walletErrorCopy } from "@/lib/messages.ts";
import { LIVE_APP } from "@/lib/site.ts";
import { toWalletError } from "@/lib/wallet.ts";
import { cx } from "../_site/cx";
import { useCopy } from "../_site/use-copy";
import {
  CONNECT_COPY,
  NETWORK_DOT,
  NETWORK_LABEL,
  accountLabel,
  accountName,
  canSwitchChain,
  menuFocus,
  networkState,
  walletTitle,
  type NetworkState,
} from "./connect-view";
import { useWallet, type ActiveWallet } from "./use-wallet";
import { WalletAvatar, WalletGlyph } from "./wallet-icons";
import { WalletModal } from "./wallet-modal";

/**
 * The header's wallet button (every page), always a 44px pill the size of its words, like the header's other pills.
 * Disconnected: "Connect wallet", which opens the wallet modal. Connecting: a saffron dot and "Connecting…".
 * Connected: a small pill with the wallet's icon, "0x1234…abcd" and the network dot, with a menu (Copy address, Switch
 * to Whitechain when the wallet is on another network, Disconnect). Under 640px it is a round icon button (the header
 * has no room for words there), the network dot a badge on the icon; its accessible name says the same.
 *
 * It runs its own useWallet on the live app (the one /pass, /verify?next=pass and /pay stamp and pay with). The
 * choice is shared with the page's WalletGate through the remembered choice (WALLET_CHOICE_KEY) and ./wallet-sync:
 * connecting here makes /verify, /pay and /pass use that wallet; Disconnect sends them back to their wallet choice.
 */
export function ConnectButton() {
  const w = useWallet(LIVE_APP.appId);
  const { view } = w;
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const wallet = view.kind === "ready" ? view.wallet : null;
  const network: NetworkState = wallet ? networkState(wallet.kind, w.chainId) : "unknown";
  // The menu belongs to a connected wallet: it is gone as soon as the wallet is (locked, disconnected on the page).
  const menuOpen = menu && wallet !== null;

  const closeModal = useCallback(() => {
    setModal(false);
    // Back to the button (now "Connect wallet" or the account): the same element either way.
    requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  const closeMenu = useCallback((refocus: boolean) => {
    setMenu(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const focusItem = (index: number) => {
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[index]?.focus();
  };

  // Opening the menu moves focus to its first item. A click or tap outside closes it.
  useEffect(() => {
    if (!menuOpen) return;
    focusItem(0);
    const onPointer = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [menuOpen]);

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (wallet && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setMenu(true);
    }
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
      return;
    }
    if (e.key === "Tab") {
      setMenu(false);
      return;
    }
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const next = menuFocus(items.indexOf(document.activeElement as HTMLElement), items.length, e.key);
    if (next === null) return;
    e.preventDefault();
    items[next]?.focus();
  };

  const busy = view.kind === "connecting";
  const title = wallet ? walletTitle(wallet) : "";

  return (
    <div ref={wrapRef} className="shrink-0 max-sm:static sm:relative">
      <button
        ref={buttonRef}
        type="button"
        data-connect-wallet=""
        onClick={() => (wallet ? setMenu((m) => !m) : setModal(true))}
        onKeyDown={onButtonKey}
        aria-haspopup={wallet ? "menu" : "dialog"}
        aria-expanded={wallet ? menuOpen : modal}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label={wallet ? accountName({ title, address: wallet.address, network }) : undefined}
        aria-busy={busy || undefined}
        className={cx(
          "relative inline-flex min-h-11 select-none items-center justify-center rounded-full border border-line bg-white font-semibold tracking-[-0.01em] text-ink whitespace-nowrap",
          "transition-[background-color,border-color,transform] duration-150 hover:border-[#cfcfcf] hover:bg-surface active:scale-[0.98]",
          // Phones: a round 40px (44px from 400px) icon button. From 640px: the pill with words.
          "max-sm:size-10 max-sm:min-h-0 min-[400px]:max-sm:size-11",
          wallet ? "sm:gap-2 sm:py-1 sm:pl-1.5 sm:pr-4" : "sm:gap-2 sm:pl-4 sm:pr-5",
          (menuOpen || modal) && "border-[#cfcfcf] bg-surface",
        )}
      >
        {wallet ? (
          <>
            <WalletAvatar wallet={wallet} className="size-7" />
            <span className="font-mono text-[13px] font-medium tabular-nums max-sm:sr-only">{accountLabel(wallet.address)}</span>
            <span
              aria-hidden="true"
              className={cx(
                "size-2 shrink-0 rounded-full",
                NETWORK_DOT[network],
                // Phones: a badge on the icon's corner.
                "max-sm:absolute max-sm:bottom-1 max-sm:right-1 max-sm:size-2.5 max-sm:ring-2 max-sm:ring-white",
              )}
            />
          </>
        ) : busy ? (
          <>
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-saffron motion-safe:animate-pulse" />
            <span className="text-sm max-sm:sr-only">{CONNECT_COPY.connecting}</span>
          </>
        ) : (
          <>
            <WalletGlyph className="size-[18px]" />
            <span className="text-sm max-sm:sr-only">{CONNECT_COPY.button}</span>
          </>
        )}
      </button>

      {wallet && menuOpen && (
        <AccountMenu
          wallet={wallet}
          title={title}
          network={network}
          menuId={menuId}
          menuRef={menuRef}
          onKeyDown={onMenuKey}
          onSwitchChain={w.switchToWhitechain}
          onDisconnect={() => {
            closeMenu(true);
            w.switchWallet();
          }}
        />
      )}

      {modal && <WalletModal wallet={w} onClose={closeModal} />}
    </div>
  );
}

const ITEM =
  "flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] font-medium text-ink outline-offset-0 transition-colors hover:bg-surface focus-visible:bg-surface aria-disabled:pointer-events-none aria-disabled:text-muted";

function AccountMenu({
  wallet,
  title,
  network,
  menuId,
  menuRef,
  onKeyDown,
  onSwitchChain,
  onDisconnect,
}: {
  wallet: ActiveWallet;
  title: string;
  network: NetworkState;
  menuId: string;
  menuRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  onSwitchChain: () => Promise<void>;
  onDisconnect: () => void;
}) {
  const addressRef = useRef<HTMLParagraphElement>(null);
  const { state: copyState, copy } = useCopy();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const showSwitch = canSwitchChain(wallet.kind, network);

  const switchChain = async () => {
    if (switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      await onSwitchChain();
    } catch (e) {
      setSwitchError(walletErrorCopy(toWalletError(e).code).title);
    } finally {
      setSwitching(false);
    }
  };

  const copyLabel =
    copyState === "copied" ? CONNECT_COPY.copied : copyState === "manual" ? CONNECT_COPY.copyManual : CONNECT_COPY.copy;

  return (
    <div
      className={cx(
        "absolute top-full z-40 rounded-[20px] border border-line bg-white p-2 text-left shadow-float motion-safe:animate-rise",
        // Phones: under the header bar's right edge (the bar is the positioning box). From 640px: under the button.
        "right-4 mt-0 w-[min(296px,calc(100vw-2rem))] sm:right-0 sm:mt-2 sm:w-[296px]",
      )}
    >
      <div className="flex items-center gap-3 px-2 pb-2.5 pt-1.5">
        <WalletAvatar wallet={wallet} className="size-10" />
        <div className="min-w-0">
          <p className="truncate font-semibold leading-snug">{title}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
            <span aria-hidden="true" className={cx("size-2 shrink-0 rounded-full", NETWORK_DOT[network])} />
            {NETWORK_LABEL[network]}
          </p>
        </div>
      </div>
      {/* The whole address, to check against what the phone or the wallet shows: two even lines of 21 characters
          (one string, so a manual copy has no line break in it). */}
      <p ref={addressRef} className="mx-2 mb-2 select-all rounded-xl bg-surface px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink">
        <span className="block w-[21ch] max-w-full break-all">{wallet.address}</span>
      </p>
      {switchError && (
        <p role="alert" className="mx-2 mb-2 rounded-xl bg-note-bg px-3 py-2 text-[13px] leading-snug text-note">
          {switchError}
        </p>
      )}

      <div id={menuId} ref={menuRef} role="menu" aria-label="Wallet" onKeyDown={onKeyDown} className="border-t border-line pt-1.5">
        <button type="button" role="menuitem" tabIndex={-1} className={ITEM} onClick={() => void copy(wallet.address, addressRef.current)}>
          <ItemIcon d={copyState === "copied" ? "M3.5 8.5l3 3 6-7" : "M5.5 5.5V3.75c0-.69.56-1.25 1.25-1.25h5.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25H10.5M3.75 5.5h5.5c.69 0 1.25.56 1.25 1.25v5.5c0 .69-.56 1.25-1.25 1.25h-5.5c-.69 0-1.25-.56-1.25-1.25v-5.5c0-.69.56-1.25 1.25-1.25z"} />
          <span className="min-w-0 flex-1" aria-live="polite">
            {copyLabel}
          </span>
        </button>
        {showSwitch && (
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-disabled={switching || undefined}
            className={ITEM}
            onClick={() => void switchChain()}
          >
            <ItemIcon d="M2.75 5.5h9.5L9.75 3M13.25 10.5h-9.5L6.25 13" />
            <span className="min-w-0 flex-1" aria-live="polite">
              {switching ? CONNECT_COPY.switching : CONNECT_COPY.switchChain}
            </span>
            {!switching && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-note" />}
          </button>
        )}
        <button type="button" role="menuitem" tabIndex={-1} className={ITEM} onClick={onDisconnect}>
          <ItemIcon d="M6.5 2.75H4A1.25 1.25 0 0 0 2.75 4v8A1.25 1.25 0 0 0 4 13.25h2.5M10.5 11l3-3-3-3M13.25 8H6.5" />
          <span className="min-w-0 flex-1">{CONNECT_COPY.disconnect}</span>
        </button>
      </div>
    </div>
  );
}

function ItemIcon({ d }: { d: string }) {
  return (
    <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-ink">
      <svg viewBox="0 0 16 16" focusable="false" className="block size-4">
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
