import type { ReactNode } from "react";
import { cx } from "@/app/_site/cx";
import { Headline } from "@/app/_site/headline";

/*
 * Small shared parts for the builders page sections: the page container, the eyebrow over a headline, and the
 * section head (eyebrow, H2 with one serif italic word, one lead line) on the 12-column grid. Server components.
 */

/** The page's container: same width and gutters as the header. */
export const WRAP = "mx-auto w-full max-w-6xl px-4 sm:px-6";

/** Vertical rhythm for a full section. */
export const BAND = "scroll-mt-6 py-12 sm:py-20 lg:py-24";

/** The small label over a section headline, e.g. "How it works". */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cx("flex items-center gap-3 text-sm font-medium text-muted", className)}>
      <span aria-hidden="true" className="h-px w-6 bg-[#cfcfcf]" />
      {children}
    </p>
  );
}

/**
 * Eyebrow and headline on the left (7 of 12 columns), the lead (and an optional action under it) on the right;
 * stacked on phones and tablets. `title` is a string with one *word* in serif italic. From 900px (a laptop zoomed to
 * 150% included) a lone lead is bottom-aligned with the headline; a lead with an action under it is taller than the
 * headline, so it starts level with the headline's top instead (bottom-aligned, it would climb above the eyebrow and
 * open a bigger gap above the section).
 */
export function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  action,
  className,
}: {
  /** The section id; the heading gets `${id}-title`. */
  id: string;
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  /** A button under the lead, e.g. "Run the bot test". */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "wm-reveal grid gap-5 min-[56.25rem]:grid-cols-12 min-[56.25rem]:gap-8",
        action ? "min-[56.25rem]:items-start" : "min-[56.25rem]:items-end",
        className,
      )}
    >
      <div className="min-w-0 min-[56.25rem]:col-span-7">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Headline id={`${id}-title`} className="mt-5 max-w-[16ch]">
          {title}
        </Headline>
      </div>
      {(lead || action) && (
        <div className={cx("min-w-0 min-[56.25rem]:col-span-5", action ? "min-[56.25rem]:pt-10" : "min-[56.25rem]:pb-2")}>
          {lead && <p className="max-w-[42ch] text-pretty text-lg leading-relaxed text-muted sm:text-xl">{lead}</p>}
          {action && <div className="mt-7">{action}</div>}
        </div>
      )}
    </div>
  );
}
