"use client";

import { useRef } from "react";
import { CopyButton } from "./copy-button";
import { cx } from "./cx";
import { useCopy } from "./use-copy";

/**
 * A full value (address, appId, root) in mono with a Copy button, e.g. the home page's live addresses. The whole value is
 * always shown (it wraps), so the fallback selection copies all of it.
 */
export function CopyText({ value, label, className }: { value: string; label: string; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const { state, copy } = useCopy();
  return (
    <span className={cx("flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <code ref={ref} className="min-w-0 break-all font-mono text-sm">
        {value}
      </code>
      <CopyButton state={state} onCopy={() => void copy(value, ref.current)} what={label} />
    </span>
  );
}
