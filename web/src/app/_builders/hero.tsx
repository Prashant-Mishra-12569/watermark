import { MumbaiSkyline } from "@/app/_art";
import { FloatChip, Headline, PillButton, cx } from "@/app/_site";
import { PASS_LIVE } from "@/lib/site.ts";
import { HERO, heroDropLabel } from "./copy.ts";
import { HeroGate } from "./hero-gate";
import styles from "./hero.module.css";

/**
 * SITE_FINAL "Page 1" section 1. The first screen is the hero and nothing else: our line drawing of Mumbai along its
 * bottom edge, drawing itself on load (fully drawn under reduced motion), with every landmark and the sea line under
 * them on the first screen at real browser sizes (hero.module.css has the numbers).
 *
 * Phones and tablets (under 900px): copy, Mumbai, then the claim gate (hero-gate.tsx). From 900px (laptops, and
 * laptops zoomed to 125% or 150%): copy left, claim gate right, and Mumbai fills whatever height is left under them,
 * as large as fits. One copy of each part in the DOM, in reading order: copy, gate, skyline (the skyline is
 * decoration; the footer's is labelled). Server component; the drawing is the only client island.
 */
export function BuildersHero() {
  return (
    <section aria-labelledby="hero-title" className="overflow-x-clip">
      <div data-hero-fold className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6", styles.hero)}>
        <div className={styles.top}>
          <div className={styles.copy}>
            <FloatChip tone="saffron">{HERO.eyebrow}</FloatChip>
            <Headline as="h1" id="hero-title" className={styles.title}>
              {HERO.title}
            </Headline>
            <p className={cx("text-pretty text-muted", styles.sub)}>{HERO.sub}</p>
            <div className={styles.ctas}>
              {/* The site's arrow rule (pill-button.tsx): a primary pill's arrow sits in a circle; ↓ because #add is
                  further down this page. */}
              <PillButton href={HERO.add.href} size="lg" arrowDir="down">
                {HERO.add.label}
              </PillButton>
              <PillButton href={HERO.drop.href} variant="secondary" size="lg" arrow>
                {heroDropLabel(PASS_LIVE)}
              </PillButton>
            </div>
          </div>

          <HeroGate className={styles.gate} />
        </div>

        {/* The whole drawing, never cropped: as wide as the hero, or narrower when the screen is short. */}
        <div data-hero-sky className={styles.sky}>
          <MumbaiSkyline draw="load" decorative className={cx("text-ink", styles.skyline)} />
        </div>
      </div>
    </section>
  );
}
