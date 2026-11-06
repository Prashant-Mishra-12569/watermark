// Watermark Genesis Pass artwork, direction B "Modern engraved". The single source of truth for the art:
// src/WatermarkPassRenderer.sol holds these strings as constants, and test/fixtures/pass-svg/<id>.svg holds the output,
// which WatermarkPassRenderer.t.sol compares byte for byte for every token.
//
// svg(tokenId) is built from constant strings plus three tokenId-driven substitutions:
//   1. the landmark plate  L[(id-1)/20]   (5 constants, 20 tokens each)
//   2. the postmark transform  translate(cx cy) rotate(r)   (integers only, always 3 digits)
//   3. the edition number  "042"
// Everything else is static, so the Solidity port is string.concat of constants.
//
//   node script/pass-art/generator.mjs           writes test/fixtures/pass-svg/1.svg .. 100.svg
//   node script/pass-art/generator.mjs --sol     rewrites the generated constants in src/WatermarkPassRenderer.sol
//   node script/pass-art/generator.mjs --check   exits 1 if a fixture or the Solidity constants are out of date
//
// The first command also records the SHA-256 of this file in test/fixtures/pass-svg/generator.sha256, and
// WatermarkPassRenderer.t.sol checks it. So `forge test` alone (all CI runs for contracts) fails when this file was
// edited and the fixtures were not regenerated, and the byte-for-byte test fails when the constants were not.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const I = '#141210'; // ink
const P = '#f3eddd'; // stamp paper
const S = '#ff6b1a'; // saffron, postmark ink only
const BG = '#101010';
const MONO = 'ui-monospace,Menlo,Consolas,monospace';
const SANS = 'Helvetica Neue,Helvetica,Arial,sans-serif';
const r = (n) => Math.round(n);

// ---------- static head: patterns, palm, postmark wave, mark ----------
const sky = (() => {
  let y = 1.5, g = 3.2, d = '';
  while (y < 150) { d += `M0 ${+y.toFixed(1)}H390`; y += g; g *= 1.17; }
  return d;
})();

const PALM =
  `<symbol id="p" viewBox="0 0 110 220"><path d="M50 220C53 160 50 100 58 44h5C58 100 61 160 59 220z" fill="url(#h)" stroke-width="1.4"/>` +
  `<path fill="${I}" stroke="${P}" stroke-width="1.4" stroke-dasharray="1 3" d="M60 44C42 28 18 30 2 54C20 40 40 40 60 47zM60 44C48 22 28 10 6 12C28 18 44 30 58 47zM60 44C58 22 66 8 82 2C70 16 64 28 62 46zM60 44C74 24 94 18 110 26C92 26 76 34 62 47zM61 45C82 36 100 46 108 70C96 52 80 48 61 48zM59 46C46 54 38 70 34 92C44 72 52 58 61 47zM61 46C72 56 80 70 82 92C74 72 66 58 59 47z"/>` +
  `<circle cx="60" cy="50" r="5" fill="${I}" stroke="none"/></symbol>`;

