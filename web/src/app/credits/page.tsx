import type { Metadata } from "next";
import { ExternalLink, Headline } from "@/app/_site";
import { DRAWN_IN_CODE, FONT_CREDITS } from "./credits-data.ts";

export const metadata: Metadata = {
  title: "Credits · Watermark",
  description: "The fonts this site uses, where they come from and their licences. Every picture is drawn in code.",
};

/*
 * /credits (footer link): only what the site really uses (credits-data.ts; credits.test.ts keeps it in step with
 * layout.tsx and web/public). Static, no JS.
 */

export default function CreditsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
      <header className="max-w-3xl">
        <Headline as="h1">Asset *credits*.</Headline>
        <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-muted sm:text-xl">
          The fonts this site uses, where they come from and their licences. Every picture you see is drawn in code for
          Watermark.
        </p>
      </header>

      <section aria-labelledby="credits-fonts-title" className="mt-16 border-t border-line pt-10 sm:mt-20">
        <h2 id="credits-fonts-title" className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          Fonts
        </h2>
        <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
          Fetched from Google Fonts when the site is built, then served from this site. Your browser never contacts
          Google.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FONT_CREDITS.map((f) => (
            <li key={f.name} className="flex min-w-0 flex-col rounded-card bg-surface p-5 sm:p-6">
              <p className="text-2xl font-semibold tracking-[-0.02em]">{f.name}</p>
              <dl className="mt-4 grid gap-3 text-sm leading-relaxed">
                <div className="min-w-0">
                  <dt className="text-muted">Used for</dt>
                  <dd>{f.usedFor}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted">By</dt>
                  <dd>{f.by}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted">Licence</dt>
                  <dd>
                    <ExternalLink href={f.licenceUrl} arrow={false}>
                      {f.licence}
                    </ExternalLink>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted">Source</dt>
                  <dd className="min-w-0 break-words">
                    <ExternalLink href={f.source} arrow={false} className="[overflow-wrap:anywhere]">
                      {f.source.replace(/^https:\/\//, "")}
                    </ExternalLink>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="credits-drawn-title" className="mt-16 border-t border-line pt-10 sm:mt-20">
        <h2 id="credits-drawn-title" className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          Pictures
        </h2>
        <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
          Drawn in code for this project. No stock photos, no emoji art, no images from anyone else.
        </p>
        <ul className="mt-6 grid max-w-3xl gap-2">
          {DRAWN_IN_CODE.map((line) => (
            <li key={line} className="flex gap-3 leading-relaxed">
              <span aria-hidden="true" className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-saffron" />
              {line}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
