import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * The one dark card per page (#0B0B0B, white text): the bot test or proof "transparency" moment, like dopepay's
 * "100% transparent" card. Inside it, use text-night-muted for secondary text, border-night-line for hairlines,
 * StatusChip/RoleChip tone="night", CopyButton tone="ink" and PillButton variant="inverse". Focus rings turn white here.
 */
export function NightCard({
  children,
  as: Tag = "div",
  id,
  labelledBy,
  label,
  className,
}: {
  children: ReactNode;
  as?: "div" | "section" | "article" | "aside";
  id?: string;
  /** aria-labelledby, e.g. the id of the card's heading (useful with as="section"). */
  labelledBy?: string;
  /** aria-label when there is no visible heading. */
  label?: string;
  className?: string;
}) {
  return (
    <Tag
      id={id}
      aria-labelledby={labelledBy}
      aria-label={label}
      className={cx(
        "relative isolate min-w-0 overflow-hidden rounded-card bg-night p-6 text-night-text sm:p-10 lg:p-14",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
