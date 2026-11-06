import { StampSeal, cx } from "@/app/_site";
import { GATE, GATE_CLAIMS, GATE_STAMP } from "./hero-gate-data.ts";
import styles from "./hero-gate.module.css";

function Cross() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" className="block size-3 shrink-0">
      <path d="M3.3 3.3l5.4 5.4M8.7 3.3l-5.4 5.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" className="block size-3 shrink-0">
      <path
        d="M2.5 6.3l2.3 2.3 4.7-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A plain wallet glyph for the refused rows: the site's line style (1.5px, round caps), in grey. */
function WalletMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="block size-[17px] text-muted">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 7.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V7.5" />
        <path d="M4 7.5A2 2 0 0 1 6 5.5h10" />
        <path d="M20 11.5h-3.5a1.5 1.5 0 0 0 0 3H20" />
      </g>
    </svg>
  );
}

/**
 * The hero's "claim gate" (SITE_FINAL hero visual): the whole service in one picture. On one side a small claims feed
 * (labelled "Example", the wallets are made up): four wallets wait in line, three bots are checked in turn, bounce off
 * and read "Refused · no stamp", then the stamped wallet gets through and claims. On the other side the prize, our
 * own Genesis Drop stamp #042 (a static file from web/public/assets/stamps), a tilted collectible that lands when the
 * stamped wallet claims it.
 *
 * Server component, CSS only (hero-gate.module.css): one calm 6 s loop that pauses on hover and starts on its
 * finished frame. The four rows and their statuses are always on screen (a wallet not yet checked is only faded), so
 * the panel is never an empty box. Under prefers-reduced-motion nothing moves and the final frame (three refused, one
 * claimed) simply shows. The rows are always in the DOM, so a screen reader reads that final frame as a plain list.
 */
export function HeroGate({ className }: { className?: string }) {
  return (
    <figure data-hero-gate aria-labelledby="hero-gate-title" className={cx(styles.gate, className)}>
      <div className={styles.feed}>
        <p className="flex items-center gap-2">
          <span id="hero-gate-title" className="text-[15px] font-semibold leading-5 tracking-[-0.01em]">
            {GATE.title}
          </span>
          <span className="rounded-full border border-line px-2 py-px text-xs font-medium leading-4 text-muted">
            {GATE.example}
          </span>
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-muted">{GATE.rule}</p>

        <ol className={styles.rows}>
          {GATE_CLAIMS.map((c, i) => (
            <li key={c.wallet} className={cx(styles.row, c.stamped ? styles.pass : styles.bot)} data-step={i}>
              <span className={styles.icon}>
                {c.stamped ? (
                  <span className={styles.seal}>
                    <StampSeal className="size-[30px]" />
                  </span>
                ) : (
                  <WalletMark />
                )}
              </span>
              <span className="relative min-w-0">
                <span
                  className={cx(
                    "block truncate font-mono text-[12.5px] leading-[18px] tabular-nums",
                    c.stamped ? "text-ink" : "text-muted",
                  )}
                >
                  {c.wallet}
                </span>
                {c.stamped ? (
                  <span className={cx(styles.status, "text-ink font-semibold")}>
                    <Check />
                    {GATE.claimed}
                  </span>
                ) : (
                  <span className={cx(styles.status, "text-error font-medium")}>
                    <Cross />
                    {GATE.refused}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.prize}>
        {/* A static file from our own art set; <img> so nothing inside the SVG can run (CSP img-src 'self'). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={GATE_STAMP.src}
          width={GATE_STAMP.width}
          height={GATE_STAMP.height}
          alt={GATE.stampAlt}
          decoding="async"
          className={styles.stamp}
        />
      </div>
    </figure>
  );
}
