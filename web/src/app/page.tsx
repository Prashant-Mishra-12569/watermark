import type { Metadata } from "next";
import { livePolicySummary } from "@/lib/policy-summary.ts";
import { LIVE_APP } from "@/lib/site.ts";
import { Add } from "./_builders/add";
import { AgentPrompt } from "./_builders/agent-prompt";
import { BotTest } from "./_builders/bot-test";
import { Control } from "./_builders/control";
import { HERO } from "./_builders/copy.ts";
import { BuildersHero } from "./_builders/hero";
import { How } from "./_builders/how";
import { Privacy } from "./_builders/privacy";
import { Proof } from "./_builders/proof";
import { Uses } from "./_builders/uses";

export const metadata: Metadata = {
  title: "Watermark · Keep bots out of your app",
  description: HERO.sub,
};

/**
 * Page 1, the Builders home (SITE_FINAL.md): the service for companies, builders and judges, top to bottom. Hero,
 * how it works, add it, try to break it, you stay in control, proof, privacy and limits. The layout renders the
 * header and the footer (with the Mumbai skyline).
 *
 * A server component, prerendered at build: the live card list is counted from policies/*.json on the server, so it
 * never ships to the browser. The client islands are the code and copy buttons and the wallet checker.
 */
export default function Home() {
  const policy = livePolicySummary();
  return (
    <main className="overflow-x-clip">
      <BuildersHero />
      <Uses />
      <How />
      <Add liveLabel={policy?.label ?? LIVE_APP.label} />
      <AgentPrompt />
      <BotTest />
      <Control policy={policy} policyFile={policy?.file ?? null} />
      <Proof />
      <Privacy />
    </main>
  );
}