const HEAD =
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 600 760" width="600" height="760"><defs>` +
  `<pattern id="h" width="8" height="3.4" patternUnits="userSpaceOnUse"><path d="M0 1.7h8" stroke="${I}" stroke-width="1.2"/></pattern>` +
  `<pattern id="v" width="3.4" height="8" patternUnits="userSpaceOnUse"><path d="M1.7 0v8" stroke="${I}" stroke-width="1.4"/></pattern>` +
  `<pattern id="x" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M0 0l4 4M4 0L0 4" stroke="${I}" stroke-width="1.1"/></pattern>` +
  `<pattern id="d" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M-1 1l2-2M0 4l4-4M3 5l2-2" stroke="${I}" stroke-width=".8"/></pattern>` +
  `<pattern id="w" width="24" height="7" patternUnits="userSpaceOnUse"><path d="M0 2h14M12 5.5h9" stroke="${I}" stroke-width="1.2"/></pattern>` +
  `<pattern id="a" width="15" height="40" patternUnits="userSpaceOnUse"><path d="M4 36V15q0-7 3.5-10 3.5 3 3.5 10v21z" fill="${I}"/></pattern>` +
  `<pattern id="l" width="7" height="9" patternUnits="userSpaceOnUse"><path d="M2 2h2.4v3.4H2z" fill="${P}"/></pattern>` +
  PALM +
  `<path id="q" d="M0 0q9-7 18 0t18 0t18 0t18 0t18 0t18 0t18 0"/>` +
  `<path id="o" d="M-49 0a49 49 0 1 1 98 0a49 49 0 1 1-98 0"/>` +
  `<g id="m"><rect width="204" height="138" rx="26"/><rect x="26" y="34" width="42" height="32" rx="8"/><circle cx="196" cy="128" r="48"/><circle cx="196" cy="128" r="36"/><path d="M176 129l14 14 27-30"/></g>` +
  `<clipPath id="c"><rect width="390" height="430"/></clipPath><clipPath id="k"><rect x="30" y="30" width="540" height="700"/></clipPath></defs>` +
  `<rect width="600" height="760" fill="${BG}"/><rect x="30" y="30" width="540" height="700" fill="${P}"/>` +
  `<rect x="44" y="44" width="512" height="672" fill="none" stroke="${I}" stroke-width="1.2"/>` +
  // hidden watermark: embossed card + seal in the paper, in the clear zone right of the edition
  `<g transform="translate(352 574) rotate(-7) scale(.8)" fill="none" stroke-width="4"><use xlink:href="#m" fill="${I}" fill-opacity=".04" stroke="none"/>` +
  `<use xlink:href="#m" x="-1.6" y="-1.6" stroke="#fff" stroke-opacity=".75"/><use xlink:href="#m" x="1.4" y="1.4" stroke="${I}" stroke-opacity=".1"/></g>` +
  `<g transform="translate(140 70)" clip-path="url(#c)"><path d="${sky}" stroke="${I}" stroke-width="1.5"/>` +
  `<g fill="${P}" stroke="${I}" stroke-width="2" stroke-linejoin="round">`;

// ---------- the five landmark plates (window-local 390 x 430) ----------
const GATEWAY =
  `<circle cx="80" cy="104" r="48" stroke-width="1.5"/>` +
  `<path d="M210 58q5-5 10 0 5-5 10 0M244 40q4-4 8 0 4-4 8 0M190 82q4-4 8 0 4-4 8 0M300 66q4-4 8 0 4-4 8 0" fill="none" stroke-width="1.5"/>` +
  `<path d="M0 318h390v112H0z" fill="url(#w)" stroke="none"/><path d="M0 318h390" fill="none"/>` +
  `<path d="M14 386h50l-8 10H24z" fill="${I}"/><path d="M38 386v-44l18 38z" fill="url(#h)" stroke-width="1.4"/>` +
  `<path d="M352 364h30l-5 6h-20z" fill="${I}"/>` +
  `<path d="M34 322h322v16H34z" fill="url(#h)"/>` +
  `<path d="M52 322V196h72v126zM266 322V196h72v126z"/><path d="M267 198h70v123h-70z" fill="url(#h)" stroke="none"/>` +
  `<path d="M46 186h84v12H46zM260 186h84v12h-84z" fill="url(#d)"/>` +
  `<path d="M48 186v-22h16v22zM326 186v-22h16v22z"/><path d="M47 164q9-20 18 0zM325 164q9-20 18 0z" fill="url(#h)"/>` +
  `<path d="M124 322V150h142v172z"/><path d="M250 152h15v169h-15z" fill="url(#v)" stroke="none"/>` +
  `<path d="M116 136h158v16H116z" fill="url(#d)"/>` +
  `<path d="M112 136V94h24v42zM254 136V94h24v42z"/><path d="M125 95h10v40h-10zM267 95h10v40h-10z" fill="url(#v)" stroke="none"/>` +
  `<path d="M110 94q14-32 28 0zM252 94q14-32 28 0zM156 136v-20h16v20zM218 136v-20h16v20z"/>` +
  `<path d="M155 116q9-20 18 0zM217 116q9-20 18 0z" fill="url(#h)"/><path d="M124 78V64M266 78V64" fill="none"/>` +
  `<path d="M142 322V220q0-44 53-64 53 20 53 64v102" fill="none" stroke-width="1.5"/>` +
  `<path d="M152 322V222q0-38 43-56 43 18 43 56v100z" fill="url(#x)"/>` +
  `<path d="M129 168h10v44h-10zM251 168h10v44h-10z" fill="url(#d)"/>` +
  `<path d="M72 322v-38q0-16 16-24 16 8 16 24v38zM286 322v-38q0-16 16-24 16 8 16 24v38z" fill="url(#x)"/>` +
  `<path d="M74 212h28v34H74zM288 212h28v34h-28z" fill="url(#d)"/>` +
  `<path d="M52 256h20M104 256h20M266 256h20M318 256h20M124 226h18M248 226h18" fill="none" stroke-width="1.2"/>`;

