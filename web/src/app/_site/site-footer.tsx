import Link from "next/link";
import { MumbaiSkyline } from "@/app/_art";
import { EM_CLASS } from "./headline";
import { Logo } from "./logo";
import { FOOTER_LINKS, type SiteNavItem } from "./nav";

const LINK =
  "inline-flex min-h-11 items-center gap-1 text-muted underline decoration-transparent decoration-1 underline-offset-4 transition-colors hover:text-ink hover:decoration-current/40";

function FooterLink({ item }: { item: SiteNavItem }) {
  if (item.external)
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={LINK}>
        {item.label}
        <span aria-hidden="true" className="text-[0.85em]">
          ↗
        </span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  return (
    <Link href={item.href} className={LINK}>
      {item.label}
    </Link>
  );
}

/**
 * The footer on every page (SITE_FINAL.md page 1, section 8): "Built in *Mumbai* at ETHGlobal 2026", the five links
 * (Genesis Drop, Bot test, GitHub, Docs, Credits), and our own line drawing of Mumbai along the bottom edge, drawing
 * itself the first time it scrolls into view (drawn at once under reduced motion). Server component; the drawing is
 * the only client island.
 */
export function SiteFooter() {
  return (
    <footer data-site-footer="" className="mt-16 overflow-x-clip border-t border-line bg-bg sm:mt-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pt-12 sm:gap-8 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-10">
        <div className="min-w-0">
          <Link href="/" aria-label="Watermark home" className="inline-flex rounded-full">
            <Logo />
          </Link>
          <p className="mt-5 text-lg font-medium tracking-[-0.01em]">
            Real people leave a <em className={EM_CLASS}>mark</em>.
          </p>
          <p className="mt-6 max-w-[16ch] text-[clamp(30px,4.2vw,48px)] font-semibold leading-[1.06] tracking-[-0.03em] text-balance sm:mt-8">
            Built in <em className={EM_CLASS}>Mumbai</em> at ETHGlobal 2026
          </p>
          <p className="mt-4 text-sm text-muted">Test networks only · No trackers</p>
        </div>
        <nav aria-label="Footer" className="min-w-0">
          {/* Phones: a tidy three-column grid (two rows). From 640px: one row, which never wraps from 1024px (the
              column is as wide as the links). */}
          <ul className="grid grid-cols-3 gap-x-4 text-[15px] sm:flex sm:flex-wrap sm:gap-x-6 lg:flex-nowrap lg:justify-end">
            {FOOTER_LINKS.map((item) => (
              <li key={item.label}>
                <FooterLink item={item} />
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* On the page grid, like the hero's drawing: the same container and gutters as the words above it (the whole
          drawing at every width, never cropped), with a little room under the sea lines. */}
      <div className="mx-auto mt-8 max-w-6xl px-4 pb-6 sm:mt-12 sm:px-6 sm:pb-8">
        <MumbaiSkyline draw className="text-ink" />
      </div>
    </footer>
  );
}
