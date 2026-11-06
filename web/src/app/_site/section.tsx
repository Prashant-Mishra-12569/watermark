import type { ReactNode } from "react";
import { cx } from "./cx";
import { Headline } from "./headline";

/**
 * One idea per section: a short headline, one line, one object. The rhythm alternates like dopepay's "Send money
 * *worldwide*." (text left) then "Receive *globally*." (text right): pass side="left" / "right" in turn. On phones the
 * text always comes first and the object sits under it. Big vertical spacing; same width and gutters as the header.
 */
export function Section({
  id,
  title,
  eyebrow,
  lead,
  object,
  side = "left",
  align = "split",
  tone = "plain",
  as: Heading = "h2",
  children,
  className,
}: {
  /** Anchor id; the heading gets `${id}-title` and labels the section. */
  id?: string;
  /** A string with *word* marks (rendered by Headline), or nodes. */
  title?: ReactNode;
  /** A small line above the title, or a FloatChip. */
  eyebrow?: ReactNode;
  /** The one line under the title. */
  lead?: ReactNode;
  /** The visual: a BankCard, the pass, a receipt, a phone. Without it the text spans one readable column. */
  object?: ReactNode;
  /** Which side the text sits on from lg up. */
  side?: "left" | "right";
  /** "center": centred text with the object underneath (hero-style). */
  align?: "split" | "center";
  /** "surface": the section sits in a big rounded #F5F5F3 container. */
  tone?: "plain" | "surface";
  as?: "h1" | "h2" | "h3";
  /** Extra content under the lead: buttons, lists, rows. */
  children?: ReactNode;
  className?: string;
}) {
  const headingId = id && title ? `${id}-title` : undefined;
  const centered = align === "center";
  const split = !centered && object !== undefined && object !== null;

  const text = (
    <div className={cx("min-w-0", centered ? "mx-auto max-w-3xl text-center" : split ? "max-w-xl" : "max-w-3xl")}>
      {eyebrow && <div className={cx("mb-5 text-sm font-medium text-muted", centered && "flex justify-center")}>{eyebrow}</div>}
      {title !== undefined && title !== null && (
        <Headline as={Heading} id={headingId}>
          {title}
        </Headline>
      )}
      {lead && (
        <p
          className={cx(
            "mt-5 text-lg leading-relaxed text-muted sm:text-xl",
            centered ? "mx-auto max-w-[40ch]" : "max-w-[46ch]",
          )}
        >
          {lead}
        </p>
      )}
      {children && <div className="mt-8">{children}</div>}
    </div>
  );

  const body = split ? (
    <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
      {text}
      <div className={cx("min-w-0", side === "right" && "lg:order-first")}>{object}</div>
    </div>
  ) : (
    <>
      {text}
      {object && <div className={cx("mt-12 min-w-0", centered && "flex justify-center")}>{object}</div>}
    </>
  );

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx("scroll-mt-6 py-20 sm:py-28 lg:py-32", className)}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {tone === "surface" ? <div className="rounded-card bg-surface px-6 py-12 sm:px-12 sm:py-16">{body}</div> : body}
      </div>
    </section>
  );
}