const RAJABAI =
  `<circle cx="300" cy="112" r="46" stroke-width="1.5"/>` +
  `<path d="M0 332h390v98H0z" fill="url(#d)" stroke="none"/><path d="M0 332h390" fill="none"/>` +
  `<path d="M10 256l14-26h126l12 26zM228 256l12-26h126l14 26z" fill="url(#h)"/>` +
  `<path d="M10 332v-76h152v76zM228 332v-76h152v76z"/>` +
  `<path d="M18 280h136v40H18zM236 280h136v40H236z" fill="url(#a)" stroke="none"/>` +
  `<path d="M228 258h152v73H228z" fill="url(#h)" stroke="none" opacity=".55"/>` +
  `<path d="M10 266h152M228 266h152" fill="none" stroke-width="1.2"/>` +
  `<path d="M160 332V226h70v106z"/><path d="M218 228h11v103h-11z" fill="url(#v)" stroke="none"/>` +
  `<path d="M183 332v-30q0-12 12-18 12 6 12 18v30z" fill="url(#x)"/>` +
  `<path d="M168 230v100M222 230v100" fill="none" stroke-width="1.2"/>` +
  `<path d="M156 216h78v12h-78z" fill="url(#d)"/>` +
  `<path d="M165 216v-78h60v78z"/><path d="M214 140h10v75h-10z" fill="url(#v)" stroke="none"/>` +
  `<path d="M175 208v-42q0-10 7-15 7 5 7 15v42zM197 208v-42q0-10 7-15 7 5 7 15v42z" fill="${I}"/>` +
  `<path d="M159 130h72v10h-72z" fill="url(#d)"/>` +
  `<path d="M168 130V90h54v40z"/><circle cx="195" cy="110" r="16" stroke-width="2.5"/>` +
  `<circle cx="195" cy="110" r="12.5" fill="none" stroke-width="2.5" stroke-dasharray="1 5.55"/>` +
  `<path d="M195 110v-10m0 10 7 4" fill="none" stroke-width="1.8"/>` +
  `<path d="M161 130l5-58 5 58zM219 130l5-58 5 58z" fill="${I}"/>` +
  `<path d="M176 90V58h38v32z"/><path d="M204 59h9v30h-9z" fill="url(#v)" stroke="none"/>` +
  `<path d="M183 86V70q0-7 4-9 4 2 4 9v16zM199 86V70q0-7 4-9 4 2 4 9v16z" fill="${I}"/>` +
  `<path d="M171 90l3-42 3 42zM213 90l3-42 3 42z" fill="${I}"/>` +
  `<path d="M174 58l21-54 21 54z" fill="url(#h)"/><path d="M195 4V0" fill="none"/>` +
  `<use xlink:href="#p" x="-34" y="148" width="124" height="248"/><use xlink:href="#p" x="300" y="196" width="100" height="200"/>`;

