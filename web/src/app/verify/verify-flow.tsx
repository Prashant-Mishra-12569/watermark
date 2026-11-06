"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState, type ReactNode } from "react";
import { buildFallbackLink } from "@watermark/sdk";
import type { WebConfig } from "@/lib/config.ts";
import {
  isRelayerDown,
  QR_STEPS,
  relayerDownCopy,
  sessionErrorCopy,
  statusNoteCopy,
  TAPPED_NOTHING_HAPPENED,
  VERIFY_RECEIPT,
  verifiedUntilCopy,
} from "@/lib/messages.ts";
import { ADDR, last4, PASS_FLOW, type NavItem } from "@/lib/site.ts";
import {
  chainName,
  explorerAddressUrl,
  formatCountdown,
  formatStampExpiry,
  secondsUntil,
  walletLast4,
} from "@/lib/view.ts";
import { REFRESH_LEAD_SECONDS } from "@/lib/timing.ts";
import { LineIcon, type LineIconName } from "../_art";
import { BankCard } from "../_site/bank-card";
import { Disclosure } from "../_site/disclosure";
import { ExternalLink } from "../_site/external-link";
import { FloatChip } from "../_site/float-chip";
import { PillButton } from "../_site/pill-button";
import { Receipt, type ReceiptRow } from "../_site/receipt";
import { useRelayerHealth } from "../_wallet/use-relayer-health";
import type { ActiveWallet } from "../_wallet/use-wallet";
import { WalletBar } from "../_wallet/wallet-gate";
import { useVerifyFlow } from "./use-verify-flow";
import { VERIFY_COPY, VerifyHeading } from "./verify-heading";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const secondsTo = (at: number, now: number) => Math.max(0, Math.ceil((at - now) / 1000));

/**
 * The receipt's role dots in black (only "You" keeps saffron), via the CSS variables RoleChip paints with. Drop this
 * once globals.css makes --role-* monochrome.
 */
const MONO_ROLE_DOTS = "[--role-business:var(--ink)] [--role-relayer:var(--ink)] [--role-shop:var(--ink)]";

/**
 * The QR's white card. Phones: the screen's width. From md it is sized from the viewport's height as well, so the whole
 * code fits on a laptop's first screen (1470x790: 390px, 1280x700: 300px), never under 300px (easy to scan) or over
 * 440px. From lg the left column is exactly this wide; the meta row under it uses the column's width.
 */
const OBJECT_COL = "w-full max-w-[480px] md:max-w-[clamp(300px,calc(100svh_-_400px),440px)]";
const META_COL = "w-full max-w-[480px]";

/** Grid placement per state (literal class strings, so Tailwind sees them). */
const LAYOUT = {
  qr: {
    grid: "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-10 lg:grid-cols-[clamp(300px,calc(100svh_-_400px),440px)_minmax(0,1fr)] lg:gap-x-16",
    side: "md:col-start-2 md:row-span-2 md:row-start-1",
    below: "md:col-start-1 md:row-start-2",
  },
  stamped: {
    // From 900px: the receipt's two-column rows need ~520px beside the card (at 768 they would wrap word by word).
    grid: "min-[900px]:grid-cols-[minmax(0,320px)_minmax(0,1fr)] min-[900px]:grid-rows-[auto_1fr] min-[900px]:gap-x-10 lg:grid-cols-[380px_minmax(0,1fr)] lg:gap-x-16",
    side: "min-[900px]:col-start-2 min-[900px]:row-span-2 min-[900px]:row-start-1",
    below: "min-[900px]:col-start-1 min-[900px]:row-start-2",
  },
} as const;

