import { LineIcon } from "@/app/_art";
import { ExternalLink, SwipeRow } from "@/app/_site";
import { DOCS } from "@/lib/site.ts";
import { GOOD_TO_KNOW, PRIVACY_EYEBROW, PRIVACY_ROWS, PRIVACY_TITLE, PRIVACY_TRUST } from "./copy.ts";
import { SectionHead, WRAP } from "./kit";

/*
 * SITE_FINAL "Page 1" section 7, "Privacy and limits" (short, id="privacy"). Two columns: what we see, store and put
 * on-chain (docs/PRIVACY.md: the prover sees card data briefly, in memory, then wipes it; never claim it stays on the
 * phone), and the plain limits (docs/INTEGRATE.md "Limits"). Server component, no JS.
 */

const ROW_ICON = ["card", "lock", "receipt"] as const;

export function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-title" className="scroll-mt-6 pb-4 pt-16 sm:pt-20 lg:pt-24">
      <div className={WRAP}>
        <SectionHead id="privacy" eyebrow={PRIVACY_EYEBROW} title={PRIVACY_TITLE} />

        {/* Phones: one card per point in a row you swipe (what we see, keep and put on-chain, the trust note, the
            limits), instead of a long stacked panel. From 640px: the two panels below. */}
        <SwipeRow
          label="Privacy and limits"
          dotsClassName="sm:hidden"
          className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
        >
          {PRIVACY_ROWS.map((row, i) => (
            <li key={row.label} className="flex w-[78%] max-w-[320px] shrink-0 snap-start flex-col rounded-card bg-surface p-6">
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-full bg-white text-ink ring-1 ring-black/[0.05]"
              >
                <LineIcon name={ROW_ICON[i] ?? "lock"} size={22} />
              </span>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.02em]">{row.label}</h3>
              <p className="mt-2 text-pretty leading-relaxed text-muted">{row.text}</p>
            </li>
          ))}
          <li className="flex w-[78%] max-w-[320px] shrink-0 snap-start flex-col justify-between rounded-card bg-ink p-6 text-white">
            <p className="text-pretty text-lg leading-relaxed">{PRIVACY_TRUST}</p>
            <ExternalLink href={DOCS.privacy} className="mt-6 text-base font-medium text-white">
              Read our privacy notes
            </ExternalLink>
          </li>
          <li className="flex w-[78%] max-w-[320px] shrink-0 snap-start flex-col rounded-card border border-line bg-white p-6">
            <h3 className="text-xl font-semibold tracking-[-0.02em]">Good to know</h3>
            <ul className="mt-4 space-y-3">
              {GOOD_TO_KNOW.map((line) => (
                <li key={line} className="flex gap-3 text-pretty text-[15px] leading-relaxed">
                  <span aria-hidden="true" className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-ink" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </li>
        </SwipeRow>

        <div className="mt-12 hidden grid-cols-1 gap-4 sm:mt-16 sm:grid sm:gap-6 lg:grid-cols-12">
          <div className="min-w-0 rounded-card bg-surface p-6 sm:p-8 lg:col-span-7">
            <h3 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-2xl">
              What we see, store and put on-chain
            </h3>
            <dl className="mt-6 divide-y divide-[#e2e2df] border-y border-[#e2e2df]">
              {PRIVACY_ROWS.map((row, i) => (
                <div key={row.label} className="grid gap-1 py-4 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
                  <dt className="flex items-center gap-2.5 font-semibold">
                    <LineIcon name={ROW_ICON[i] ?? "lock"} size={20} className="shrink-0" />
                    {row.label}
                  </dt>
                  <dd className="text-pretty leading-relaxed text-muted">{row.text}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 text-pretty text-base leading-relaxed">{PRIVACY_TRUST}</p>
            <p className="mt-4">
              <ExternalLink href={DOCS.privacy} className="text-base font-medium">
                Read our privacy notes
              </ExternalLink>
            </p>
          </div>

          <div className="min-w-0 rounded-card border border-line p-6 sm:p-8 lg:col-span-5">
            <h3 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-2xl">Good to know</h3>
            <ul className="mt-6 space-y-4">
              {GOOD_TO_KNOW.map((line) => (
                <li key={line} className="flex gap-3 text-pretty text-base leading-relaxed">
                  <span aria-hidden="true" className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-ink" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
