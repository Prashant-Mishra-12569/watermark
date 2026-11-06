import { PASS_LIVE } from "@/lib/site.ts";
import { cx } from "../_site/cx";

export type DropStep = 1 | 2 | 3;

/** The drop's page (SITE_FINAL "Page 2"): every step links back to it. */
export const DROP_HUB = "/pass";

/** The three steps of the Genesis Drop, named as the /pass checklist names them (SITE_FINAL "Page 2"). */
export const DROP_STEPS: readonly { n: DropStep; title: string }[] = [
  { n: 1, title: "Tap your card" },
  { n: 2, title: "Send a free payment" },
  { n: 3, title: "Claim your NFT" },
];

/**
 * The top of /verify and /pay on the drop's walk (?next=pass, SITE_FINAL "Steps inside the drop"): the three steps
 * as a short progress bar. The flow header above it says "Genesis Drop · Step n of 3" and holds the way back (Exit),
 * so neither is repeated here. The current step is saffron, finished steps are ink with a check, later steps are
 * grey. While the drop isn't live, step 3 says "Opens soon". Server-safe.
 */
export function DropSteps({
  current,
  done = [],
  className,
}: {
  current: DropStep;
  /** Steps this wallet has finished (shown with a check). */
  done?: readonly DropStep[];
  className?: string;
}) {
  return (
    <div className={cx("w-full max-w-2xl", className)}>
      <ol aria-label={`Genesis Drop: step ${current} of 3`} className="grid grid-cols-3 gap-2 sm:gap-3">
        {DROP_STEPS.map((s) => {
          const state = done.includes(s.n) ? "done" : s.n === current ? "current" : "todo";
          const soon = s.n === 3 && !PASS_LIVE && state !== "done";
          return (
            <li key={s.n} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
              <span
                aria-hidden="true"
                className={cx(
                  "block h-1 rounded-full",
                  state === "done" ? "bg-ink" : state === "current" ? "bg-saffron" : "bg-line",
                )}
              />
              <p
                className={cx(
                  "mt-2.5 flex items-start gap-1.5 text-[13px] leading-snug sm:gap-2 sm:text-sm",
                  state === "todo" ? "text-muted" : "font-medium text-ink",
                )}
              >
                <StepMark n={s.n} state={state} />
                <span className="min-w-0">
                  {s.title}
                  {soon && <span className="block font-normal text-muted">Opens soon</span>}
                  <span className="sr-only">
                    {state === "done" ? " (done)" : state === "current" ? " (this step)" : ""}
                  </span>
                </span>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The step's number in a small circle, or a check once it is done. */
function StepMark({ n, state }: { n: DropStep; state: "done" | "current" | "todo" }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid size-[18px] shrink-0 place-items-center rounded-full text-[11px] font-semibold leading-none sm:size-5",
        state === "done" && "bg-ink text-white",
        state === "current" && "text-ink ring-[1.5px] ring-inset ring-saffron",
        state === "todo" && "ring-1 ring-inset ring-line",
      )}
    >
      {state === "done" ? (
        <svg viewBox="0 0 12 12" focusable="false" className="block size-2.5">
          <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        n
      )}
    </span>
  );
}
