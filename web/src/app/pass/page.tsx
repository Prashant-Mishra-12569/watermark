import type { Metadata } from "next";
import { PassArt } from "@/app/_site";
import { PASS_LIVE } from "@/lib/site.ts";
import { PassClient } from "./pass-client";
import { NotLiveCard, PassIntro, PassLayout, PassQuestions, PassStage, PREVIEW_CAPTION, WhyCardNote } from "./pass-layout";
import { PassPlates } from "./pass-plates";

export const metadata: Metadata = {
  title: "Genesis Drop · Watermark",
  description:
    "A free NFT for real cardholders. Only 100 will ever exist, one per bank card. Verify once with your card, send one free test payment, claim. We pay every fee.",
};

/**
 * /pass: the Watermark Genesis Drop (SITE_FINAL.md "Page 2"), our own free NFT drop that uses the service. The claim
 * steps live inside it: /verify?next=pass (step 1) and /pay?next=pass (step 2); the flow header comes from the layout
 * and PassFlow reports the step. PASS_LIVE off (NEXT_PUBLIC_GENESIS_PASS_ADDRESS unset): "The drop opens soon",
 * without any server call.
 */
export default function PassPage() {
  return (
    <main className="w-full">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {PASS_LIVE ? (
          <PassClient questions={<PassQuestions />} />
        ) : (
          <>
            <PassLayout
              intro={<PassIntro />}
              art={
                <PassStage caption={PREVIEW_CAPTION}>
                  <PassArt example shadow className="w-full" />
                </PassStage>
              }
              after={<PassQuestions />}
            >
              <NotLiveCard />
            </PassLayout>
            <PassPlates />
          </>
        )}
      </div>

      {/* No bottom padding: the site footer brings its own top margin, so the dark card isn't followed by a gap. */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <WhyCardNote />
      </div>
    </main>
  );
}
