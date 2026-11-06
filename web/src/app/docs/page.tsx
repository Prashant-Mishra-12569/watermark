import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CodeBlock, ExternalLink, Headline, PillButton, StatusChip, cx } from "@/app/_site";
import { AGENT_PROMPT } from "@/app/_builders/agent-prompt-text.ts";
import { MCP_SERVERS_JSON, MCP_TOOL_PREFIX } from "@/app/_builders/mcp-data.ts";
import { SOLIDITY_GATE, TYPESCRIPT_CHECK } from "@/app/_builders/snippets.ts";
import { DOCS, REPO_URL } from "@/lib/site.ts";
import {
  BACKEND_CHECK,
  CUSTOMIZE_ROWS,
  HERO,
  HOW_STEPS,
  LIMITS,
  LIVE_VERIFY_LINK,
  MCP_TOOL_ROWS,
  NOT_DOES,
  RELAYER_SETTINGS,
  STOPS,
  TOC,
  X_URL,
  type Today,
} from "./docs-data.ts";

export const metadata: Metadata = {
  title: "Docs · Watermark",
  description:
    "Watermark for businesses: stop bot wallets from farming your airdrop, mint or rewards. How it works, the MCP server, code to add it, and every setting you can change.",
};

/*
 * /docs: the business docs (header and footer "Docs"). Server component; only CodeBlock (copy) is a client island.
 * Desktop: a sticky table of contents on the left. Phones: the same list at the top. Facts live in docs-data.ts,
 * snippets.ts and mcp-data.ts; docs.test.ts keeps them in step with the repo.
 */

const TODAY_CHIP: Record<Today, { status: "live" | "deployed" | "planned"; label: string }> = {
  live: { status: "live", label: "Live" },
  yours: { status: "deployed", label: "Your setting" },
  planned: { status: "planned", label: "Planned" },
};

/** Phones: each table row becomes a card, and each cell shows its column name above it. */
const T = {
  table: "w-full border-collapse text-left text-[15px] leading-relaxed max-md:block",
  thead: "max-md:hidden",
  th: "border-b border-line py-3 pr-6 text-sm font-medium text-muted last:pr-0",
  tbody: "max-md:grid max-md:gap-3",
  tr: "border-b border-line max-md:block max-md:rounded-inner max-md:border max-md:p-4",
  td: "align-top max-md:block max-md:py-1 md:py-4 md:pr-6 md:last:pr-0",
  cellLabel: "mb-0.5 block text-xs font-medium text-muted md:hidden",
};

function Cell({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <td className={cx(T.td, className)}>
      <span className={T.cellLabel}>{label}</span>
      {children}
    </td>
  );
}

