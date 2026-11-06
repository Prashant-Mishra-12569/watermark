import type { CSSProperties, ReactNode } from "react";
import { LineIcon } from "@/app/_art";
import { StampSeal } from "@/app/_site";
import { cx } from "@/app/_site/cx";
import { HOW_STEPS, HOW_TITLE, type StepIcon } from "./copy.ts";
import styles from "./how.module.css";
import { BAND, SectionHead, WRAP } from "./kit";

/*
 * SITE_FINAL "Page 1" section 2, "Three steps. *Zero* bots." (id="how"): three step cards, each read top to bottom
 * (line icon and step, title, one line, then a small picture of that step on a white panel at the bottom). Three
 * across from 900px (like the home hero, so a laptop zoomed to 150% gets them side by side), stacked below that. Side
 * by side, the cards share two grid rows (subgrid): the words, then the pictures, so the three pictures start on the
 * same line and are the same height whatever the length of the words above them. Server component, no JS. The cards rise into place as they scroll in
 * (how.module.css); with reduced motion, or without scroll-driven animations, they are simply there. The pictures are
 * aria-hidden: the step text says it all.
 */

/** A white inner panel at the bottom of a step card. It fills its row, so the three panels share one height. */
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "flex flex-1 flex-col rounded-inner bg-white p-4 ring-1 ring-black/[0.04] sm:p-5 min-[56.25rem]:p-4 lg:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Step 1: the one word a contract adds (the onlyStamped modifier from docs/INTEGRATE.md), and, in the same panel,
 * the three places it can go.
 */
function CodeVisual() {
  return (
    <Panel className="justify-between gap-4">
      <div className="overflow-x-auto whitespace-nowrap font-mono text-[13px] leading-6 text-ink">
        <span className="block text-muted">{"// your airdrop contract"}</span>
        <span className="block">function claim()</span>
        <span className="block pl-4">
          external{" "}
          <span className="font-semibold underline decoration-saffron decoration-2 underline-offset-4">onlyStamped</span>{" "}
          {"{"}
        </span>
      </div>
      <ul className="flex flex-wrap gap-1.5 border-t border-line pt-3 text-xs font-medium leading-5 text-muted">
        {["Contract", "Backend", "AI agent"].map((where) => (
          <li key={where} className="rounded-full bg-surface px-2.5 py-0.5">
            {where}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** Step 2: tap → private proof → stamp, in the line-art style. */
function TapVisual() {
  const parts: { icon: "tap" | "lock" | "stamp"; label: string }[] = [
    { icon: "tap", label: "Tap" },
    { icon: "lock", label: "Private proof" },
    { icon: "stamp", label: "Stamp" },
  ];
  return (
    <Panel className="justify-center">
      <ol className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start">
        {parts.map((p, i) => (
          <li key={p.label} className="contents">
            {i > 0 && <span className="mt-[22px] block h-px w-5 bg-line sm:w-6" aria-hidden="true" />}
            <span className="flex min-w-0 flex-col items-center gap-2 text-center">
              <span
                className={cx(
                  "grid size-11 place-items-center rounded-full",
                  p.icon === "stamp" ? "bg-saffron/10 text-saffron" : "bg-surface text-ink",
                )}
              >
                <LineIcon name={p.icon} size={22} />
              </span>
              <span className="text-xs font-medium leading-4 text-muted">{p.label}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/** Step 3: what the check answers. Red only for "Refused"; the saffron seal marks the stamped wallet. */
function GateVisual() {
  return (
    <Panel className="justify-center py-2 sm:py-2.5">
      <ul className="divide-y divide-line text-[13px] leading-5">
        <li className="flex items-center gap-3 py-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-muted">
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false" className="block size-3">
              <path d="M3.3 3.3l5.4 5.4M8.7 3.3l-5.4 5.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1 truncate text-muted">No stamp</span>
          <span className="font-medium text-error">Refused</span>
        </li>
        <li className="flex items-center gap-3 py-2.5">
          <StampSeal className="size-7 shrink-0 -rotate-12" />
          <span className="min-w-0 flex-1 truncate text-ink">Stamped</span>
          <span className="font-semibold text-ink">Allowed</span>
        </li>
      </ul>
    </Panel>
  );
}

const VISUAL: Record<StepIcon, ReactNode> = {
  code: <CodeVisual />,
  tap: <TapVisual />,
  shield: <GateVisual />,
};

export function How() {
  return (
    <section id="how" aria-labelledby="how-title" className={BAND}>
      <div className={WRAP}>
        <SectionHead id="how" eyebrow="How it works" title={HOW_TITLE} />

        {/* One simple card per step at every size: step label, title, line, then the picture at the bottom.
            Three across from 900px (two shared rows: words, pictures), stacked below that. */}
        <ol className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 sm:gap-6 min-[56.25rem]:grid-cols-3 min-[56.25rem]:grid-rows-[auto_1fr] min-[56.25rem]:gap-x-4 min-[56.25rem]:gap-y-0 lg:gap-x-6">
          {HOW_STEPS.map((step, i) => (
            <li
              key={step.title}
              style={{ "--wm-i": i } as CSSProperties}
              className={cx(
                "flex min-w-0 flex-col rounded-card bg-surface p-6 sm:p-8 min-[56.25rem]:row-span-2 min-[56.25rem]:grid min-[56.25rem]:grid-rows-subgrid min-[56.25rem]:p-6 lg:p-8",
                styles.card,
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-ink ring-1 ring-black/[0.05]"
                  >
                    <LineIcon name={step.icon} size={24} />
                  </span>
                  <span className="text-sm font-medium text-muted">Step {i + 1}</span>
                </div>
                <h3 className="mt-6 text-[24px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[26px] min-[56.25rem]:text-[22px] lg:text-[24px] xl:text-[26px]">
                  {step.title}
                </h3>
                <p className="mt-3 text-pretty text-base leading-relaxed text-muted sm:text-[17px]">
                  {step.body}
                </p>
              </div>
              <div aria-hidden="true" className="mt-auto flex min-w-0 flex-col pt-8 min-[56.25rem]:mt-0 min-[56.25rem]:pt-7">
                {VISUAL[step.icon]}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
