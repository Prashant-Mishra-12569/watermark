"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Counter, PassArt, StatusChip } from "@/app/_site";
import { readWebConfig } from "@/lib/config.ts";
import { getPassSupply, PASS_COPY, PASS_MAX_SUPPLY, type PassStatus, type PassSupply } from "@/lib/genesis-pass.ts";
import { passArtId } from "@/lib/pass-art.ts";
import { RelayerError } from "@/lib/relayer.ts";
import { LIVE_APP } from "@/lib/site.ts";
import { WalletGate } from "../_wallet/wallet-gate";
import { PassFlow } from "./pass-flow";
import { NotLiveCard, PassIntro, PassLayout, PassStage, PREVIEW_CAPTION, StepsPreview, type StageChip } from "./pass-layout";
import { PassPlates } from "./pass-plates";
import { POLL_MS } from "./use-pass-flow";

/**
 * The pass binds to the live app only, so /pass always uses the live app's wallet (the one /verify?next=pass stamps)
 * and Whitechain Sepolia, whatever NEXT_PUBLIC_APP_ID or ?app= say. Pure: safe at module level.
 */
const CONFIG = readWebConfig(
  // Literal process.env.NEXT_PUBLIC_* reads, so Next inlines them.
  { relayerUrl: process.env.NEXT_PUBLIC_RELAYER_URL, appId: process.env.NEXT_PUBLIC_APP_ID, chainId: "1874" },
  { app: LIVE_APP.appId, chain: "1874" },
);

type Supply = { kind: "loading" } | { kind: "ok"; value: PassSupply } | { kind: "not-configured" } | { kind: "error" };

/** `questions` is the server-rendered PassQuestions block (it holds a client CodeBlock), shown under the steps. */
export function PassClient({ questions }: { questions?: ReactNode }) {
  const [supply, setSupply] = useState<Supply>({ kind: "loading" });
  const [status, setStatus] = useState<PassStatus | null>(null);
  const onStatus = useCallback((s: PassStatus | null) => setStatus(s), []);
  const relayerUrl = CONFIG.ok ? CONFIG.config.relayerUrl : null;

  // "{N} left" before a wallet is chosen: GET /pass every 10 s. Once the checklist reads the wallet's status (which
  // carries the same numbers), this stops.
  const flowActive = status !== null;
  useEffect(() => {
    if (!relayerUrl || flowActive) return;
    let stopped = false;
    const read = async () => {
      try {
        const value = await getPassSupply(relayerUrl);
        if (!stopped) setSupply({ kind: "ok", value });
      } catch (e) {
        if (stopped) return;
        if (e instanceof RelayerError && e.code === "PASS_NOT_CONFIGURED") setSupply({ kind: "not-configured" });
        else setSupply((prev) => (prev.kind === "ok" ? prev : { kind: "error" }));
      }
    };
    void read();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [relayerUrl, flowActive]);

  const remaining = status ? status.remaining : supply.kind === "ok" ? supply.value.remaining : null;
  const max = Number(status ? status.maxSupply : supply.kind === "ok" ? supply.value.maxSupply : PASS_MAX_SUPPLY);
  const notLive = supply.kind === "not-configured" && !status;
  const meter = !CONFIG.ok || notLive ? undefined : <SupplyMeter remaining={remaining} max={max} />;

  const mine = status?.claimed ? status.tokenId : null;

  return (
    <>
      <PassLayout intro={<PassIntro />} art={<ArtPanel status={status} meter={meter} />} after={questions}>
        {!CONFIG.ok ? (
          <section role="alert" className="rounded-card bg-surface p-6 sm:p-8">
            <h2 className="text-xl font-semibold">This page isn&apos;t set up yet</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
              {CONFIG.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </section>
        ) : notLive ? (
          <NotLiveCard />
        ) : (
          // From lg the left column is too narrow for WalletGate's two option cards side by side ("Keep it in this
          // browser" would be cut off), so the choice stacks there. Scoped to the chooser's own list.
          <div className="lg:[&>section>div>ul]:grid-cols-1">
            <WalletGate
              appId={CONFIG.config.appId}
              purpose="pass"
              intro={<StepsPreview />}
              title={PASS_COPY.walletTitle}
              sub={PASS_COPY.walletSub}
            >
              {(wallet) => (
                <PassFlow
                  key={`${wallet.kind}:${wallet.address}`}
                  relayerUrl={CONFIG.config.relayerUrl}
                  wallet={wallet}
                  onStatus={onStatus}
                />
              )}
            </WalletGate>
          </div>
        )}
      </PassLayout>
      <PassPlates mine={mine} />
    </>
  );
}

/**
 * The live count under the NFT: "{N} left", ticking when the number changes, and a thin bar of how many are left.
 * While the count is loading or can't be read it says "Only 100 will ever exist." in the same space (no jump, and
 * never a placeholder number).
 */
function SupplyMeter({ remaining, max }: { remaining: number | null; max: number }) {
  const total = Number.isSafeInteger(max) && max > 0 ? max : PASS_MAX_SUPPLY;
  // The bar shows what is left, like the number beside it.
  const left = remaining === null ? 0 : Math.min(total, Math.max(0, remaining));
  return (
    <div aria-live="polite" aria-atomic="true" className="flex min-h-[68px] flex-col justify-center gap-3">
      {remaining === null ? (
        <p className="text-base font-medium text-muted">{PASS_COPY.supplyFallback}</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span className="sr-only">{`${PASS_COPY.left(remaining)} of ${total}.`}</span>
            <span aria-hidden="true" className="flex items-baseline gap-2">
              <Counter value={remaining} className="text-4xl font-semibold leading-none tracking-[-0.04em]" />
              <span className="text-lg font-medium">left</span>
              <span className="text-sm text-muted">of {total}</span>
            </span>
            <StatusChip status="live" label="Live count" />
          </p>
          <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-line">
            <span
              className="block h-full rounded-full bg-ink transition-[width] duration-700 motion-reduce:transition-none"
              style={{ width: `${(left / total) * 100}%` }}
            />
          </span>
        </>
      )}
    </div>
  );
}

/**
 * The NFT on its stage: the visitor's own stamp once claimed (the minted token's on-chain image when the relayer
 * returns it, else the same picture drawn on this page), else #042 as the example.
 */
function ArtPanel({ status, meter }: { status: PassStatus | null; meter?: ReactNode }) {
  const tokenId = status?.claimed ? status.tokenId : null;
  const onChain = tokenId ? status?.image : null;
  // A token this page can draw (1..100), or one the chain drew for us.
  const shown = tokenId && (onChain || passArtId(tokenId) !== null) ? tokenId : null;
  const chips: StageChip[] = shown ? [{ text: "✓ Claimed" }, { text: "$0 fee", tone: "ink" }] : [];
  const caption = !shown
    ? PREVIEW_CAPTION
    : onChain
      ? `Your NFT #${shown}, as its contract draws it on-chain.`
      : `Your NFT #${shown}, drawn on this page. The contract stores the same picture.`;

  return (
    <PassStage caption={caption} chips={chips} meter={meter}>
      <PassArt
        key={shown ?? "preview"}
        tokenId={shown}
        src={onChain}
        example={!shown}
        shadow
        className={shown ? "w-full motion-safe:animate-rise" : "w-full"}
      />
    </PassStage>
  );
}
