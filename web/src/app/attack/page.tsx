import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BotFarm, LineIcon } from "@/app/_art";
import { Disclosure } from "../_site/disclosure";
import { ExternalLink } from "../_site/external-link";
import { FloatChip } from "../_site/float-chip";
import { Headline, emphasize } from "../_site/headline";
import { PillButton } from "../_site/pill-button";
import { StatusChip, type StatusKind } from "../_site/status-chip";
import { PROOF_PAYMENT, EF_ADMITTED_TX } from "@/lib/evidence.ts";
import { PASS_LIVE, altmempoolTxUrl } from "@/lib/site.ts";
import { AttackClient, AttackProvider, HeroLaunch } from "./attack-client";
import { BOT_COUNT, limitLine } from "./bots.ts";

export const metadata: Metadata = {
  title: "Bot test · Watermark",
  description:
    "Making wallets is free, so bots make thousands. Watch 5 wallets with no card ask for every free thing. Real requests, nothing faked.",
};

/**
 * The sub under the h1. The drop's NFT is named only while the drop is live: the bots never ask for it otherwise.
 */
function subLine(passLive: boolean): string {
  const asks = passLive ? "test USDT, a free payment and a Genesis Drop NFT" : "test USDT and a free payment";
  return `Making wallets is free, so bots make thousands. Press the button. We make ${BOT_COUNT} wallets with no card. Each asks for ${asks}. These are real requests. Nothing here is faked.`;
}

/** /attack is a tool opened from the home page's "Try to farm it" section (SITE_FINAL): "back" returns there. */
const BACK = { href: "/#test", label: "Back to the home page" } as const;

const CODE = "font-mono text-[0.92em] wrap-anywhere";

/**
 * The h1's size comes from the viewport's width AND height: on a short laptop screen (125% or 150% zoom) it shrinks
 * so the headline never runs into the farm panel beside it.
 */
const H1 =
  "mt-6 text-balance text-[clamp(40px,min(6.4vw,11svh),84px)] font-semibold leading-[1] tracking-[-0.035em] sm:mt-[clamp(16px,3svh,28px)]";

interface Guard {
  name: string;
  body: ReactNode;
  status: StatusKind;
  /** Replaces the chip word, e.g. "Tested in code" for a Foundry-tested check. */
  chip?: string;
  /** Small print under the body. */
  extra?: string;
}

/**
 * The guards behind the bot test, in plain words (SITE_SPEC.md /attack layer cards). Jargon lives in Details below.
 * Only the server's check runs live on this page; the others are tested in code (Foundry), and say so.
 */
const GUARDS: Guard[] = [
  { name: "Our server", body: "Checks for a stamp before it sends anything. The bots above meet this guard.", status: "live" },
  {
    name: "The payment contract",
    body: "Says no to a wallet with no stamp, even if someone skips our server.",
    status: "foundry",
    chip: "Tested in code",
  },
  ...(PASS_LIVE
    ? [
        {
          name: "The NFT contract",
          body: "Won't mint a Genesis Drop NFT to a wallet with no stamp.",
          status: "foundry" as const,
          chip: "Tested in code",
        },
      ]
    : []),
  {
    name: "Ethereum test network",
    body: (
      <>
        The app that pays fees there checks for a stamp too.{" "}
        <ExternalLink href={altmempoolTxUrl(EF_ADMITTED_TX)} title={EF_ADMITTED_TX}>
          See a stamped wallet get in
        </ExternalLink>
      </>
    ),
    status: "foundry",
    chip: "Tested in code",
    extra: "The refusal is tested in code. It isn't shown on the network yet.",
  },
  {
    name: "Same card, second wallet",
    body: "One card can't stamp a second wallet in the same app.",
    status: "foundry",
    chip: "Tested in code",
    extra: "Not tried live yet.",
  },
];

/**
 * The header's object: a bot farm in line art (many identical wallets, a few refused, one stamped), on a surface
 * panel with a one-line caption. It is an illustration, not a result: the live run is the night card below.
 */
function FarmPanel() {
  return (
    <figure className="min-w-0 max-w-[560px] min-[900px]:max-w-none">
      <div className="rounded-card bg-surface p-6 sm:p-8">
        <p className="text-base font-semibold tracking-[-0.01em]">A bot farm</p>
        <p className="mt-1 text-sm text-muted">Illustration. Every wallet looks the same until one has a stamp.</p>
        <BotFarm className="mt-6 block h-auto w-full" />
        <ul aria-hidden="true" className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-sm text-muted">
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-red" />
            Refused · no stamp
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-saffron" />
            Allowed · stamped
          </li>
        </ul>
      </div>
      <figcaption className="mt-4 text-sm text-muted">Wallets are free to make. Bank cards are not.</figcaption>
    </figure>
  );
}

