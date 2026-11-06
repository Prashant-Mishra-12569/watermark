"use client";

import { useEffect, useState } from "react";
import { otherAppIds, parseAppId, readPaySetup, sponsorAppProblem, type PageSetup } from "@/lib/config.ts";
import { readPayConfig, type PayConfig } from "@/lib/pay.ts";
import { LIVE_APP, PASS_LIVE, PREVIOUS_LIVE_APP, SPONSOR_APP_ID, TEST_APP, isDropWalk } from "@/lib/site.ts";
import { WalletGate } from "../_wallet/wallet-gate";
import { PayFlow } from "./pay-flow";
import { PAY_COPY, PAY_MAIN, PayChooserAside, PayHeading } from "./pay-heading";

interface PaySetup {
  page: PageSetup;
  pay: PayConfig;
  /** Apps read only to say "this wallet's stamp is for another app" (stable for the page's lifetime). */
  otherApps: string[];
  /** ?next=pass: the Genesis Drop's walk (its step bar), open or not. */
  drop: boolean;
}

/**
 * /pay: step 2 of the Genesis Drop on its walk (?next=pass), otherwise a plain payment page with no drop in it.
 * Reads the configuration on the client only, so nothing touches localStorage or window during server rendering.
 * The stamp is always read for the Sponsor's app (NEXT_PUBLIC_APP_ID); ?app= never changes it. The site header comes
 * from the root layout (flow mode "Step 2 of 3" on ?next=pass). The heading is the same in every state, and the
 * server renders it too, so it shows before the wallet loads.
 */
export function PayClient() {
  const [setup, setSetup] = useState<PaySetup | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const page = readPaySetup(
      {
        // Literal process.env.NEXT_PUBLIC_* reads, so Next inlines them.
        relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL,
        appId: process.env.NEXT_PUBLIC_APP_ID,
        chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
      },
      { app: q.get("app"), next: q.get("next") },
      { liveAppId: LIVE_APP.appId, passLive: PASS_LIVE },
    );
    const payAppId = page.config.ok ? page.config.config.appId : "";
    setSetup({
      page,
      pay: readPayConfig({
        demoShop: process.env.NEXT_PUBLIC_DEMO_SHOP,
        payMaxUsdt: process.env.NEXT_PUBLIC_PAY_MAX_USDT,
      }),
      // The ?app= a visitor came with (from /verify?app=) is read only to explain a refusal, never to pay.
      otherApps: otherAppIds(payAppId, [parseAppId(q.get("app")), TEST_APP.appId, PREVIOUS_LIVE_APP.appId]),
      drop: isDropWalk(q.get("next")),
    });
  }, []);

  // Narrowed here: JSX callbacks below can't see the narrowing of setup.page.config.
  const web = setup?.page.config.ok ? setup.page.config.config : null;
  const appProblem = web ? sponsorAppProblem(web, SPONSOR_APP_ID) : null;

  if (setup === null) {
    return (
      <main className={PAY_MAIN}>
        <PayHeading />
        <p aria-live="polite" className="mt-10 text-lg text-muted">
          Loading your wallet…
        </p>
      </main>
    );
  }

  if (!setup.page.config.ok || setup.page.config.config.chainId !== "1874") {
    return (
      <main className={PAY_MAIN}>
        <PayHeading drop={setup.drop} />
        <section role="alert" className="mt-10 max-w-2xl rounded-card bg-surface p-6 sm:p-10">
          {!setup.page.config.ok ? (
            <>
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">This page isn&apos;t set up yet.</h2>
              <ul className="mt-4 list-disc space-y-1 pl-5">
                {setup.page.config.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-muted">See web/README.md for the environment variables.</p>
            </>
          ) : (
            <>
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">
                Payments work on Whitechain Sepolia only.
              </h2>
              <p className="mt-3 text-muted">Set NEXT_PUBLIC_CHAIN_ID to 1874 (or leave it unset) to use this page.</p>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className={PAY_MAIN}>
      {web && (
        <WalletGate
          appId={web.appId}
          purpose="pay"
          hideBar
          intro={<PayHeading drop={setup.drop} />}
          aside={<PayChooserAside />}
          {...(setup.drop ? { title: PAY_COPY.question, sub: PAY_COPY.questionSub } : {})}
        >
          {(wallet, controls) => (
            // Keyed on the wallet: another account starts over (stamp, balance, form) and can't reuse a signature.
            <PayFlow
              key={`${wallet.kind}:${wallet.address}`}
              config={web}
              pay={setup.pay}
              passFlow={setup.page.passFlow}
              drop={setup.drop}
              otherAppIds={setup.otherApps}
              setupProblems={appProblem ? [appProblem] : []}
              wallet={wallet}
              walletChainId={controls.chainId}
              onWalletStale={controls.resync}
              onSwitchWallet={controls.switchWallet}
            />
          )}
        </WalletGate>
      )}
    </main>
  );
}
