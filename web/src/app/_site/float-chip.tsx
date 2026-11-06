import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

export type ChipTone = "ok" | "refused" | "saffron" | "pink" | "sun" | "ink" | "muted";
export type ChipIcon = "check" | "cross" | "dot" | "none";

/** Offsets for an absolutely placed chip, e.g. { top: "8%", left: "-4%" }. Numbers are px. */
export interface ChipPosition {
  top?: string | number;
  right?: string | number;
  bottom?: string | number;
  left?: string | number;
}

/*
 * SITE_FINAL "Look": monochrome with one accent. Dots are black (or saffron when the caller asks for the one
 * highlight; grey for "muted"). Green and red only when the caller names a functional state: tone="ok" (allowed)
 * or tone="refused". The old playful tones (pink, sun) stay in the type so callers compile, but draw in ink.
 */
const DOT_BG: Record<ChipTone, string> = {
  ok: "bg-leaf",
  refused: "bg-red",
  saffron: "bg-saffron",
  pink: "bg-ink",
  sun: "bg-ink",
  ink: "bg-ink",
  muted: "bg-[#b5b5b5]",
};

/*
 * The round check / cross badge. A check or cross picked from the text (no tone passed) stays monochrome: a solid ink
 * circle for ✓, a hairline circle for ✕. An explicit tone="ok" / "refused" keeps the functional green / red, for app
 * states and the bot test only.
 */
const BADGE: Record<ChipTone, string> = {
  ok: "bg-ok text-white",
  refused: "bg-red text-white",
  saffron: "bg-saffron text-white",
  pink: "bg-ink text-white",
  sun: "bg-ink text-white",
  ink: "bg-ink text-white",
  muted: "bg-[#8f8f8f] text-white",
};
const BADGE_OUTLINE = "bg-white text-ink ring-1 ring-inset ring-ink/70";

/** "✓ Wallet stamped" → check + "Wallet stamped"; "✕ Bot refused" → cross + "Bot refused". Other text keeps a dot. */
function infer(children: ReactNode): { text: ReactNode; icon: ChipIcon | null } {
  if (typeof children !== "string") return { text: children, icon: null };
  const m = /^\s*([✓✔✕✗×])\s*/u.exec(children);
  if (!m) return { text: children, icon: null };
  const ok = m[1] === "✓" || m[1] === "✔";
  return { text: children.slice(m[0].length), icon: ok ? "check" : "cross" };
}

function Glyph({ icon }: { icon: "check" | "cross" }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" className="block size-3">
      {icon === "check" ? (
        <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M3.4 3.4l5.2 5.2M8.6 3.4l-5.2 5.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      )}
    </svg>
  );
}

/**
 * A small white pill with a soft shadow: an icon (check, cross or dot) and short text, like dopepay's "Sent $350".
 * Inline by default (also good as an eyebrow chip). With `at` it is absolutely placed: give the parent `relative`.
 * Text that starts with ✓ or ✕ picks its icon itself, so DESIGN_V2's lines can be pasted as they are.
 */
export function FloatChip({
  children,
  icon,
  tone,
  at,
  float = false,
  delayMs = 0,
  decorative = false,
  className,
}: {
  children: ReactNode;
  /** Default: inferred from a leading ✓ / ✕, else "dot". */
  icon?: ChipIcon;
  /**
   * Colour of the icon circle or dot. Dots draw in ink, saffron (the one highlight) or grey (muted). Default: an ink
   * dot; ✓ an ink circle, ✕ a hairline circle. tone="ok" / "refused" keep green / red badges for app states.
   */
  tone?: ChipTone;
  /** Absolute position inside a `relative` parent. */
  at?: ChipPosition;
  /** Bob gently (off under reduced motion). */
  float?: boolean;
  /** Offsets the float so several chips don't move in step. */
  delayMs?: number;
  /** Hide from screen readers when the chip only repeats nearby text. */
  decorative?: boolean;
  className?: string;
}) {
  const inferred = infer(children);
  const finalIcon: ChipIcon = icon ?? inferred.icon ?? "dot";
  const badge = tone ? BADGE[tone] : finalIcon === "cross" ? BADGE_OUTLINE : BADGE.ink;
  const style: CSSProperties | undefined =
    at || (float && delayMs)
      ? { ...(at ?? {}), ...(float && delayMs ? { animationDelay: `${delayMs}ms` } : {}) }
      : undefined;

  return (
    <span
      aria-hidden={decorative || undefined}
      style={style}
      className={cx(
        "inline-flex w-max max-w-full items-center gap-2 whitespace-nowrap rounded-full bg-white py-1.5 text-sm font-medium leading-5 text-ink shadow-float ring-1 ring-black/[0.04]",
        finalIcon === "check" || finalIcon === "cross" ? "pl-1.5 pr-3.5" : finalIcon === "dot" ? "pl-3 pr-3.5" : "px-3.5",
        at && "absolute z-10",
        float && "motion-safe:animate-float",
        className,
      )}
    >
      {(finalIcon === "check" || finalIcon === "cross") && (
        <span aria-hidden="true" className={cx("grid size-6 shrink-0 place-items-center rounded-full", badge)}>
          <Glyph icon={finalIcon} />
        </span>
      )}
      {finalIcon === "dot" && <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", DOT_BG[tone ?? "ink"])} />}
      <span className="min-w-0 truncate">{inferred.text}</span>
    </span>
  );
}
