"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { buildFallbackLink } from "@watermark/sdk";
import type { WebConfig } from "@/lib/config.ts";
import { sessionErrorCopy, statusNoteCopy } from "@/lib/messages.ts";
import {
  chainName,
  explorerAddressUrl,
  formatCountdown,
  formatStampExpiry,
  secondsUntil,
  walletLast4,
} from "@/lib/view.ts";
import { REFRESH_LEAD_SECONDS } from "@/lib/timing.ts";
import type { ActiveWallet } from "../_wallet/use-wallet";
import { useVerifyFlow } from "./use-verify-flow";

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

export function VerifyFlow({
  config,
  wallet: active,
  onNewWallet,
}: {
  config: WebConfig;
  wallet: ActiveWallet;
  /** Only for the burner: "Demo tools → start over with a new wallet". */
  onNewWallet?: (() => void) | undefined;
}) {
  const flow = useVerifyFlow(config, active);
  const { wallet, session, stamp } = flow;
  const now = useNow(!stamp);
  const [shortQr, setShortQr] = useState(false);
  const chain = chainName(config.chainId);
  // /pay finds the same wallet by appId: keep a ?app= override.
  const payHref =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("app")
      ? `/pay?app=${encodeURIComponent(config.appId)}`
      : "/pay";

  // Counted on this device's clock from when the session arrived (see localSessionDeadline).
  const left = session ? secondsUntil(session.deadlineMs, now) : 0;
  // Never show a QR without a live, signed session.
  const liveSession = session && left > 0 ? session : null;
  const qrValue =
    liveSession && shortQr && config.relayerLanUrl
      ? buildFallbackLink(liveSession.sessionId, config.relayerLanUrl)
      : liveSession?.qr;
  // The same 4 characters the Tap app shows: from session.wallet (= the link's w), case-sensitive.
  const last4 = session ? walletLast4(session.session.wallet) : wallet ? walletLast4(wallet.address) : null;
  const retryIn = flow.retryBlockedUntil ? Math.max(0, Math.ceil((flow.retryBlockedUntil - now) / 1000)) : 0;
  const errorCopy = flow.sessionError
    ? sessionErrorCopy(flow.sessionError.code, { relayerUrl: config.relayerUrl, appId: config.appId, chainName: chain })
    : null;

  return (
    <div className="grid items-start gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:gap-8">
      {/* QR column */}
      <div className="flex flex-col items-center gap-2 md:items-start">
        {stamp ? (
          <div className="qr-frame flex items-center justify-center" style={{ background: "var(--ok-bg)" }}>
            <p className="text-6xl font-bold text-ok" aria-hidden="true">
              ✓
            </p>
          </div>
        ) : qrValue ? (
          <div className="qr-frame">
            <QRCodeSVG
              value={qrValue}
              level="L"
              marginSize={4}
              size={480}
              bgColor="#FFFFFF"
              fgColor="#000000"
              title="QR code: scan it with your Android phone's camera to open Watermark Tap"
              role="img"
              aria-label="QR code that opens Watermark Tap with this session"
            />
          </div>
        ) : (
          <div className="qr-frame flex items-center justify-center p-6 text-center text-black/60">
            {flow.sessionLoading || (!flow.sessionError && !session) ? "Preparing your QR code…" : "No QR code yet"}
          </div>
        )}
        {liveSession && !stamp && (
          <p className="text-sm text-muted">
            QR code valid for <span className="font-mono tabular-nums">{formatCountdown(left)}</span>
            {left <= REFRESH_LEAD_SECONDS ? " · getting a new one…" : ""}
          </p>
        )}
        {liveSession && !stamp && (
          // On a phone, the link is the fallback when the camera won't open it: keep it right under the QR.
          <a
            href={liveSession.qr}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-accent px-4 text-lg font-semibold text-accent-text md:hidden"
          >
            Open in Watermark Tap
          </a>
        )}
      </div>

      {/* Details column */}
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{stamp ? "Your wallet is verified" : "Verify your wallet"}</h1>
          <p className="text-sm text-muted">{chain}</p>
        </div>

        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <p className="text-sm text-muted">Wallet ending</p>
          <p className="font-mono text-5xl font-bold tracking-wider sm:text-6xl" data-testid="wallet-last4">
            {last4 ?? "····"}
          </p>
        </div>

        <div aria-live="polite" aria-atomic="true" className="min-h-8">
          {stamp ? (
            <div className="space-y-2 rounded-xl bg-ok-bg px-4 py-3 text-ok">
              <p className="text-3xl font-bold">Verified ✓</p>
              {config.chainId === "1874" && (
                <Link
                  href={payHref}
                  className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-accent-text hover:opacity-90"
                >
                  Pay a shop with this wallet (no gas)
                </Link>
              )}
              {stamp.expiresAt > 0 && (
                <p className="text-sm">Stamp valid until {formatStampExpiry(stamp.expiresAt)}.</p>
              )}
              <p className="text-sm">
                <a
                  className="font-semibold underline"
                  href={explorerAddressUrl(config.chainId, wallet?.address ?? "")}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  See this wallet on the {chain} explorer
                </a>
                {session && (
                  <>
                    {" · "}
                    <a
                      className="underline"
                      href={explorerAddressUrl(config.chainId, session.session.registry)}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      stamp registry (Stamped events)
                    </a>
                  </>
                )}
              </p>
            </div>
          ) : liveSession ? (
            <p className="text-lg">Waiting for your tap…</p>
          ) : null}
        </div>

        {!stamp && errorCopy && !liveSession && (
          <div
            role="alert"
            className={`rounded-xl px-4 py-3 ${
              flow.sessionError?.retryAt ? "bg-note-bg text-note" : "bg-error-bg text-error"
            }`}
          >
            <p className="font-semibold">{errorCopy.title}</p>
            <p className="mt-1 text-sm">{errorCopy.hint}</p>
            {flow.sessionError?.retryAt && (
              <p className="mt-1 text-sm">
                Trying again in {Math.max(0, Math.ceil((flow.sessionError.retryAt - now) / 1000))} s.
              </p>
            )}
          </div>
        )}

        {/* No scan steps next to a "no QR code" message. */}
        {!stamp && (liveSession || !flow.sessionError) && (
          <ol className="list-decimal space-y-1 pl-5 text-base">
            <li>Scan the QR code with your Android phone&apos;s camera.</li>
            <li>Check the wallet ending matches, then tap your card on the back of the phone.</li>
          </ol>
        )}

        {/* The note says "your QR code still works", so it only appears next to a live QR. */}
        {!stamp && liveSession && flow.statusNote && (
          <p className="rounded-lg bg-note-bg px-3 py-2 text-sm text-note">{statusNoteCopy(flow.statusNote)}</p>
        )}

        {!stamp && liveSession?.clockSkewed && (
          <p className="text-sm text-muted">
            This computer&apos;s clock looks wrong, so the countdown is approximate. Check the date and time settings.
          </p>
        )}

        {!stamp && (
          <div className="flex flex-wrap items-center gap-3">
            {liveSession && (
              <a
                href={liveSession.qr}
                className="hidden min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-accent-text hover:opacity-90 md:inline-flex"
              >
                Open in Watermark Tap
              </a>
            )}
            <button
              type="button"
              onClick={flow.newQr}
              disabled={flow.sessionLoading || retryIn > 0 || !wallet}
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-4 font-semibold disabled:opacity-50"
            >
              {flow.sessionLoading ? "Getting a QR code…" : retryIn > 0 ? `New QR code in ${retryIn} s` : "New QR code"}
            </button>
          </div>
        )}

        {liveSession && !stamp && <LinkBox link={qrValue ?? liveSession.qr} />}

        {!stamp && config.relayerLanUrl && liveSession && (
          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              className="mt-1"
              checked={shortQr}
              onChange={(e) => setShortQr(e.target.checked)}
            />
            <span>Short QR code (not supported by Watermark Tap yet; for scan tests only)</span>
          </label>
        )}

        <p className="text-sm text-muted">No money is charged. No card number goes on-chain.</p>

        {wallet && !wallet.persistent && (
          <p className="text-sm text-muted">
            This browser isn&apos;t saving data (private browsing?), so a reload starts with a new wallet.
          </p>
        )}

        {onNewWallet && <DemoTools stamped={!!stamp} onNewWallet={onNewWallet} />}
      </div>
    </div>
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
        className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2 py-1.5 font-mono text-xs text-muted"
      />
      {canCopy && (
        <button
          type="button"
          className="shrink-0 rounded-md border border-line px-2 py-1.5 text-xs font-semibold"
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
    <details className="text-sm text-muted">
      <summary className="cursor-pointer select-none">Demo tools</summary>
      <div className="mt-2 space-y-2">
        {!confirming ? (
          <button type="button" className="underline" onClick={() => setConfirming(true)}>
            Start over with a new wallet
          </button>
        ) : (
          <div className="space-y-2 rounded-lg border border-line p-3">
            <p>
              {stamped
                ? "This wallet is stamped. A new wallet starts without a stamp, and this one can't be recovered in this browser."
                : "This browser's wallet for this app will be replaced. It can't be recovered afterwards."}
            </p>
            <div className="flex gap-3">
              <button type="button" className="font-semibold text-error underline" onClick={onNewWallet}>
                Yes, use a new wallet
              </button>
              <button type="button" className="underline" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
