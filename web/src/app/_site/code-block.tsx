"use client";

import { useEffect, useRef, useState } from "react";
import { CopyButton } from "./copy-button";
import { cx } from "./cx";
import { useCopy } from "./use-copy";

/**
 * Code on a dark rounded panel with a Copy button. Long lines scroll inside the block, never the page: give the parent
 * `min-w-0` when it is a flex or grid item. While a line runs past the right edge (phones, mostly), the edge fades and
 * says "Scroll →", until the reader has scrolled to the end.
 */
export function CodeBlock({ code, label, className }: { code: string; label: string; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const [more, setMore] = useState(false);
  const { state, copy } = useCopy();

  useEffect(() => {
    const el = preRef.current;
    if (!el) return;
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Also when the block is resized or shown (a hidden tab panel measures 0 until it opens).
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [code]);

  return (
    <figure className={cx("min-w-0 max-w-full overflow-hidden rounded-inner bg-night text-night-text", className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-night-line py-2.5 pl-6 pr-2.5">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="flex shrink-0 gap-1.5">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </span>
          <span className="min-w-0 truncate pl-1 font-mono text-[13px] text-night-muted">{label}</span>
        </span>
        <CopyButton state={state} onCopy={() => void copy(code, ref.current)} what={label} tone="ink" />
      </figcaption>
      <div className="relative">
        <pre ref={preRef} tabIndex={0} aria-label={label} className="overflow-x-auto p-6 text-[13px] leading-relaxed sm:text-sm">
          <code ref={ref} className="font-mono">
            {code}
          </code>
        </pre>
        {more && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex w-20 items-end justify-end pb-2.5 pr-3"
            style={{ background: "linear-gradient(to left, var(--night) 30%, transparent)" }}
          >
            <span className="font-sans text-[11px] font-medium text-night-muted">Scroll →</span>
          </div>
        )}
      </div>
    </figure>
  );
}
