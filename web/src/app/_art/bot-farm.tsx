import { useId } from "react";
import { cx } from "@/app/_site/cx";
import { LINE, Stroke, WALLET_PATHS } from "./line-icon";

/*
 * A bot farm, drawn calmly (STORY_V4): a field of identical wallet glyphs that fades out at the edges (there are always
 * more), a few marked with a red ✕ (refused, no stamp) and one with the saffron seal (allowed, stamped). No faces, no
 * cartoon robots. Two small labels explain the marks. Server-safe, no motion: the bot-test section owns any animation.
 */

const COLS = 10;
const ROWS = 6;
const CELL = 40;
const W = COLS * CELL;
const H = ROWS * CELL;
/** The wallet glyph is 24 units; it covers ~70% of a cell. */
const SCALE = 1.15;
const INSET = (CELL - 24 * SCALE) / 2;

type Spot = readonly [col: number, row: number];
/** The one stamped wallet, and the refused wallet that carries the "Refused" label. Same column, so the labels align. */
const ALLOWED: Spot = [4, 2];
const REFUSED_LABELLED: Spot = [4, 4];
const REFUSED: readonly Spot[] = [[2, 1], [7, 1], [1, 3], [8, 3], [1, 4], REFUSED_LABELLED];
/**
 * A label sits right of its wallet, and the rest of that row stays empty so no wallet peeks out from behind it. Five
 * cells hold the longer label ("Refused · no stamp", about 140px) down to a 280px-wide figure.
 */
const LANES: readonly Spot[] = [ALLOWED, REFUSED_LABELLED];

const isSpot = (c: number, r: number, s: Spot) => s[0] === c && s[1] === r;
const inLane = (c: number, r: number) => LANES.some(([lc, lr]) => lr === r && c > lc);

/** Glyph origin of a cell, in viewBox units. */
function origin([c, r]: Spot): { x: number; y: number } {
  return { x: c * CELL + INSET, y: r * CELL + INSET };
}

/** Where a label sits: just right of the cell, centred on it, as % of the box (so it tracks the scaled SVG). */
function labelAt([c, r]: Spot): { left: string; top: string } {
  return { left: `${(((c + 1) * CELL - INSET / 2) / W) * 100}%`, top: `${(((r + 0.5) * CELL) / H) * 100}%` };
}

export function BotFarm({ className }: { className?: string }) {
  const id = useId();
  const plain: Spot[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (isSpot(c, r, ALLOWED) || REFUSED.some((s) => isSpot(c, r, s)) || inLane(c, r)) continue;
      plain.push([c, r]);
    }
  }
  const allowed = origin(ALLOWED);

  return (
    <figure
      className={cx("relative m-0 w-full", className)}
      role="img"
      aria-label={`A bot farm: rows of identical wallets. ${REFUSED.length} shown refused for having no stamp, one stamped wallet allowed.`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full overflow-visible [mask-image:radial-gradient(ellipse_70%_75%_at_50%_50%,#000_55%,transparent_100%)]"
        aria-hidden="true"
        focusable="false"
        {...LINE}
      >
        <defs>
          <g id={id}>
            {WALLET_PATHS.map((d) => (
              <Stroke key={d} d={d} />
            ))}
          </g>
        </defs>

        {/* The farm: the same wallet over and over, quiet grey. */}
        <g className="text-ink" opacity={0.26}>
          {plain.map(([c, r]) => (
            <use key={`${c}-${r}`} href={`#${id}`} transform={`translate(${c * CELL + INSET} ${r * CELL + INSET}) scale(${SCALE})`} />
          ))}
        </g>

        {/* Refused: the wallet in red with a small ✕ badge on its corner. */}
        {REFUSED.map((s) => {
          const { x, y } = origin(s);
          return (
            <g key={`${s[0]}-${s[1]}`} className="text-red">
              <use href={`#${id}`} transform={`translate(${x} ${y}) scale(${SCALE})`} />
              <circle cx={x + 22 * SCALE} cy={y + 5 * SCALE} r={6} fill="var(--red)" stroke="var(--bg)" strokeWidth={2} />
              <Stroke
                d={`M${x + 22 * SCALE - 2.2} ${y + 5 * SCALE - 2.2}l4.4 4.4m0-4.4l-4.4 4.4`}
                className="stroke-white"
              />
            </g>
          );
        })}

        {/* Allowed: the one wallet backed by a real bank card, in ink, with the saffron seal. */}
        <g className="text-ink">
          <use href={`#${id}`} transform={`translate(${allowed.x} ${allowed.y}) scale(${SCALE})`} />
          <circle
            cx={allowed.x + 22 * SCALE}
            cy={allowed.y + 5 * SCALE}
            r={7}
            fill="var(--saffron)"
            stroke="var(--bg)"
            strokeWidth={2}
          />
          <Stroke
            d={`M${allowed.x + 22 * SCALE - 3} ${allowed.y + 5 * SCALE + 0.2}l2 2 3.8-4`}
            className="stroke-white"
          />
        </g>
      </svg>

      <FarmLabel at={labelAt(ALLOWED)} tone="allowed">
        Allowed · stamped
      </FarmLabel>
      <FarmLabel at={labelAt(REFUSED_LABELLED)} tone="refused">
        Refused · no stamp
      </FarmLabel>
    </figure>
  );
}

function FarmLabel({
  at,
  tone,
  children,
}: {
  at: { left: string; top: string };
  tone: "allowed" | "refused";
  children: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={at}
      className="absolute z-10 inline-flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-bg py-1 pl-1.5 pr-2.5 text-[11px] font-medium leading-none text-ink shadow-float sm:text-xs"
    >
      {tone === "allowed" ? (
        <span className="grid size-4 place-items-center rounded-full bg-saffron text-white">
          <svg viewBox="0 0 16 16" className="size-2.5" aria-hidden="true" focusable="false" {...LINE} strokeWidth={2}>
            <path d="M3.5 8.5l3 3 6-6.5" />
          </svg>
        </span>
      ) : (
        <span className="grid size-4 place-items-center rounded-full bg-red text-white">
          <svg viewBox="0 0 16 16" className="size-2.5" aria-hidden="true" focusable="false" {...LINE} strokeWidth={2}>
            <path d="M4.5 4.5l7 7m0-7l-7 7" />
          </svg>
        </span>
      )}
      {children}
    </span>
  );
}
