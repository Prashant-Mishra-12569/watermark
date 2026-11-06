import { useId, type ReactNode } from "react";
import { PAY_RECEIPT } from "@/lib/messages.ts";
import { ExternalLink } from "../_site/external-link";
import { Hash } from "../_site/hash";
import { LogoMark } from "../_site/logo";
import { PillButton } from "../_site/pill-button";
import type { ReceiptRow } from "../_site/receipt";
import { RoleChip } from "../_site/role-chip";
import { StampSeal } from "../_site/bank-card";

/**
 * Role dots in black, so the ticket reads in one colour: only "You" keeps the saffron dot. Scoped CSS variables
 * (RoleChip paints its dot with var(--role-*)); drop this once globals.css makes those monochrome.
 */
const MONO_ROLE_DOTS = "[--role-business:var(--ink)] [--role-relayer:var(--ink)] [--role-shop:var(--ink)]";

/**
 * The "Paid." receipt as a paper ticket: the amount, the saffron seal landing on it, a torn line with two notches, who
 * did what (You / Us / Business / Shop) and the transaction on the explorer. A white page shows through the notches
 * and the scalloped bottom edge, so the ticket reads as paper. Server-safe; rendered by the client PayFlow.
 */
export function PayTicket({
  amountUsdt,
  toDemoShop,
  txHash,
  txUrl,
  rows,
}: {
  amountUsdt: string;
  /** The payment went to NEXT_PUBLIC_DEMO_SHOP (else "the shop": the address someone typed). */
  toDemoShop: boolean;
  txHash: string;
  txUrl: string;
  rows: ReceiptRow[];
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `ticket-${uid}`;
  const scallop = `scallop-${uid}`;

  return (
    <article aria-labelledby={titleId} className={`relative w-full max-w-[480px] ${MONO_ROLE_DOTS}`}>
      <div className="relative rounded-t-card bg-surface shadow-float ring-1 ring-black/[0.04]">
        {/* Head: brand, amount, fee */}
        <div className="relative px-6 pb-7 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-[15px] font-bold tracking-[-0.02em]">
              <LogoMark className="size-6" />
              watermark
            </span>
            <h3 id={titleId} className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Receipt
            </h3>
          </div>

          <p className="mt-9 text-sm font-medium text-muted">{toDemoShop ? "Paid to the demo shop" : "Paid to the shop"}</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-[clamp(48px,14vw,64px)] font-semibold leading-none tracking-[-0.045em]">
              {amountUsdt}
            </span>
            <span className="text-xl font-semibold text-muted">USDT</span>
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm font-semibold text-ok ring-1 ring-line">
            <span aria-hidden="true" className="size-2 rounded-full bg-leaf" />
            Your fee: $0
          </p>

          {/* The seal lands (scale + turn, once); its resting angle sits on this wrapper. */}
          <div aria-hidden="true" className="pointer-events-none absolute right-5 top-[68px] -rotate-12 sm:right-8 sm:top-[76px]">
            <StampSeal land className="size-[92px] sm:size-28" />
          </div>
        </div>

        {/* The tear: a dashed line between two notches cut out of the paper */}
        <div aria-hidden="true" className="relative mx-6 border-t-2 border-dashed border-[#d9d9d6] sm:mx-8">
          <span className="absolute -left-[38px] -top-[15px] size-7 rounded-full bg-bg sm:-left-[46px]" />
          <span className="absolute -right-[38px] -top-[15px] size-7 rounded-full bg-bg sm:-right-[46px]" />
        </div>

        {/* Who did what */}
        <ul className="px-6 pt-2 sm:px-8">
          {rows.map((r, i) => (
            <li
              key={`${r.role}-${i}`}
              className="flex flex-col gap-1.5 border-b border-dashed border-[#d9d9d6] py-4 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4"
            >
              <div className="flex shrink-0 items-center gap-2 sm:w-36">
                <RoleChip role={r.role} label={r.label} />
                {r.who && <span className="font-mono text-[13px] text-muted">{r.who}</span>}
              </div>
              <p className="min-w-0 break-words leading-relaxed">
                {r.href && !r.linkLabel ? (
                  <ExternalLink href={r.href}>{keepTogether(r.text)}</ExternalLink>
                ) : (
                  <>
                    {keepTogether(r.text)}
                    {r.href && r.linkLabel && (
                      <>
                        {" "}
                        <ExternalLink href={r.href} className="text-muted">
                          {r.linkLabel}
                        </ExternalLink>
                      </>
                    )}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>

        {/* The transaction */}
        <div className="flex flex-col gap-4 border-t-2 border-dashed border-[#d9d9d6] px-6 pb-9 pt-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="min-w-0 text-sm text-muted">
            Transaction <Hash value={txHash} className="text-ink" />
          </p>
          <PillButton href={txUrl} variant="secondary" size="sm" arrow>
            {PAY_RECEIPT.explorer}
          </PillButton>
        </div>

        {/* Scalloped bottom edge: page-white bites out of the paper */}
        <svg aria-hidden="true" focusable="false" className="absolute inset-x-0 -bottom-px block h-[9px] w-full">
          <defs>
            <pattern id={scallop} width="18" height="9" patternUnits="userSpaceOnUse" x="-3">
              <circle cx="9" cy="9" r="6" fill="#ffffff" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${scallop})`} />
        </svg>
      </div>
    </article>
  );
}

/** "on-chain" never breaks at its hyphen ("on-" / "chain" on a phone reads badly). */
function keepTogether(text: ReactNode): ReactNode {
  if (typeof text !== "string" || !text.includes("on-chain")) return text;
  const [before, ...rest] = text.split("on-chain");
  return (
    <>
      {before}
      <span className="whitespace-nowrap">on-chain</span>
      {rest.join("on-chain")}
    </>
  );
}
