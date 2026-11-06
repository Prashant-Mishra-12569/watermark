import type { ReactNode } from "react";
import { LineIcon } from "@/app/_art";
import { CodeBlock, CopyText, ExternalLink, StatusChip } from "@/app/_site";
import { BLOCKSCOUT_VERIFIED } from "@/lib/evidence.ts";
import { ADDR, CHAIN_ID, DEPLOY_BLOCK, DOCS, LIVE_APP, addressUrl } from "@/lib/site.ts";
import { AddTabs, type AddTab } from "./add-tabs";
import { ADD_BLOCKS, ADD_LEAD, ADD_TITLE, LIVE_TITLE } from "./copy.ts";
import { BAND, SectionHead, WRAP } from "./kit";
import { MCP_CHIPS, MCP_SERVERS_JSON, MCP_TOOL_PREFIX, MCP_TOOLS } from "./mcp-data.ts";
import { SOLIDITY_GATE, TYPESCRIPT_CHECK } from "./snippets.ts";

/*
 * SITE_FINAL "Page 1" section 3, "Add it in *one line*." (id="add"): the three ways in as tabs (Solidity · TypeScript
 * SDK · AI agents (MCP)), so one code block is on screen at a time, then the live addresses with Copy. The Solidity
 * tab opens with the one line itself (the modifier on your function), then the code you paste once. The code is
 * docs/INTEGRATE.md's and mcp/README.md's, verbatim (builders.test.ts checks); the addresses come from
 * deployments/whitechain.json via lib/site.ts. Server component; the tabs, CodeBlock and CopyText are the client
 * islands.
 */

/** A tab's opening words. */
function Lead({ children }: { children: ReactNode }) {
  return <div className="max-w-[60ch] text-pretty text-base leading-relaxed text-muted sm:text-[17px]">{children}</div>;
}

/**
 * The one line a contract adds: `onlyStamped` on its own function (the same as "How it works" step 1), with the
 * saffron underline. Wraps after `claim()` on narrow screens instead of scrolling.
 */
function OneLine() {
  return (
    <figure className="rounded-inner bg-white p-5 ring-1 ring-line sm:p-6">
      <figcaption className="text-sm font-medium text-muted">{ADD_BLOCKS.solidity.useLabel}</figcaption>
      <p className="mt-3 flex flex-wrap gap-x-[1ch] font-mono text-[15px] leading-7 text-ink sm:text-base">
        <span>function claim()</span>
        <span>
          external{" "}
          <span className="font-semibold underline decoration-saffron decoration-2 underline-offset-[5px]">onlyStamped</span>{" "}
          {"{ … }"}
        </span>
      </p>
    </figure>
  );
}

function SolidityPanel() {
  return (
    <>
      <Lead>
        <p>{ADD_BLOCKS.solidity.body}</p>
      </Lead>
      {/* Full width, so its right edge lines up with the code block under it. */}
      <div className="mt-6">
        <OneLine />
      </div>
      <p className="mb-3 mt-8 text-sm font-medium text-muted">{ADD_BLOCKS.solidity.pasteOnce}</p>
      <CodeBlock code={SOLIDITY_GATE} label={ADD_BLOCKS.solidity.label} />
    </>
  );
}

function SdkPanel() {
  return (
    <>
      <Lead>
        <p>{ADD_BLOCKS.sdk.body}</p>
        <p className="mt-3 text-sm">{ADD_BLOCKS.sdk.note}</p>
      </Lead>
      <CodeBlock code={TYPESCRIPT_CHECK} label={ADD_BLOCKS.sdk.label} className="mt-6" />
    </>
  );
}

