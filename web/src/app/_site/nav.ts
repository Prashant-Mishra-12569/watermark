/*
 * The site header's links (SITE_FINAL.md "Nav"): logo · Genesis Drop · GitHub · black pill "Add Watermark ↗".
 * Nothing else. The footer's links (SITE_FINAL.md page 1, section 8) live here too. Pure data: safe in server and
 * client components and under node --test.
 *
 * lib/site.ts keeps only the drop's step links (PASS_FLOW); the header and footer read this file.
 */

import { DOCS, REPO_URL } from "../../lib/site.ts";

export interface SiteNavItem {
  href: string;
  label: string;
  /** Leaves the site (GitHub, docs): opens in a new tab. */
  external?: boolean;
}

/**
 * The header links in order. The Genesis Drop page always exists (it says "The drop opens soon" while the pass
 * contract is not deployed), so the link never goes to a dead page. The argument is ignored; it stays so older
 * callers compile.
 */
export function siteNav(_passLive?: boolean): SiteNavItem[] {
  return [
    { href: "/pass", label: "Genesis Drop" },
    { href: REPO_URL, label: "GitHub", external: true },
  ];
}

/** The header's black pill. No arrow in the label: PillButton draws the ↗ in its white circle. */
export const SITE_CTA: SiteNavItem = { href: "/#add", label: "Add Watermark" };

/** The footer's links, in order (SITE_FINAL.md page 1, section 8). */
export const FOOTER_LINKS: readonly SiteNavItem[] = [
  { href: "/pass", label: "Genesis Drop" },
  { href: "/attack", label: "Bot test" },
  { href: REPO_URL, label: "GitHub", external: true },
  { href: DOCS.integrate, label: "Docs", external: true },
  { href: "/credits", label: "Credits" },
];
