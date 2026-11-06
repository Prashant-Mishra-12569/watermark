"use client";

import { cx } from "./cx";
import type { CopyState } from "./use-copy";

/** The Copy pill and its live status. `tone="ink"` on dark panels (CodeBlock, NightCard). */
export function CopyButton({
  state,
  onCopy,
  what,
  tone = "surface",
}: {
  state: CopyState;
  onCopy: () => void;
  /** For screen readers: "Copy {what}". */
  what: string;
  tone?: "surface" | "ink";
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span aria-live="polite" className={cx("text-xs", tone === "ink" ? "text-night-muted" : "text-muted")}>
        {state === "manual" ? "Press ⌘C / Ctrl+C." : ""}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={state === "copied" ? `Copied ${what}` : `Copy ${what}`}
        className={cx(
          "inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
          tone === "ink"
            ? "border-white/20 text-night-text hover:bg-white/10"
            : "border-line bg-white text-ink hover:bg-surface",
        )}
      >
        {state === "copied" ? "Copied ✓" : "Copy"}
      </button>
    </span>
  );
}
