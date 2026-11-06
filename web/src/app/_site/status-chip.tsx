import type { EvidenceStatus } from "@/lib/evidence.ts";
import { cx } from "./cx";

export type StatusKind = EvidenceStatus;

/**
 * Words from DESIGN_V2.md ("Live", "Testnet", "Coming soon", "Not live yet") plus the evidence states. Calm and
 * monochrome (STORY_V4 "Look"): the word carries the meaning, the dot only its weight. A solid dot with a soft halo
 * for something running on a network (live, verified, admitted), a solid dot for deployed, a grey dot for a test
 * network, a hollow ring for anything not live yet.
 */
type DotKind = "on" | "solid" | "grey" | "hollow";

const STATUS: Record<StatusKind, { label: string; dot: DotKind }> = {
  live: { label: "Live", dot: "on" },
  verified: { label: "Verified", dot: "on" },
  admitted: { label: "Admitted", dot: "on" },
  deployed: { label: "Deployed", dot: "solid" },
  testnet: { label: "Testnet", dot: "grey" },
  devnet: { label: "Testnet", dot: "grey" },
  planned: { label: "Coming soon", dot: "hollow" },
  // Tested in code only, not on a network yet.
  foundry: { label: "Not live yet", dot: "hollow" },
  "not-recorded": { label: "Not recorded yet", dot: "hollow" },
  "not-deployed": { label: "Not live yet", dot: "hollow" },
};

const DOT: Record<"light" | "night", Record<DotKind, string>> = {
  light: {
    on: "mx-[3px] bg-ink ring-[3px] ring-ink/10",
    solid: "bg-ink",
    grey: "bg-[#a3a3a3]",
    hollow: "border border-current bg-transparent",
  },
  night: {
    on: "mx-[3px] bg-white ring-[3px] ring-white/15",
    solid: "bg-white",
    grey: "bg-night-muted",
    hollow: "border border-current bg-transparent",
  },
};

const QUIET = new Set<StatusKind>(["planned", "foundry", "not-recorded", "not-deployed"]);

/**
 * How proven a claim is. Never show Live or Verified for something untested; `label` replaces the text only.
 * tone="night" on the dark card.
 */
export function StatusChip({
  status,
  label,
  className,
  tone = "light",
}: {
  status: StatusKind;
  label?: string;
  className?: string;
  tone?: "light" | "night";
}) {
  const s = STATUS[status];
  const quiet = QUIET.has(status);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
        tone === "night"
          ? cx("border-night-line bg-white/[0.06]", quiet ? "text-night-muted" : "text-night-text")
          : cx(quiet ? "border-dashed border-[#d4d4d4] bg-transparent text-muted" : "border-line bg-white text-ink"),
        className,
      )}
    >
      <span aria-hidden="true" className={cx("size-1.5 shrink-0 rounded-full", DOT[tone][s.dot])} />
      {label ?? s.label}
    </span>
  );
}

export function statusLabel(status: StatusKind): string {
  return STATUS[status].label;
}
