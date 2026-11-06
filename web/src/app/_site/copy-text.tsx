"use client";

import { useRef, type ReactNode } from "react";
import { CopyButton } from "./copy-button";
import { cx } from "./cx";
import { useCopy } from "./use-copy";

/**
 * A full value (address, appId, root) in mono with a Copy button, e.g. the home page's live addresses. The whole value is
 * always shown (it wraps), so the fallback selection copies all of it. `split`: a two-column row for tables of values,
 * the value on the left (wrapping, with `extra`, e.g. an explorer link, on a line under it) and Copy always alone in
 * the right-hand column, so every row's Copy lines up.
 */
export function CopyText({
  value,
  label,
  className,
  extra,
  split = false,
}: {
  value: string;
  label: string;
  className?: string;
  extra?: ReactNode;
  split?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const { state, copy } = useCopy();
  if (split)
    return (
      <span className={cx("grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4", className)}>
        <span className="flex min-w-0 flex-col items-start gap-1.5">
          <code ref={ref} className="min-w-0 max-w-full break-all font-mono text-sm">
            {value}
          </code>
          {extra && <span className="flex flex-wrap items-center gap-x-3 gap-y-1">{extra}</span>}
        </span>
        <CopyButton state={state} onCopy={() => void copy(value, ref.current)} what={label} />
      </span>
    );
  return (
    <span className={cx("flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <code ref={ref} className="min-w-0 break-all font-mono text-sm">
        {value}
      </code>
      <CopyButton state={state} onCopy={() => void copy(value, ref.current)} what={label} />
    </span>
  );
}