const SEALINK = (() => {
  const yd = (x) => 290 - (28 * x) / 390; // deck top
  const yw = (x) => 360 - (98 * x) / 390; // water level under the deck
  let s = `<circle cx="292" cy="138" r="58" stroke-width="1.5"/>`;
  s += `<path d="M196 70q5-5 10 0 5-5 10 0M228 50q4-4 8 0 4-4 8 0M60 86q4-4 8 0 4-4 8 0" fill="none" stroke-width="1.5"/>`;
  s += `<path d="M0 258h390v172H0z" fill="url(#w)" stroke="none"/><path d="M0 258h390" fill="none"/>`;
  s += `<path d="M322 258v-22h8v-10h6v32zM342 258v-42h10v42zM356 258v-28h12v28zM371 258v-54h8v-6h4v60zM386 258v-30h8v30zM0 258v-16h12v-8h8v24zM26 258v-12h14v12z" fill="url(#h)" stroke-width="1"/>`;
  // piers
  let pd = '';
  for (const x of [8, 34, 58, 80, 150, 172, 192, 211, 229, 246, 262, 277, 290, 312, 324, 336, 347, 357, 366]) {
    pd += `M${x} ${r(yd(x) + 8)}V${r(yw(x))}`;
  }
  s += `<path d="${pd}" fill="none" stroke-width="3"/>`;
  // cables: each anchor carries a left and a right stay (deck-anchor-deck)
  let cd = '';
  for (let i = 0; i < 14; i++) {
    const ya = 34 + i * 9, sp = 14 - i;
    const xl = 110 - 8 * sp, xr = 110 + 9 * sp;
    cd += `M${xl} ${r(yd(xl))}L110 ${ya}L${xr} ${r(yd(xr))}`;
  }
  for (let i = 0; i < 12; i++) {
    const ya = 158 + i * 5, sp = 12 - i;
    const xl = 300 - 6.6 * sp, xr = 300 + 7.2 * sp;
    cd += `M${r(xl)} ${r(yd(xl))}L300 ${ya}L${r(xr)} ${r(yd(xr))}`;
  }
  s += `<path d="${cd}" fill="none" stroke-width="1"/>`;
  // pylons (inverted Y)
  s += `<path d="M88 ${r(yw(110))}L104 176V30l6-8 6 8v146l16 ${r(yw(110) - 176)}h-9l-12-136h-2l-12 136z" fill="url(#v)" stroke-width="1.6"/>`;
  s += `<path d="M291 ${r(yw(300))}L298 221V156l2-4 2 4v65l7 ${r(yw(300) - 221)}h-4l-4-46h-2l-4 46z" fill="url(#v)" stroke-width="1.2"/>`;
  // deck
  s += `<path d="M0 290L390 262v4L0 302z" fill="${I}"/><path d="M0 286L390 260" fill="none" stroke-width="1"/>`;
  // koli fishing boat with flags
  s += `<path d="M16 396h62l-10 11H28z" fill="${I}"/><path d="M42 396v-44" fill="none"/><path d="M43 352l16 4-16 4zM43 364l11 3-11 3z" fill="${I}" stroke="none"/>`;
  return s;
})();

