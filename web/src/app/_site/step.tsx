import type { ReactNode } from "react";
import { cx } from "./cx";
import { RoleChip, type Role } from "./role-chip";

/**
 * One "How it works" card: a serif-italic number, a short title, one line, then the visual. Renders an <li>: put the
 * cards in an <ol>. `role` (optional) adds a RoleChip next to the number (left-aligned, never in a far corner);
 * `object` (optional) a small visual under the text.
 */
export function Step({
  n,
  role,
  title,
  body,
  roleLabel,
  object,
  className,
}: {
  n: number;
  role?: Role;
  title: string;
  body: ReactNode;
  /** Replaces the chip text. */
  roleLabel?: string;
  object?: ReactNode;
  className?: string;
}) {
  return (
    <li className={cx("flex min-w-0 flex-col gap-3 rounded-card bg-surface p-7 sm:p-8", className)}>
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="font-serif text-4xl italic leading-none">
          {n}
        </span>
        {role && <RoleChip role={role} label={roleLabel} />}
      </div>
      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
      <div className="text-base leading-relaxed text-muted sm:text-lg">{body}</div>
      {object && <div className="mt-auto pt-4">{object}</div>}
    </li>
  );
}
