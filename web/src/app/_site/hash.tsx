import { shortHex } from "@/lib/site.ts";
import { cx } from "./cx";
import { ExternalLink } from "./external-link";

/** "0xd7e0…bc07 ↗" in Geist Mono with the full value in `title`. Without `href`, the short value as plain mono text. */
export function Hash({ value, href, className }: { value: string; href?: string | null; className?: string }) {
  const short = shortHex(value);
  if (!href)
    return (
      <code title={value} className={cx("font-mono text-[0.92em] tabular-nums", className)}>
        {short}
      </code>
    );
  return (
    <ExternalLink href={href} title={value} className={cx("font-mono text-[0.92em] tabular-nums", className)}>
      {short}
    </ExternalLink>
  );
}