/** The config on the left, what the server is and its 12 tools on the right; each only as tall as itself. */
function McpPanel() {
  return (
    <>
      <Lead>
        <p>{ADD_BLOCKS.mcp.body}</p>
      </Lead>
      <div className="mt-6 grid min-w-0 items-start gap-4 lg:grid-cols-12 lg:gap-6">
        <CodeBlock code={MCP_SERVERS_JSON} label={ADD_BLOCKS.mcp.label} className="lg:col-span-7" />
        <div className="min-w-0 rounded-inner border border-line p-5 sm:p-6 lg:col-span-5">
          <ul aria-label="What the MCP server is" className="flex flex-wrap gap-2">
            {MCP_CHIPS.map((chip) => (
              <li
                key={chip}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-medium text-ink"
              >
                <span aria-hidden="true" className="size-1.5 rounded-full bg-ink" />
                {chip}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-line pt-5 text-sm text-muted">
            {MCP_TOOLS.length} tools, each named <code className="font-mono text-[0.92em] text-ink">{MCP_TOOL_PREFIX}…</code>
          </p>
          <ul aria-label={`The ${MCP_TOOLS.length} MCP tools`} className="mt-3 flex flex-wrap gap-1.5">
            {MCP_TOOLS.map((tool) => (
              <li key={tool}>
                <code
                  title={`${MCP_TOOL_PREFIX}${tool}`}
                  className="inline-flex rounded-full border border-line bg-white px-2.5 py-0.5 font-mono text-[12.5px] leading-5"
                >
                  <span className="sr-only">{MCP_TOOL_PREFIX}</span>
                  {tool}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}

const TABS: readonly AddTab[] = [
  {
    id: "solidity",
    label: ADD_BLOCKS.solidity.title,
    short: "Solidity",
    icon: <LineIcon name="code" size={18} />,
    panel: <SolidityPanel />,
  },
  {
    id: "sdk",
    label: ADD_BLOCKS.sdk.title,
    short: "TypeScript",
    icon: <LineIcon name="wallet" size={18} />,
    panel: <SdkPanel />,
  },
  {
    id: "mcp",
    label: ADD_BLOCKS.mcp.title,
    short: "AI agents",
    icon: <LineIcon name="agent" size={18} />,
    panel: <McpPanel />,
  },
];

/**
 * One "Live on Whitechain Sepolia" row, on a fixed three-column grid: what it is | the full value (wraps anywhere,
 * with the status and explorer link under it) | Copy. Copy always sits in the right-hand column, so it never jumps
 * under a long value; on phones the label goes on top and the value and Copy share the row under it.
 */
function LiveRow({ label, hint, value, extra }: { label: string; hint: string; value: string; extra?: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-2 border-t border-line py-5 first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <dt className="min-w-0">
        <span className="font-semibold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </dt>
      <dd className="min-w-0 self-center">
        <CopyText value={value} label={label} extra={extra} split />
      </dd>
    </div>
  );
}

export function Add({ liveLabel }: { liveLabel: string }) {
  return (
    <section id="add" aria-labelledby="add-title" className={BAND}>
      <div className={WRAP}>
        <SectionHead id="add" eyebrow="Add it" title={ADD_TITLE} lead={ADD_LEAD} />

        <AddTabs tabs={TABS} label="Ways to add Watermark" className="mt-12 sm:mt-16" />

        <div className="mt-12 rounded-card bg-surface p-6 sm:mt-16 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h3 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold tracking-[-0.02em] sm:text-2xl">
              {LIVE_TITLE}
              <StatusChip status="testnet" label="Test network" />
            </h3>
            <p className="flex flex-wrap gap-x-5 gap-y-1 text-base">
              <ExternalLink href={DOCS.integrate}>Read the full guide</ExternalLink>
              <ExternalLink href={DOCS.mcp}>MCP setup</ExternalLink>
            </p>
          </div>
          <dl className="mt-6 rounded-inner bg-white px-5 ring-1 ring-black/[0.04] sm:px-7">
            <LiveRow label="Chain ID" hint="Whitechain Sepolia" value={String(CHAIN_ID)} />
            <LiveRow
              label="Registry"
              hint="WatermarkRegistry"
              value={ADDR.registry}
              extra={
                <>
                  {BLOCKSCOUT_VERIFIED.registry && <StatusChip status="verified" />}
                  <ExternalLink href={addressUrl(ADDR.registry)} className="whitespace-nowrap text-sm text-muted">
                    Explorer
                  </ExternalLink>
                </>
              }
            />
            <LiveRow label="Live appId" hint={liveLabel} value={LIVE_APP.appId} />
            <LiveRow label="Deploy block" hint="Event history starts here" value={String(DEPLOY_BLOCK)} />
          </dl>
        </div>
      </div>
    </section>
  );
}
