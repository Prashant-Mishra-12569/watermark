/*
 * Grid maths for WalletGrid (pure, so node --test can check it). n wallets fill a W x H box with square cells:
 * one wallet is drawn big in the middle, a thousand become a fine 40 x 25 texture, and every count in between keeps
 * the same box. The grid is centred; a last, partly filled row starts from the left like text.
 */

export const GRID_W = 480;
export const GRID_H = 300;
/** Counts above this are clamped, so a bad prop can never render tens of thousands of nodes. */
export const MAX_WALLETS = 2000;

export type WalletLayout = {
  count: number;
  cols: number;
  rows: number;
  /** Cell edge in viewBox units. */
  cell: number;
  /** Top-left corner of the grid inside the box. */
  x0: number;
  y0: number;
};

export function walletLayout(count: number, w = GRID_W, h = GRID_H): WalletLayout {
  const n = Number.isFinite(count) ? Math.min(MAX_WALLETS, Math.max(0, Math.floor(count))) : 0;
  if (n === 0) return { count: 0, cols: 0, rows: 0, cell: 0, x0: w / 2, y0: h / 2 };
  let best = { cols: 1, rows: n, cell: 0 };
  // Try every column count near the box's shape and keep the one with the biggest cells.
  const guess = Math.ceil(Math.sqrt((n * w) / h));
  for (let cols = Math.max(1, guess - 2); cols <= Math.min(n, guess + 2); cols++) {
    const rows = Math.ceil(n / cols);
    const cell = Math.min(w / cols, h / rows);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  const { cols, rows, cell } = best;
  return { count: n, cols, rows, cell, x0: (w - cols * cell) / 2, y0: (h - rows * cell) / 2 };
}

/** Top-left corner of wallet i (0-based), in viewBox units. */
export function walletCell(layout: WalletLayout, i: number): { x: number; y: number } {
  const col = i % layout.cols;
  const row = Math.floor(i / layout.cols);
  return { x: layout.x0 + col * layout.cell, y: layout.y0 + row * layout.cell };
}
