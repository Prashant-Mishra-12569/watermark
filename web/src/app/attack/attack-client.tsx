"use client";

import type { ReactNode } from "react";
import { PASS_LIVE, addressUrl, last4, txUrl } from "@/lib/site.ts";
import { Counter } from "../_site/counter";
import { cx } from "../_site/cx";
import { ExternalLink } from "../_site/external-link";
import { Hash } from "../_site/hash";
import { Headline } from "../_site/headline";
import { NightCard } from "../_site/night-card";
import { PillButton } from "../_site/pill-button";
import {
  BOT_COUNT,
  DOOR_LABEL,
  doorCopy,
  doorsFor,
  readAttackConfig,
  summarize,
  summaryLines,
  type AttackSummary,
  type BotView,
  type Door,
  type DoorState,
  type Tone,
} from "./bots.ts";
import { useAttack } from "./use-attack.ts";

// Literal process.env.NEXT_PUBLIC_* reads, so Next inlines them (the same on the server and in the browser).
const CONFIG = readAttackConfig(
  { relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL, demoShop: process.env.NEXT_PUBLIC_DEMO_SHOP },
  PASS_LIVE,
);

/** The doors every row shows: three while the pass is live, two otherwise (the pass is hidden everywhere then). */
const DOORS: Door[] = doorsFor(CONFIG.ok ? CONFIG.config.passLive : PASS_LIVE);

/** Column names on this page: the pass door is the Genesis Drop's free NFT (SITE_FINAL "Page 2"). */
const DOOR_NAME: Record<Door, string> = { ...DOOR_LABEL, pass: "Free NFT" };

/**
 * Row layout, literal so Tailwind sees it. Phones: the bot's name on its own line, then one column per door.
 * From sm: a name column, then the doors.
 */
const ROW_GRID_2 = "grid-cols-2 sm:grid-cols-[7.5rem_repeat(2,minmax(0,1fr))]";
const ROW_GRID_3 = "grid-cols-3 sm:grid-cols-[7.5rem_repeat(3,minmax(0,1fr))]";

/** Cell layout: with three narrow columns on a phone the icon sits above the words; otherwise beside them. */
const CELL_LAYOUT_2 = "min-h-12 flex-row items-center gap-2";
const CELL_LAYOUT_3 = "min-h-[3.75rem] flex-col items-start gap-1.5 sm:min-h-14 sm:flex-row sm:items-center sm:gap-2";

/**
 * Each door cell on the night card, in black, white and greys. Red is kept for one thing: the ✕ of a refusal (the
 * defence working). Got through is a bug, so it is the loudest cell here: inverted to solid white.
 */
const CELL: Record<DoorState["kind"], string> = {
  idle: "border-dashed border-night-line text-night-muted",
  running: "border-night-line bg-white/[0.04] text-night-text",
  refused: "border-night-line bg-white/[0.07] text-night-text",
  slowed: "border-night-line bg-white/[0.04] text-night-text",
  through: "border-white bg-white font-semibold text-ink",
  other: "border-night-line text-night-muted",
  network: "border-dashed border-night-line text-night-muted",
};

/** Summary lines on the night card. */
const LINE: Record<Tone, string> = {
  ok: "text-night-text",
  error: "rounded-inner bg-white px-4 py-3 text-ink",
  note: "text-night-text",
  muted: "text-night-muted",
};

