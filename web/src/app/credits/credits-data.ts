/**
 * What /credits lists: only what the site really uses. Every picture is drawn in code; the only image files in
 * web/public are Genesis Drop stamps (assets/stamps), byte for byte the contract's own picture. The only outside
 * assets are the three fonts layout.tsx loads through next/font, which fetches them when the site is built and serves
 * them from this site. credits.test.ts keeps this list in step with layout.tsx and web/public.
 */

export interface FontCredit {
  /** The family name, as next/font/google exports it (underscores for spaces) in layout.tsx. */
  nextFontExport: string;
  name: string;
  usedFor: string;
  by: string;
  licence: string;
  licenceUrl: string;
  source: string;
}

const OFL = "SIL Open Font License 1.1";
const OFL_URL = "https://openfontlicense.org";

export const FONT_CREDITS: readonly FontCredit[] = [
  {
    nextFontExport: "Geist",
    name: "Geist",
    usedFor: "Body text and headings",
    by: "Vercel",
    licence: OFL,
    licenceUrl: OFL_URL,
    source: "https://fonts.google.com/specimen/Geist",
  },
  {
    nextFontExport: "Geist_Mono",
    name: "Geist Mono",
    usedFor: "Code, addresses and hashes",
    by: "Vercel",
    licence: OFL,
    licenceUrl: OFL_URL,
    source: "https://fonts.google.com/specimen/Geist+Mono",
  },
  {
    nextFontExport: "Instrument_Serif",
    name: "Instrument Serif",
    usedFor: "The one italic word in each headline",
    by: "Instrument",
    licence: OFL,
    licenceUrl: OFL_URL,
    source: "https://fonts.google.com/specimen/Instrument+Serif",
  },
];

/** The pictures on the site, all drawn in code for Watermark (web/src/app/_art, _site and lib/pass-art.ts). */
export const DRAWN_IN_CODE: readonly string[] = [
  "The Mumbai skyline along the bottom of every page",
  "The bot farm, the wallet grid and the line icons",
  "The bank card and the saffron stamp seal",
  "The Genesis Drop NFT, the same picture its contract draws on-chain",
  "The Watermark logo (\"One tap\"): our own drawing, generated in code (public/brand)",
];
