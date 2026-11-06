import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { LineIcon, type LineIconName } from "@/app/_art";
import { cx, emphasize, ExternalLink, Headline, PillButton, Step, SwipeRow } from "@/app/_site";
import { DOCS } from "@/lib/site.ts";
import { ANDROID_SOURCE_URL, APK_FILE_NAME, APK_PUBLIC_URL, apkDownload, formatSize } from "./apk";
import { DownloadQr } from "./download-qr";

export const metadata: Metadata = {
  title: "Get the app · Watermark",
  description:
    "Watermark Tap: our free Android app checks your bank card with one tap. You only need it once, to stamp your wallet.",
};

/*
 * /app: "Get the app". Where Watermark Tap (android/) is downloaded. The APK isn't in git: the page looks for
 * web/public/download/watermark-tap.apk on every request and, while it's missing, says so instead of showing a
 * download button or a QR that would lead to a 404.
 */

const COPY = {
  eyebrow: "Watermark Tap",
  eyebrowTail: "Android",
  title: "Tap your card, *once*.",
  sub: "Our free Android app checks your bank card with one tap. You only need it once, to stamp your wallet.",
  download: "Download for Android (.apk)",
  back: "Back to the drop",
  missing: "The Android app is being published.",
  missingTail: "Find us at the Watermark table and tap your card on our phone.",
  qrCaption: "Scan with your Android phone",
  qrMissing: "The QR code appears here when the app is published.",
} as const;

const NEEDS: readonly { icon: LineIconName; title: string; note?: string }[] = [
  { icon: "phone", title: "Android 8 or newer" },
  { icon: "tap", title: "NFC turned on" },
  { icon: "card", title: "A RuPay debit card from India", note: "Visa and Mastercard coming." },
];

const INSTALL: readonly { title: string; body: ReactNode }[] = [
  { title: "Download the file", body: <>Get {APK_FILE_NAME} from this page, on your Android phone.</> },
  {
    title: "Allow the install",
    body: <>Open it and allow &ldquo;Install unknown apps&rdquo; for your browser when Android asks.</>,
  },
  { title: "Open and scan", body: <>Open Watermark Tap and scan the QR on usewatermark.xyz.</> },
];

const READS: readonly { icon: LineIconName; text: string }[] = [
  {
    icon: "card",
    text: "Your card's public certificates and a one-time signature. These include your card number.",
  },
  { icon: "lock", text: "It's locked on your phone. Only our server can open it, and it uses it once and then wipes it." },
];

const NEVER: readonly string[] = [
  "Charges money",
  "Asks for your PIN",
  "Stores your card data",
  "Puts your card number on-chain",
];

export default async function AppPage() {
  // Read the disk per request, not at build time: the APK is dropped in after the site is deployed.
  await connection();
  const apk = apkDownload();

  return (
    <main className="w-full">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Hero apk={apk} />
        <Needs />
        <Install />
        <Privacy />
        <p className="border-t border-line py-10 text-sm leading-relaxed text-muted [overflow-wrap:anywhere]">
          Source code:{" "}
          <ExternalLink href={ANDROID_SOURCE_URL} className="text-ink">
            github.com/Prashant-Mishra-12569/watermark
          </ExternalLink>{" "}
          (android/)
        </p>
      </div>
    </main>
  );
}

/**
 * Words and buttons on the left; the QR on the right from lg (a laptop visitor scans it with their phone). Phones
 * don't get the QR: they are the phone, so the download button is the way in. The left column is a size container,
 * so the H1 sizes from its own width and "Keep it private." stays on one line at any width.
 */
