import { isAddress, isTxHash } from "@/lib/site.ts";
import type { Evidence } from "@/lib/evidence.ts";
import { ExternalLink } from "./external-link";
import { Hash } from "./hash";
import { StatusChip } from "./status-chip";

function Value({ item }: { item: Evidence }) {
  if (item.links && item.links.length > 0)
    return (
      <span>
        {item.links.map((l, i) => (
          <span key={l.href}>
            {i > 0 && ", "}
            <ExternalLink href={l.href}>{l.label}</ExternalLink>
          </span>
        ))}
      </span>
    );
  if (item.value === null) return <span className="text-muted">{item.empty ?? "Not recorded yet"}</span>;
  if (isTxHash(item.value) || isAddress(item.value)) return <Hash value={item.value} href={item.href} />;
  if (item.href) return <ExternalLink href={item.href}>{item.value}</ExternalLink>;
  return <span>{item.value}</span>;
}

/**
 * One public record: what happened (and its small print), the link one tap from the chain, and its status chip.
 * Renders an <li>: put the rows in a <ul>. A row is never hidden; an empty value says "Not recorded yet".
 * tone="night" when the list sits on the dark card.
 */
export function EvidenceRow({ item, tone = "light" }: { item: Evidence; tone?: "light" | "night" }) {
  const night = tone === "night";
  return (
    <li
      className={
        night
          ? "grid gap-x-6 gap-y-2 border-b border-night-line py-5 last:border-b-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center"
          : "grid gap-x-6 gap-y-2 border-b border-line py-5 last:border-b-0 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:items-center"
      }
    >
      <div className="min-w-0">
        <p className="text-base font-semibold leading-snug sm:text-lg">{item.label}</p>
        {item.note && <p className={night ? "mt-1 text-sm text-night-muted" : "mt-1 text-sm text-muted"}>{item.note}</p>}
      </div>
      <div className="min-w-0 break-words">
        <Value item={item} />
        {item.detail && <span className={night ? "text-night-muted" : "text-muted"}>, {item.detail}</span>}
      </div>
      <div className="sm:text-right">{item.status && <StatusChip status={item.status} tone={tone} />}</div>
    </li>
  );
}
