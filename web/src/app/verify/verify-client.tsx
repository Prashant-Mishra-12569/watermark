"use client";

import { useEffect, useState } from "react";
import { readVerifySetup, type PageSetup } from "@/lib/config.ts";
import { appNoteCopy } from "@/lib/messages.ts";
import { LIVE_APP, PASS_LIVE, PREVIOUS_LIVE_APP, PREVIOUS_LIVE_LABEL, isDropWalk } from "@/lib/site.ts";
import { chainName } from "@/lib/view.ts";
import { BankCard } from "../_site/bank-card";
import { FloatChip } from "../_site/float-chip";
import { WalletGate } from "../_wallet/wallet-gate";
import { VerifyFlow } from "./verify-flow";
import { VERIFY_COPY, VerifyHeading } from "./verify-heading";

/**
 * The page width every /verify state shares (the header's container). overflow-x-clip: the stamp's landing (it starts
 * at 1.6x) never makes the page scroll sideways on a phone.
 */
const MAIN = "mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-20 pt-6 sm:px-6 sm:pb-28 sm:pt-[clamp(16px,4svh,40px)]";

/**
 * /verify: step 1 of the Genesis Drop on its walk (?next=pass), otherwise the plain page a company sends its users to
 * (the SDK's verifyLink), with no drop in it. Reads the configuration on the client only (the query string can
 * override the app and chain, except on the live drop's walk, which forces the live app), so nothing touches
 * localStorage or window during server rendering. The header comes from the root layout (flow mode "Step 1 of 3" on
 * ?next=pass).
 */
export function VerifyClient() {
  const [setup, setSetup] = useState<PageSetup | null>(null);
  const [drop, setDrop] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setDrop(isDropWalk(q.get("next")));
    setSetup(
      readVerifySetup(
        {
          // Literal process.env.NEXT_PUBLIC_* reads, so Next inlines them.
          relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL,
          relayerLanUrl: process.env.NEXT_PUBLIC_RELAYER_LAN_URL,
          appId: process.env.NEXT_PUBLIC_APP_ID,
          chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
        },
        { app: q.get("app"), chain: q.get("chain"), next: q.get("next") },
        { liveAppId: LIVE_APP.appId, passLive: PASS_LIVE },
      ),
    );
  }, []);

  const config = setup?.config;
  const note =
    config?.ok === true
      ? appNoteCopy({
          appId: config.config.appId,
          chainId: config.config.chainId,
          liveAppId: LIVE_APP.appId,
          previousLiveAppId: PREVIOUS_LIVE_APP.appId,
          previousLiveLabel: PREVIOUS_LIVE_LABEL,
          liveLabel: LIVE_APP.label,
          passLive: PASS_LIVE,
        })
      : null;

  if (!setup || !config) {
    return (
      <main className={MAIN}>
        <VerifyHeading title={VERIFY_COPY.title} lead={VERIFY_COPY.intro} chain={null} drop={drop} />
        <p className="mt-10 text-lg text-muted">Preparing your QR code…</p>
      </main>
    );
  }

  if (!config.ok) {
    return (
      <main className={MAIN}>
        <section role="alert" className="rounded-card bg-surface p-6 sm:p-10">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]">
            This page isn&apos;t set up yet
          </h1>
          <ul className="mt-4 list-disc space-y-1 pl-5">
            {config.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">See web/README.md for the environment variables.</p>
        </section>
      </main>
    );
  }

  const chain = chainName(config.config.chainId);
  return (
    <main className={MAIN}>
      {note && <p className="mb-8 rounded-inner bg-note-bg px-5 py-4 text-note">{note}</p>}
      <WalletGate
        appId={config.config.appId}
        purpose={setup.passFlow ? "pass" : "verify"}
        hideBar
        intro={<VerifyHeading title={VERIFY_COPY.title} lead={VERIFY_COPY.intro} chain={chain} drop={drop} />}
        aside={<ChooserCard />}
        {...(setup.passFlow ? { title: VERIFY_COPY.passQuestion, sub: VERIFY_COPY.passQuestionSub } : {})}
      >
        {(wallet, controls) => (
          // Keyed on the wallet: another account (or a new burner) starts the flow over with fresh state.
          <VerifyFlow
            key={`${wallet.kind}:${wallet.address}`}
            config={config.config}
            passFlow={setup.passFlow}
            drop={drop}
            wallet={wallet}
            onSwitchWallet={controls.switchWallet}
            onNewWallet={wallet.kind === "burner" ? controls.newBurner : undefined}
          />
        )}
      </WalletGate>
    </main>
  );
}

/** Beside the wallet choice (from 900px): the card that will be stamped, with two honest chips. */
function ChooserCard() {
  return (
    <div className="relative w-full max-w-[340px] py-6">
      <BankCard label="A bank card, not stamped yet" />
      <FloatChip at={{ top: 0, left: "4%" }} tone="ink" float delayMs={900}>
        Card number never on-chain
      </FloatChip>
      <FloatChip at={{ bottom: 0, right: "6%" }} tone="ink" float delayMs={2200}>
        $0 fee
      </FloatChip>
    </div>
  );
}
