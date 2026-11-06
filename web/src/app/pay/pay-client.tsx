"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readWebConfig, type ConfigResult } from "@/lib/config.ts";
import { readPayConfig, type PayConfig } from "@/lib/pay.ts";
import { WalletGate } from "../_wallet/wallet-gate";
import { PayFlow } from "./pay-flow";

/** Reads the configuration on the client only, so nothing touches localStorage or window during server rendering. */
export function PayClient() {
  const [config, setConfig] = useState<{ web: ConfigResult; pay: PayConfig } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setConfig({
      web: readWebConfig(
        {
          // Literal process.env.NEXT_PUBLIC_* reads, so Next inlines them.
          relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL,
          appId: process.env.NEXT_PUBLIC_APP_ID,
          chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
        },
        // ?app= picks the same wallet /verify?app= used. No ?chain=: USDT payments run on Whitechain only.
        { app: q.get("app") },
      ),
      pay: readPayConfig({
        demoShop: process.env.NEXT_PUBLIC_DEMO_SHOP,
        payMaxUsdt: process.env.NEXT_PUBLIC_PAY_MAX_USDT,
      }),
    });
  }, []);

  // Narrowed here: JSX callbacks below can't see the narrowing of config.web.
  const web = config?.web.ok ? config.web.config : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-3 sm:px-6 sm:py-5">
      <header className="mb-4 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold tracking-[0.2em] text-muted hover:text-text">
          WATERMARK
        </Link>
      </header>

      {config === null ? (
        <p className="py-10 text-lg text-muted">Loading your wallet…</p>
      ) : !config.web.ok ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-5">
          <h1 className="text-2xl font-semibold">This page isn&apos;t set up yet</h1>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {config.web.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">See web/README.md for the environment variables.</p>
        </section>
      ) : config.web.config.chainId !== "1874" ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-5">
          <h1 className="text-2xl font-semibold">Payments run on Whitechain Sepolia only</h1>
          <p className="mt-2">Set NEXT_PUBLIC_CHAIN_ID to 1874 (or leave it unset) to use this page.</p>
        </section>
      ) : web ? (
        <WalletGate appId={web.appId} purpose="pay">
          {(wallet, controls) => (
            // Keyed on the wallet: another account starts over (stamp, balance, form) and can't reuse a signature.
            <PayFlow
              key={`${wallet.kind}:${wallet.address}`}
              config={web}
              pay={config.pay}
              wallet={wallet}
              walletChainId={controls.chainId}
              onWalletStale={controls.resync}
            />
          )}
        </WalletGate>
      ) : null}
    </main>
  );
}
