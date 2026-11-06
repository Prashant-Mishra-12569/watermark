import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * A link that leaves the site (explorers, GitHub): opens in a new tab so a flow page keeps its state, with a ↗
 * (hidden from screen readers, which hear "opens in a new tab" instead). Plain navigation: no fetch, no CSP change.
 * The underline takes the text colour at low strength, so it works on white and on the night card.
 */
export function ExternalLink({
  href,
  children,
  title,
  className,
  arrow = true,
}: {
  href: string;
  children: ReactNode;
  /** Full value on hover, e.g. the whole tx hash. */
  title?: string;
  className?: string;
  /** false hides the ↗ (the link still opens in a new tab). */
  arrow?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cx(
        // py-2.5 on an inline link makes it easier to tap on a phone (about 40px tall) without moving any text.
        "py-2.5 underline decoration-current/35 decoration-1 underline-offset-4 transition-colors hover:decoration-current",
        className,
      )}
    >
      {children}
      {arrow && <span aria-hidden="true">&nbsp;↗</span>}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