const CST = (() => {
  const zig = (x0, n) => `M${x0} 236` + 'l5-9 5 9'.repeat(n);
  let s = `<circle cx="72" cy="96" r="40" stroke-width="1.5"/>`;
  s += `<path d="M0 338h390v92H0z" fill="url(#h)" stroke="none"/><path d="M0 338h390M0 352h390" fill="none"/>`;
  s += `<path d="${zig(22, 10)}${zig(264, 10)}" fill="${I}" stroke-width="1"/>`;
  s += `<path d="M22 338V236h106v102zM262 338V236h106v102z"/>`;
  s += `<path d="M26 240h98v80H26zM266 240h98v80h-98z" fill="url(#a)" stroke="none"/>`;
  s += `<path d="M263 237h104v100H263z" fill="url(#h)" stroke="none" opacity=".45"/>`;
  s += `<path d="M22 280h106M262 280h106" fill="none" stroke-width="1.2"/>`;
  s += `<path d="M4 338V196h18v142zM368 338V196h18v142z"/><path d="M2 196q11-32 22 0zM366 196q11-32 22 0z" fill="url(#h)"/>`;
  s += `<path d="M13 180v-14M377 180v-14" fill="none"/>`;
  // drum + dome
  s += `<path d="M160 160v-40h70v40z"/><path d="M164 120h62v40h-62z" fill="url(#a)" stroke="none"/>`;
  const dome = 'M154 122c0-42 28-58 41-88 13 30 41 46 41 88z';
  s += `<path d="${dome}" stroke="none"/><path d="M195 34c13 30 41 46 41 88h-41z" fill="url(#h)" stroke="none"/>`;
  s += `<path d="${dome}M195 34c-8 28-20 46-20 88M195 34c8 28 20 46 20 88M195 34v88" fill="none"/>`;
  s += `<path d="M150 122h90" fill="none" stroke-width="4"/>`;
  s += `<path d="M195 34V14m-6 6 6-4 6-8" fill="none" stroke-width="2"/><circle cx="195" cy="12" r="2.5" fill="${I}"/>`;
  // central block, gable, rose window, turrets, entrance
  s += `<path d="M128 338V196h134v142z"/><path d="M134 200h122v80H134z" fill="url(#a)" stroke="none"/>`;
  s += `<path d="M120 198l75-52 75 52z"/><circle cx="195" cy="180" r="13" stroke-width="2"/>`;
  s += `<circle cx="195" cy="180" r="6.5" fill="none" stroke-width="7" stroke-dasharray="1.6 2.5"/>`;
  s += `<path d="M116 338V180h14v158zM260 338V180h14v158z"/><path d="M114 180l9-38 9 38zM258 180l9-38 9 38z" fill="${I}"/>`;
  s += `<path d="M168 338v-32q0-20 27-30 27 10 27 30v32z" fill="url(#x)"/>`;
  // kaali-peeli taxi (Premier Padmini profile)
  s += `<g transform="translate(36 364) scale(1.15)"><path d="M0 28v-10q0-6 7-7l14-2 10-9h36l10 9 16 2q6 1 6 7v10z" fill="${I}"/>`;
  s += `<path d="M27 10l9-8h34l9 8z" fill="url(#h)" stroke="none"/><path d="M34 9l7-6h11v6zM56 9V3h10l7 6z" stroke="none"/>`;
  s += `<path d="M44 0h14v-4H44z" fill="${I}" stroke="none"/><circle cx="21" cy="28" r="7" stroke-width="3"/><circle cx="78" cy="28" r="7" stroke-width="3"/></g>`;
  s += `<path d="M300 400h70" fill="none" stroke-width="1.2" stroke-dasharray="12 8"/>`;
  return s;
})();