function Hero({ apk }: { apk: { href: string; qr: string; bytes: number | null } | null }) {
  return (
    <section
      aria-labelledby="app-title"
      className="grid grid-cols-1 gap-y-12 pb-16 pt-10 sm:pb-20 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-center lg:gap-x-16 lg:pt-16 xl:gap-x-24"
    >
      <div className="@container min-w-0">
        <p className="inline-flex max-w-full items-center gap-x-2 rounded-full bg-white py-1.5 pl-3 pr-3.5 text-[12.5px] font-medium leading-5 shadow-float ring-1 ring-black/[0.04] sm:text-sm">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-saffron" />
          <span className="whitespace-nowrap">{COPY.eyebrow}</span>
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <span className="whitespace-nowrap text-muted">
            <span className="sr-only">, </span>
            {COPY.eyebrowTail}
          </span>
        </p>
        <h1
          id="app-title"
          className="mt-6 text-balance text-[length:clamp(38px,min(11.5cqi,11svh),84px)] font-semibold leading-[1] tracking-[-0.035em]"
        >
          {emphasize(COPY.title)}
        </h1>
        <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted sm:text-xl">{COPY.sub}</p>

        {apk ? (
          <div className="mt-9">
            <div className="flex flex-wrap items-center gap-3">
              <DownloadButton href={apk.href} />
              <PillButton href="/pass" variant="secondary" className="max-sm:min-h-12 sm:min-h-14 sm:text-lg">
                {COPY.back}
              </PillButton>
            </div>
            <p className="mt-4 text-sm text-muted">
              <span className="font-mono text-[13px]">{APK_FILE_NAME}</span>{apk.bytes ? ` · ${formatSize(apk.bytes)}` : ""} · Free
            </p>
          </div>
        ) : (
          <div className="mt-9 max-w-xl">
            <div role="status" className="flex gap-3.5 rounded-inner border border-line bg-surface p-4 sm:p-5">
              <span aria-hidden="true" className="mt-[0.45em] size-2 shrink-0 rounded-full border-[1.5px] border-ink" />
              <p className="leading-relaxed">
                <span className="font-semibold">{COPY.missing}</span> {COPY.missingTail}
              </p>
            </div>
            <div className="mt-5">
              <PillButton href="/pass" variant="secondary">
                {COPY.back}
              </PillButton>
            </div>
          </div>
        )}
      </div>

      <figure className="mx-auto hidden w-full max-w-[380px] lg:mx-0 lg:block">
        <div className="rounded-card bg-surface p-7">
          {apk ? (
            <div className="overflow-hidden rounded-inner bg-white shadow-float ring-1 ring-black/[0.04]">
              <DownloadQr value={apk.qr} label="QR code that downloads Watermark Tap for Android" />
            </div>
          ) : (
            <div className="grid aspect-square place-items-center rounded-inner border border-dashed border-[#d4d4d4] bg-white p-8 text-center">
              <div>
                <LineIcon name="phone" size={36} className="mx-auto text-muted" />
                <p className="mx-auto mt-4 max-w-[22ch] text-balance text-sm leading-relaxed text-muted">
                  {COPY.qrMissing}
                </p>
              </div>
            </div>
          )}
        </div>
        <figcaption className={cx("mt-4 text-center", !apk && "text-muted")}>
          <span className="block font-semibold tracking-[-0.01em]">{COPY.qrCaption}</span>
          <span className="mt-1 block font-mono text-xs text-muted [overflow-wrap:anywhere]">
            {(apk?.qr ?? APK_PUBLIC_URL).replace(/^https:\/\//, "")}
          </span>
        </figcaption>
      </figure>
    </section>
  );
}

/**
 * The site's primary pill (PillButton "primary": black, white circle) as a plain <a download>: PillButton renders
 * internal paths through next/link, which would try a client-side navigation to the file. The circle holds a ↓.
 */
function DownloadButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      download={APK_FILE_NAME}
      type="application/vnd.android.package-archive"
      className="group/pill inline-flex min-h-12 max-w-full select-none items-center justify-center gap-3 whitespace-nowrap rounded-full bg-ink pl-6 pr-1.5 text-base font-semibold tracking-[-0.01em] text-white transition-[background-color,transform] duration-150 hover:bg-[#262626] active:scale-[0.98] sm:min-h-14 sm:gap-3.5 sm:pl-7 sm:pr-2 sm:text-lg"
    >
      <span className="min-w-0 truncate">{COPY.download}</span>
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-ink transition-transform duration-200 motion-safe:group-hover/pill:translate-y-0.5 sm:size-10"
      >
        <svg viewBox="0 0 16 16" focusable="false" className="block size-4 sm:size-[18px]">
          <path
            d="M8 2.75v7.5M4.75 7l3.25 3.25L11.25 7M3.5 13.25h9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </a>
  );
}

