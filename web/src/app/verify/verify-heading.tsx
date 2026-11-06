import type { ReactNode } from "react";
import { FloatChip } from "../_site/float-chip";
import { emphasize } from "../_site/headline";
import { DropSteps } from "../_wallet/drop-steps";

/**
 * The top of /verify in every state: on the drop's walk (?next=pass), the drop's step bar at step 1 (SITE_FINAL
 * "Steps inside the drop"); then a small "Testnet" chip (plus the wallet bar once there is a wallet), the h1 with its
 * one serif word, and one line under it. Without ?next=pass (a company's own verify link) there is no drop in it.
 * The chooser and the QR screen share it, so the h1 never jumps.
 */
export function VerifyHeading({
  title,
  lead,
  chain,
  bar,
  stamped = false,
  drop = false,
}: {
  /** A line with *word* marks, e.g. "Verify with your *card*." */
  title: string;
  lead?: ReactNode;
  /** "Whitechain Sepolia"; null hides the chip (config not read yet). */
  chain: string | null;
  bar?: ReactNode;
  /** Step 1 is done: the step bar shows its check. */
  stamped?: boolean;
  /** On the Genesis Drop's walk (?next=pass): show its step bar. */
  drop?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-5">
      {drop && <DropSteps current={1} done={stamped ? [1] : []} className="mb-1 sm:mb-3" />}
      {(chain || bar) && (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {chain ? <FloatChip tone="ink">{`Testnet · ${chain}`}</FloatChip> : <span />}
          {bar}
        </div>
      )}
      <h1 className={STEP_H1}>{emphasize(title)}</h1>
      {lead && <p className="max-w-[46ch] text-base leading-relaxed text-muted sm:text-lg lg:text-xl">{keepOnChain(lead)}</p>}
    </div>
  );
}

/**
 * The step's h1, sized from the viewport's width AND height (short laptop screens get a smaller line, so the QR or the
 * payment card still fits on the first screen), never wider than 18 characters.
 */
export const STEP_H1 =
  "max-w-[18ch] text-balance text-[clamp(32px,min(5.2vw,7.2svh),56px)] font-semibold leading-[1.04] tracking-[-0.03em]";

/** "on-chain" never breaks at its hyphen ("on-" / "chain" reads badly). */
function keepOnChain(text: ReactNode): ReactNode {
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

/** Step 1's words (SITE_FINAL "Page 2": "1 Verify with your card"). The QR's own steps stay in QR_STEPS. */
export const VERIFY_COPY = {
  title: "Verify with your *card*.",
  stamped: "Your wallet is *stamped*.",
  /** Under the h1 while the wallet is chosen (the QR screen then says what to do). */
  intro:
    "Tap your bank card on the Watermark phone app, once. Your wallet gets a stamp bots can't fake. Your card number never goes on-chain, and you pay no fee.",
  /** The wallet question on the drop walk (?next=pass): the stamp and the NFT go to the same wallet. */
  passQuestion: "Where should we keep your NFT?",
  passQuestionSub: "Your stamp and your NFT go to the wallet you pick. You never pay a fee.",
  /** After the stamp, on the drop's walk: step 2 (/pay?next=pass). */
  next: "Continue to step 2",
  /** After the stamp, off the walk: the same free payment, without the drop's step words. */
  nextPlain: "Try a payment with no fee",
} as const;