export default function AttackPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* One bot test for the page: the hero's Launch button and the night card below share it. */}
      <AttackProvider>
        <div className="pt-6 sm:pt-[clamp(16px,3svh,32px)]">
          <BackLink />
        </div>
        {/* Two columns from 900px (a laptop at 150% zoom included), top-aligned so the Launch button stays on the first
            screen of a short (zoomed) laptop; stacked below, the panel capped at 560px. */}
        <header className="grid gap-10 pb-12 pt-6 sm:gap-12 sm:pb-16 sm:pt-[clamp(16px,3svh,32px)] min-[900px]:grid-cols-12 min-[900px]:items-start min-[900px]:gap-12 xl:gap-16">
          <div className="min-w-0 min-[900px]:col-span-6">
            <FloatChip tone="ink">Bot test · Real requests on testnet</FloatChip>
            <h1 className={H1}>{emphasize("Bot army vs. *Watermark*.")}</h1>
            <p className="mt-[clamp(16px,3svh,24px)] max-w-[44ch] text-pretty text-lg leading-relaxed text-muted min-[900px]:text-[length:clamp(16px,2.6svh,20px)]">{subLine(PASS_LIVE)}</p>
            {/* The page's main action, on the first screen; the results land on the dark card below. */}
            <div className="mt-[clamp(20px,3.6svh,32px)]">
              <HeroLaunch />
            </div>
          </div>
          <div className="min-w-0 min-[900px]:col-span-6">
            <FarmPanel />
          </div>
        </header>

        <AttackClient />
      </AttackProvider>

      <section
        aria-label="A wallet with a real bank card"
        className="mt-4 flex flex-col gap-5 rounded-card bg-surface p-6 sm:mt-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-white ring-1 ring-line">
            <LineIcon name="check" size={28} />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-snug tracking-[-0.02em]">A wallet with a real bank card gets through.</p>
            {PROOF_PAYMENT.note && <p className="mt-1 text-sm text-muted">On the {PROOF_PAYMENT.note}.</p>}
          </div>
        </div>
        <div className="shrink-0">
          <PillButton variant="secondary" href={PROOF_PAYMENT.href} arrow>
            See the payment ↗
          </PillButton>
        </div>
      </section>

      <section aria-labelledby="guards-title" className="pb-12 pt-20 sm:pb-16 sm:pt-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <Headline id="guards-title">Every door has a *guard*.</Headline>
            <p className="mt-5 max-w-[40ch] text-lg leading-relaxed text-muted sm:text-xl">
              Every free thing checks for a stamp first. No card, no stamp, no entry.
            </p>
          </div>

          <div className="min-w-0">
            <ol className="divide-y divide-line border-y border-line">
              {GUARDS.map((g, i) => (
                <li key={g.name} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 py-7 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-4">
                  <span aria-hidden="true" className="font-serif text-3xl italic leading-none text-muted">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    {/* The chip sits with its title, not pushed into the row's far corner. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h3 className="text-xl font-semibold tracking-[-0.02em]">{g.name}</h3>
                      <StatusChip status={g.status} label={g.chip} />
                    </div>
                    <p className="mt-2 max-w-[52ch] text-lg leading-relaxed">{g.body}</p>
                    {g.extra && <p className="mt-1.5 text-sm text-muted">{g.extra}</p>}
                  </div>
                </li>
              ))}
            </ol>

            <Disclosure summary="Details for builders" className="mt-6">
              <div className="space-y-3 text-base text-muted">
                <p>
                  Each bot is a fresh key made in this browser (viem <code className={CODE}>generatePrivateKey</code>). It
                  calls the relayer: <code className={CODE}>POST /fund</code>, then <code className={CODE}>POST /pay</code>{" "}
                  with a real EIP-3009 signature for 1 USDT to the demo shop
                  {PASS_LIVE ? (
                    <>
                      , then <code className={CODE}>POST /pass</code>
                    </>
                  ) : null}
                  . The key signs one authorization and is dropped. Nothing is stored or logged.
                </p>
                <p>
                  <code className={CODE}>403 NOT_STAMPED</code> shows as Refused. {limitLine(PASS_LIVE)} Any 2xx shows as
                  a bug, with its transaction. Any other code is shown as it is and isn&apos;t counted as a refusal.
                </p>
                <p>
                  The Sponsor contract reverts <code className={CODE}>NotStamped</code> even if someone skips the relayer.
                  {PASS_LIVE ? (
                    <>
                      {" "}
                      The Genesis Drop NFT&apos;s <code className={CODE}>mint</code> reverts{" "}
                      <code className={CODE}>NotStamped</code>.
                    </>
                  ) : null}{" "}
                  The alt-mempool paymaster refuses unstamped senders in its VERIFY frame (
                  <code className={CODE}>test_unstampedSender</code>); a stamped wallet&apos;s frame tx was{" "}
                  <ExternalLink href={altmempoolTxUrl(EF_ADMITTED_TX)} title={EF_ADMITTED_TX}>
                    admitted
                  </ExternalLink>
                  , and an on-chain refusal is planned. A second wallet for the same card reverts{" "}
                  <code className={CODE}>NullifierBoundToOtherWallet</code> in the registry; the phone then shows a
                  general &lsquo;chain refused the stamp&rsquo; message. These are Foundry tests; that last one is
                  untested live.
                </p>
              </div>
            </Disclosure>
          </div>
        </div>
      </section>

      <nav aria-label="Back" className="flex justify-center">
        <BackLink pill />
      </nav>
    </main>
  );
}

/** Back to the home page's bot test section. A plain link at the top, a quiet pill at the end. */
function BackLink({ pill = false }: { pill?: boolean }) {
  return (
    <Link
      href={BACK.href}
      className={
        pill
          ? "inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-white px-6 font-semibold transition-colors hover:bg-surface"
          : "-my-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted underline decoration-current/30 underline-offset-4 hover:text-ink hover:decoration-current"
      }
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="block size-3.5">
        <path d="M13 8H3.5M7.5 3.5L3 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {BACK.label}
    </Link>
  );
}