function DocSection({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 scroll-mt-6 border-t border-line pt-10 sm:pt-12">
      <Headline as="h2" size="card" id={`${id}-title`}>
        {title}
      </Headline>
      {lead && <p className="mt-3 max-w-[64ch] text-lg leading-relaxed text-muted">{lead}</p>}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return <h3 className="text-xl font-semibold tracking-[-0.02em]">{children}</h3>;
}

function Dot() {
  return <span aria-hidden="true" className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-saffron" />;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[0.88em] [overflow-wrap:anywhere]">{children}</code>;
}

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 sm:pt-24">
      <header className="max-w-3xl">
        <p className="mb-5 text-sm font-medium text-muted">Docs</p>
        <Headline as="h1">{HERO.title}</Headline>
        <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-muted sm:text-xl">{HERO.sub}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PillButton href="#add">Add it to your app</PillButton>
          <PillButton href="/watermark.txt" external variant="secondary">
            Full reference
          </PillButton>
        </div>
      </header>

      <div className="mt-14 grid gap-10 sm:mt-20 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="On this page" className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-medium text-muted">On this page</p>
          <ol className="mt-3 grid grid-cols-2 gap-x-4 rounded-inner bg-surface p-3 text-[15px] sm:grid-cols-4 lg:grid-cols-1 lg:bg-transparent lg:p-0">
            {TOC.map((item) => (
              <li key={item.id} className="min-w-0">
                <a
                  href={`#${item.id}`}
                  className="flex min-h-11 items-center rounded-lg px-2 text-muted transition-colors hover:text-ink lg:min-h-9 lg:px-0"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="grid min-w-0 gap-16 sm:gap-20">
          {/* 1. What it stops */}
          <DocSection id="stops" title="What it *stops*." lead="Every extra wallet costs a real bank card. That is what bots can't fake at scale.">
            <ul className="grid gap-3 sm:grid-cols-2">
              {STOPS.map((s) => (
                <li key={s.title} className="min-w-0 rounded-card bg-surface p-5 sm:p-6">
                  <p className="text-lg font-semibold tracking-[-0.02em]">{s.title}</p>
                  <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-card border border-line p-5 sm:p-6">
              <SubHead>What it does not do</SubHead>
              <ul className="mt-4 grid gap-2">
                {NOT_DOES.map((line) => (
                  <li key={line} className="flex gap-3 leading-relaxed">
                    <Dot />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </DocSection>

          {/* 2. How it works */}
          <DocSection id="how" title="How it *works*." lead="Four steps. The user does one tap; your app does one read.">
            <ol className="grid gap-3 sm:grid-cols-2">
              {HOW_STEPS.map((s, i) => (
                <li key={s.title} className="min-w-0 rounded-card bg-surface p-5 sm:p-6">
                  <span className="grid size-9 place-items-center rounded-full bg-ink text-sm font-semibold text-white">{i + 1}</span>
                  <p className="mt-4 text-lg font-semibold tracking-[-0.02em]">{s.title}</p>
                  <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </DocSection>

          {/* 3. MCP */}
          <DocSection
            id="mcp"
            title="Connect your AI *agent*."
            lead="MCP (Model Context Protocol) lets an AI app such as Claude Desktop, Claude Code or Cursor use outside tools. Our MCP server gives your agent 12 Watermark tools."
          >
            <div className="flex flex-wrap gap-2">
              {["Read-only", "Holds no keys", "Signs nothing", "Runs locally"].map((c) => (
                <span key={c} className="rounded-full border border-line px-3 py-1 text-sm font-medium">
                  {c}
                </span>
              ))}
            </div>

            <ol className="mt-8 grid gap-2 leading-relaxed">
              <li className="flex gap-3">
                <span className="w-5 shrink-0 font-semibold">1.</span>
                <span>
                  Clone the <ExternalLink href={REPO_URL}>repo</ExternalLink> and run <Code>pnpm install</Code> at its root
                  (Node 24).
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 shrink-0 font-semibold">2.</span>
                <span>
                  Add this to your MCP client&apos;s server config (the exact file depends on the client). Put your own
                  path to the repo in <Code>args</Code>.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="w-5 shrink-0 font-semibold">3.</span>
                <span>Ask your agent a question from the table below.</span>
              </li>
            </ol>
            <CodeBlock code={MCP_SERVERS_JSON} label="MCP server config" className="mt-6" />
            <p className="mt-3 text-sm text-muted">
              From <ExternalLink href={DOCS.mcp}>mcp/README.md</ExternalLink>. The tools only read the chain or return
              unsigned data. No tool takes card data.
            </p>

            <div className="mt-10">
              <SubHead>The 12 tools</SubHead>
              <table className={cx(T.table, "mt-4")}>
                <thead className={T.thead}>
                  <tr>
                    <th className={T.th}>Tool</th>
                    <th className={T.th}>What it does</th>
                    <th className={T.th}>Ask it</th>
                  </tr>
                </thead>
                <tbody className={T.tbody}>
                  {MCP_TOOL_ROWS.map((r) => (
                    <tr key={r.tool} className={T.tr}>
                      <Cell label="Tool" className="md:w-[30%]">
                        <code className="font-mono text-[13px] font-medium [overflow-wrap:anywhere]">
                          {MCP_TOOL_PREFIX}
                          {r.tool}
                        </code>
                      </Cell>
                      <Cell label="What it does">{r.does}</Cell>
                      <Cell label="Ask it" className="md:w-[30%]">
                        <span className="italic text-muted">&ldquo;{r.ask}&rdquo;</span>
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-10">
              <SubHead>Or let your coding agent add it</SubHead>
              <p className="mt-2 max-w-[64ch] leading-relaxed text-muted">
                Paste this prompt into Claude Code, Cursor or any coding agent. It reads our docs and adds the stamp check
                to your app.
              </p>
              <CodeBlock
                code={AGENT_PROMPT}
                label="Prompt"
                className="mt-4 [&_pre]:max-h-[24rem] [&_pre]:overflow-y-auto [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]"
              />
            </div>
          </DocSection>

          {/* 4. Add it to your app */}
          <DocSection id="add" title="Add it to your *app*." lead="Check the stamp before you pay out. Pick the place your payout lives.">
            <div className="grid gap-10">
              <div className="min-w-0">
                <SubHead>1. In your contract (Solidity)</SubHead>
                <p className="mt-2 max-w-[64ch] leading-relaxed text-muted">
                  For contracts on Whitechain Sepolia, where the registry is. Put <Code>onlyStamped</Code> on each claim
                  function.
                </p>
                <CodeBlock code={SOLIDITY_GATE} label="Solidity" className="mt-4" />
              </div>
              <div className="min-w-0">
                <SubHead>2. In your app (TypeScript SDK)</SubHead>
                <p className="mt-2 max-w-[64ch] leading-relaxed text-muted">
                  Reads the chain directly: no API key. The SDK lives in the repo (<Code>sdk/</Code>) and is not on npm
                  yet; watermark.txt has the same read in plain viem.
                </p>
                <CodeBlock code={TYPESCRIPT_CHECK} label="TypeScript" className="mt-4" />
              </div>
              <div className="min-w-0">
                <SubHead>3. On your server, right before a payout</SubHead>
                <p className="mt-2 max-w-[64ch] leading-relaxed text-muted">
                  Use this when your contract is on another chain or the payout is off-chain. Never trust a
                  &ldquo;stamped&rdquo; flag sent by the browser.
                </p>
                <CodeBlock code={BACKEND_CHECK} label="watermark-gate.ts" className="mt-4" />
              </div>
              <div className="min-w-0">
                <SubHead>4. Send unverified users to the verify link</SubHead>
                <p className="mt-2 max-w-[64ch] leading-relaxed text-muted">
                  A &ldquo;Get verified with Watermark&rdquo; button. Ask users to verify the same wallet they claim with.
                  It works for app ids our relayer serves, such as the live app below; your own app runs its own session
                  signer.
                </p>
                <CodeBlock code={LIVE_VERIFY_LINK} label="Verify link (live app)" className="mt-4" />
              </div>
            </div>
          </DocSection>

          {/* 5. Customize it */}
          <DocSection
            id="customize"
            title="*Customize* it."
            lead="What you can change, how, and what runs today. On-chain rules are enforced by the contracts, not by us."
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-2">
                <StatusChip status="live" /> running now
              </span>
              <span className="inline-flex items-center gap-2">
                <StatusChip status="deployed" label="Your setting" /> you choose it
              </span>
              <span className="inline-flex items-center gap-2">
                <StatusChip status="planned" label="Planned" /> not live
              </span>
            </div>

            <table className={cx(T.table, "mt-6")}>
              <thead className={T.thead}>
                <tr>
                  <th className={T.th}>Setting</th>
                  <th className={T.th}>Options</th>
                  <th className={T.th}>How</th>
                  <th className={T.th}>Today</th>
                </tr>
              </thead>
              <tbody className={T.tbody}>
                {CUSTOMIZE_ROWS.map((r) => (
                  <tr key={r.setting} className={T.tr}>
                    <Cell label="Setting" className="font-semibold md:w-[18%]">
                      {r.setting}
                    </Cell>
                    <Cell label="Options" className="md:w-[20%]">
                      {r.options}
                    </Cell>
                    <Cell label="How" className="text-muted">
                      {r.how}
                    </Cell>
                    <Cell label="Today" className="md:w-[19%]">
                      <ul className="grid gap-2">
                        {r.today.map((t) => (
                          <li key={t.kind + (t.note ?? "")} className="grid justify-items-start gap-1">
                            <StatusChip status={TODAY_CHIP[t.kind].status} label={TODAY_CHIP[t.kind].label} />
                            {t.note && <span className="text-sm leading-snug text-muted">{t.note}</span>}
                          </li>
                        ))}
                      </ul>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-12">
              <SubHead>Relayer settings</SubHead>
              <p className="mt-2 max-w-[64ch] leading-relaxed text-muted">
                If you run your own relayer (it is in the repo, <Code>relayer/</Code>), these environment settings cap
                what bots can cost you. Every payment is simulated before any gas is spent.
              </p>
              <table className={cx(T.table, "mt-4")}>
                <thead className={T.thead}>
                  <tr>
                    <th className={T.th}>Setting</th>
                    <th className={T.th}>What it limits</th>
                    <th className={T.th}>Default</th>
                  </tr>
                </thead>
                <tbody className={T.tbody}>
                  {RELAYER_SETTINGS.map((s) => (
                    <tr key={s.name} className={T.tr}>
                      <Cell label="Setting" className="md:w-[38%]">
                        <code className="font-mono text-[13px] font-medium [overflow-wrap:anywhere]">{s.name}</code>
                      </Cell>
                      <Cell label="What it limits">{s.what}</Cell>
                      <Cell label="Default" className="whitespace-nowrap max-md:whitespace-normal">
                        {s.def}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DocSection>

          {/* 6. Pricing */}
          <DocSection id="pricing" title="*Pricing*.">
            <p className="text-2xl font-semibold tracking-[-0.02em]">Free during the hackathon testnet.</p>
          </DocSection>

          {/* 7. Limits and privacy */}
          <DocSection id="limits" title="Limits and *privacy*.">
            <ul className="grid max-w-3xl gap-2">
              {LIMITS.map((line) => (
                <li key={line} className="flex gap-3 leading-relaxed">
                  <Dot />
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-6 leading-relaxed">
              The full list: <ExternalLink href="/watermark.txt">watermark.txt</ExternalLink>, sections 11 (Privacy) and 12
              (Limits), and <ExternalLink href={DOCS.privacy}>docs/PRIVACY.md</ExternalLink>.
            </p>
          </DocSection>

          {/* 8. Get help */}
          <DocSection id="help" title="Get *help*.">
            <ul className="grid gap-3 sm:grid-cols-3">
              <li className="min-w-0 rounded-card bg-surface p-5 sm:p-6">
                <p className="text-sm text-muted">Code and issues</p>
                <p className="mt-2 text-lg font-semibold">
                  <ExternalLink href={REPO_URL}>GitHub</ExternalLink>
                </p>
              </li>
              <li className="min-w-0 rounded-card bg-surface p-5 sm:p-6">
                <p className="text-sm text-muted">Full reference</p>
                <p className="mt-2 text-lg font-semibold">
                  <ExternalLink href="/watermark.txt">watermark.txt</ExternalLink>
                </p>
              </li>
              <li className="min-w-0 rounded-card bg-surface p-5 sm:p-6">
                <p className="text-sm text-muted">Questions</p>
                <p className="mt-2 text-lg font-semibold">
                  <ExternalLink href={X_URL}>@usewatermark on X</ExternalLink>
                </p>
              </li>
            </ul>
          </DocSection>
        </div>
      </div>
    </main>
  );
}