/** Requirements: one row of three on wide screens, a stack on phones. */
function Needs() {
  return (
    <section aria-labelledby="app-needs-title" className="pb-16 sm:pb-20">
      <h2 id="app-needs-title" className="text-sm font-medium text-muted">
        What you need
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-inner border border-line bg-line sm:grid-cols-3">
        {NEEDS.map((n) => (
          <li key={n.title} className="flex min-w-0 items-start gap-3.5 bg-white p-5 sm:flex-col sm:gap-4 sm:p-6">
            <LineIcon name={n.icon} size={24} className="mt-px shrink-0 text-ink" />
            <div className="min-w-0">
              <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{n.title}</p>
              {n.note && <p className="mt-1 text-[15px] leading-snug text-muted">{n.note}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Install() {
  return (
    <section aria-labelledby="app-install-title" className="border-t border-line py-16 sm:py-20">
      <Headline id="app-install-title">Install in *three* steps.</Headline>
      <p className="mt-5 max-w-[60ch] text-pretty text-lg leading-relaxed text-muted sm:text-xl">
        The app isn&rsquo;t from the Play Store, so Android asks you once.
      </p>
      {/* Phones and small tablets: a row you swipe; three across from 768px. */}
      <SwipeRow
        as="ol"
        label="Install steps"
        dotsClassName="md:hidden"
        className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden md:mx-0 md:mt-10 md:grid md:snap-none md:grid-cols-3 md:overflow-visible md:px-0 md:py-0"
      >
        {INSTALL.map((s, i) => (
          <Step
            key={s.title}
            n={i + 1}
            title={s.title}
            body={s.body}
            className="wm-lift w-[80%] max-w-[340px] shrink-0 snap-start sm:w-[46%] md:w-auto md:max-w-none"
          />
        ))}
      </SwipeRow>
      <p className="mt-6 flex gap-3 text-[15px] leading-relaxed text-muted">
        <span aria-hidden="true" className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-saffron" />
        We&rsquo;re a hackathon project, so the app isn&rsquo;t on the Play Store yet.
      </p>
    </section>
  );
}

function Privacy() {
  return (
    <section aria-labelledby="app-privacy-title" className="border-t border-line py-16 sm:py-20">
      <Headline id="app-privacy-title">
        What it reads. What it *never* does.
      </Headline>
      <div className="mt-10 grid gap-3 md:grid-cols-2">
        <div className="min-w-0 rounded-card bg-surface p-7 sm:p-8">
          <h3 className="text-2xl font-semibold tracking-[-0.025em]">Reads</h3>
          <ul className="mt-6 grid gap-5">
            {READS.map((r) => (
              <li key={r.text} className="flex gap-3.5 leading-relaxed">
                <LineIcon name={r.icon} size={22} className="mt-0.5 shrink-0 text-ink" />
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 rounded-card border border-line bg-white p-7 sm:p-8">
          <h3 className="text-2xl font-semibold tracking-[-0.025em]">Never</h3>
          <ul className="mt-6 grid gap-4">
            {NEVER.map((t) => (
              <li key={t} className="flex items-center gap-3.5 leading-relaxed">
                <LineIcon name="cross" size={22} className="shrink-0 text-ink" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="mt-6 text-[15px] leading-relaxed text-muted">
        <ExternalLink href={DOCS.privacy}>Read the privacy notes</ExternalLink>
      </p>
    </section>
  );
}