const MARINE = (() => {
  // the bay edge: quadratic from the near-left foreground round to Nariman Point on the far right
  const A = [0, 412], B = [64, 300], C = [390, 254];
  const at = (t) => [
    (1 - t) ** 2 * A[0] + 2 * t * (1 - t) * B[0] + t * t * C[0],
    (1 - t) ** 2 * A[1] + 2 * t * (1 - t) * B[1] + t * t * C[1],
  ];
  const yAtX = (x) => { let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (at(m)[0] < x) lo = m; else hi = m; } return at(lo)[1]; };
  let s = `<path d="M0 0h390v256H0z" fill="url(#h)" stroke="none"/>`;
  s += `<path d="M24 64h0M86 30h0M118 92h0M160 20h0M206 58h0M246 16h0M372 40h0M360 140h0M40 136h0M190 120h0M20 200h0" stroke="${P}" stroke-width="2.4" stroke-linecap="round"/>`;
  s += `<circle cx="296" cy="86" r="30" stroke="none"/><circle cx="296" cy="86" r="40" fill="none" stroke="${P}" stroke-width="1.4" stroke-dasharray="2 4"/>`;
  s += `<path d="M0 250h390v180H0z" fill="${I}" stroke="none"/>`;
  // Nariman Point towers far right, and a few towers behind the frontage
  let bd = `M330 254v-58h9v58zM342 254v-86h7v-6h3v92zM355 254v-70h11v70zM369 254v-50h9v50zM380 254v-62h10v62zM120 262v-64h12v64zM196 258v-48h10v48zM250 256v-56h8v56z`;
  // art deco frontage: low, even blocks with rounded corners and stepped crowns, receding along the curve
  const mult = [1, 0.86, 1.12, 0.92, 1.04, 0.84, 1.1, 0.95];
  let x = -4, i = 0;
  while (x < 330) {
    const k = 1 - x / 400, w = 44 * k + 6, h = (78 * k ** 1.25 + 9) * mult[i % 8];
    const base = r(yAtX(x + w) + 8), top = r(yAtX(x + w) - h), rc = Math.max(2, r(9 * k)), cw = r(w * 0.3), st = Math.max(2, r(7 * k));
    const W = r(w);
    if (i % 2) bd += `M${r(x)} ${base}V${top + rc}q0-${rc} ${rc}-${rc}h${W - rc}V${base}z`;
    else bd += `M${r(x)} ${base}V${top}h${r((W - cw) / 2)}v-${st}h${cw}v${st}h${W - cw - r((W - cw) / 2)}V${base}z`;
    if (i % 4 === 1) bd += `M${r(x + w * 0.7)} ${top}v-${r(12 * k + 3)}h1v${r(12 * k + 3)}z`;
    x += w + 1; i++;
  }
  s += `<path d="${bd}" fill="${I}" stroke="${P}" stroke-width=".8" stroke-opacity=".5"/><path d="${bd}" fill="url(#l)" stroke="none"/>`;
  // the bay (sea), drawn over the building bases
  const arc = `M0 ${A[1]}Q${B[0]} ${B[1]} ${C[0]} ${C[1]}`;
  s += `<path d="${arc}V430H0z" fill="${I}" stroke="none"/><path d="${arc}" fill="none" stroke="${P}" stroke-width="2"/>`;
  let sh = '';
  for (let j = 0; j < 15; j++) {
    const y = 272 + j * 10 + (j % 3) * 2, len = 8 + ((j * 7) % 13) + j * 1.4, cx = 296 + ((j * 13) % 9) - 4;
    sh += `M${r(cx - len / 2)} ${y}h${r(len)}`;
  }
  s += `<path d="${sh}" fill="none" stroke="${P}" stroke-width="1.3"/>`;
  // the necklace: streetlights along the curve, with glow and reflections
  const grp = [[], [], []];
  let refl = '';
  for (let j = 0; j < 24; j++) {
    const t = 0.03 + 0.96 * (1 - (1 - j / 23) ** 1.7);
    const [lx, ly] = at(t);
    const g = t < 0.25 ? 0 : t < 0.6 ? 1 : 2;
    grp[g].push(`M${r(lx)} ${r(ly - 4)}h0`);
    refl += `M${r(lx)} ${r(ly + 6)}v${r(22 * (1 - t) + 4)}`;
  }
  s += `<path d="${refl}" fill="none" stroke="${P}" stroke-width="1.2" stroke-dasharray="3 2"/>`;
  [[8, 20], [5.4, 13], [3.2, 8]].forEach(([w, gw], g) => {
    const d = grp[g].join('');
    s += `<path d="${d}" stroke="${P}" stroke-opacity=".28" stroke-width="${gw}" stroke-linecap="round"/><path d="${d}" stroke="${P}" stroke-width="${w}" stroke-linecap="round"/>`;
  });
  return s;
})();

const PLATES = [
  [GATEWAY, 'GATEWAY OF INDIA', '18.92&#176;N 72.83&#176;E'],
  [RAJABAI, 'RAJABAI CLOCK TOWER', '18.93&#176;N 72.83&#176;E'],
  [SEALINK, 'BANDRA&#8211;WORLI SEA LINK', '19.04&#176;N 72.82&#176;E'],
  [CST, 'CHHATRAPATI SHIVAJI TERMINUS', '18.94&#176;N 72.84&#176;E'],
  [MARINE, 'MARINE DRIVE &#183; QUEEN&#8217;S NECKLACE', '18.94&#176;N 72.82&#176;E'],
];

