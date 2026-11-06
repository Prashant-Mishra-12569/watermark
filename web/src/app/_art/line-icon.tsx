import type { ReactNode } from "react";
import { cx } from "@/app/_site/cx";

/*
 * The line-art icon set (STORY_V4 "The line-art set"). Every glyph is drawn on a 24-unit grid with a 1.5px stroke
 * that stays 1.5px at any size (vector-effect: non-scaling-stroke), round caps and round joins, in currentColor.
 * The only colour is the saffron imprint under "stamp": that line is the stamp, so the accent means something there.
 */

export const LINE_ICON_NAMES = [
  "card",
  "phone",
  "tap",
  "stamp",
  "lock",
  "code",
  "agent",
  "shield",
  "coin",
  "ticket",
  "check",
  "cross",
  "receipt",
  "building",
  "wallet",
] as const;

export type LineIconName = (typeof LINE_ICON_NAMES)[number];

/** Shared stroke attributes for every line-art piece (spread on an <svg> or <g>). */
export const LINE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** One stroked path that keeps its 1.5px width however the drawing is scaled. */
export function Stroke({ d, className }: { d: string; className?: string }) {
  return <path d={d} vectorEffect="non-scaling-stroke" className={className} />;
}

/** The wallet glyph (24 grid): body, a card tucked behind it, the clasp and its stud. WalletGrid and BotFarm reuse it. */
export const WALLET_PATHS = [
  "M5.5 7h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z",
  "M6.75 7l9-2.6a1.25 1.25 0 0 1 1.55.85L17.85 7",
  "M20.5 11.25h-3.75a2.25 2.25 0 0 0 0 4.5h3.75",
  "M16.9 13.5h.01",
] as const;

/** The same wallet with only body and clasp, for very dense grids where the small parts would blur. */
export const WALLET_PATHS_SIMPLE = [WALLET_PATHS[0], "M20.5 11.25h-3.75a2.25 2.25 0 0 0 0 4.5h3.75"] as const;

const ICONS: Record<LineIconName, readonly string[]> = {
  card: [
    "M4.75 5.5h14.5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4.75a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z",
    "M6.25 9.25h3.5v2.75h-3.5z",
    "M6.25 15h3",
    "M11.25 15h2",
  ],
  phone: [
    "M8 2.75h8a2 2 0 0 1 2 2v14.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2z",
    "M10.75 5.5h2.5",
    "M11 18.25h2",
  ],
  tap: [
    "M4.5 10.5h9a1.75 1.75 0 0 1 1.75 1.75v5.5a1.75 1.75 0 0 1-1.75 1.75h-9a1.75 1.75 0 0 1-1.75-1.75v-5.5a1.75 1.75 0 0 1 1.75-1.75z",
    "M5.75 16.5h2.5",
    "M15 5.75a3.25 3.25 0 0 1 3.25 3.25",
    "M15 2.25a6.75 6.75 0 0 1 6.75 6.75",
  ],
  stamp: [
    "M9.75 5.25a2.25 2.25 0 1 0 4.5 0a2.25 2.25 0 1 0-4.5 0",
    "M10.6 7.2 10.1 11.5",
    "M13.4 7.2l.5 4.3",
    "M5.5 11.5h13a1.5 1.5 0 0 1 1.5 1.5v2.5H4V13a1.5 1.5 0 0 1 1.5-1.5z",
    "M5.25 15.5v1.75h13.5V15.5",
  ],
  lock: [
    "M7 10.5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z",
    "M8 10.5v-3a4 4 0 0 1 8 0v3",
    "M12 14.5v2",
  ],
  code: ["M8 7.5 3.5 12 8 16.5", "M16 7.5l4.5 4.5-4.5 4.5", "M13.5 5.5l-3 13"],
  agent: [
    "M5.5 4h13a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H11l-4.5 3.5V17h-1a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M12 6.75c.4 2 1.4 3 3.4 3.75-2 .75-3 1.75-3.4 3.75-.4-2-1.4-3-3.4-3.75 2-.75 3-1.75 3.4-3.75z",
  ],
  shield: [
    "M12 3.25 19 5.75v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5v-5.5z",
    "M9 12.25l2.1 2.1 4-4.1",
  ],
  // A dollar coin (USDT is a dollar token): reads as "fee" or "payment" at a glance.
  coin: [
    "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0",
    "M14.6 9.4c-.45-.95-1.45-1.55-2.6-1.55c-1.45 0-2.6.8-2.6 1.95c0 2.75 5.3 1.45 5.3 4.25c0 1.2-1.2 2.05-2.7 2.05c-1.25 0-2.3-.6-2.75-1.55",
    "M12 6.5v1.35",
    "M12 16.1v1.4",
  ],
  ticket: [
    "M4.5 6.5h15A1.5 1.5 0 0 1 21 8v2.25a1.75 1.75 0 0 0 0 3.5V16a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16v-2.25a1.75 1.75 0 0 0 0-3.5V8a1.5 1.5 0 0 1 1.5-1.5z",
    "M15 8.75v1",
    "M15 11.5v1",
    "M15 14.25v1",
  ],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  cross: ["M6.5 6.5l11 11", "M17.5 6.5l-11 11"],
  receipt: [
    "M6 3.25h12v17.5l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25-2 1.25z",
    "M9 8h6",
    "M9 11.5h6",
    "M9 15h3.5",
  ],
  building: [
    "M3.5 20.5h17",
    "M5.5 20.5V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15.5",
    "M15.5 9.5h2a1 1 0 0 1 1 1v10",
    "M8.25 7.5h1",
    "M11.75 7.5h1",
    "M8.25 11h1",
    "M11.75 11h1",
    "M8.25 14.5h1",
    "M11.75 14.5h1",
    "M9.25 20.5v-3h2.5v3",
  ],
  wallet: WALLET_PATHS,
};

/** The saffron extra a glyph carries, if any. */
const ACCENTS: Partial<Record<LineIconName, ReactNode>> = {
  stamp: <Stroke d="M5.25 20.5h13.5" className="stroke-saffron" />,
};

export type LineIconProps = {
  name: LineIconName;
  /** Rendered width and height in CSS px (default 24). */
  size?: number;
  className?: string;
  /** Makes the icon an image with this name. Without it the icon is decorative (aria-hidden). */
  title?: string;
};

/** A single line icon in the Watermark line-art style. */
export function LineIcon({ name, size = 24, className, title }: LineIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cx("inline-block shrink-0 overflow-visible", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...LINE}
    >
      {ICONS[name].map((d) => (
        <Stroke key={d} d={d} />
      ))}
      {ACCENTS[name]}
    </svg>
  );
}
