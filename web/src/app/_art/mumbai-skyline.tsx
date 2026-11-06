"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cx } from "@/app/_site/cx";
import { LINE } from "./line-icon";
import styles from "./mumbai-skyline.module.css";

/*
 * Mumbai in one line (STORY_V4 "The line-art set"): our own drawing, not traced from anything. Left to right: the
 * Nariman Point towers, the University library and the Rajabai clock tower, Fort's low buildings, the Taj Mahal Palace
 * with its dome, the Gateway of India (arch and four turrets) on its plinth, the Bandra–Worli Sea Link's two
 * cable-stayed pylons, the Worli towers, a few palms, and the sea with a ferry and a fishing boat. Black strokes with
 * ONE saffron detail (SITE_FINAL "Look"): the sun over the Sea Link.
 *
 * Wide: the whole 5:1 drawing from 640px. On phones it runs edge to edge and is cropped to the landmarks (x 430 to
 * 1430: the clock tower, the Taj, the Gateway, the sun and both Sea Link pylons), so they stay big enough to read
 * (about 120px tall at 390px). Strokes are 1.5px at every size. With `draw`, it draws itself (stroke-dashoffset, landmark by landmark): "view" (or true)
 * the first time it scrolls into view, left drawn when it is already on screen at load (the footer); "load" as soon
 * as it is on screen, page load included, in about 2.5 s (the hero). Under prefers-reduced-motion it is simply drawn.
 */

const W = 1600;
const H = 320;
/** The waterline everything stands on. */
const G = 262;
const DRAW_MS = 1700;

// ---------------------------------------------------------------------------------------------------- path helpers

const n = (v: number) => Math.round(v * 100) / 100;
const hl = (x0: number, x1: number, y: number) => `M${n(x0)} ${n(y)}H${n(x1)}`;
const vl = (x: number, y0: number, y1: number) => `M${n(x)} ${n(y0)}V${n(y1)}`;
/** A block standing on the waterline: up the left wall, across the roof, down the right wall. */
const block = (x0: number, x1: number, top: number, base = G) => `M${n(x0)} ${base}V${n(top)}H${n(x1)}V${base}`;
const circle = (cx: number, cy: number, r: number) =>
  `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0`;
/** A pointed (Gothic / Indo-Saracenic) opening standing on `base`: walls up to `spring`, two curves to the apex. */
const arch = (x: number, w: number, base: number, spring: number, apex: number, closed = false) => {
  const k = apex + (spring - apex) * 0.3;
  const c = x + w / 2;
  return `M${n(x)} ${n(base)}V${n(spring)}Q${n(x)} ${n(k)} ${n(c)} ${n(apex)}Q${n(x + w)} ${n(k)} ${n(x + w)} ${n(spring)}V${n(base)}${closed ? "Z" : ""}`;
};
/** A dome from its base line to a pointed apex (Indo-Saracenic onion profile). */
const dome = (cx: number, w: number, base: number, apex: number) => {
  const h = base - apex;
  const l = cx - w / 2;
  const r = cx + w / 2;
  return `M${n(l)} ${n(base)}C${n(l)} ${n(base - h * 0.55)} ${n(cx - w * 0.12)} ${n(apex + h * 0.22)} ${n(cx)} ${n(apex)}C${n(cx + w * 0.12)} ${n(apex + h * 0.22)} ${n(r)} ${n(base - h * 0.55)} ${n(r)} ${n(base)}`;
};
/** A slim Gothic pinnacle standing on `base`. */
const pinnacle = (cx: number, base: number, h = 12, w = 4) =>
  `M${n(cx - w / 2)} ${n(base)}V${n(base - h * 0.55)}L${n(cx)} ${n(base - h)}L${n(cx + w / 2)} ${n(base - h * 0.55)}V${n(base)}`;
const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to + 1e-9 : v >= to - 1e-9; v += step) out.push(v);
  return out;
};

