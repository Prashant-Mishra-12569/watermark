import { LineIcon } from "@/app/_art";
import { ExternalLink, PillButton, StatusChip } from "@/app/_site";
import { DOCS, repoFileUrl } from "@/lib/site.ts";
import {
  COMING_SOON,
  CONTROL_LEAD,
  CONTROL_TITLE,
  DOWNLOAD_LIST,
  OWN_LIST,
  acceptedCategories,
  controlFacts,
  type ControlPolicy,
} from "./copy.ts";
import { BAND, SectionHead, WRAP } from "./kit";

/*
 * SITE_FINAL "Page 1" section 5, "You decide who *counts*." (id="control"; /sponsor redirects here). Four facts on
 * the 12-column grid, built from the live app's published card list (lib/policy-summary.ts reads policies/*.json at
 * build time, so the 480 KB list never reaches the browser), then the networks that are coming and the links to the
 * list itself and to running your own. Server component, no JS.
 */
export function Control({ policy, policyFile }: { policy: ControlPolicy | null; policyFile: string | null }) {
  const facts = controlFacts(policy);
  const categories = acceptedCategories(policy);
  // INTEGRATE.md's "Your own app with your own filter" section (GitHub's heading anchor).
  const ownListHref = `${DOCS.integrate}#your-own-app-with-your-own-filter`;

  return (
    <section id="control" aria-labelledby="control-title" className={BAND}>
      <div className={WRAP}>
        <SectionHead id="control" eyebrow="You stay in control" title={CONTROL_TITLE} lead={CONTROL_LEAD} />

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 sm:gap-6 md:grid-cols-2">
          {facts.map((fact) => (
            <li key={fact.key} className="flex min-w-0 flex-col rounded-card bg-surface p-6 sm:p-8">
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-full bg-white text-ink ring-1 ring-black/[0.05]"
              >
                <LineIcon name={fact.icon} size={24} />
              </span>
              <h3 className="mt-6 text-[22px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-2xl">{fact.title}</h3>
              <p className="mt-2 text-pretty text-base leading-relaxed text-muted sm:text-[17px]">{fact.line}</p>
              {fact.stats && fact.stats.length > 0 && (
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  {fact.stats.map((st) => (
                    <div
                      key={st.label}
                      className="flex min-w-0 flex-col-reverse justify-end gap-1 rounded-inner bg-white p-4 ring-1 ring-black/[0.04]"
                    >
                      <dt className="text-pretty text-sm leading-snug text-muted">{st.label}</dt>
                      <dd className="text-[32px] font-semibold leading-none tracking-[-0.03em] tabular-nums">{st.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {fact.key === "cards" && categories.length > 0 && (
                <ul aria-label="Card types on the list" className="mt-5 flex flex-wrap gap-2">
                  {categories.map((c) => (
                    <li
                      key={c}
                      className="rounded-full border border-black/[0.08] bg-white px-3 py-0.5 text-sm font-medium leading-6"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-6 rounded-card border border-line p-6 sm:mt-6 sm:p-8 min-[56.25rem]:flex-row min-[56.25rem]:items-center min-[56.25rem]:justify-between">
          <p className="flex flex-wrap items-center gap-3 text-lg">
            <span className="font-semibold">{COMING_SOON.title}</span>
            <StatusChip status="planned" />
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
            {policyFile && (
              <PillButton href={repoFileUrl(`policies/${policyFile}`)} variant="secondary" arrow>
                {DOWNLOAD_LIST}
              </PillButton>
            )}
            <ExternalLink href={ownListHref} className="text-base font-medium">
              {OWN_LIST}
            </ExternalLink>
          </div>
        </div>
      </div>
    </section>
  );
}
