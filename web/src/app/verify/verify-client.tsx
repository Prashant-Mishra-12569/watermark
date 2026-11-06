"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readWebConfig, type ConfigResult } from "@/lib/config.ts";
import { WalletGate } from "../_wallet/wallet-gate";
import { VerifyFlow } from "./verify-flow";

/**
 * Reads the configuration on the client only (the query string can override the app and chain),
 * so nothing touches localStorage or window during server rendering.
 */
export function VerifyClient() {
  const [config, setConfig] = useState<ConfigResult | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setConfig(
      readWebConfig(
        {
          // Literal process.env.NEXT_PUBLIC_* reads, so Next inlines them.
          relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL,
          relayerLanUrl: process.env.NEXT_PUBLIC_RELAYER_LAN_URL,
          appId: process.env.NEXT_PUBLIC_APP_ID,
          chainId: process.env.NEXT_PUBLIC_CHAIN_ID,
        },
        { app: q.get("app"), chain: q.get("chain") },
      ),
    );
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 py-3 sm:px-6 sm:py-5">
      <header className="mb-3 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm font-semibold tracking-[0.2em] text-muted hover:text-text">
          WATERMARK
        </Link>
      </header>

      {config === null ? (
        <p className="py-10 text-lg text-muted">Preparing your QR code…</p>
      ) : !config.ok ? (
        <section role="alert" className="rounded-xl border border-line bg-surface p-5">
          <h1 className="text-2xl font-semibold">This page isn&apos;t set up yet</h1>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {config.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-muted">See web/README.md for the environment variables.</p>
        </section>
      ) : (
        <WalletGate appId={config.config.appId} purpose="verify">
          {(wallet, controls) => (
            // Keyed on the wallet: another account (or a new burner) starts the flow over with fresh state.
            <VerifyFlow
              key={`${wallet.kind}:${wallet.address}`}
              config={config.config}
              wallet={wallet}
              onNewWallet={wallet.kind === "burner" ? controls.newBurner : undefined}
            />
          )}
        </WalletGate>
      )}
    </main>
  );
}
