import { StatusChip, cx } from "@/app/_site";
import { isAddress, isTxHash, shortHex } from "@/lib/site.ts";
import { PROOF_LEAD, PROOF_TITLE } from "./copy.ts";
import { BAND, SectionHead, WRAP } from "./kit";
import { PROOF_RECEIPTS, type ProofReceipt } from "./proof-data.ts";

/*
 * SITE_FINAL "Page 1" section 6, "See it *yourself*." (id="proof"): five real public records as paper receipts: a row
 * you swipe on phones, a calm grid from 640px (2 + 2 + one full-width card on tablets; two wide on top, three below
 * from lg). Every value comes from lib/evidence.ts and deployments/*.json
 * (proof-data.ts). Server component, no JS. Each whole card is one link to the explorer.
 */

/** "on-chain" never breaks at its hyphen ("on-" / "chain"). */
function keepOnChain(text: string) {
  const i = text.indexOf("on-chain");
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className="whitespace-nowrap">on-chain</span>
      {text.slice(i + "on-chain".length)}
    </>
  );
}

/** One paper receipt. The whole card is the link ("Check it ↗"), stretched over the slip. */
function Slip({ r, index, total }: { r: ProofReceipt; index: number; total: number }) {
  const titleId = `proof-${r.id}-title`;
  return (
    <article
      aria-labelledby={titleId}
      className="relative flex h-full flex-col rounded-inner bg-white p-6 text-ink shadow-[0_1px_2px_rgb(0_0_0/0.05),0_24px_48px_-24px_rgb(0_0_0/0.22)] ring-1 ring-black/[0.07] transition-shadow has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ink hover:shadow-[0_1px_2px_rgb(0_0_0/0.06),0_28px_56px_-24px_rgb(0_0_0/0.3)] sm:p-7"
    >
      {/* The kicker wraps (never cut) when a phone's card is narrow; the chip keeps its corner. */}
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 pt-0.5 text-xs font-medium leading-snug text-muted">{r.kicker}</span>
        <StatusChip status={r.status} />
      </div>
      <h3 id={titleId} className="mt-3 text-[19px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-xl">
        {r.title}
      </h3>
      <div aria-hidden="true" className="my-4 border-t border-dashed border-[#d6d6d2]" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 text-sm text-muted">{keepOnChain(r.total.label)}</span>
        <span className="shrink-0 text-2xl font-semibold tracking-[-0.02em] tabular-nums">{r.total.value}</span>
      </div>
      <p className="mt-2 truncate font-mono text-[13px] tabular-nums text-muted" title={r.ref}>
        {isTxHash(r.ref) || isAddress(r.ref) ? shortHex(r.ref) : r.ref}
      </p>
      {r.note && <p className="mt-1 text-xs leading-snug text-muted">{r.note}</p>}
      <div aria-hidden="true" className="flex-1" />
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-dashed border-[#d6d6d2] pt-4">
        <a
          href={r.href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline decoration-current/30 underline-offset-4 after:absolute after:inset-0 after:rounded-inner after:content-[''] hover:decoration-current"
        >
          Check it<span aria-hidden="true">&nbsp;↗</span>
          <span className="sr-only">: {r.title} (opens in a new tab)</span>
        </a>
        <span aria-hidden="true" className="font-mono text-[11px] tabular-nums text-muted">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
    </article>
  );
}

export function Proof() {
  const n = PROOF_RECEIPTS.length;
  return (
    <section id="proof" aria-labelledby="proof-title" className={BAND}>
      <div className={WRAP}>
        <SectionHead id="proof" eyebrow="Public records · Test networks" title={PROOF_TITLE} lead={PROOF_LEAD} />

        {/* Phones: one row you swipe (the next receipt peeks in from the right), so five receipts are not a 1,600px
            column. From 640px: the grid. */}
        <div className="mt-12 rounded-card bg-surface sm:mt-16 sm:p-6 lg:p-8">
          <ul
            aria-label="Public records"
            className={cx(
              "flex snap-x snap-mandatory scroll-px-3 gap-3 overflow-x-auto overscroll-x-contain rounded-card p-3 pb-7 [scrollbar-width:none]",
              "sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:rounded-none sm:p-0 lg:grid-cols-6 lg:gap-5",
            )}
          >
            {PROOF_RECEIPTS.map((r, i) => (
              <li
                key={r.id}
                className={cx(
                  "w-[84%] min-w-0 max-w-[340px] shrink-0 snap-start sm:w-auto sm:max-w-none",
                  i < 2 ? "lg:col-span-3" : "lg:col-span-2",
                  i === n - 1 && "sm:col-span-2 lg:col-span-2",
                )}
              >
                <Slip r={r} index={i} total={n} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
