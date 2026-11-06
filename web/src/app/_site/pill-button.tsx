import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import { cx } from "./cx";

export type PillVariant = "primary" | "secondary" | "inverse";
export type PillSize = "xs" | "sm" | "md" | "lg" | "hero";

export interface PillButtonProps {
  children: ReactNode;
  /** primary: black pill + white ↗ circle. secondary: white pill, 1px line border. inverse: white pill for the night card. */
  variant?: PillVariant;
  /** xs 44px compact (phone header), sm 44px (header), md 48px (default), lg 56px, hero: 48px on phones (so two fit
   * side by side on a 360px screen), 56px from 640px. */
  size?: PillSize;
  /** Renders a link. Internal paths use next/link; http(s) links open in a new tab. */
  href?: string;
  /** Force new-tab behaviour on or off (default: true for http(s) hrefs). */
  external?: boolean;
  /** Draw the arrow. Default: on for primary and inverse (in a circle), off for secondary (bare when on). */
  arrow?: boolean;
  /** Which arrow: ↗ (another page, the default) or ↓ (a section further down this page, e.g. "Add Watermark ↓"). */
  arrowDir?: "up-right" | "down";
  /** 40% opacity and not clickable. A disabled link renders as a <span aria-disabled>. */
  disabled?: boolean;
  /** Sets aria-busy (e.g. while a request runs). Does not disable on its own. */
  busy?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: MouseEventHandler<HTMLElement>;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-current"?: "page" | "step" | undefined;
}

const BASE =
  "group/pill inline-flex max-w-full select-none items-center justify-center rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]";

const SIZE: Record<PillSize, { pill: string; withArrow: string; circle: string; icon: string }> = {
  xs: { pill: "min-h-11 px-3.5 text-[13px]", withArrow: "min-h-11 gap-2 pl-3.5 pr-1.5 text-[13px]", circle: "size-7", icon: "size-3" },
  sm: { pill: "min-h-11 px-5 text-sm", withArrow: "min-h-11 gap-2.5 pl-5 pr-1.5 text-sm", circle: "size-8", icon: "size-3.5" },
  md: { pill: "min-h-12 px-6 text-base", withArrow: "min-h-12 gap-3 pl-6 pr-1.5 text-base", circle: "size-9", icon: "size-4" },
  lg: { pill: "min-h-14 px-7 text-lg", withArrow: "min-h-14 gap-3.5 pl-7 pr-2 text-lg", circle: "size-10", icon: "size-[18px]" },
  hero: {
    pill: "min-h-12 gap-2 px-[18px] text-[15px] max-[379px]:px-4 max-[379px]:text-sm sm:min-h-14 sm:gap-2.5 sm:px-7 sm:text-lg",
    withArrow:
      "min-h-12 gap-2.5 pl-[18px] pr-1.5 text-[15px] max-[379px]:gap-2 max-[379px]:pl-4 max-[379px]:text-sm sm:min-h-14 sm:gap-3.5 sm:pl-7 sm:pr-2 sm:text-lg",
    circle: "size-8 max-[379px]:size-7 sm:size-10",
    icon: "size-3.5 sm:size-[18px]",
  },
};

const VARIANT: Record<PillVariant, { pill: string; circle: string }> = {
  primary: { pill: "bg-ink text-white hover:bg-[#262626]", circle: "bg-white text-ink" },
  secondary: { pill: "border border-line bg-white text-ink hover:border-[#cfcfcf] hover:bg-surface", circle: "" },
  inverse: { pill: "bg-white text-ink hover:bg-[#ececea]", circle: "bg-ink text-white" },
};

/** The ↗ arrow, drawn so it looks the same in every font. */
export function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={cx("block shrink-0", className)}>
      <path d="M4.5 11.5l7-7M5.5 4.5h6v6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The ↓ for an in-page jump, drawn like ArrowUpRight. */
export function ArrowDown({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className={cx("block shrink-0", className)}>
      <path d="M8 3v10M3.5 8.5 8 13l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Claim your free pass ↗" → "Claim your free pass": the circle draws the arrow, so a copied label doesn't double it. */
function stripArrow(children: ReactNode): ReactNode {
  return typeof children === "string" ? children.replace(/\s*[↗→↓]\s*$/u, "") : children;
}

/**
 * The site's button: primary is a black pill with a white circle holding ↗ (dopepay's "Get The App ↗"); secondary a
 * white pill with a hairline border; inverse a white pill for the dark card. Link or button, same look. One arrow rule
 * everywhere: a primary (or inverse) pill that goes somewhere carries its arrow in a circle, a secondary pill a bare
 * arrow; ↗ for another page, ↓ (arrowDir="down") for a section further down the same page. Server-safe (no
 * "use client"): pass onClick only from a client component.
 */
export function PillButton({
  children,
  variant = "primary",
  size = "md",
  href,
  external,
  arrow,
  arrowDir = "up-right",
  disabled = false,
  busy,
  type = "button",
  onClick,
  className,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-current": ariaCurrent,
}: PillButtonProps) {
  const showArrow = arrow ?? variant !== "secondary";
  const circled = showArrow && variant !== "secondary";
  const s = SIZE[size];
  const v = VARIANT[variant];
  const classes = cx(
    BASE,
    circled ? s.withArrow : s.pill,
    showArrow && !circled && "gap-2",
    v.pill,
    disabled && "pointer-events-none cursor-not-allowed opacity-40",
    className,
  );
  const isExternal = external ?? (href !== undefined && /^https?:\/\//i.test(href));

  const Arrow = arrowDir === "down" ? ArrowDown : ArrowUpRight;
  const content = (
    <>
      <span className="min-w-0 truncate">{showArrow ? stripArrow(children) : children}</span>
      {circled && (
        <span
          aria-hidden="true"
          className={cx(
            "grid shrink-0 place-items-center rounded-full transition-transform duration-200",
            arrowDir === "down" ? "motion-safe:group-hover/pill:translate-y-0.5" : "motion-safe:group-hover/pill:rotate-45",
            s.circle,
            v.circle,
          )}
        >
          <Arrow className={s.icon} />
        </span>
      )}
      {showArrow && !circled && (
        <Arrow
          className={cx(
            s.icon,
            "transition-transform duration-200",
            arrowDir === "down" ? "motion-safe:group-hover/pill:translate-y-0.5" : "motion-safe:group-hover/pill:translate-x-0.5 motion-safe:group-hover/pill:-translate-y-0.5",
          )}
        />
      )}
      {isExternal && href && <span className="sr-only"> (opens in a new tab)</span>}
    </>
  );

  const aria = {
    id,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
    "aria-current": ariaCurrent,
    "aria-busy": busy || undefined,
  };

  if (href !== undefined) {
    if (disabled)
      return (
        <span role="link" aria-disabled="true" className={classes} {...aria}>
          {content}
        </span>
      );
    if (isExternal)
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={classes} {...aria}>
          {content}
        </a>
      );
    return (
      <Link href={href} onClick={onClick} className={classes} {...aria}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes} {...aria}>
      {content}
    </button>
  );
}
