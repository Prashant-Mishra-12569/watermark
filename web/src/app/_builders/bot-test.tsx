import { BotFarm } from "@/app/_art";
import { PillButton } from "@/app/_site";
import { CHAIN_ID, LIVE_APP, TEST_APP } from "@/lib/site.ts";
import { BOT_COUNT } from "../attack/bots.ts";
import { TEST_CTA, TEST_TITLE, botTestLead } from "./copy.ts";
import { BAND, SectionHead, WRAP } from "./kit";
import { WalletChecker } from "./wallet-checker";

/*
 * SITE_FINAL "Page 1" section 4, "Try to *farm* it." (id="test"). The head says what the bot test does (the bot count
 * is /attack's own setting) with the button to /attack. Under it, two cards of the same height from 900px (stacked
 * below): the BotFarm line art (labelled "Illustration", at most 540px wide), and the live wallet checker, which
 * asks the chain through our relayer (GET /status, read-only). Server component; the checker is the client island.
 */
export function BotTest() {
  return (
    <section id="test" aria-labelledby="test-title" className={BAND}>
      <div className={WRAP}>
        <SectionHead
          id="test"
          eyebrow="Try to break it"
          title={TEST_TITLE}
          lead={botTestLead(BOT_COUNT)}
          action={
            <PillButton href={TEST_CTA.href} size="lg">
              {TEST_CTA.label}
            </PillButton>
          }
        />

        <div className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 sm:gap-6 min-[56.25rem]:grid-cols-12">
          <div className="flex min-w-0 items-center justify-center rounded-card bg-surface p-3 min-[420px]:p-5 sm:p-8 min-[56.25rem]:col-span-6 min-[56.25rem]:p-6 lg:p-8">
            {/* Never wider than it is in the two-column layout: on a tablet it does not grow into a wall of wallets. */}
            <div className="w-full max-w-[540px] rounded-inner bg-white px-4 pb-6 pt-4 ring-1 ring-black/[0.04] sm:px-8 sm:pb-10 sm:pt-6 min-[56.25rem]:px-6 min-[56.25rem]:pb-8 lg:px-8 lg:pb-10">
              {/* Mock art, so it says so (SITE_FINAL "Words": "Example" on mock data), like the hero's panel. */}
              <p className="flex">
                <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium leading-5 text-muted">
                  Illustration
                </span>
              </p>
              <BotFarm className="mt-3 sm:mt-4" />
            </div>
          </div>

          <div className="min-w-0 min-[56.25rem]:col-span-6">
            <WalletChecker
              liveAppId={LIVE_APP.appId}
              testAppId={TEST_APP.appId}
              chainId={String(CHAIN_ID)}
              className="min-[56.25rem]:flex min-[56.25rem]:h-full min-[56.25rem]:flex-col min-[56.25rem]:justify-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
