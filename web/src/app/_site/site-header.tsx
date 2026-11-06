"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { isCurrent, type FlowStep } from "@/lib/site.ts";
import { ConnectButton } from "../_wallet/connect-button";
import { cx } from "./cx";
import { Logo } from "./logo";
import { SITE_CTA, siteNav, type SiteNavItem } from "./nav";
import { PillButton } from "./pill-button";

const BAR = "relative mx-auto flex min-h-[72px] max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6";

/**
 * The site header, one row at every width (never wraps, no sideways scroll at 360px). The root layout renders it
 * through RouteHeader, which picks the mode from the route; pages don't render it themselves.
 * - site (SITE_FINAL.md "Nav", on both pages): logo · Genesis Drop · GitHub · wallet · black pill "Add Watermark ↗"
 *   (links from ./nav.ts).
 *   - From 900px: everything in one row.
 *   - 440 to 899px (tablets, zoomed laptops): logo, wallet, the pill and a menu holding the two links.
 *   - Phones (under 440px): logo, the round wallet button and the menu; the pill moves to the menu's foot.
 *   The menu is a <details> (works without JS); a link click, a tap outside or Escape closes it.
 * - flow (the drop's steps: ?next=pass on /verify and /pay): logo, "Genesis Drop · Step n of 3" and Exit (back to
 *   the drop page). Nothing else is clickable.
 */
export function SiteHeader({
  mode = "site",
  step,
  current = null,
}: {
  mode?: "site" | "flow";
  step?: FlowStep;
  /** The current pathname, to mark the active nav link. */
  current?: string | null;
}) {
  if (mode === "flow") {
    return (
      <header className="bg-bg">
        <div className={BAR}>
          <span className="flex shrink-0 items-center">
            <Logo />
          </span>
          <p className="flex min-w-0 flex-1 justify-center text-sm font-semibold">
            <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-surface px-3.5 py-1.5">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-saffron" />
              {step ? (
                <span className="truncate">
                  {/* Phones keep the step, the part that changes; the drop's name stays for screen readers. */}
                  <span className="max-sm:sr-only">Genesis Drop · </span>
                  <span className="whitespace-nowrap">Step {step} of 3</span>
                </span>
              ) : (
                <span className="truncate">Genesis Drop</span>
              )}
            </span>
          </p>
          {/* The wallet button from 640px; on phones the step's own wallet bar shows the wallet. */}
          <div className="hidden shrink-0 sm:block">
            <ConnectButton />
          </div>
          <PillButton href="/pass" variant="secondary" size="sm" className="shrink-0">
            Exit
          </PillButton>
        </div>
      </header>
    );
  }

  // The active page reads in ink on a quiet surface pill: no colour, no dot.
  const link = (item: SiteNavItem, itemClass: string) => {
    if (item.external)
      return (
        <a href={item.href} target="_blank" rel="noopener noreferrer" className={cx(itemClass, "text-muted hover:text-ink")}>
          {item.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      );
    const active = isCurrent(current, item.href);
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(itemClass, active ? "bg-surface font-medium text-ink" : "text-muted hover:text-ink")}
      >
        {item.label}
      </Link>
    );
  };
  const links = (itemClass: string) =>
    siteNav().map((item) => <li key={item.href}>{link(item, itemClass)}</li>);

  return (
    <header className="bg-bg">
      <div className={BAR}>
        <Link href="/" aria-label="Watermark home" className="mr-auto flex shrink-0 items-center rounded-full">
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden min-w-0 min-[900px]:block">
          <ul className="flex items-center gap-1">
            {links("block whitespace-nowrap rounded-full px-4 py-2.5 text-[15px] transition-colors")}
          </ul>
        </nav>

        {/* Connect wallet (client): a white pill from 640px, a round icon button on phones. Shares its wallet with
            the page's WalletGate (/verify, /pay, /pass). */}
        <div className="shrink-0 min-[900px]:ml-1">
          <ConnectButton />
        </div>

        {/* The pill from 440px; on phones it sits at the foot of the menu. */}
        <span className="hidden shrink-0 min-[440px]:block min-[900px]:ml-2">
          <PillButton href={SITE_CTA.href} size="sm">
            {SITE_CTA.label}
          </PillButton>
        </span>

        <MenuDetails>
          <ul className="flex flex-col">{links("block rounded-xl px-4 py-3 text-base hover:bg-surface")}</ul>
          <div className="mt-2 border-t border-line px-1 pb-1 pt-3 min-[440px]:hidden">
            <PillButton href={SITE_CTA.href} size="sm" className="w-full">
              {SITE_CTA.label}
            </PillButton>
          </div>
        </MenuDetails>
      </div>
    </header>
  );
}

/**
 * The menu under 900px: a <details> with a round button. It closes on a link click (an in-page link like /#add keeps
 * the route, so the header does not remount), a tap outside and Escape (focus back on the button).
 */
function MenuDetails({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (refocus: boolean) => {
      const el = ref.current;
      if (!el?.open) return;
      el.open = false;
      if (refocus) el.querySelector("summary")?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ref.current?.contains(document.activeElement)) close(true);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="relative shrink-0 min-[900px]:hidden">
      <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full border border-line bg-white transition-colors hover:bg-surface min-[400px]:size-11 [&::-webkit-details-marker]:hidden">
        <span className="sr-only">Menu</span>
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="block size-4">
          <path d="M2 5.5h12M2 10.5h12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </summary>
      <nav
        aria-label="Main"
        onClick={(e) => {
          if ((e.target as Element).closest("a") && ref.current) ref.current.open = false;
        }}
        className="absolute right-0 top-full z-30 mt-2 w-60 max-w-[calc(100vw-2rem)] rounded-inner border border-line bg-white p-2 shadow-float"
      >
        {children}
      </nav>
    </details>
  );
}

/** Same height as the header, logo only: shown for a moment while the header waits for the query string. */
export function SiteHeaderPlaceholder() {
  return (
    <header className="bg-bg">
      <div className={BAR}>
        <Logo />
      </div>
    </header>
  );
}
