"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "@/app/_site/external-link";
import { useCopy, type CopyState } from "@/app/_site/use-copy";
import { AGENT_PROMPT } from "./agent-prompt-text.ts";
import { BAND, SectionHead, WRAP } from "./kit";

/*
 * "For AI agents" (id="agent"): one prompt a company pastes into Claude Code, Cursor or any coding agent, which reads
 * /watermark.txt and adds the stamp check to their app. The prompt sits in the site's dark code panel; it wraps (it is
 * prose) and scrolls inside the panel, never the page. Copy uses the shared useCopy (clipboard, or select the text and
 * say "Press ⌘C / Ctrl+C." when the clipboard is blocked).
 */

/** The "Copy prompt" pill for the dark panel: CopyButton's look (tone "ink"), with the action in its label. */
function CopyPromptButton({ state, onCopy }: { state: CopyState; onCopy: () => void }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2">
      <span aria-live="polite" className="text-xs text-night-muted">
        {state === "manual" ? "Press ⌘C / Ctrl+C." : ""}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex min-h-9 items-center rounded-full border border-white/20 px-3.5 text-sm font-medium text-night-text transition-colors hover:bg-white/10"
      >
        {state === "copied" ? "Copied" : "Copy prompt"}
      </button>
    </span>
  );
}

export function AgentPrompt() {
  const textRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLPreElement>(null);
  const [more, setMore] = useState(false);
  const { state, copy } = useCopy();

  // Fade the bottom edge while there is more prompt below, so the panel reads as scrollable.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 2);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);

  return (
    <section id="agent" aria-labelledby="agent-title" className={BAND}>
      <div className={WRAP}>
        <SectionHead
          id="agent"
          eyebrow="For AI agents"
          title="Let your AI agent *add* it."
          lead="Copy this prompt into Claude Code, Cursor or any coding agent. It reads our docs and adds the bot check to your app."
        />

        <figure className="mt-12 min-w-0 max-w-full overflow-hidden rounded-inner bg-night text-night-text sm:mt-16">
          <figcaption className="flex items-center justify-between gap-3 border-b border-night-line py-2.5 pl-5 pr-2.5 sm:pl-6">
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="flex shrink-0 gap-1.5">
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
                <span className="size-2.5 rounded-full bg-white/15" />
              </span>
              <span className="min-w-0 truncate pl-1 font-mono text-[13px] text-night-muted">Prompt</span>
            </span>
            <CopyPromptButton state={state} onCopy={() => void copy(AGENT_PROMPT, textRef.current)} />
          </figcaption>
          <div className="relative">
            <pre
              ref={scrollRef}
              tabIndex={0}
              aria-label="Prompt for your coding agent"
              className="max-h-[22rem] overflow-y-auto overflow-x-hidden whitespace-pre-wrap p-5 text-[13px] leading-relaxed wrap-anywhere sm:max-h-[26rem] sm:p-6 sm:text-sm"
            >
              <code ref={textRef} className="font-mono">
                {AGENT_PROMPT}
              </code>
            </pre>
            {more && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end justify-end pb-2.5 pr-4"
                style={{ background: "linear-gradient(to top, var(--night) 35%, transparent)" }}
              >
                <span className="font-sans text-[11px] font-medium text-night-muted">Scroll ↓</span>
              </div>
            )}
          </div>
        </figure>

        <p className="mt-5 text-base">
          <ExternalLink href="/watermark.txt" className="font-medium">
            Read the full docs: watermark.txt
          </ExternalLink>
        </p>
      </div>
    </section>
  );
}
