import { LineIcon } from "@/app/_art";
import { USES, USES_CHECK, USES_LEAD, USES_TITLE } from "./copy.ts";
import { BAND, SectionHead, WRAP } from "./kit";

/*
 * "Anywhere bots cost you *money*." (id="uses"): what Watermark is for, beyond one airdrop. Six plain cards (three
 * across from 900px, two on tablets, one on phones), then the one function every use shares. Server component, no JS.
 */
export function Uses() {
  return (
    <section id="uses" aria-labelledby="uses-title" className={BAND}>
      <div className={WRAP}>
        <SectionHead id="uses" eyebrow="What it stops" title={USES_TITLE} lead={USES_LEAD} />

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 sm:gap-6 min-[56.25rem]:grid-cols-3">
          {USES.map((u) => (
            <li key={u.title} className="flex min-w-0 flex-col rounded-card bg-surface p-6 sm:p-8">
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center rounded-full bg-white text-ink ring-1 ring-black/[0.05]"
              >
                <LineIcon name={u.icon} size={24} />
              </span>
              <h3 className="mt-6 text-[22px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-2xl">{u.title}</h3>
              <p className="mt-2 text-pretty text-base leading-relaxed text-muted sm:text-[17px]">{u.body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-pretty text-base text-muted sm:mt-10">
          Behind all of them is the same one-line check:{" "}
          <code className="rounded-md bg-surface px-2 py-1 font-mono text-[0.92em] text-ink">{USES_CHECK}</code>
        </p>
      </div>
    </section>
  );
}
