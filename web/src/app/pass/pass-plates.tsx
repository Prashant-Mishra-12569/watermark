import { cx, emphasize, Headline, PassArt } from "@/app/_site";
import { PASS_PLATES, passArtEdition, passArtId, passPlate } from "@/lib/pass-art.ts";

/**
 * "5 Mumbai plates · 20 stamps each": the first stamp of each plate (#001, #021, #041, #061, #081), drawn from the same
 * SVG the contract stores. With `mine` (the visitor's claimed token id) their plate gets a saffron ring and "Yours".
 * Below ~900px: a row of 150px (phones) or 176px stamps that scrolls sideways inside itself (the page never does),
 * the visitor's plate first. From 900px: one row of five in plate order, each stamp ~155-195px wide (never above
 * 200px).
 * No hooks and no "use client": the server page and the client flow both render it.
 */
export function PassPlates({ mine }: { mine?: string | null }) {
  const mineId = passArtId(mine);
  const minePlate = mineId === null ? null : passPlate(mineId);
  return (
    <section aria-labelledby="pass-plates-title" className="pb-20 sm:pb-24">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
        {/* Two whole phrases: on one line with the dot between them, or (phones) one under the other without it. */}
        <Headline as="h2" size="card" id="pass-plates-title">
          <span className="whitespace-nowrap">5 {emphasize("*Mumbai*")} plates</span>
          <span aria-hidden="true" className="max-sm:hidden">
            {" · "}
          </span>
          <span className="sr-only">, </span>
          <span className="whitespace-nowrap max-sm:block">20 stamps each</span>
        </Headline>
        <p className="max-w-[46ch] text-muted">Each NFT is a stamp its contract draws on-chain. Your number picks the landmark.</p>
      </div>
      <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 pt-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 min-[56.25rem]:mx-0 min-[56.25rem]:grid min-[56.25rem]:grid-cols-5 min-[56.25rem]:gap-5 min-[56.25rem]:overflow-visible min-[56.25rem]:px-0 min-[56.25rem]:pb-0 min-[56.25rem]:pt-0 lg:gap-8">
        {PASS_PLATES.map((p) => {
          const yours = minePlate?.first === p.first;
          const range = `#${passArtEdition(p.first)}–#${passArtEdition(p.last)}`;
          return (
            // On phones the visitor's plate leads the row, so "Yours" is in view without scrolling sideways.
            <li
              key={p.first}
              className={cx(
                "w-[150px] shrink-0 snap-start sm:w-[176px] min-[56.25rem]:w-auto min-[56.25rem]:min-w-0",
                yours && "order-first min-[56.25rem]:order-none",
              )}
            >
              <figure className="flex max-w-[200px] flex-col gap-3">
                <PassArt
                  tokenId={p.first}
                  alt={`Stamp #${passArtEdition(p.first)}, ${p.landmark}`}
                  className={cx("w-full", yours && "ring-2 ring-saffron ring-offset-4 ring-offset-white")}
                />
                <figcaption className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 font-mono text-xs tabular-nums text-muted">
                    {range}
                    {yours && mineId !== null && (
                      <span className="inline-flex items-center gap-1 font-sans font-medium text-ink">
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-saffron" />
                        Yours: #{passArtEdition(mineId)}
                      </span>
                    )}
                  </span>
                  <span className="text-[15px] font-medium leading-snug tracking-[-0.01em]">{p.landmark}</span>
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
