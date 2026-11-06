"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Headline, PillButton, Receipt, StampSeal, useFlowStep, type ReceiptRow } from "@/app/_site";
import {
  canClaim,
  flowStepOf,
  passErrorCopy,
  passSteps,
  PASS_COPY,
  type PassStatus,
  type StepState,
} from "@/lib/genesis-pass.ts";
import { passArtDataUri, passArtId } from "@/lib/pass-art.ts";
import { addressUrl, last4, PASS_ADDRESS, PASS_FLOW, txUrl } from "@/lib/site.ts";
import { formatStampExpiry, walletLast4 } from "@/lib/view.ts";
import type { ActiveWallet } from "../_wallet/use-wallet";
import { ClaimReveal } from "./claim-reveal";
import { StepItem, StepsHeading } from "./pass-layout";
import { isUnreachable, usePassFlow } from "./use-pass-flow";

/**
 * The receipt's role dots in black (only "You" keeps saffron), via the CSS variables RoleChip paints with. Drop this
 * once globals.css makes --role-* monochrome.
 */
const MONO_ROLE_DOTS = "[--role-business:var(--ink)] [--role-relayer:var(--ink)] [--role-shop:var(--ink)]";

/**
 * The /pass checklist for one wallet: 1 verify with your card (→ /verify?next=pass), 2 one free test payment
 * (→ /pay?next=pass), 3 claim the NFT.
 * Rendered inside <WalletGate> and keyed on the wallet, so another account starts over. Nothing is signed here.
 * `onStatus` hands the latest status to the page (the art panel and the "left" line).
 */
