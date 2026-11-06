import { useId } from "react";
import { cx } from "@/app/_site/cx";
import { LINE, Stroke, WALLET_PATHS, WALLET_PATHS_SIMPLE } from "./line-icon";
import { GRID_H, GRID_W, walletCell, walletLayout } from "./wallet-layout.ts";

/** How much of its cell a wallet covers. */
const FILL = 0.72;

/**
 * n identical wallet glyphs in one box (STORY_V4: "1 → 1,000 wallets"). With `stamped` (a 0-based index), that one
 * wallet is drawn in saffron with a small seal: the one backed by a bank card among many free ones. The box keeps its 8:5 shape for every count,
 * so as n grows the wallets multiply and shrink: one big wallet becomes a fine 40 x 25 texture at 1,000. Strokes stay
 * 1.5px while the wallets are big and thin out (down to 0.75px) in dense grids, where the small parts drop away. Server-safe; a
 * client parent can drive `count` from scroll.
 */
export function WalletGrid({ count, stamped, className }: { count: number; stamped?: number; className?: string }) {
  const id = useId();
  const layout = walletLayout(count);
  const scale = (layout.cell * FILL) / 24;
  const inset = (layout.cell - 24 * scale) / 2;
  const dense = layout.cell < 20;
  // Thinner lines as the grid gets denser, so 1,000 wallets read as a fine texture rather than a dark block.
  const strokeWidth = layout.cell >= 40 ? 1.5 : layout.cell >= 24 ? 1.25 : layout.cell >= 15 ? 1 : 0.75;
  const mark = stamped !== undefined && Number.isInteger(stamped) && stamped >= 0 && stamped < layout.count ? stamped : null;
  const plural = layout.count === 1 ? "wallet" : "wallets";
  const label =
    mark === null
      ? `${layout.count.toLocaleString("en-US")} identical ${plural}`
      : `${layout.count.toLocaleString("en-US")} ${plural}, one of them stamped`;
  const seal = (i: number) => {
    const { x, y } = walletCell(layout, i);
    const r = layout.cell * 0.15;
    return { x, y, r, cx: x + inset + 24 * scale * 0.9, cy: y + inset + 24 * scale * 0.2 };
  };

  return (
    <svg
      viewBox={`0 0 ${GRID_W} ${GRID_H}`}
      className={cx("block h-auto w-full", className)}
      role="img"
      aria-label={label}
      focusable="false"
      {...LINE}
      strokeWidth={strokeWidth}
    >
      <defs>
        <g id={id}>
          {(dense ? WALLET_PATHS_SIMPLE : WALLET_PATHS).map((d) => (
            <Stroke key={d} d={d} />
          ))}
        </g>
      </defs>
      {Array.from({ length: layout.count }, (_, i) => {
        if (i === mark) return null;
        const { x, y } = walletCell(layout, i);
        return (
          <use
            key={i}
            href={`#${id}`}
            transform={`translate(${round(x + inset)} ${round(y + inset)}) scale(${round(scale)})`}
          />
        );
      })}
      {mark !== null &&
        (() => {
          const s = seal(mark);
          return (
            <g className="text-saffron">
              <use href={`#${id}`} transform={`translate(${round(s.x + inset)} ${round(s.y + inset)}) scale(${round(scale)})`} />
              <circle cx={round(s.cx)} cy={round(s.cy)} r={round(s.r)} fill="currentColor" stroke="none" />
              <path
                d={`M${round(s.cx - s.r * 0.45)} ${round(s.cy + s.r * 0.02)}l${round(s.r * 0.3)} ${round(s.r * 0.32)}l${round(s.r * 0.6)} ${round(-s.r * 0.62)}`}
                stroke="#fff"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })()}
    </svg>
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