/** The bot test: the Launch button, the bot grid and the tally, on the page's one dark card. Every request is real (bots.ts). */
export function AttackClient() {
  const config = CONFIG.ok ? CONFIG.config : null;
  const attack = useAttack(config);

  if (!CONFIG.ok)
    return (
      <section role="alert" className="rounded-card bg-surface p-6 sm:p-10">
        <Headline as="h2" size="card">
          This page isn&apos;t set up yet.
        </Headline>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-lg">
          {CONFIG.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p className="mt-4 text-muted">See web/README.md for the environment variables.</p>
      </section>
    );

  const running = attack.phase === "running";
  const started = attack.bots.length > 0;
  // The live tally counts only answered doors, so it ticks up as each cell flips.
  const tally = summarize(attack.bots);
  const lines = attack.summary ? summaryLines(attack.summary) : [];

  return (
    <NightCard as="section" labelledBy="bot-test-title">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div className="flex min-w-0 flex-col">
          <Headline as="h2" id="bot-test-title">
            Watch bots *try*.
          </Headline>
          <p className="mt-4 max-w-[42ch] leading-relaxed text-night-muted">
            Keys are made in this browser, kept in memory and thrown away on reload. Wait a minute between runs.
          </p>

          <div className="mt-8">
            <PillButton
              variant="inverse"
              size="lg"
              onClick={attack.launch}
              disabled={running || attack.cooldownSeconds > 0}
              busy={running}
            >
              {running
                ? "Bots running…"
                : attack.cooldownSeconds > 0
                  ? `Launch again in ${attack.cooldownSeconds}s`
                  : `Launch ${BOT_COUNT} bots ↗`}
            </PillButton>
          </div>

          {attack.relayerRetrySeconds !== null && (
            <p role="status" className="mt-5 flex items-center gap-2 text-sm font-medium text-night-text">
              <span aria-hidden="true" className="size-2 shrink-0 rounded-full border border-current motion-safe:animate-pulse" />
              {attack.relayerRetrySeconds > 0
                ? `Can't reach our server. Retrying in ${attack.relayerRetrySeconds}s.`
                : "Can't reach our server. Retrying now…"}
            </p>
          )}

          {started && <Tally s={tally} />}

          {/* Always in the DOM, so screen readers announce the summary when it arrives. */}
          <div aria-live="polite" className="space-y-2">
            {lines.map((l, i) => (
              <p
                key={l.text}
                className={cx(
                  "flex items-start gap-3 motion-safe:animate-rise",
                  i === 0 ? "mt-6 text-xl font-semibold leading-snug tracking-[-0.02em]" : "text-base",
                  LINE[l.tone],
                )}
              >
                {l.tone === "ok" && <OkMark />}
                <span className="min-w-0">{l.text}</span>
              </p>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <BotGrid bots={attack.bots} doors={DOORS} running={running} />
          <Legend />
        </div>
      </div>
    </NightCard>
  );
}

/** Tries, refused and got through, counting up as the cells flip. Got through turns solid white the moment it isn't 0. */
function Tally({ s }: { s: AttackSummary }) {
  return (
    <dl className="mt-8 grid grid-cols-3 gap-2">
      <Stat label="Tries" value={s.answered} />
      <Stat label="Refused" value={s.refused} />
      <Stat label="Got through" value={s.through} bug={s.through > 0} />
    </dl>
  );
}

function Stat({ label, value, bug = false }: { label: string; value: number; bug?: boolean }) {
  return (
    <div className={cx("min-w-0 rounded-inner border px-3 py-3 sm:px-4", bug ? "border-white bg-white text-ink" : "border-night-line")}>
      <dt className={cx("truncate text-xs font-medium", bug ? "text-ink" : "text-night-muted")}>{label}</dt>
      <dd className="mt-1.5 text-[32px] font-semibold leading-none tracking-[-0.03em] sm:text-[38px]">
        <Counter value={value} durationMs={420} />
      </dd>
    </div>
  );
}

/**
 * The grid: one row per bot, one cell per door. Rows not made yet show as quiet placeholders. Exported only so the
 * layout can be previewed with three doors; the page renders it through AttackClient.
 */
export function BotGrid({ bots, doors, running }: { bots: readonly BotView[]; doors: readonly Door[]; running: boolean }) {
  const rowGrid = doors.length === 2 ? ROW_GRID_2 : ROW_GRID_3;
  const cellLayout = doors.length === 2 ? CELL_LAYOUT_2 : CELL_LAYOUT_3;
  const waiting = Array.from({ length: Math.max(0, BOT_COUNT - bots.length) }, (_, i) => bots.length + i + 1);
  return (
    <div className="min-w-0 rounded-inner border border-night-line bg-white/[0.03] p-2.5 sm:p-4">
      <div aria-hidden="true" className={cx("grid gap-1.5 px-0.5 pb-2.5 text-xs font-medium text-night-muted sm:gap-2", rowGrid)}>
        <span className="hidden sm:block">Bot</span>
        {doors.map((door) => (
          <span key={door} className="min-w-0">
            {DOOR_NAME[door]}
          </span>
        ))}
      </div>
      <ol aria-label="Bots" aria-busy={running} className="space-y-2.5 sm:space-y-2">
        {bots.map((bot) => (
          <li key={bot.address} className={cx("grid gap-1.5 motion-safe:animate-rise sm:gap-2", rowGrid)}>
            <BotName n={bot.n}>
              <ExternalLink href={addressUrl(bot.address)} title={bot.address} className="font-mono">
                {last4(bot.address)}
              </ExternalLink>
            </BotName>
            {bot.doors.map(({ door, state }) => (
              <DoorCell key={door} door={door} state={state} layout={cellLayout} />
            ))}
          </li>
        ))}
        {waiting.map((n) => (
          <li key={`waiting-${n}`} aria-hidden="true" className={cx("grid gap-1.5 sm:gap-2", rowGrid)}>
            <BotName n={n}>No wallet yet</BotName>
            {doors.map((door) => (
              <DoorCell key={door} door={door} state={{ kind: "idle" }} layout={cellLayout} />
            ))}
          </li>
        ))}
      </ol>
      {bots.length === 0 && <p className="sr-only">Press Launch and the bots appear here, one row each.</p>}
    </div>
  );
}

function BotName({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="col-span-full flex min-w-0 items-baseline gap-2 px-0.5 pt-1 text-sm sm:col-span-1 sm:flex-col sm:justify-center sm:gap-0.5 sm:pt-0">
      <span className="font-semibold">Bot {n}</span>
      <span className="min-w-0 truncate text-xs text-night-muted">{children}</span>
    </div>
  );
}

/** One door: flips (rotateX) into each answer as it lands, one by one. */
function DoorCell({ door, state, layout }: { door: Door; state: DoorState; layout: string }) {
  const { text } = doorCopy(door, state);
  const txHash = state.kind === "through" || state.kind === "other" ? state.txHash : null;
  const answered = state.kind !== "idle" && state.kind !== "running";
  return (
    <div className="min-w-0">
      <div
        key={state.kind}
        className={cx(
          "flex h-full min-w-0 rounded-[14px] border px-2.5 py-2 text-[13px] leading-snug sm:text-sm",
          layout,
          CELL[state.kind],
          answered && "motion-safe:animate-flip",
        )}
      >
        <span className="sr-only">{DOOR_NAME[door]}: </span>
        <CellIcon kind={state.kind} />
        <span className="min-w-0 wrap-anywhere">
          {state.kind === "idle" ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">{text}</span>
            </>
          ) : (
            text
          )}
          {txHash && (
            <>
              {" "}
              <Hash value={txHash} href={txUrl(txHash)} />
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function CellIcon({ kind }: { kind: DoorState["kind"] }) {
  switch (kind) {
    case "idle":
      return null;
    case "running":
      return <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-night-text motion-safe:animate-pulse" />;
    case "refused":
      return (
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-red">
          <svg viewBox="0 0 12 12" focusable="false" className="block size-2.5">
            <path d="M3.3 3.3l5.4 5.4M8.7 3.3l-5.4 5.4" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      );
    case "through":
      return (
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold leading-none text-white">
          !
        </span>
      );
    case "slowed":
      // A short bar: held back by the second guard (the rate limit), not by the stamp check.
      return <span aria-hidden="true" className="h-0.5 w-2.5 shrink-0 rounded-full bg-current" />;
    case "other":
    case "network":
      return <span aria-hidden="true" className="size-2 shrink-0 rounded-full border border-current" />;
  }
}

/** How to read the grid: on this page a red ✕ is the good news, and a solid white cell is the bad news. */
function Legend() {
  return (
    <ul className="mt-5 flex flex-col gap-x-6 gap-y-2.5 px-1 text-sm text-night-muted sm:flex-row sm:flex-wrap">
      <li className="flex items-center gap-2.5">
        <CellIcon kind="refused" />
        Refused means the guard worked.
      </li>
      <li className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-5 w-7 shrink-0 place-items-center rounded-[6px] bg-white text-[13px] font-bold leading-none text-ink">
          !
        </span>
        Got through means a bug. Its cell turns white.
      </li>
    </ul>
  );
}

function OkMark() {
  return (
    <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white">
      <svg viewBox="0 0 12 12" focusable="false" className="block size-3">
        <path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#0a0a0a" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