export function PassFlow({
  relayerUrl,
  wallet,
  onStatus,
}: {
  relayerUrl: string;
  wallet: ActiveWallet;
  onStatus: (s: PassStatus | null) => void;
}) {
  const flow = usePassFlow(relayerUrl, wallet.address);
  const { status, statusError, claim } = flow;

  useFlowStep(flowStepOf(status));
  useEffect(() => {
    onStatus(status);
  }, [status, onStatus]);
  useEffect(() => () => onStatus(null), [onStatus]);

  // The claim reveal (SITE_FINAL.md "Claim reveal"): opens full-screen by itself once, when this page's own claim
  // succeeds (POST /pass answered {txHash, tokenId}); "View my pass" reopens it for a wallet that has claimed.
  // Nothing here runs on the server: PassFlow only renders once WalletGate has a wallet, after mount.
  const mintedTx = claim.kind === "claimed" ? claim.txHash : null;
  const [revealSeenFor, setRevealSeenFor] = useState<string | null>(null);
  const [revealAsked, setRevealAsked] = useState(false);
  const revealId = passArtId(claim.kind === "claimed" ? claim.tokenId : status?.claimed ? status.tokenId : null);
  const revealOpen = revealId !== null && (revealAsked || (mintedTx !== null && revealSeenFor !== mintedTx));
  const openReveal = useCallback(() => setRevealAsked(true), []);
  const closeReveal = useCallback(() => {
    setRevealAsked(false);
    setRevealSeenFor(mintedTx);
  }, [mintedTx]);
  // The token's own on-chain image (tokenURI, from GET /pass/:wallet) once the relayer returns it; until then the
  // same picture drawn on this page.
  const revealImage =
    revealId === null
      ? null
      : status?.claimed && passArtId(status.tokenId) === revealId && status.image
        ? status.image
        : passArtDataUri(revealId);
  const revealPass = status?.pass ?? PASS_ADDRESS;

  const unreachable = isUnreachable(statusError);
  const retryLine = unreachable ? <Notice text={PASS_COPY.unreachable(flow.retryInSeconds)} live /> : null;

  let body: ReactNode;
  if (statusError === "PASS_NOT_CONFIGURED") {
    body = <Notice text={PASS_COPY.notConfigured} />;
  } else if (!status) {
    body =
      retryLine ??
      (statusError ? (
        <Notice text={passErrorCopy(statusError).text} />
      ) : (
        <p role="status" className="flex items-center gap-3 py-6 text-lg text-muted">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-saffron motion-safe:animate-pulse" />
          {PASS_COPY.loading}
        </p>
      ));
  } else if (status.claimed && status.tokenId) {
    body = (
      <>
        <Claimed
          status={status}
          wallet={wallet}
          claim={claim}
          relayer={flow.relayer}
          onView={revealId !== null && revealPass ? openReveal : undefined}
        />
        {retryLine}
      </>
    );
  } else {
    body = (
      <>
        <Checklist status={status} claiming={claim.kind === "claiming"} onClaim={() => void flow.claimNow()} />
        {retryLine}
        {claim.kind === "error" && claim.code !== "NETWORK" && (
          <Notice text={passErrorCopy(claim.code, status.tokenId).text} txHash={claim.txHash} />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Wallet ending <span className="font-mono font-semibold text-ink">{walletLast4(wallet.address)}</span>
      </p>
      {body}
      {wallet.kind === "burner" && !wallet.persistent && (
        <p className="text-sm text-muted">
          This browser isn&apos;t saving data (private browsing?), so this is a new wallet with no stamp.
        </p>
      )}
      {revealOpen &&
        revealId !== null &&
        revealImage &&
        revealPass &&
        createPortal(
          <ClaimReveal
            tokenId={revealId}
            image={revealImage}
            txHash={mintedTx ?? pendingMintTx(claim)}
            passAddress={revealPass}
            onClose={closeReveal}
          />,
          document.body,
        )}
    </div>
  );
}

/** The mint this page sent whose answer came late (PASS_PENDING / CLAIM_PENDING with a tx), if any. */
function pendingMintTx(claim: ReturnType<typeof usePassFlow>["claim"]): `0x${string}` | null {
  return claim.kind === "error" && (claim.code === "TX_PENDING" || claim.code === "CLAIM_PENDING") ? claim.txHash : null;
}

/** The step to do next: the first one that isn't done (an unknown payment counts as done: you can still claim). */
function currentStep(steps: ReturnType<typeof passSteps>): 1 | 2 | 3 {
  if (steps.verify !== "done") return 1;
  if (steps.pay === "todo") return 2;
  return 3;
}

function Checklist({ status, claiming, onClaim }: { status: PassStatus; claiming: boolean; onClaim: () => void }) {
  const steps = passSteps(status);
  const ready = canClaim(status) && !claiming;
  const soldOut = status.remaining === 0;
  const until = formatStampExpiry(status.stampExpiresAt);
  const current = currentStep(steps);
  const claimState: StepState = steps.claim;

  return (
    <section aria-labelledby="pass-steps-title" className="flex flex-col gap-5">
      <StepsHeading id="pass-steps-title" />
      <ol className="flex flex-col gap-3">
        <StepItem n={1} title={PASS_COPY.step1Title} state={steps.verify} current={current === 1}>
          {steps.verify === "done" ? (
            <p className="text-muted">{PASS_COPY.step1Done(until)}</p>
          ) : (
            <>
              <p className="text-muted">{PASS_COPY.step1Body}</p>
              <div className="mt-2">
                <PillButton href={PASS_FLOW.step1}>{PASS_COPY.step1Button}</PillButton>
              </div>
              <p className="text-sm text-muted">{PASS_COPY.step1Hint}</p>
            </>
          )}
        </StepItem>

        <StepItem n={2} title={PASS_COPY.step2Title} state={steps.pay} current={current === 2}>
          {steps.pay === "done" ? (
            <p className="text-muted">{PASS_COPY.step2Done}</p>
          ) : steps.pay === "unknown" ? (
            <p className="text-muted">{PASS_COPY.step2Unknown}</p>
          ) : (
            <>
              <p className="text-muted">{PASS_COPY.step2Body}</p>
              {status.stamped && (
                <div className="mt-2">
                  <PillButton href={PASS_FLOW.step2}>{PASS_COPY.step2Button}</PillButton>
                </div>
              )}
            </>
          )}
        </StepItem>

        <StepItem n={3} title={PASS_COPY.step3Title} state={claimState} current={current === 3}>
          {claiming ? (
            <p role="status" aria-live="polite" className="flex items-start gap-3 text-lg font-medium">
              <span aria-hidden="true" className="mt-2 size-2.5 shrink-0 rounded-full bg-saffron motion-safe:animate-pulse" />
              {PASS_COPY.claiming}
            </p>
          ) : soldOut ? (
            <p className="text-muted">{PASS_COPY.soldOut}</p>
          ) : ready ? (
            <>
              <p className="text-muted">{PASS_COPY.step3Body}</p>
              <div className="mt-2 max-w-full">
                <PillButton onClick={onClaim}>
                  {PASS_COPY.step3Button}
                </PillButton>
              </div>
            </>
          ) : (
            <>
              <p id="pass-claim-locked" className="text-muted">
                {PASS_COPY.step3Locked}
              </p>
              <div className="mt-2 max-w-full">
                <PillButton disabled aria-describedby="pass-claim-locked">
                  {PASS_COPY.step3Button}
                </PillButton>
              </div>
            </>
          )}
        </StepItem>
      </ol>
    </section>
  );
}

/** The NFT is claimed: by this page just now ("NFT #N is yours." and the mint tx), or earlier ("already has"). */
function Claimed({
  status,
  wallet,
  claim,
  relayer,
  onView,
}: {
  status: PassStatus;
  wallet: ActiveWallet;
  claim: ReturnType<typeof usePassFlow>["claim"];
  relayer: string | null;
  /** Opens the claim reveal again ("View my pass"); absent when the token can't be shown. */
  onView?: () => void;
}) {
  const tokenId = status.tokenId!;
  // This page's own mint: answered right away, or sent and confirmed later (PASS_PENDING / CLAIM_PENDING with a tx).
  const mintTx = claim.kind === "claimed" ? claim.txHash : pendingMintTx(claim);
  const mintedHere = mintTx !== null;
  const rows: ReceiptRow[] = [
    { role: "user", text: "Signed nothing. Paid $0." },
    {
      role: "relayer",
      who: relayer ? last4(relayer) : undefined,
      text: "Minted it and paid the fee.",
      // The mint tx when this page sent it; otherwise our minting wallet's page, which lists the mint.
      href: mintTx ? txUrl(mintTx) : relayer ? addressUrl(relayer) : null,
      linkLabel: mintTx ? "See it on the explorer" : "See our minting wallet",
    },
    {
      role: "business",
      label: "NFT",
      who: last4(status.pass),
      text: "The NFT contract.",
      href: addressUrl(status.pass),
      linkLabel: "See it on the explorer",
    },
  ];

  return (
    <section aria-live="polite" className="flex flex-col gap-6">
      <div className="flex items-center gap-4 sm:gap-5">
        <StampSeal land className="size-16 shrink-0 sm:size-20" />
        <div className="min-w-0">
          {mintedHere ? (
            <>
              <Headline as="h2">{PASS_COPY.success(tokenId)}</Headline>
              <p className="mt-2 text-lg text-muted">{PASS_COPY.successLine}</p>
            </>
          ) : (
            <Headline as="h2" size="card">
              {PASS_COPY.alreadyClaimed(tokenId)}
            </Headline>
          )}
        </div>
      </div>
      {onView && (
        <div>
          <PillButton onClick={onView} arrow={false}>
            View my pass
          </PillButton>
        </div>
      )}
      {wallet.kind === "burner" && (
        <p className="rounded-inner bg-note-bg px-5 py-4 text-note">{PASS_COPY.burner}</p>
      )}
      <Receipt title="Receipt" rows={rows} className={MONO_ROLE_DOTS} />
    </section>
  );
}

function Notice({ text, txHash, live = false }: { text: string; txHash?: `0x${string}` | null; live?: boolean }) {
  return (
    <div role={live ? "status" : "alert"} className="rounded-inner bg-note-bg px-5 py-4 text-note">
      <p>{text}</p>
      {txHash && (
        <p className="mt-1 text-sm">
          <ExternalLink href={txUrl(txHash)} title={txHash}>
            See the transaction
          </ExternalLink>
        </p>
      )}
    </div>
  );
}
