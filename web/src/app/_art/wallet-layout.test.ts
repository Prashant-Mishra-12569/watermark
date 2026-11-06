import { test } from "node:test";
import assert from "node:assert/strict";
import { GRID_H, GRID_W, MAX_WALLETS, walletCell, walletLayout } from "./wallet-layout.ts";

test("one wallet fills the box, centred", () => {
  const l = walletLayout(1);
  assert.deepEqual([l.cols, l.rows, l.cell], [1, 1, GRID_H]);
  assert.equal(l.x0, (GRID_W - GRID_H) / 2);
  assert.equal(l.y0, 0);
});

test("a thousand wallets make an exact 40 x 25 grid", () => {
  const l = walletLayout(1000);
  assert.deepEqual([l.cols, l.rows, l.cell], [40, 25, 12]);
});

test("every wallet stays inside the box for any count", () => {
  for (const n of [2, 3, 7, 10, 64, 99, 250, 333, 999, 1000]) {
    const l = walletLayout(n);
    assert.ok(l.cols * l.rows >= n, `room for ${n}`);
    const last = walletCell(l, n - 1);
    assert.ok(last.x >= 0 && last.x + l.cell <= GRID_W + 1e-9, `x in box for ${n}`);
    assert.ok(last.y >= 0 && last.y + l.cell <= GRID_H + 1e-9, `y in box for ${n}`);
  }
});

test("bad counts are safe", () => {
  assert.equal(walletLayout(0).count, 0);
  assert.equal(walletLayout(-5).count, 0);
  assert.equal(walletLayout(Number.NaN).count, 0);
  assert.equal(walletLayout(2.9).count, 2);
  assert.equal(walletLayout(1e9).count, MAX_WALLETS);
});
