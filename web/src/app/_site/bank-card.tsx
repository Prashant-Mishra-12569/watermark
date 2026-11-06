import { useId } from "react";
import { cx } from "./cx";

/**
 * The round saffron stamp: "STAMPED · ONE CARD · ONE STAMP" around a white check. Also usable on its own (a success
 * badge, a list bullet). `land` plays the landing (scale + turn, 320 ms, once); off under reduced motion.
 */
export function StampSeal({ className, land = false }: { className?: string; land?: boolean }) {
  const ringId = `wm-seal-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      className={cx("block", land && "motion-safe:animate-stamp", className)}
    >
      <defs>
        <path id={ringId} d="M60 60m-40 0a40 40 0 1 1 80 0a40 40 0 1 1-80 0" />
      </defs>
      <circle cx="60" cy="60" r="58" fill="#ff6b1a" />
      <circle cx="60" cy="60" r="51" fill="none" stroke="#ffffff" strokeOpacity=".9" strokeWidth="1.6" strokeDasharray="2.4 3.2" />
      <circle cx="60" cy="60" r="29" fill="none" stroke="#ffffff" strokeOpacity=".9" strokeWidth="1.6" />
      <text fill="#ffffff" fontSize="9.6" fontWeight="700" letterSpacing="1.4" className="font-sans">
        <textPath href={`#${ringId}`} textLength="246" lengthAdjust="spacing">
          STAMPED • ONE CARD • ONE STAMP •
        </textPath>
      </text>
      <path d="M47 61l9 9 18-20" fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The four last digits, only if they really are four digits. */
function cleanLast4(v: string | undefined): string | null {
  const d = v?.replace(/\D/g, "") ?? "";
  return d.length >= 4 ? d.slice(-4) : null;
}

/**
 * A tilted, glossy debit card drawn in CSS (no images, no real card data): silver chip, contactless mark, masked
 * number and RuPay-style corner text. `stamped` presses the round saffron seal onto it (it lands once; a faint dashed
 * ring marks the spot until then). Floats gently unless `float={false}`; all motion is off under prefers-reduced-motion.
 * Fills its container's width up to `max-w-[400px]` (override with className); text scales with the card.
 */
export function BankCard({
  stamped = false,
  last4,
  float = true,
  tilt = true,
  land = true,
  label,
  className,
}: {
  stamped?: boolean;
  /** Shown as "•••• •••• •••• 1234". Anything that isn't 4+ digits shows dots only. */
  last4?: string;
  /** Gentle bob (default on). */
  float?: boolean;
  /** Turned −7° like a card on a table (default on). */
  tilt?: boolean;
  /** Play the seal's landing when it appears (default on). */
  land?: boolean;
  /** Replaces the accessible description. */
  label?: string;
  className?: string;
}) {
  const digits = cleanLast4(last4);
  const description =
    label ??
    `A bank card${digits ? ` ending ${digits}` : ""}${stamped ? ", stamped by Watermark" : ""}`;

  return (
    <div role="img" aria-label={description} className={cx("w-full max-w-[400px]", tilt && "px-[4%] py-[5%]", className)}>
      {/* The padding above keeps the turned corners inside the box (no sideways scroll at 390px). */}
      <div className={cx("@container", float && "motion-safe:animate-float")}>
        <div
          aria-hidden="true"
          className={cx(
            "relative aspect-[1.586/1] w-full overflow-hidden rounded-[5.5cqw] shadow-object ring-1 ring-white/10",
            tilt && "rotate-[-7deg]",
          )}
          style={{
            backgroundColor: "#111111",
            // The sheen is the site's one allowed gradient (playbook §4): a soft diagonal light streak on the plastic.
            backgroundImage:
              "linear-gradient(118deg, rgba(255,255,255,0) 28%, rgba(255,255,255,0.11) 44%, rgba(255,255,255,0) 58%), linear-gradient(160deg, #2b2b2b 0%, #121212 55%, #0b0b0b 100%)",
          }}
        >
          {/* Top row: issuer line and DEBIT. */}
          <div className="absolute left-[7%] right-[7%] top-[9%] flex items-baseline justify-between">
            <span className="text-[4.4cqw] font-semibold tracking-[-0.02em] text-white/90">Your bank</span>
            <span className="text-[2.9cqw] font-semibold tracking-[0.18em] text-white/55">DEBIT</span>
          </div>

          {/* Chip and contactless mark. */}
          <div className="absolute left-[7%] top-[33%] flex items-center gap-[3.5cqw]">
            <div
              className="relative h-[10.5cqw] w-[13.5cqw] overflow-hidden rounded-[1.8cqw]"
              style={{ backgroundImage: "linear-gradient(135deg, #efefeb 0%, #b9b9b3 48%, #e3e3de 100%)" }}
            >
              <svg viewBox="0 0 54 42" className="absolute inset-0 size-full" preserveAspectRatio="none">
                <path
                  d="M0 14h17M0 28h17M37 14h17M37 28h17M17 0v42M37 0v42M17 21h20"
                  fill="none"
                  stroke="#5e5e59"
                  strokeOpacity=".55"
                  strokeWidth="1.6"
                />
              </svg>
            </div>
            <svg viewBox="0 0 24 24" className="h-[7cqw] w-[7cqw] text-white/70">
              <path
                d="M8 7.5a6.5 6.5 0 0 1 0 9M11.5 5a10 10 0 0 1 0 14M15 2.8a13.2 13.2 0 0 1 0 18.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Masked number. */}
          <p className="absolute left-[7%] top-[60%] whitespace-nowrap font-mono text-[5.4cqw] tracking-[0.08em] text-white/90">
            •••• •••• •••• {digits ?? "••••"}
          </p>

          {/* Bottom row: expiry and the RuPay-style corner. */}
          <div className="absolute bottom-[8%] left-[7%] right-[7%] flex items-end justify-between">
            <span className="font-mono text-[2.8cqw] tracking-[0.12em] text-white/50">VALID THRU ••/••</span>
            <span className="text-[6.2cqw] font-bold italic leading-none tracking-[-0.03em] text-white">RuPay</span>
          </div>

          {/* The stamp, or a faint ring where it will land. */}
          <div className="absolute right-[6%] top-[19%] w-[29%] rotate-[-12deg]">
            {stamped ? (
              <StampSeal land={land} className="w-full drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]" />
            ) : (
              <svg viewBox="0 0 120 120" className="block w-full">
                <circle
                  cx="60"
                  cy="60"
                  r="56"
                  fill="none"
                  stroke="#ffffff"
                  strokeOpacity=".22"
                  strokeWidth="2"
                  strokeDasharray="5 6"
                />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
