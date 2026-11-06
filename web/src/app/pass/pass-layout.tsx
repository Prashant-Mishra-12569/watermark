import type { ReactNode } from "react";
import { LineIcon, WalletGrid, type LineIconName } from "@/app/_art";
import { CodeBlock, cx, Disclosure, emphasize, ExternalLink, Headline, NightCard, PillButton, StatusChip } from "@/app/_site";
import { PASS_COPY, PASS_GATE_CODE, type StepState } from "@/lib/genesis-pass.ts";
import { addressUrl, PASS_ADDRESS, PASS_FLOW } from "@/lib/site.ts";

/*
 * The /pass ("Watermark Genesis Drop", SITE_FINAL.md "Page 2") building blocks shared by the server page (drop not
 * open) and the client flow (drop open). No hooks and no "use client": they render on either side.
 */

/**
 * Phones and tablets: the words, then the NFT, then the steps and the questions. From 900px (the home hero's
 * breakpoint, so a laptop zoomed to 150% gets two columns too): words, steps and questions on the left; the NFT on the
 * right (a 340px column, 420px from lg), sticky while the left column scrolls. The left column is a size container, so
 * the H1 is sized from its own width and can never run into the NFT beside it.
 */
export function PassLayout({
  intro,
  art,
  children,
  after,
}: {
  intro: ReactNode;
  art: ReactNode;
  children: ReactNode;
  /** Under the steps in the left column (the questions). */
  after?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 gap-y-12 pb-20 pt-10 sm:pb-24 sm:pt-14 min-[56.25rem]:grid-cols-[minmax(0,1fr)_minmax(0,340px)] min-[56.25rem]:gap-x-10 min-[56.25rem]:gap-y-14 min-[56.25rem]:pt-[clamp(24px,5svh,64px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-x-14 xl:gap-x-20">
      <div className="@container min-w-0 min-[56.25rem]:col-start-1 min-[56.25rem]:row-start-1">{intro}</div>
      <div className="min-w-0 min-[56.25rem]:col-start-2 min-[56.25rem]:row-span-3 min-[56.25rem]:row-start-1">
        {/* The header doesn't stick, so the NFT can sit close to the top while the left column scrolls. */}
        <div className="min-[56.25rem]:sticky min-[56.25rem]:top-8">{art}</div>
      </div>
      <div className="min-w-0 min-[56.25rem]:col-start-1 min-[56.25rem]:row-start-2">{children}</div>
      {after && <div className="min-w-0 min-[56.25rem]:col-start-1 min-[56.25rem]:row-start-3">{after}</div>}
    </div>
  );
}

/** One line-art icon per fact: the free NFT, no fee, the fixed supply, one per bank card. */
const FACT_ICON: readonly LineIconName[] = ["ticket", "coin", "stamp", "card"];

/**
 * The H1's size, from the intro column's own width (cqi: PassLayout makes it a size container) and the screen's
 * height (svh, so a short laptop screen keeps the hero in view). One column (phones, tablets): at most 64px. Beside
 * the NFT (from 900px): on the home H1's scale, at most 68px, so it is always two lines ("A free NFT for / real
 * cardholders.", ~7.6em at most, under 80% of the column) and never reaches the NFT.
 */
const H1_SIZE =
  "text-[length:clamp(36px,min(14.5cqi,11svh),64px)] min-[56.25rem]:text-[length:clamp(40px,min(10cqi,7.8svh),68px)]";

/**
 * Eyebrow "Watermark Genesis Drop · protected by Watermark", the H1, the one paragraph and the four facts. The
 * eyebrow is one white pill line wherever it fits (12.5px on phones, one line at 390px); when the intro column is
 * under 21.5rem (phones under ~375px) the tail moves to its own line under the name, without the dot, instead of
 * wrapping word by word. The facts are a 2 × 2
 * grid until ~1100px (one row of four above), each a whole phrase on at most two lines.
 */
export function PassIntro() {
  return (
    <div>
      <p className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[20px] bg-white py-1.5 pl-3 pr-3.5 text-[12.5px] font-medium leading-5 shadow-float ring-1 ring-black/[0.04] sm:rounded-full sm:text-sm">
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-saffron" />
        <span className="whitespace-nowrap">{PASS_COPY.eyebrow}</span>
        <span aria-hidden="true" className="text-muted @max-[21.5rem]:hidden">
          ·
        </span>
        <span className="whitespace-nowrap text-muted @max-[21.5rem]:basis-full @max-[21.5rem]:pl-3.5">
          <span className="sr-only">, </span>
          {PASS_COPY.eyebrowTail}
        </span>
      </p>
      <h1 className={cx("mt-6 max-w-[13ch] text-balance font-semibold leading-[1] tracking-[-0.035em] min-[56.25rem]:mt-5 min-[56.25rem]:max-w-[15ch] min-[56.25rem]:leading-[1.02]", H1_SIZE)}>
        {emphasize(PASS_COPY.title)}
      </h1>
      <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted sm:text-xl">{PASS_COPY.sub}</p>
      <ul
        aria-label="The drop at a glance"
        className="mt-9 grid max-w-xl grid-cols-2 gap-px overflow-hidden rounded-inner border border-line bg-line min-[68.75rem]:max-w-2xl min-[68.75rem]:grid-cols-4"
      >
        {PASS_COPY.facts.map((fact, i) => (
          <li
            key={fact}
            className="flex min-w-0 flex-col gap-3 bg-white p-4 sm:flex-row sm:items-center sm:gap-3.5 sm:px-5 sm:py-4 min-[68.75rem]:flex-col min-[68.75rem]:items-start min-[68.75rem]:gap-3 min-[68.75rem]:p-5"
          >
            <LineIcon name={FACT_ICON[i] ?? "check"} size={22} className="shrink-0 text-ink" />
            <span className="min-w-0 text-[15px] font-semibold leading-snug tracking-[-0.01em]">{fact}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The stage's caption before anyone has claimed: the big stamp is #042, an example. */
export const PREVIEW_CAPTION = "Example: #042. The art is drawn fully on-chain.";

/** Chip dots stay black; green only for a real result ("✓ Claimed"). */
export type StageChip = { text: string; tone?: "ok" | "saffron" | "ink" };

/** Where the (up to) two chips sit: on the stage's padding, never over the number or the words. */
const CHIP_AT = [
  { top: "14px", left: "4%" },
  { top: "14px", right: "4%" },
] as const;

/**
 * The NFT on its stage: a big rounded surface with the stamp tilted a little and floating. `children` is the stamp
 * itself (PassArt: #042 as the example, or the visitor's own token); `meter` (the live "{N} left") sits in a white band
 * at the stage's foot, like a mint widget. Chips only for a claimed NFT: the facts row already says the rest.
 */
export function PassStage({
  children,
  caption,
  chips = [],
  meter,
}: {
  children: ReactNode;
  caption: ReactNode;
  chips?: StageChip[];
  meter?: ReactNode;
}) {
  return (
    <figure className="w-full max-w-[420px] min-[56.25rem]:mx-auto">
      <div className="overflow-hidden rounded-card bg-surface">
        <div className="relative px-8 pb-10 pt-16 sm:px-12 min-[56.25rem]:px-10 min-[56.25rem]:pb-9 min-[56.25rem]:pt-12 lg:px-12 lg:pt-16">
          {/*
            The stamp: 264px on phones, 300px on tablets, up to 320px beside the words (never wider than ~340px with
            its tilt). Beside the words it also shrinks with a short screen, so the stage and its "{N} left" stay in
            view while it sticks (stage ≈ 190px + 1.27 × the stamp's width).
          */}
          <div className="mx-auto w-[min(100%,264px)] motion-safe:animate-float sm:w-[min(100%,300px)] min-[56.25rem]:w-[min(100%,clamp(200px,calc((100svh_-_260px)*0.79),320px))]">
            <div className="rotate-[2deg]">{children}</div>
          </div>
          {chips.slice(0, 2).map((c, i) => (
            <FloatingChip key={c.text} chip={c} at={CHIP_AT[i] ?? CHIP_AT[0]} />
          ))}
        </div>
        {meter && <div className="border-t border-line bg-white px-6 py-5 sm:px-7">{meter}</div>}
      </div>
      <figcaption className="mt-4 text-balance text-center text-sm text-muted">{caption}</figcaption>
    </figure>
  );
}

/** A small white pill on the stage ("✓ Claimed", "$0 fee"). Decorative: the page says the same in words. */
function FloatingChip({ chip, at }: { chip: StageChip; at: { top?: string; left?: string; right?: string } }) {
  const check = chip.text.startsWith("✓");
  const text = check ? chip.text.slice(1).trim() : chip.text;
  return (
    <span
      aria-hidden="true"
      style={at}
      className="absolute z-10 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white py-1.5 pl-1.5 pr-3.5 text-sm font-medium leading-5 shadow-float ring-1 ring-black/[0.04] motion-safe:animate-rise"
    >
      {check ? (
        <span className={cx("grid size-6 place-items-center rounded-full text-white", chip.tone === "ok" ? "bg-ok" : "bg-ink")}>
          <svg viewBox="0 0 12 12" className="block size-3" focusable="false">
            <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : (
        <span className={cx("ml-1.5 size-1.5 rounded-full", chip.tone === "saffron" ? "bg-saffron" : "bg-ink")} />
      )}
      {text}
    </span>
  );
}

/** The site's line-art icons: tap the card, pay, the NFT itself. */
const STEP_ICON = { 1: "tap", 2: "coin", 3: "ticket" } as const;

const STATE_CHIP: Record<StepState, { text: string; className: string }> = {
  done: { text: "Done", className: "bg-ok-bg text-ok" },
  todo: { text: "To do", className: "border border-line bg-white text-muted" },
  unknown: { text: "Can't check now", className: "bg-note-bg text-note" },
};

/**
 * One step of the claim, as a card: a line-art icon, "1. Verify with your card", a state chip and whatever the step
 * needs (a line, a button). The step to do next stands out (white, raised). Without `state` it is a plain preview.
 */
export function StepItem({
  n,
  title,
  state,
  current = false,
  children,
}: {
  n: 1 | 2 | 3;
  title: string;
  state?: StepState;
  current?: boolean;
  children?: ReactNode;
}) {
  const done = state === "done";
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={cx(
        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 rounded-card p-5 sm:gap-x-5 sm:p-6",
        current ? "bg-white shadow-float ring-1 ring-line" : "bg-surface",
      )}
    >
      <div
        aria-hidden="true"
        className={cx(
          "relative grid size-12 shrink-0 place-items-center rounded-full ring-1 ring-line sm:row-span-2 sm:size-14 sm:self-start",
          current ? "bg-surface" : "bg-white",
        )}
      >
        <LineIcon name={STEP_ICON[n]} size={26} />
        {done && (
          <span className="absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-ink ring-2 ring-white">
            <svg viewBox="0 0 12 12" className="block size-3" focusable="false">
              <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>
      {/* The state chip follows its title instead of sitting in the card's far corner. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 sm:self-end">
        <h3 className="text-lg font-semibold tracking-[-0.02em] sm:text-xl">
          <span className="font-serif text-[1.15em] font-normal italic text-muted">{n}.</span> {title}
        </h3>
        {state && (
          <span
            className={cx(
              "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5",
              STATE_CHIP[state].className,
            )}
          >
            {done && <span aria-hidden="true">✓</span>}
            {STATE_CHIP[state].text}
          </span>
        )}
      </div>
      {children && (
        <div className="col-span-2 flex min-w-0 flex-col items-start gap-2 sm:col-span-1 sm:col-start-2 sm:self-start">
          {children}
        </div>
      )}
    </li>
  );
}

/** "Claim it in three steps." The checklist's heading, shared by the live checklist and the preview. */
export function StepsHeading({ id }: { id: string }) {
  return (
    <Headline as="h2" size="card" id={id}>
      {PASS_COPY.stepsTitle}
    </Headline>
  );
}

/** The three steps with their one-line explanations and no state: what the claim looks like before the drop opens. */
export function StepsPreview() {
  return (
    <section aria-labelledby="pass-steps-title" className="flex flex-col gap-5">
      <StepsHeading id="pass-steps-title" />
      <ol className="flex flex-col gap-3">
        <StepItem n={1} title={PASS_COPY.step1Title}>
          <p className="text-muted">{PASS_COPY.step1Body}</p>
        </StepItem>
        <StepItem n={2} title={PASS_COPY.step2Title}>
          <p className="text-muted">{PASS_COPY.step2Body}</p>
        </StepItem>
        <StepItem n={3} title={PASS_COPY.step3Title}>
          <p className="text-muted">{PASS_COPY.step3Body}</p>
        </StepItem>
      </ol>
    </section>
  );
}

/**
 * The drop isn't open (no NFT contract address, or the server has none): say so, offer what works today (verify your
 * wallet), and show the three steps it will take.
 */
export function NotLiveCard() {
  return (
    <div className="flex flex-col gap-12">
      <div className="rounded-card bg-surface p-6 sm:p-8">
        <StatusChip status="planned" label="Opens soon" />
        <p role="status" className="mt-4 max-w-[30ch] text-balance text-xl font-medium leading-snug tracking-[-0.01em] sm:text-2xl">
          {PASS_COPY.notConfigured}
        </p>
        <div className="mt-6">
          {/* Step 1 of the drop's walk: the stamp works today, and the page keeps the drop's steps and Exit. */}
          <PillButton href={PASS_FLOW.step1} size="lg">
            {PASS_COPY.notConfiguredButton}
          </PillButton>
        </div>
      </div>
      <StepsPreview />
    </div>
  );
}

/**
 * Short, honest answers under the steps. Jargon only inside the last one (it quotes the contract). Server-safe:
 * the client page receives it as a prop.
 */
export function PassQuestions() {
  return (
    <section aria-labelledby="pass-questions-title" className="flex flex-col gap-5">
      <h2 id="pass-questions-title" className="text-sm font-medium tracking-normal text-muted">
        Good to know
      </h2>
      <div className="flex flex-col gap-3">
        <Disclosure summary="Why one per card?">
          <p className="text-muted">
            One card stamps one wallet, and each wallet claims once. Bots have no card, so they get nothing. We check a
            bank card, not who you are.
          </p>
        </Disclosure>
        <Disclosure summary="Why a test payment?">
          <p className="text-muted">
            It shows the other half of Watermark: you pay in USDT, and we pay the fee. It&apos;s test money on a test
            network.
          </p>
        </Disclosure>
        <Disclosure summary="Is my card number stored?">
          <p className="text-muted">
            No. Our server sees your card data for a moment to make the proof, then wipes it. Your card number never
            goes on-chain.
          </p>
        </Disclosure>
        <Disclosure summary="Can I give the NFT away?">
          <p className="text-muted">Yes. Send it to any wallet. The limit is on claiming, not on holding.</p>
        </Disclosure>
        <Disclosure summary="Is this real money?">
          <p className="text-muted">No. It runs on Whitechain Sepolia, a test network.</p>
        </Disclosure>
        <Disclosure summary="For builders: how the contract checks the stamp">
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-muted">The NFT contract checks the wallet&apos;s stamp on-chain before it mints:</p>
            <CodeBlock label="WatermarkGenesisPass.sol" code={PASS_GATE_CODE} />
            <p className="text-muted">{PASS_COPY.gated}</p>
            {PASS_ADDRESS && (
              <p className="text-sm">
                <ExternalLink href={addressUrl(PASS_ADDRESS)} title={PASS_ADDRESS}>
                  See the NFT contract
                </ExternalLink>
              </p>
            )}
          </div>
        </Disclosure>
      </div>
    </section>
  );
}

/**
 * The closing note, the page's one dark card: why a bank card, and the way to the builders page ("See how it works
 * ↗" → /). The wallet grid is decorative: wallets cost nothing to make, and only the one backed by a bank card (the
 * saffron one, with its seal) counts.
 */
export function WhyCardNote() {
  return (
    <NightCard
      as="section"
      labelledBy="pass-why-title"
      className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)] md:items-center md:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:gap-16"
    >
      <div className="min-w-0">
        <Headline as="h2" id="pass-why-title">
          {PASS_COPY.noteTitle}
        </Headline>
        <p className="mt-6 max-w-[34ch] text-xl leading-relaxed text-night-text sm:text-2xl sm:leading-snug">{PASS_COPY.noteBody}</p>
        <p className="mt-4 max-w-[44ch] text-lg leading-relaxed text-night-muted">{PASS_COPY.noteBody2}</p>
        <div className="mt-8">
          <PillButton href="/" variant="inverse" size="lg">
            {PASS_COPY.noteLink}
          </PillButton>
        </div>
      </div>
      <div aria-hidden="true" className="min-w-0 max-w-[320px] text-night-muted/55 md:max-w-none">
        <WalletGrid count={96} stamped={43} />
      </div>
    </NightCard>
  );
}