/** A modern tower with a little detail, for the background clusters. */
function tower(x0: number, x1: number, top: number, kind: "floors" | "split" | "crown" | "tank" | "slant"): string[] {
  const out: string[] = [];
  if (kind === "crown") {
    const inset = (x1 - x0) * 0.2;
    const step = top + 18;
    out.push(`M${x0} ${G}V${step}H${x0 + inset}V${top}H${x1 - inset}V${step}H${x1}V${G}`);
    out.push(vl((x0 + x1) / 2, top, top - 22));
    out.push(...range(step + 14, G - 12, 16).map((y) => hl(x0 + 5, x1 - 5, y)));
    return out;
  }
  if (kind === "slant") {
    out.push(`M${x0} ${G}V${top + 22}L${x1} ${top}V${G}`);
    out.push(vl(x1 - 4, top + 1, top - 14));
    out.push(vl(x0 + (x1 - x0) / 3, top + 22 + (x1 - x0) / 3 * (-22 / (x1 - x0)) + 6, G));
    out.push(vl(x0 + ((x1 - x0) * 2) / 3, top + 22 - 22 * (2 / 3) + 6, G));
    return out;
  }
  out.push(block(x0, x1, top));
  if (kind === "split") {
    out.push(vl((x0 + x1) / 2, top + 8, G));
  } else {
    if (kind === "tank") {
      const c = (x0 + x1) / 2;
      out.push(`M${c - 7} ${top}V${top - 8}H${c + 7}V${top}`);
    }
    out.push(...range(top + 12, G - 12, 14).map((y) => hl(x0 + 5, x1 - 5, y)));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------- layers

/** `accent`: saffron instead of ink. `fill`: a filled shape (it fades in instead of being drawn). */
type Layer = { key: string; delay: number; opacity?: number; accent?: boolean; fill?: boolean; paths: readonly string[] };

/** Nariman Point / Cuffe Parade towers (background). */
const LEFT_TOWERS: string[] = [
  ...tower(16, 44, 230, "floors"),
  ...tower(44, 78, 194, "floors"),
  ...tower(78, 100, 150, "split"),
  ...tower(100, 140, 122, "crown"),
  ...tower(140, 168, 178, "floors"),
  ...tower(168, 198, 100, "split"),
  ...tower(198, 232, 138, "floors"),
  ...tower(232, 262, 170, "tank"),
  ...tower(262, 302, 202, "floors"),
  ...tower(302, 342, 226, "floors"),
];

/** Worli towers at the far end of the Sea Link (background). */
const RIGHT_TOWERS: string[] = [
  ...tower(1494, 1516, 178, "floors"),
  ...tower(1516, 1546, 78, "slant"),
  ...tower(1546, 1566, 130, "split"),
  ...tower(1566, 1586, 186, "floors"),
];

/** A low Fort-era building with a pediment, between the clock tower and the Taj (background). */
const FORT: string[] = [
  block(492, 580, 224),
  hl(488, 584, 224),
  `M520 224L536 210L552 224`,
  vl(536, 210, 203),
  ...range(500, 520, 10).map((x) => vl(x, 234, 244)),
  ...range(552, 572, 10).map((x) => vl(x, 234, 244)),
  arch(530, 12, G, 248, 240),
];

/** The University library and the Rajabai clock tower (cx 460). */
const RAJABAI: string[] = [
  // Library: walls, eaves, hipped roof, a dormer gable, a row of lancet windows.
  vl(352, G, 216),
  hl(348, 442, 216),
  `M352 216L363 200H431L442 216`,
  `M388 200L397 190L406 200`,
  ...range(361, 433, 12).map((c) => arch(c - 3.5, 7, 252, 236, 229, true)),
  // Stage 1: base with corner buttresses, pointed door and a rose window.
  vl(442, G, 208),
  vl(478, G, 208),
  vl(447, G, 212),
  vl(473, G, 212),
  hl(439, 481, 208),
  arch(453, 14, G, 246, 236),
  circle(460, 224, 4),
  pinnacle(442.5, 208, 14, 5),
  pinnacle(477.5, 208, 14, 5),
  // Stage 2: shaft with two tall lancets.
  vl(446, 208, 150),
  vl(474, 208, 150),
  hl(443, 477, 150),
  arch(451, 7, 198, 176, 168, true),
  arch(462, 7, 198, 176, 168, true),
  pinnacle(446, 150, 12, 4),
  pinnacle(474, 150, 12, 4),
  // Stage 3: the clock.
  vl(449, 150, 118),
  vl(471, 150, 118),
  hl(446, 474, 118),
  circle(460, 134, 7.5),
  `M460 134V129.5`,
  `M460 134L463.2 135.6`,
  // Stage 4: octagonal lantern with corner pinnacles.
  vl(451, 118, 94),
  vl(469, 118, 94),
  vl(456, 115, 97),
  vl(464, 115, 97),
  hl(449, 471, 94),
  pinnacle(451.5, 94, 11, 4),
  pinnacle(468.5, 94, 11, 4),
  // Spire and finial.
  `M453 94Q456.5 68 460 46Q463.5 68 467 94`,
  vl(460, 46, 37),
];

/** The Taj Mahal Palace (cx 692): corner towers, the big ribbed dome with its lantern, chhatris, arcades. */
const TAJ: string[] = [
  // Corner towers with their domes.
  vl(600, G, 172),
  hl(597, 629, 172),
  vl(626, 172, 184),
  dome(613, 22, 172, 150),
  vl(613, 150, 143),
  vl(784, G, 172),
  hl(755, 787, 172),
  vl(758, 172, 184),
  dome(771, 22, 172, 150),
  vl(771, 150, 143),
  // Roof line, chhatris, the central block and drum.
  hl(626, 668, 184),
  hl(716, 758, 184),
  dome(646, 12, 184, 172),
  vl(646, 172, 167),
  dome(738, 12, 184, 172),
  vl(738, 172, 167),
  `M668 184V158H716V184`,
  `M674 158V150H710V158`,
  // The dome, two ribs, the lantern and finial.
  dome(692, 36, 150, 106),
  `M692 106C687.5 118 685.5 134 686 150`,
  `M692 106C696.5 118 698.5 134 698 150`,
  `M689.5 106V100H694.5V106`,
  `M688.5 100Q692 93 695.5 100`,
  vl(692, 95.5, 88),
  arch(686, 12, 180, 168, 162, true),
  // Floors: two string courses, two rows of windows, the ground-floor arcade.
  hl(600, 784, 204),
  hl(600, 784, 228),
  ...range(608, 776, 14).map((x) => vl(x, 190, 198)),
  ...range(608, 776, 14).map((x) => vl(x, 212, 221)),
  ...range(620, 764, 24).map((c) => arch(c - 6, 12, G, 246, 238)),
];

/** The Gateway of India (cx 900): plinth, side wings, the great arch in its frame, niches and four turrets. */
const GATEWAY: string[] = [
  `M804 ${G}V256H996V${G}`,
  // Side wings with their arches, parapets and pinnacles.
  vl(814, 256, 191),
  hl(809, 852, 198),
  hl(814, 852, 191),
  pinnacle(814, 191, 11, 4),
  arch(822, 22, 256, 228, 212),
  vl(986, 256, 191),
  hl(948, 991, 198),
  hl(948, 986, 191),
  pinnacle(986, 191, 11, 4),
  arch(956, 22, 256, 228, 212),
  // Central block: walls run up into the outer turrets; cornice, frieze, parapet.
  vl(852, 256, 128),
  vl(948, 256, 128),
  hl(846, 954, 158),
  hl(852, 948, 164),
  hl(852, 948, 148),
  // The great arch: its frame, the opening and the inner recess.
  `M868 256V172H932V256`,
  `M876 256V206A30 30 0 0 1 900 178A30 30 0 0 1 924 206V256`,
  `M884 256V210A24 24 0 0 1 900 190A24 24 0 0 1 916 210V256`,
  // Niches either side of the arch.
  arch(856, 8, 244, 228, 221, true),
  arch(856, 8, 204, 190, 183, true),
  arch(936, 8, 244, 228, 221, true),
  arch(936, 8, 204, 190, 183, true),
  // Four turrets: two at the corners, two over the arch.
  vl(864, 148, 128),
  hl(849, 867, 128),
  dome(858, 12, 128, 112),
  vl(858, 112, 105),
  vl(936, 148, 128),
  hl(933, 951, 128),
  dome(942, 12, 128, 112),
  vl(942, 112, 105),
  vl(879, 148, 134),
  vl(889, 148, 134),
  hl(876.5, 891.5, 134),
  dome(884, 10, 134, 121),
  vl(884, 121, 115),
  vl(911, 148, 134),
  vl(921, 148, 134),
  hl(908.5, 923.5, 134),
  dome(916, 10, 134, 121),
  vl(916, 121, 115),
];

/** Bandra–Worli Sea Link: the deck, its piers and the two inverted-Y pylons (cables are their own layer). */
const SEALINK: string[] = [
  `M1016 ${G}Q1028 234 1056 232H1494`,
  `M1030 ${G}Q1040 239 1062 238H1494`,
  ...[1068, 1104, 1140, 1224, 1260, 1296, 1340, 1440, 1470].map((x) => vl(x, 238, G)),
  // Main pylon (cx 1180): splayed legs, the opening between them, the shaft and its cap.
  `M1164 ${G}L1176 152L1177.5 80L1180 74L1182.5 80L1184 152L1196 ${G}`,
  `M1171 ${G}L1180 176L1189 ${G}`,
  // Second pylon (cx 1390).
  `M1378 ${G}L1386.5 186L1387.5 140L1390 135L1392.5 140L1393.5 186L1402 ${G}`,
  `M1384 ${G}L1390 204L1396 ${G}`,
];

/** Fan cables: the highest anchor runs to the farthest deck point. */
function fan(cx: number, half: number, anchors: number[], reach: number[]): string[] {
  return anchors.flatMap((y, i) => {
    const d = reach[i] ?? 0;
    return [`M${n(cx - half)} ${y}L${n(cx - d)} 232`, `M${n(cx + half)} ${y}L${n(cx + d)} 232`];
  });
}
const CABLES: string[] = [
  ...fan(1180, 3, range(86, 135, 7), [122, 108, 94, 80, 66, 52, 38, 24]),
  ...fan(1390, 2.5, range(146, 174, 7), [64, 52, 40, 28, 16]),
];

/**
 * A coconut palm standing on the waterline: a gently curved trunk and six fronds drooping from the crown. `lean`
 * moves the crown sideways.
 */
function palm(x: number, h: number, lean: number): string[] {
  const tx = x + lean;
  const ty = G - h;
  const frond = (cx: number, cy: number, ex: number, ey: number) =>
    `M${n(tx)} ${n(ty)}Q${n(tx + cx)} ${n(ty + cy)} ${n(tx + ex)} ${n(ty + ey)}`;
  return [
    `M${n(x)} ${G}Q${n(x + lean * 0.12)} ${n(G - h * 0.6)} ${n(tx)} ${n(ty)}`,
    frond(-12, -10, -26, 7),
    frond(-9, -14, -21, -5),
    frond(-3, -15, -10, -15),
    frond(12, -10, 26, 7),
    frond(9, -14, 21, -5),
    frond(3, -15, 10, -15),
  ];
}

/** Palms: a pair beside the University library, one between the Gateway and the Sea Link. */
const PALMS: string[] = [...palm(314, 50, -6), ...palm(340, 64, -12), ...palm(1006, 64, 16)];

/** The sun over the harbour, between the Gateway and the Sea Link: the drawing's one saffron detail, a small disc. */
const SUN: string[] = [circle(1088, 116, 16)];

/**
 * Boats: a harbour ferry off the Gateway (hull, two decks with a row of windows, a funnel) and a lateen-sail fishing
 * boat under the Sea Link (round-bottomed hull, mast, the sail). Big enough to read as boats on a phone.
 */
const BOATS: string[] = [
  `M674 284H766L757 296H683Z`,
  `M690 284V274H750V284`,
  `M700 274V266H738V274`,
  `M727 266V258H734V266`,
  ...range(699, 743, 11).map((x) => vl(x, 277.5, 280.5)),
  `M1224 298H1297Q1292 310 1281 311.5H1243Q1231 310 1224 298Z`,
  vl(1262, 298, 264),
  `M1235 282L1292 258L1275.5 295Z`,
];

/** The sea: broken ripple lines, quieter than the city. */
const RIPPLES: string[] = [
  ...(
    [
      [274, [[40, 110], [300, 360], [430, 520], [560, 640], [790, 860], [960, 1010], [1060, 1150], [1330, 1400], [1500, 1570]]],
      [288, [[100, 190], [240, 330], [470, 540], [600, 660], [780, 880], [920, 990], [1100, 1200], [1320, 1380], [1430, 1520]]],
      [302, [[20, 90], [180, 260], [380, 470], [520, 600], [660, 760], [840, 900], [990, 1100], [1160, 1220], [1340, 1440], [1520, 1590]]],
      [316, [[120, 200], [430, 500], [700, 790], [1010, 1080], [1300, 1360]]],
    ] as const
  ).flatMap(([y, spans]) => spans.map(([a, b]) => hl(a, b, y))),
  hl(882, 918, 270),
];

const LAYERS: readonly Layer[] = [
  { key: "ground", delay: 0, paths: [hl(0, W, G)] },
  { key: "left", delay: 150, opacity: 0.42, paths: LEFT_TOWERS },
  { key: "sea", delay: 300, opacity: 0.38, paths: RIPPLES },
  { key: "rajabai", delay: 300, paths: RAJABAI },
  { key: "fort", delay: 450, opacity: 0.42, paths: FORT },
  { key: "taj", delay: 550, paths: TAJ },
  { key: "gateway", delay: 750, paths: GATEWAY },
  { key: "sealink", delay: 950, paths: SEALINK },
  { key: "right", delay: 1100, opacity: 0.42, paths: RIGHT_TOWERS },
  { key: "cables", delay: 1200, opacity: 0.6, paths: CABLES },
  { key: "palms", delay: 1000, paths: PALMS },
  { key: "boats", delay: 1400, paths: BOATS },
  { key: "sun", delay: 1300, accent: true, fill: true, paths: SUN },
];
const TOTAL_MS = Math.max(...LAYERS.map((l) => l.delay)) + DRAW_MS;
/** "load" runs the same schedule faster: about 2.5 s from the first stroke to the last. */
const LOAD_SPEED = 0.8;

// -------------------------------------------------------------------------------------------------------- component

/**
 * "static": drawn, strokes pinned to 1.5px by vector-effect (no JS needed, the SSR state).
 * "pending": "load" mode's SSR state: drawn like "static" but hidden (CSS, motion allowed only) until the script
 * takes over, so the drawing never shows, vanishes and redraws. If the script never runs it fades in after 2.5 s.
 * "armed": blank, waiting to be on screen. "drawing": the dash offsets run to 0.
 * Chrome ignores pathLength when vector-effect is on, so while armed or drawing the stroke width is computed from the
 * rendered size instead; both give 1.5px on screen.
 */
type Phase = "static" | "pending" | "armed" | "drawing";

function layerStyle(phase: Phase, delay: number, speed: number, fill = false): CSSProperties | undefined {
  if (phase === "static" || phase === "pending") return undefined;
  if (fill)
    return {
      opacity: phase === "armed" ? 0 : 1,
      transition: phase === "drawing" ? `opacity 700ms ease ${Math.round(delay * speed)}ms` : "none",
    };
  return {
    // One dash the length of the path, then a longer gap. Armed at 1.02 the path sits just inside the gap (hidden, round
    // caps included); the offset then runs to 0 and the dash draws in from the path's start with no dead time.
    strokeDasharray: "1 2",
    strokeDashoffset: phase === "armed" ? 1.02 : 0,
    transition:
      phase === "drawing"
        ? `stroke-dashoffset ${Math.round(DRAW_MS * speed)}ms cubic-bezier(0.45, 0, 0.2, 1) ${Math.round(delay * speed)}ms`
        : "none",
  };
}

export type MumbaiSkylineProps = {
  /**
   * Draw itself. true or "view": the first time it scrolls into view (left drawn if it is on screen at load).
   * "load": as soon as it is on screen, page load included, in about 2.5 s.
   */
  draw?: boolean | "view" | "load";
  /** A repeat of a drawing labelled elsewhere on the page: hidden from screen readers. */
  decorative?: boolean;
  className?: string;
};

export function MumbaiSkyline({ draw = false, decorative = false, className }: MumbaiSkylineProps) {
  const onLoad = draw === "load";
  const speed = onLoad ? LOAD_SPEED : 1;
  const ref = useRef<SVGSVGElement>(null);
  const [phase, setPhase] = useState<Phase>(onLoad ? "pending" : "static");
  const [width, setWidth] = useState(1.5);

  useEffect(() => {
    const el = ref.current;
    if (!draw || !el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("static");
      return;
    }
    const box = el.getBoundingClientRect();
    // "view", already on screen at load: leave it drawn rather than blank it in front of the reader.
    if (!onLoad && box.bottom > 0 && box.top < window.innerHeight) return;

    const measure = () => {
      const b = el.getBoundingClientRect();
      const scale = Math.min(b.width / W, b.height / H); // 5:1 box, so both are equal
      if (scale > 0) setWidth(1.5 / scale);
    };
    measure();
    setPhase("armed");

    let frame = 0;
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        measure();
        frame = requestAnimationFrame(() => setPhase("drawing"));
        timer = window.setTimeout(() => setPhase("static"), Math.round(TOTAL_MS * speed) + 150);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [draw, onLoad, speed]);

  const pinned = phase === "static" || phase === "pending";
  // Phones: a 25:8 window on the drawing's x 430..1430 (the SVG is 160% wide, shifted left by 43% of the window, so
  // (Team request: the WHOLE drawing at every width, phones included; no crop.)
  return (
    <div className={cx("relative", className)}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax meet"
        className={cx(
          "block aspect-[5/1] h-auto w-full max-w-full",
          phase === "pending" && styles.pending,
        )}
        {...(decorative
          ? { "aria-hidden": true }
          : {
              role: "img",
              "aria-label":
                "Line drawing of Mumbai: the Rajabai clock tower, the Taj Mahal Palace, the Gateway of India, palms and the Bandra–Worli Sea Link by the sea, under a saffron sun.",
            })}
        focusable="false"
        {...LINE}
        strokeWidth={pinned ? 1.5 : width}
        data-phase={phase}
      >
        {LAYERS.map((layer) => (
          <g
            key={layer.key}
            opacity={layer.opacity}
            className={layer.accent ? "text-saffron" : undefined}
            style={layerStyle(phase, layer.delay, speed, layer.fill)}
          >
            {layer.paths.map((d, i) =>
              layer.fill ? (
                <path key={i} d={d} fill="currentColor" stroke="none" />
              ) : (
                <path key={i} d={d} pathLength={1} vectorEffect={pinned ? "non-scaling-stroke" : undefined} />
              ),
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
