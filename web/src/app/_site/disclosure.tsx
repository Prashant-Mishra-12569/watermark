import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A styled <details> ("Details", "Tapped but nothing happened?"): works without JS, keyboard and screen reader
 * friendly. The + turns into × when open (no motion under reduced motion). Jargon belongs in here, not on the page.
 */
export function Disclosure({
  summary,
  children,
  defaultOpen,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cx("group min-w-0 rounded-inner bg-surface", className)}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-inner px-6 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{summary}</span>
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-white transition-transform duration-200 group-open:rotate-45"
        >
          <svg viewBox="0 0 12 12" className="block size-3" focusable="false">
            <path d="M6 1.5v9M1.5 6h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      </summary>
      <div className="min-w-0 px-6 pb-6 leading-relaxed">{children}</div>
    </details>
  );
}