// ---------- static middle: denomination tab, window frame, lettering ----------
const MID =
  `</g><path d="M0 0h78v50H0z" fill="${I}"/><text x="39" y="37" fill="${P}" font-family="${SANS}" font-size="32" font-weight="700" text-anchor="middle">&#8377;0</text></g>` +
  `<rect x="140" y="70" width="390" height="430" fill="none" stroke="${I}" stroke-width="4"/>` +
  `<g fill="${I}" font-family="${MONO}"><text x="140" y="60" font-size="10" letter-spacing="3">SERIES 01 &#183; WHITECHAIN 1874</text>` +
    `<g transform="translate(100 500) rotate(-90)"><text font-family="${SANS}" font-size="32" font-weight="700" textLength="300" lengthAdjust="spacingAndGlyphs">WATERMARK GENESIS</text>` +
  `<text x="430" font-family="Noto Sans Devanagari,Mangal,sans-serif" font-size="34" font-weight="700" text-anchor="end">&#2350;&#2369;&#2306;&#2348;&#2312;</text>` +
  `<text y="30" font-size="25" font-weight="700" letter-spacing="2">2026</text><text x="430" y="28" font-size="10" letter-spacing="2.4" text-anchor="end">ONE CARD &#183; ONE PASS</text></g>` +
  `<path d="M140 546H530" stroke="${I}" stroke-width="1.2"/>` +
  `<text x="140" y="530" font-size="13" font-weight="700" letter-spacing="2.6">`;
const MID2 = `</text><text x="530" y="60" font-size="10" letter-spacing="2" text-anchor="end">`;
// postmark goes here (in paper, under the edition ink), then the edition
const PM_HEAD = `</text><g clip-path="url(#k)"><g transform="`;
const PM_TAIL =
  `" fill="none" stroke="${S}" stroke-opacity=".9"><circle r="62" stroke-width="3.6"/><circle r="42" stroke-width="1.6"/><path d="M-42-11h84M-42 11h84" stroke-width="1.6"/>` +
  `<g stroke-width="3"><use xlink:href="#q" x="-196" y="-27"/><use xlink:href="#q" x="-196" y="-9"/><use xlink:href="#q" x="-196" y="9"/><use xlink:href="#q" x="-196" y="27"/></g>` +
  `<g fill="${S}" fill-opacity=".92" stroke="none" font-weight="700"><text font-size="11" letter-spacing="2.15"><textPath xlink:href="#o">ETHGLOBAL MUMBAI &#183; 07 NOV 2026 &#183;</textPath></text>` +
  `<text y="5" font-size="14" letter-spacing="1.5" text-anchor="middle">FEE PAID</text></g></g></g>` +
  `<g font-family="${SANS}" font-weight="700"><text x="58" y="610" font-size="46">#</text><text x="92" y="702" font-size="178" letter-spacing="-4" textLength="252" lengthAdjust="spacingAndGlyphs">`;
const TAIL =
  `</text></g><text x="352" y="702" font-size="26" font-weight="700">/ 100</text><text x="354" y="662" font-size="9" letter-spacing="2.6">EDITION</text></g>` +
  `<rect x="30" y="30" width="540" height="700" fill="none" stroke="${BG}" stroke-width="15" stroke-dasharray="0 20" stroke-linecap="round"/></svg>`;

export function svg(tokenId) {
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id < 1 || id > 100) throw new RangeError('tokenId must be 1..100');
  const [plate, name, coord] = PLATES[Math.floor((id - 1) / 20)];
  const cx = 404 + ((id * 37) % 9) * 11;
  const cy = 404 + ((id * 29) % 6) * 9;
  const rot = 348 + ((id * 47) % 37);
  const ed = String(id).padStart(3, '0');
  return HEAD + plate + MID + name + MID2 + coord + PM_HEAD + `translate(${cx} ${cy}) rotate(${rot})` + PM_TAIL + ed + TAIL;
}

// ---------- Solidity constants for src/WatermarkPassRenderer.sol ----------
const BEGIN = '    // BEGIN GENERATED ART';
const END = '    // END GENERATED ART';

/**
 * One `string internal constant`, split into adjacent literals so each line stays within 120 columns, laid out the way
 * forge fmt prints it (first literal on the declaration line, then 8 spaces; double quotes unless the text has one).
 */
