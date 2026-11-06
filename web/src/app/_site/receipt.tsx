import type { ReactNode } from "react";
import { cx } from "./cx";
import { ExternalLink } from "./external-link";
import { RoleChip, type Role } from "./role-chip";

export interface ReceiptRow {
  role: Role;
  /** Replaces the chip text, e.g. "Us". */
  label?: string;
  /** Mono text after the chip, e.g. "…a9Ba". */
  who?: string;
  text: ReactNode;
  /** Explorer link. Without linkLabel the whole text becomes the link (with ↗). */
  href?: string | null;
  /** With href: the text stays plain and this is the link, e.g. "See it on the explorer". */
  linkLabel?: string;
}

/**
 * Who did what, one row per role, on a paper-like slip: "You · Tapped a card, signed nothing, paid $0." / "Us · Put
 * it on-chain and paid the fee ↗". Never put fee amounts here; never a row for something that didn't happen.
 */
export function Receipt({
  title,
  rows,
  as: Heading = "h2",
  className,
}: {
  title: string;
  rows: ReceiptRow[];
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <section aria-label={title} className={cx("min-w-0 rounded-card bg-surface p-6 sm:p-8", className)}>
      <Heading className="text-sm font-medium tracking-normal text-muted">{title}</Heading>
      <ul className="mt-4 divide-y divide-dashed divide-[#d9d9d6] border-t border-dashed border-[#d9d9d6]">
        {rows.map((r, i) => (
          <li key={`${r.role}-${i}`} className="flex flex-col gap-2 py-4 last:pb-0 sm:flex-row sm:items-baseline sm:gap-5">
            <div className="flex shrink-0 items-center gap-2 sm:w-40">
              <RoleChip role={r.role} label={r.label} />
              {r.who && <span className="font-mono text-sm text-muted">{r.who}</span>}
            </div>
            <div className="min-w-0 break-words text-base leading-relaxed sm:text-lg">
              {r.href && !r.linkLabel ? (
                <ExternalLink href={r.href}>{r.text}</ExternalLink>
              ) : (
                <>
                  {r.text}
                  {r.href && r.linkLabel && (
                    <>
                      {" "}
                      <ExternalLink href={r.href}>{r.linkLabel}</ExternalLink>
                    </>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
