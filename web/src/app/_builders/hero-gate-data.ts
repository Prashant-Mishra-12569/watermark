/**
 * The hero's "claim gate" (hero-gate.tsx): the words, the example wallets and the NFT it shows. A pure module so
 * hero-gate.test.ts can check them. The wallets are made up and the panel says "Example": bots come in and get
 * refused, one wallet backed by a real bank card claims the Genesis Drop stamp.
 */

export interface GateClaim {
  wallet: string;
  stamped: boolean;
}

/** In the order they arrive. Three bots, then the one stamped wallet: the last row is the one that gets in. */
export const GATE_CLAIMS: readonly GateClaim[] = [
  { wallet: "0x9c1e…41ab", stamped: false },
  { wallet: "0x4d07…e2f0", stamped: false },
  { wallet: "0x71aa…09c3", stamped: false },
  { wallet: "0xb3f2…7d15", stamped: true },
];

/** Our own art for the Genesis Drop (web/public/assets/stamps), shown as a static file. */
export const GATE_STAMP = {
  src: "/assets/stamps/stamp-042.svg",
  width: 600,
  height: 760,
  edition: "042",
  of: 100,
} as const;

export const GATE = {
  title: "Who gets in",
  example: "Example",
  rule: "Only wallets with a stamp get through.",
  refused: "Refused · no stamp",
  claimed: `Claimed #${GATE_STAMP.edition} · stamped wallet`,
  stampAlt: `Genesis Drop stamp #${GATE_STAMP.edition} of ${GATE_STAMP.of}: a Mumbai postage stamp of the Bandra–Worli Sea Link`,
  /** For screen readers: the whole example in one line (the animation is decoration). */
  summary: `Example: three wallets with no stamp are refused. One stamped wallet claims Genesis Drop stamp #${GATE_STAMP.edition}.`,
} as const;

/** One loop of the example, in ms (hero-gate.module.css keeps the same number in --gate-cycle). */
export const GATE_CYCLE_MS = 6000;
