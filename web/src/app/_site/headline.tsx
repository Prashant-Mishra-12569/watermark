import type { ReactNode } from "react";
import { cx } from "./cx";

export type HeadlineSize = "hero" | "section" | "card";

/** The serif italic word: Instrument Serif, regular weight, a hair larger so it sits level with Geist. */
export const EM_CLASS = "font-serif text-[1.06em] font-normal italic tracking-[-0.01em] pr-[0.04em]";

export const HEADLINE_SIZE: Record<HeadlineSize, string> = {
  hero: "text-[clamp(44px,7vw,88px)] font-semibold leading-[1] tracking-[-0.035em]",
  section: "text-[clamp(34px,4.6vw,58px)] font-semibold leading-[1.04] tracking-[-0.03em]",
  card: "text-[26px] font-semibold leading-[1.12] tracking-[-0.025em] sm:text-[30px]",
};

/**
 * "Stop bots from farming your *airdrop*." → Stop bots from farming your <em>airdrop</em>. Every *…* pair becomes
 * the italic serif word; everything else is plain text. Use it for a headline written as one string.
 */
export function emphasize(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <em key={i++} className={EM_CLASS}>
        {m[1]}
      </em>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * A headline in Geist (600, tight) with one italic serif word, like "Add it in *one line*." Pass the
 * line from SITE_FINAL.md as a string with *asterisks* around the word. Size defaults from the tag: h1 hero, h2
 * section, h3 card.
 */
export function Headline({
  children,
  as: Tag = "h2",
  size,
  id,
  className,
}: {
  /** A string with *word* marks, or ready-made nodes (rendered as they are). */
  children: ReactNode;
  as?: "h1" | "h2" | "h3" | "p";
  size?: HeadlineSize;
  id?: string;
  className?: string;
}) {
  const s: HeadlineSize = size ?? (Tag === "h1" ? "hero" : Tag === "h3" ? "card" : "section");
  return (
    <Tag id={id} className={cx("text-balance", HEADLINE_SIZE[s], className)}>
      {typeof children === "string" ? emphasize(children) : children}
    </Tag>
  );
}
