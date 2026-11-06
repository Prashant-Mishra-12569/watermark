"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./cx";

function formatNumber(n: number, pad: number, grouping: boolean): string {
  const s = grouping ? Math.round(n).toLocaleString("en-US") : String(Math.round(n));
  return pad > 0 ? s.padStart(pad, "0") : s;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * A number that ticks to its new value ("{N} left", "{r} of {t} tries refused"). The server and the first client
 * render show the real `value`, so screenshots and no-JS readers never see a fake number; it ticks only when `value`
 * changes later (or once on mount with `animateOnMount`, starting from `from`). Jumps straight there under reduced
 * motion. Screen readers get the final value only, never the in-between ones.
 */
export function Counter({
  value,
  from,
  durationMs = 700,
  animateOnMount = false,
  pad = 0,
  grouping = true,
  className,
}: {
  value: number;
  /** Start of the on-mount tick (default 0). Rendered on the server when animateOnMount is on. */
  from?: number;
  durationMs?: number;
  animateOnMount?: boolean;
  /** Minimum digits, e.g. 3 → "007". */
  pad?: number;
  /** Thousands separators, e.g. 4,208 (default on). */
  grouping?: boolean;
  className?: string;
}) {
  const start = animateOnMount ? (from ?? 0) : value;
  const [shown, setShown] = useState(start);
  const shownRef = useRef(start);

  useEffect(() => {
    const begin = shownRef.current;
    if (begin === value) return;
    if (reducedMotion() || durationMs <= 0) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - p) ** 3;
      const next = p >= 1 ? value : begin + (value - begin) * eased;
      shownRef.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return (
    <span className={cx("tabular-nums", className)}>
      <span aria-hidden="true">{formatNumber(shown, pad, grouping)}</span>
      <span className="sr-only">{formatNumber(value, pad, grouping)}</span>
    </span>
  );
}
