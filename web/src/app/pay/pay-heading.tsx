import type { ReactNode } from "react";
import { BankCard } from "../_site/bank-card";
import { FloatChip } from "../_site/float-chip";
import { emphasize } from "../_site/headline";
import { STEP_H1, STEP_LEAD, StepHeadingTop } from "../verify/verify-heading";
import { DropSteps, type DropStep } from "../_wallet/drop-steps";

/** The page width every /pay state shares (the header's container, same as /verify; clipped sideways the same way). */
export const PAY_MAIN = "mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-20 pt-6 sm:px-6 sm:pb-28 sm:pt-[clamp(16px,4svh,40px)]";

/** Step 2's words (SITE_FINAL "Page 2": "2 Send one free test payment, we pay the fee"). */
export const PAY_COPY = {
  title: "Pay with *no* fees.",
  lead: "Once your wallet has a stamp, you don't pay network fees. Sign one test USDT payment and we'll cover the fee.",
  /** The wallet question: the stamp from step 1 is what makes the payment free. */
  question: "Which wallet did you stamp?",
  questionSub: "Pick the wallet you used in step 1. You won't pay any fees.",
  /** After paying on the drop walk (?next=pass): step 3 on /pass. */
  toStep3: "Go to step 3",
  backToDrop: "Back to the drop",
  toStep1: "Go to step 1",
  /** The same link off the drop's walk (no step numbers there). */
  toVerify: "Tap your card",
  noStampNext: "Do step 1 first and tap your bank card. It only takes 2 minutes.",
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
    <StepHeadingTop
      drop={drop ? <DropSteps current={2} done={done} /> : null}
      chip={<FloatChip tone="ink">Testnet · Whitechain Sepolia</FloatChip>}
      bar={bar}
    >
      <h1 className={STEP_H1}>{emphasize(PAY_COPY.title)}</h1>
      <p className={STEP_LEAD}>{PAY_COPY.lead}</p>
    </StepHeadingTop>
  );
}

/**
 * Beside the wallet choice (from 900px, decorative): the same plain card as /verify's chooser and two chips that say
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
