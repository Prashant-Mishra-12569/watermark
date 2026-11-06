"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/app/_site/cx";

export interface AddTab {
  id: string;
  /** "TypeScript SDK". */
  label: string;
  /** Under 640px, so three tabs fit at 360px: "TypeScript". */
  short: string;
  icon: ReactNode;
  panel: ReactNode;
}

/**
 * "Add it in one line." as three tabs (Solidity · TypeScript SDK · AI agents (MCP)), one code block on screen at a
 * time. The WAI-ARIA tabs pattern: arrow keys, Home and End move between tabs (and select them); only the selected tab
 * is in the tab order. The server renders the first tab selected, so the page reads the same before JS runs. The
 * panels are server-rendered and passed in.
 */
export function AddTabs({ tabs, label, className }: { tabs: readonly AddTab[]; label: string; className?: string }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const base = useId();
  const n = tabs.length;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === "ArrowRight"
        ? (active + 1) % n
        : e.key === "ArrowLeft"
          ? (active - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <div className={cx("min-w-0", className)}>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        className="grid w-full grid-cols-3 gap-1 rounded-full bg-surface p-1 sm:inline-flex sm:w-auto"
      >
        {tabs.map((t, i) => {
          const selected = i === active;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${base}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={cx(
                "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-[15px] font-medium transition-colors sm:px-5",
                selected ? "bg-ink text-white" : "text-muted hover:bg-white hover:text-ink",
              )}
            >
              <span aria-hidden="true" className="hidden sm:inline-flex">
                {t.icon}
              </span>
              <span className="sm:hidden">{t.short}</span>
              <span className="max-sm:hidden">{t.label}</span>
            </button>
          );
        })}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.id}
          id={`${base}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={i !== active}
          className="mt-8 min-w-0 sm:mt-10"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