function solConstant(name, value) {
  const q = (s) => (s.includes('"') ? `'${s}'` : `"${s}"`);
  const decl = `    string internal constant ${name} = `;
  const lines = [];
  let rest = value;
  let max = 120 - decl.length - 3; // quotes, and ';' when it is the only line
  while (rest.length > max) {
    let cut = Math.max(rest.lastIndexOf('>', max - 1), rest.lastIndexOf(' ', max - 1)) + 1;
    if (cut < max / 2) cut = max;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    max = 120 - 8 - 3;
  }
  lines.push(rest);
  return `${decl}${lines.map(q).join('\n        ')};`;
}

function solBlock() {
  const out = [
    BEGIN,
    '    // Generated by `node script/pass-art/generator.mjs --sol` from script/pass-art/generator.mjs. Do not edit.',
    solConstant('HEAD', HEAD),
    solConstant('MID', MID),
    solConstant('MID2', MID2),
    solConstant('PM_HEAD', PM_HEAD),
    solConstant('PM_TAIL', PM_TAIL),
    solConstant('TAIL', TAIL),
  ];
  PLATES.forEach(([plate, name, coord], i) => {
    out.push(solConstant(`PLATE_${i}`, plate), solConstant(`NAME_${i}`, name), solConstant(`COORD_${i}`, coord));
  });
  out.push(END);
  return out.join('\n');
}

function withSolBlock(source) {
  const a = source.indexOf(BEGIN);
  const b = source.indexOf(END);
  if (a < 0 || b < a) throw new Error('WatermarkPassRenderer.sol: generated-art markers not found');
  return source.slice(0, a) + solBlock() + source.slice(b + END.length);
}

// ---------- CLI ----------
/**
 * True when node runs this file (not when another module imports svg()). import.meta.url is the real path, while
 * argv[1] keeps any symlink in the path the script was started with, so compare real paths: otherwise a run through
 * a symlinked checkout would do nothing and exit 0, and `--check` would pass without checking.
 */
function isMain() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const self = fileURLToPath(import.meta.url);
  const here = dirname(self);
  const fixtures = join(here, '..', '..', 'test', 'fixtures', 'pass-svg');
  const solPath = join(here, '..', '..', 'src', 'WatermarkPassRenderer.sol');
  // 0x-prefixed, so the forge test reads it with vm.parseBytes32 and compares it with sha256(generator.mjs)
  const hashPath = join(fixtures, 'generator.sha256');
  const selfHash = `0x${createHash('sha256').update(readFileSync(self)).digest('hex')}`;
  const mode = process.argv[2] ?? '';
  if (mode === '--sol') {
    writeFileSync(solPath, withSolBlock(readFileSync(solPath, 'utf8')));
    console.log(`rewrote the generated art in ${solPath}`);
  } else if (mode === '--check') {
    const stale = [];
    for (let id = 1; id <= 100; id++) {
      const f = join(fixtures, `${id}.svg`);
      if (!existsSync(f) || readFileSync(f, 'utf8') !== svg(id)) stale.push(`test/fixtures/pass-svg/${id}.svg`);
    }
    if (!existsSync(hashPath) || readFileSync(hashPath, 'utf8').trim() !== selfHash) {
      stale.push('test/fixtures/pass-svg/generator.sha256');
    }
    const sol = readFileSync(solPath, 'utf8');
    if (withSolBlock(sol) !== sol) stale.push('src/WatermarkPassRenderer.sol (generated art)');
    if (stale.length) {
      console.error(`out of date (run node script/pass-art/generator.mjs, then --sol):\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    console.log('fixtures and Solidity constants match the generator');
  } else if (mode === '') {
    mkdirSync(fixtures, { recursive: true });
    const sizes = [];
    for (let id = 1; id <= 100; id++) {
      const s = svg(id);
      writeFileSync(join(fixtures, `${id}.svg`), s);
      sizes.push(Buffer.byteLength(s));
    }
    writeFileSync(hashPath, `${selfHash}\n`);
    console.log(`wrote 100 SVGs to ${fixtures} (${Math.min(...sizes)}-${Math.max(...sizes)} bytes each)`);
  } else {
    console.error('usage: node script/pass-art/generator.mjs [--sol | --check]');
    process.exit(2);
  }
}
