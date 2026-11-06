import type { ReactNode } from "react";
import { BankCard } from "../_site/bank-card";
import { FloatChip } from "../_site/float-chip";
import { emphasize } from "../_site/headline";
import { STEP_H1 } from "../verify/verify-heading";
import { DropSteps, type DropStep } from "../_wallet/drop-steps";

/** The page width every /pay state shares (the header's container, same as /verify; clipped sideways the same way). */
export const PAY_MAIN = "mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-20 pt-6 sm:px-6 sm:pb-28 sm:pt-[clamp(16px,4svh,40px)]";

/** Step 2's words (SITE_FINAL "Page 2": "2 Send one free test payment, we pay the fee"). */
export const PAY_COPY = {
  title: "One free test *payment*.",
  lead: "A stamp unlocks payments with no fees. Try it: sign one payment in test USDT, and we pay the network fee.",
  /** The wallet question: the stamp from step 1 is what makes the payment free. */
  question: "Which wallet did you verify?",
  questionSub: "Pick the wallet from step 1. You never pay a network fee.",
  /** After paying on the drop walk (?next=pass): step 3 on /pass. */
  toStep3: "Continue to step 3",
  backToDrop: "Back to the drop",
  toStep1: "Go to step 1",
  /** The same link off the drop's walk (no step numbers there). */
  toVerify: "Verify with your card",
  noStampNext: "Do step 1 first: verify with your bank card. It takes 2 minutes.",
} as const;

/**
 * The top of /pay in every state: on the drop's walk (?next=pass), the drop's step bar at step 2 (SITE_FINAL "Steps
 * inside the drop"); then a "Testnet" chip (plus the wallet bar once there is a wallet), the h1 with its one serif
 * word and one line under it. Without ?next=pass there is no drop in it. The chooser and the payment screen share it,
 * so the h1 never jumps. Payments run on Whitechain Sepolia only, so the chip never waits for the config.
 */
export function PayHeading({
  bar,
  done = [],
  drop = false,
}: {
  bar?: ReactNode;
  done?: readonly DropStep[];
  /** On the Genesis Drop's walk (?next=pass): show its step bar. */
  drop?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-5">
      {drop && <DropSteps current={2} done={done} className="mb-1 sm:mb-3" />}
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <FloatChip tone="ink">Testnet · Whitechain Sepolia</FloatChip>
        {bar}
      </div>
      <h1 className={STEP_H1}>{emphasize(PAY_COPY.title)}</h1>
      <p className="max-w-[44ch] text-base leading-relaxed text-muted sm:text-lg lg:text-xl">{PAY_COPY.lead}</p>
    </div>
  );
}

/**
 * Beside the wallet choice (lg+ only, decorative): the same plain card as /verify's chooser and two chips that say
 * how this page works. No "stamped" or "paid" here: nothing has been checked or paid yet.
 */
export function PayChooserAside() {
  return (
    <div className="relative w-full max-w-[340px] py-8">
      <BankCard label="A bank card" />
      <FloatChip at={{ top: 0, right: "4%" }} tone="ink" float delayMs={700}>
        You only sign
      </FloatChip>
      <FloatChip at={{ bottom: 0, left: "2%" }} tone="ink" float delayMs={1900}>
        $0 fee
      </FloatChip>
    </div>
  );
}