export function VerifyFlow({
  config,
  passFlow,
  drop = passFlow,
  wallet: active,
  onSwitchWallet,
  onNewWallet,
}: {
  config: WebConfig;
  /** ?next=pass while the drop is live: step 1 of the Genesis Drop walk (step 2 is /pay?next=pass). */
  passFlow: boolean;
  /** ?next=pass, live or not: the drop's step bar, and step 2 stays on the walk. */
  drop?: boolean;
  wallet: ActiveWallet;
  /** The wallet bar's button: back to the wallet choice. */
  onSwitchWallet: () => void;
  /** Only for the burner: "Details → Demo tools → start over with a new wallet". */
  onNewWallet?: (() => void) | undefined;
}) {
  const flow = useVerifyFlow(config, active);
  const { wallet, session, stamp } = flow;
  const now = useNow(!stamp);
  const [shortQr, setShortQr] = useState(false);
  const chain = chainName(config.chainId);
  // /status returns no tx hash, so the receipt links the relayer's address from GET /health.
  const health = useRelayerHealth(config.relayerUrl, !!stamp);

  // Counted on this device's clock from when the session arrived (see localSessionDeadline).
  const left = session ? secondsUntil(session.deadlineMs, now) : 0;
  // Never show a QR without a live, signed session.
  const liveSession = session && left > 0 ? session : null;
  const qrValue =
    liveSession && shortQr && config.relayerLanUrl
      ? buildFallbackLink(liveSession.sessionId, config.relayerLanUrl)
      : liveSession?.qr;
  // The same 4 characters the Tap app shows: from session.wallet (= the link's w), case-sensitive.
  const ending = session ? walletLast4(session.session.wallet) : wallet ? walletLast4(wallet.address) : null;
  const check = QR_STEPS.check(ending ?? "····");
  const retryIn = flow.retryBlockedUntil ? secondsTo(flow.retryBlockedUntil, now) : 0;
  const errorCopy = flow.sessionError
    ? sessionErrorCopy(flow.sessionError.code, { relayerUrl: config.relayerUrl, appId: config.appId, chainName: chain })
    : null;
  const sessionRetryAt = flow.sessionError?.retryAt ?? null;
  const relayerDown = !!flow.sessionError && isRelayerDown(flow.sessionError.code) && sessionRetryAt !== null;
  const validUntil = stamp ? verifiedUntilCopy(formatStampExpiry(stamp.expiresAt)) : "";
  const making = flow.sessionLoading || (!flow.sessionError && !session);
  // The steps (and the card that will be stamped) show next to a live QR, or while one is being made.
  const showSteps = !stamp && (!!liveSession || !flow.sessionError);

  // After the stamp: step 2 of the drop (/pay?next=pass) on the drop's walk; otherwise /pay, worded without the
  // drop. Payments run on Whitechain only (not the devnet).
  const next: NavItem | null =
    passFlow || (drop && config.chainId === "1874")
      ? { href: PASS_FLOW.step2, label: VERIFY_COPY.next }
      : config.chainId === "1874"
        ? { href: "/pay", label: VERIFY_COPY.nextPlain }
        : null;

  const registry = session?.session.registry ?? (config.chainId === "1874" ? ADDR.registry : null);
  const relayer = health?.relayer ?? null;
  const receiptRows: ReceiptRow[] = [
    { role: "user", text: VERIFY_RECEIPT.you },
    relayer
      ? { role: "relayer", who: last4(relayer), text: VERIFY_RECEIPT.relayer, href: explorerAddressUrl(config.chainId, relayer) }
      : { role: "relayer", text: VERIFY_RECEIPT.relayer },
  ];

  return (
    <div className="flex flex-col gap-8 sm:gap-[clamp(24px,4svh,40px)]">
      <VerifyHeading
        title={stamp ? VERIFY_COPY.stamped : VERIFY_COPY.title}
        lead={
          stamp ? `${drop ? "Step 1 done." : "Done."}${validUntil ? ` ${validUntil}` : ""}` : QR_STEPS.lead
        }
        chain={chain}
        bar={<WalletBar wallet={active} onSwitch={onSwitchWallet} />}
        stamped={!!stamp}
        drop={drop}
      />

      {/*
        Three blocks. Phones stack them A, B, C. Wider (the QR from md, the stamped card from 900px): A (the QR, or the
        stamped card) and C (help, Details) on the left, B (steps, or step 2 and the receipt) beside them on the right.
      */}
      <div className={`grid gap-8 ${stamp ? LAYOUT.stamped.grid : LAYOUT.qr.grid}`}>
        {/* A: the QR in its white card, or the stamped card. */}
        <div className="flex min-w-0 flex-col gap-4">
          {stamp ? (
            <div className="relative mx-auto w-full max-w-[340px] sm:mx-0">
              <BankCard
                stamped
                label={`Your bank card, stamped by Watermark for the wallet ending ${ending ?? "····"}`}
              />
              <FloatChip at={{ top: "2%", left: 0 }} decorative className="motion-safe:animate-rise">
                ✓ Wallet stamped
              </FloatChip>
              <FloatChip at={{ bottom: "2%", right: 0 }} tone="ink" decorative>
                <span>
                  Wallet ending <span className="font-mono font-semibold">{ending ?? "····"}</span>
                </span>
              </FloatChip>
            </div>
          ) : (
            <>
              <div className={`${OBJECT_COL} rounded-card bg-white p-3 shadow-float ring-1 ring-line sm:p-4`}>
                {qrValue ? (
                  <QRCodeSVG
                    value={qrValue}
                    level="L"
                    marginSize={4}
                    size={480}
                    bgColor="#FFFFFF"
                    fgColor="#000000"
                    title="QR code: show it to the Watermark phone app, or scan it with your Android phone's camera to open Watermark Tap"
                    role="img"
                    aria-label="QR code that opens Watermark Tap with this session"
                    className="block aspect-square h-auto w-full rounded-inner"
                  />
                ) : (
                  <div
                    className={`grid w-full place-items-center rounded-inner bg-surface p-8 text-center text-lg text-muted ${
                      making ? "aspect-square" : "aspect-[2/1]"
                    }`}
                  >
                    {making ? "Making your QR code…" : "No QR code yet"}
                  </div>
                )}
              </div>

              <div className={`flex ${META_COL} flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
                {liveSession ? (
                  <p className="text-sm text-muted">
                    Code valid for <span className="font-mono tabular-nums text-ink">{formatCountdown(left)}</span>
                    {left <= REFRESH_LEAD_SECONDS ? " · getting a new one…" : ""}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {liveSession && (
                    // Desktop has no Watermark Tap app, but the link still helps when testing on a laptop.
                    <span className="hidden md:inline">
                      <PillButton href={liveSession.qr} external={false} variant="secondary" size="xs">
                        Open in Watermark Tap
                      </PillButton>
                    </span>
                  )}
                  <PillButton
                    variant="secondary"
                    size="xs"
                    onClick={flow.newQr}
                    disabled={flow.sessionLoading || retryIn > 0 || !wallet}
                    busy={flow.sessionLoading}
                  >
                    {flow.sessionLoading ? "Getting a QR code…" : retryIn > 0 ? `New QR code in ${retryIn} s` : "New QR code"}
                  </PillButton>
                </div>
              </div>

              {liveSession && (
                // On a phone, the link is the fallback when the camera won't open it: keep it right under the QR.
                <div className="md:hidden">
                  <PillButton href={liveSession.qr} external={false} className="w-full">
                    Open in Watermark Tap
                  </PillButton>
                </div>
              )}
            </>
          )}
        </div>

        {/* B: the three steps and the wait, or the receipt and the next step. */}
        <div className={`flex min-w-0 flex-col gap-6 ${stamp ? LAYOUT.stamped.side : LAYOUT.qr.side}`}>
          {!stamp && errorCopy && !liveSession && (
            <div
              role="alert"
              className={`rounded-inner px-5 py-4 ${sessionRetryAt ? "bg-note-bg text-note" : "bg-error-bg text-error"}`}
            >
              <p className="font-semibold">
                {relayerDown && sessionRetryAt ? relayerDownCopy(secondsTo(sessionRetryAt, now)) : errorCopy.title}
              </p>
              {sessionRetryAt && !relayerDown && (
                <p className="mt-1 text-sm">Trying again in {secondsTo(sessionRetryAt, now)} s.</p>
              )}
              {/* The fix is for whoever runs the demo: kept, but folded away. */}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer select-none font-medium underline decoration-current/40 underline-offset-4">
                  What to check
                </summary>
                <p className="mt-1 break-words opacity-90">{errorCopy.hint}</p>
              </details>
            </div>
          )}

          {/* No scan steps next to a "no QR code" message. */}
          {/* How to tap: icons, not numbers, so they never read as the drop's steps 1 to 3. */}
          {showSteps && (
            <ol className="flex flex-col gap-5" aria-label="How to tap your card">
              <StepRow icon="phone">{QR_STEPS.scan}</StepRow>
              <StepRow icon="wallet">
                {check.before}
                <strong
                  className="mx-0.5 inline-block whitespace-nowrap rounded-lg bg-white px-2 font-mono text-[1.15em] font-semibold tracking-wide text-ink shadow-float ring-1 ring-black/[0.06]"
                  data-testid="wallet-last4"
                >
                  {check.strong}
                </strong>
                {check.after}
              </StepRow>
              <StepRow icon="tap">{QR_STEPS.hold}</StepRow>
            </ol>
          )}

          {/* One live region in a fixed place: it says "waiting" next to a live QR, and announces the stamp. */}
          <div aria-live="polite" aria-atomic="true">
            {stamp ? (
              <p className="sr-only">
                You&apos;re stamped. {validUntil}
              </p>
            ) : liveSession ? (
              <div className="flex items-start gap-3.5 rounded-inner bg-surface px-5 py-4">
                <span aria-hidden="true" className="relative mt-[7px] flex size-2.5 shrink-0">
                  <span className="absolute inline-flex size-full rounded-full bg-saffron opacity-60 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-saffron" />
                </span>
                <p className="leading-relaxed">
                  <span className="font-semibold">{QR_STEPS.waiting}</span>{" "}
                  <span className="text-muted">{QR_STEPS.waitingNote}</span>
                </p>
              </div>
            ) : null}
          </div>

          {/* The note says "your QR code still works", so it only appears next to a live QR. */}
          {!stamp && liveSession && flow.statusNote && (
            <p className="rounded-inner bg-note-bg px-5 py-3 text-sm text-note">
              {isRelayerDown(flow.statusNote.code)
                ? `${relayerDownCopy(secondsTo(flow.statusNote.retryAt, now))} Your QR code still works.`
                : statusNoteCopy(flow.statusNote.code)}
            </p>
          )}

          {!stamp && liveSession?.clockSkewed && (
            <p className="text-sm text-muted">
              This computer&apos;s clock looks wrong, so the countdown is only roughly right. Check the date and time.
            </p>
          )}

          {showSteps && (
            <>
              <div className="relative mx-auto w-full max-w-[340px] md:mx-0">
                <BankCard label={`Your bank card. Its stamp goes to the wallet ending ${ending ?? "····"}`} />
                <FloatChip at={{ bottom: "4%", left: 0 }} tone="ink" decorative>
                  <span>
                    Wallet ending <span className="font-mono font-semibold">{ending ?? "····"}</span>
                  </span>
                </FloatChip>
              </div>
              <p className="text-sm text-muted">You pay nothing. We never store your card number or put it on-chain.</p>
            </>
          )}

          {/* Phones and tablets: step 2 right under the stamped card (first screen). From lg: after the receipt. */}
          {next && stamp && (
            <div className="flex flex-col items-start gap-2 lg:order-last">
              <PillButton href={next.href} size="lg">
                {next.label}
              </PillButton>
              <p className="text-sm text-muted">One free test payment. We pay the fee.</p>
            </div>
          )}

          {stamp && <Receipt title="Receipt" rows={receiptRows} className={MONO_ROLE_DOTS} />}
        </div>

        {/* C: help, and everything technical folded into Details. */}
        <div className={`flex min-w-0 flex-col gap-3 ${stamp ? LAYOUT.stamped.below : LAYOUT.qr.below}`}>
          {!stamp && (
            <Disclosure summary={TAPPED_NOTHING_HAPPENED.summary}>
              <p>{TAPPED_NOTHING_HAPPENED.body}</p>
              <p className="mt-2 text-sm text-muted">{TAPPED_NOTHING_HAPPENED.note}</p>
            </Disclosure>
          )}

          {wallet && !wallet.persistent && (
            <p className="rounded-inner bg-note-bg px-5 py-3 text-sm text-note">
              This browser isn&apos;t saving data (private mode?). A reload starts with a new wallet.
            </p>
          )}

          {/* Moved here, not removed: explorer links, the raw link, Short QR and Demo tools. */}
          <Disclosure summary="Details">
            <div className="flex flex-col gap-4 text-sm">
              <p className="text-muted">
                The Watermark phone app reads the card. Our prover makes a private proof, then wipes the card data. Our
                relayer puts the stamp on-chain and pays the fee.
              </p>
              {wallet && (
                <p className="flex flex-wrap gap-x-4 gap-y-2">
                  <ExternalLink href={explorerAddressUrl(config.chainId, wallet.address)}>
                    This wallet on the {chain} explorer
                  </ExternalLink>
                  {registry && (
                    <ExternalLink href={explorerAddressUrl(config.chainId, registry)}>
                      Stamp registry (Stamped events)
                    </ExternalLink>
                  )}
                </p>
              )}
              {liveSession && !stamp && <LinkBox link={qrValue ?? liveSession.qr} />}
              {!stamp && config.relayerLanUrl && liveSession && (
                <label className="flex items-start gap-2 text-muted">
                  <input
                    type="checkbox"
                    className="mt-1 accent-ink"
                    checked={shortQr}
                    onChange={(e) => setShortQr(e.target.checked)}
                  />
                  <span>Short QR code (not supported by Watermark Tap yet; for scan tests only)</span>
                </label>
              )}
              {onNewWallet && <DemoTools stamped={!!stamp} onNewWallet={onNewWallet} />}
            </div>
          </Disclosure>
        </div>
      </div>
    </div>
  );
}

/** One of the three things to do at the phone: a line icon in a round chip and one short line. */
function StepRow({ icon, children }: { icon: LineIconName; children: ReactNode }) {
  return (
    <li className="flex items-start gap-4">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-ink">
        <LineIcon name={icon} size={22} />
      </span>
      <p className="min-w-0 pt-1.5 text-lg leading-snug lg:text-xl">{children}</p>
    </li>
  );
}

function LinkBox({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  // navigator.clipboard needs a secure context: localhost yes, http://192.168.x.x no.
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard && window.isSecureContext;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        readOnly
        value={link}
        aria-label="Watermark link"
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-10 min-w-0 flex-1 truncate rounded-full border border-line bg-white px-4 font-mono text-xs text-muted"
      />
      {canCopy && (
        <button
          type="button"
          className="min-h-10 shrink-0 rounded-full border border-line bg-white px-4 text-xs font-semibold hover:bg-surface"
          onClick={() => {
            navigator.clipboard.writeText(link).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => {},
            );
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

/** For demo rehearsals: start over with a new wallet. Two steps, so a stamped wallet isn't thrown away by accident. */
function DemoTools({ stamped, onNewWallet }: { stamped: boolean; onNewWallet: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <details className="text-muted">
      <summary className="cursor-pointer select-none font-medium">Demo tools</summary>
      <div className="mt-2 space-y-2">
        {!confirming ? (
          <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setConfirming(true)}>
            Start over with a new wallet
          </button>
        ) : (
          <div className="space-y-2 rounded-inner border border-line bg-white p-4">
            <p>
              {stamped
                ? "This wallet is stamped. A new wallet starts without a stamp, and this one can't be recovered in this browser."
                : "This browser's wallet for this app will be replaced. It can't be recovered afterwards."}
            </p>
            <div className="flex gap-4">
              <button
                type="button"
                className="min-h-11 font-semibold text-error underline underline-offset-4"
                onClick={onNewWallet}
              >
                Yes, use a new wallet
              </button>
              <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
