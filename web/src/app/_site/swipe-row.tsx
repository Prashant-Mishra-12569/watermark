"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./cx";

/**
 * A row of cards you swipe on small screens, and a normal grid from the breakpoint the caller picks. The caller
 * passes the list classes for both (a static Tailwind string, so the classes are generated) and renders the <li>
 * cards as children; this only adds the scroll position dots. The dots show only while the row really scrolls
 * sideways (so never on the desktop grid), follow the swipe, and jump to a card when clicked. They are a visual aid
 * only (aria-hidden): screen readers get the plain list.
 */
export function SwipeRow({
  as: List = "ul",
  label,
  className,
  dotsClassName,
  children,
}: {
  as?: "ul" | "ol";
  /** aria-label for the list. */
  label?: string;
  /** Classes for the list: the swipe row first, then the grid from a breakpoint. */
  className: string;
  /** Extra classes for the dots row, e.g. to hide it at a breakpoint the grid starts at. */
  dotsClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLUListElement & HTMLOListElement>(null);
  const [count, setCount] = useState(0);
  const [active, setActive] = useState(0);
  const [scrollable, setScrollable] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const items = Array.from(el.children) as HTMLElement[];
    setCount(items.length);
    setScrollable(el.scrollWidth > el.clientWidth + 4);
    const pad = parseFloat(getComputedStyle(el).scrollPaddingInlineStart || "0") || 0;
    const x = el.scrollLeft + pad;
    // The card whose left edge is nearest the row's start; the last one once the row is scrolled to its end
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    items.forEach((item, i) => {
      const d = Math.abs(item.offsetLeft - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) best = items.length - 1;
    setActive(best);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure]);

  const go = (i: number) => {
    const el = ref.current;
    const item = el?.children[i] as HTMLElement | undefined;
    if (!el || !item) return;
    const pad = parseFloat(getComputedStyle(el).scrollPaddingInlineStart || "0") || 0;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ left: item.offsetLeft - pad, behavior: still ? "auto" : "smooth" });
  };

  return (
    <>
      <List ref={ref} aria-label={label} className={cx("relative", className)}>
        {children}
      </List>
      {scrollable && count > 1 && (
        <div aria-hidden="true" className={cx("mt-4 flex justify-center gap-1.5", dotsClassName)}>
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              onClick={() => go(i)}
              className={cx(
                "h-1.5 rounded-full transition-[width,background-color] duration-300 ease-out",
                i === active ? "w-6 bg-ink" : "w-1.5 bg-[#d4d4d0] hover:bg-muted",
              )}
            />
          ))}
        </div>
      )}
    </>
  );
}
