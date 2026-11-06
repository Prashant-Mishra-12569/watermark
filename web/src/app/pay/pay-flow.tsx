"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import type { WebConfig } from "@/lib/config.ts";
import {
  isRelayerDown,
  PAY_RECEIPT,
  payErrorCopy,
  payNoStampCopy,
  relayerDownCopy,
  walletErrorCopy,
  walletPopupHint,
} from "@/lib/messages.ts";
import { checkAmount, checkRecipient, DEFAULT_PAY_AMOUNT_USDT, PAY_VALIDITY_SECONDS, type PayConfig } from "@/lib/pay.ts";
import { ADDR, LIVE_APP, last4, PASS_FLOW } from "@/lib/site.ts";
import { formatUsdt, parseUsdt, USDT_CHAIN_ID } from "@/lib/usdt.ts";
import { explorerAddressUrl, explorerTxUrl, shortAddress, walletLast4 } from "@/lib/view.ts";
import { BankCard } from "../_site/bank-card";
import { cx } from "../_site/cx";
import { ExternalLink } from "../_site/external-link";
import { FloatChip } from "../_site/float-chip";
import { Headline } from "../_site/headline";
import { PillButton } from "../_site/pill-button";
import type { ReceiptRow } from "../_site/receipt";
import { useRelayerHealth } from "../_wallet/use-relayer-health";
import type { ActiveWallet } from "../_wallet/use-wallet";
import { DROP_HUB, type DropStep } from "../_wallet/drop-steps";
import { WalletBar } from "../_wallet/wallet-gate";
import { PAY_COPY, PayHeading } from "./pay-heading";
import { PayTicket } from "./pay-ticket";
import { freePaymentsLine, PAY_STAMP_LABEL, quotaUsedUp, type PayStampView } from "./pay-stamp";
import { usePayFlow, type PaidReceipt } from "./use-pay-flow";

/** The dot and text colour of the stamp cell. Only the Sponsor's stamp is green; no stamp is an empty ring. */
const STAMP_DOT: Readonly<Record<PayStampView, string>> = {
  checking: "bg-[#b5b5b5] motion-safe:animate-pulse",
  stamped: "bg-leaf",
  "not-stamped": "border-[1.5px] border-ink",
  "other-app": "border-[1.5px] border-ink",
  error: "border-[1.5px] border-note",
};
const STAMP_TEXT: Readonly<Record<PayStampView, string>> = {
  checking: "text-muted",
  stamped: "text-ok",
  "not-stamped": "",
  "other-app": "",
  error: "text-note",
};
/** The Genesis Pass walk pays exactly this much to the demo shop (SITE_SPEC.md /pay ?next=pass). */
const PASS_PAY_AMOUNT_USDT = "1";
/** What POST /fund sends: the relayer's DEMO_FUND_USDT default (relayer/src/config.ts). DESIGN_V2: "Get 2 test USDT". */
const DEMO_FUND_USDT = "2";

const LABEL = "text-sm font-medium text-muted";
const DASHED = "border-dashed border-[#d9d9d6]";

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

export function PayFlow({
  config,
  pay: payConfig,
  passFlow,
  drop = passFlow,
  otherAppIds,
  setupProblems = [],
  wallet: active,
  walletChainId,
  onWalletStale,
  onSwitchWallet,
}: {
  /** config.appId is the Sponsor's app (readPaySetup): the only stamp this page trusts. */
  config: WebConfig;
  pay: PayConfig;
  /** ?next=pass while the drop is live: step 2 of the Genesis Drop walk (1 USDT to the demo shop). */
  passFlow: boolean;
  /** ?next=pass, live or not: the drop's step bar, and the way back to the drop after paying. */
  drop?: boolean;
  /** Read only to explain "this wallet's stamp is for another app". A stable array. */
  otherAppIds: readonly string[];
  /** Operator problems shown in the small print (for example, NEXT_PUBLIC_APP_ID isn't the Sponsor's app). */
  setupProblems?: readonly string[];
  wallet: ActiveWallet;
  /** The external wallet's active chain (null for the burner or when unknown). */
  walletChainId: number | null;
  /** Re-reads the own wallet's account after Pay found it changed or missing. */
  onWalletStale?: () => void;
  /** Back to the wallet choice: the wallet bar beside the "Testnet" chip (the gate's own bar is hidden). */
  onSwitchWallet?: () => void;
}) {
  const flow = usePayFlow(config, active, onWalletStale, otherAppIds);
  const { wallet, stamp, balance, fund, pay } = flow;
  const own = active.kind === "injected";
  const health = useRelayerHealth(config.relayerUrl);
  const ids = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  // The pass walk fixes the amount and, when the demo shop is set, the shop (its address field is hidden).
  const fixedAmount = passFlow ? PASS_PAY_AMOUNT_USDT : null;
  const [amountInput, setAmount] = useState(DEFAULT_PAY_AMOUNT_USDT);
  const amount = fixedAmount ?? amountInput;
  const [recipient, setRecipient] = useState(payConfig.demoShop ?? "");
  const [touched, setTouched] = useState(false);

  // Step 1 of the drop: /verify?next=pass on the drop walk, else /verify.
  const verifyHref = drop ? PASS_FLOW.step1 : "/verify";
  const stamped = stamp.kind === "stamped";
  const retryAt = stamp.kind === "error" ? stamp.retryAt : null;
  const now = useNow(retryAt !== null);
  const balanceUnits = balance ? (parseUsdt(balance.usdt) ?? 0n) : null;
  const busy = pay.kind === "signing" || pay.kind === "sending";
  const amountCheck = checkAmount(amount, payConfig.payMaxUsdt, balance?.usdt ?? null);
  const recipientCheck = wallet ? checkRecipient(recipient, wallet.address) : null;
  const canPay = stamped && !!wallet && balanceUnits !== null && balanceUnits > 0n && amountCheck.ok && !!recipientCheck?.ok && !busy;
  // The step bar: step 1 done once the stamp is read, step 2 once paid.
  const done: DropStep[] = [...(stamped ? [1 as const] : []), ...(pay.kind === "paid" ? [2 as const] : [])];
  const problems = [...setupProblems, ...payConfig.problems];
  const quotaLine = freePaymentsLine(stamp.kind, balance?.quotaLeft);

  const onPay = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canPay || !amountCheck.ok || !recipientCheck?.ok) return;
    void flow.submitPayment(recipientCheck.address, amountCheck.value, formatUsdt(amountCheck.value));
  };

  const payLabel =
    pay.kind === "signing"
      ? own
        ? `Sign in ${active.name}…`
        : "Signing…"
      : pay.kind === "sending"
        ? "Paying…"
        : amountCheck.ok
          ? `Pay ${formatUsdt(amountCheck.value)} USDT`
          : "Pay";
  const payStatus =
    pay.kind === "signing" && own
      ? "Check your wallet and sign. There's no fee to pay."
      : pay.kind === "sending" || pay.kind === "signing"
        ? "Sending it now. We pay the fee."
        : own
          ? `You'll sign in ${active.name}. Nothing is sent until you confirm.`
          : "This browser signs for you. We pay the network fee.";

  return (
    // Phones: one column (heading, what to do now, the wallet, small print). md: the heading across, then the wallet
    // and small print on the left, what to do now on the right. lg: the heading joins the left column.
    <div className="grid items-start gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:grid-rows-[auto_auto_1fr] md:gap-x-8 md:gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:grid-rows-[auto_auto_auto_1fr] lg:gap-x-16">
      {/* One polite announcement for the payment's progress (errors use role=alert). */}
      <p className="sr-only" aria-live="polite">
        {pay.kind === "paid" ? "Paid." : pay.kind === "sending" ? "Paying…" : ""}
      </p>

      <div className="min-w-0 md:col-span-2 md:row-start-1 lg:col-span-1 lg:col-start-1">
        <PayHeading
          bar={onSwitchWallet ? <WalletBar wallet={active} onSwitch={onSwitchWallet} /> : null}
          done={done}
          drop={drop}
        />
      </div>

      {/* The object column: what to do now (check, stamp first, get test USDT, pay, paid) */}
      <div className="flex min-w-0 flex-col gap-6 md:col-start-2 md:row-span-2 md:row-start-2 lg:row-span-4 lg:row-start-1">
        {stamp.kind === "checking" && (
          <div className="rounded-card bg-surface p-6 sm:p-8">
            <div aria-hidden="true" className="flex flex-col gap-4">
              <span className="h-3.5 w-20 rounded-full bg-line motion-safe:animate-pulse" />
              <span className="h-14 w-44 rounded-2xl bg-line motion-safe:animate-pulse" />
              <span className="mt-4 h-12 w-full rounded-full bg-line motion-safe:animate-pulse" />
            </div>
            <p className="mt-5 text-muted">Checking your stamp…</p>
          </div>
        )}

        {stamp.kind === "error" && (
          <section role="alert" className="rounded-card bg-note-bg p-6 text-note sm:p-8">
            <p className="text-lg font-semibold">
              {isRelayerDown(stamp.code) && retryAt !== null
                ? relayerDownCopy((retryAt - now) / 1000)
                : "Can't check your stamp right now."}
            </p>
            <p className="mt-1">
              {isRelayerDown(stamp.code) ? "Nothing has been sent." : "Our server or the network isn't answering. Nothing has been sent."}
              {retryAt !== null && !isRelayerDown(stamp.code) && ` Trying again in ${Math.max(0, Math.ceil((retryAt - now) / 1000))}s.`}
            </p>
            <div className="mt-5">
              <PillButton variant="secondary" onClick={() => void flow.checkStamp()}>
                Check again
              </PillButton>
            </div>
          </section>
        )}

        {/* No stamp for the Sponsor's app: send them back to step 1 (/verify, or /verify?next=pass on the drop walk). */}
        {(stamp.kind === "not-stamped" || stamp.kind === "other-app") && (
          <NoStampCard kind={stamp.kind} verifyHref={verifyHref} drop={drop} />
        )}

        {/* Test USDT from the business */}
        {stamped && (balanceUnits === 0n || fund.kind !== "idle") && pay.kind !== "paid" && (
          <section aria-labelledby={`${ids}-fund`} className="rounded-card bg-surface p-6 sm:p-8">
            {fund.kind === "sent" ? (
              <div className="flex flex-col items-start gap-3">
                <h2 id={`${ids}-fund`} className="sr-only">
                  Test USDT
                </h2>
                <FloatChip>✓ The business sent you test USDT</FloatChip>
                <p className="text-muted">
                  <ExternalLink href={explorerTxUrl(config.chainId, fund.txHash)} className="text-ink">
                    See the transfer
                  </ExternalLink>
                  {balanceUnits === 0n && <span> · It can take a few seconds to show.</span>}
                </p>
              </div>
            ) : (
              <>
                <h2 id={`${ids}-fund`} className="text-[26px] font-semibold leading-tight tracking-[-0.025em] sm:text-[28px]">
                  You have no test USDT yet.
                </h2>
                <p className="mt-2 text-muted">The business gives each stamped wallet a little test USDT to try a payment.</p>
                <div className="mt-6">
                  <PillButton
                    onClick={() => void flow.getDemoUsdt()}
                    disabled={fund.kind === "sending"}
                    busy={fund.kind === "sending"}
                  >
                    {fund.kind === "sending" ? "Asking the business…" : `Get ${DEMO_FUND_USDT} test USDT`}
                  </PillButton>
                </div>
                {fund.kind === "error" && (
                  <ErrorBox code={fund.code} payMaxUsdt={payConfig.payMaxUsdt} txUrl={fund.txHash && explorerTxUrl(config.chainId, fund.txHash)} />
                )}
              </>
            )}
          </section>
        )}

        {/* Paid: a paper ticket of who did what */}
        {pay.kind === "paid" && (
          <section aria-labelledby={`${ids}-paid`} className="flex min-w-0 flex-col items-start">
            <Headline as="h2" id={`${ids}-paid`}>
              *Paid.*
            </Headline>
            <p className="mt-3 text-lg text-muted">Step 2 done.</p>
            <div className="relative mt-8 w-full">
              <FloatChip at={{ top: -14, left: 20 }} tone="ink" decorative>
                Paid · $0 fee
              </FloatChip>
              <PayTicket
                amountUsdt={pay.receipt.amountUsdt}
                toDemoShop={!!payConfig.demoShop && pay.receipt.to.toLowerCase() === payConfig.demoShop.toLowerCase()}
                txHash={pay.receipt.txHash}
                txUrl={explorerTxUrl(config.chainId, pay.receipt.txHash)}
                rows={paidRows(pay.receipt, config.chainId, health?.relayer ?? null, health?.sponsor ?? ADDR.sponsor)}
              />
            </div>
            <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              {/* The live drop's walk goes on to step 3 (the claim on /pass); the walk before the drop opens goes back to
                  it; off the walk there is no drop to go back to. */}
              {passFlow ? (
                <PillButton href={PASS_FLOW.hub} size="lg">
                  {PAY_COPY.toStep3}
                </PillButton>
              ) : (
                <>
                  {drop && <PillButton href={DROP_HUB}>{PAY_COPY.backToDrop}</PillButton>}
                  <PillButton variant={drop ? "secondary" : "primary"} onClick={flow.resetPayment}>
                    Make another payment
                  </PillButton>
                </>
              )}
            </div>
          </section>
        )}

        {/* The payment card */}
        {stamped && pay.kind !== "paid" && (
          <form onSubmit={onPay} noValidate aria-label="Payment" className="relative rounded-card bg-surface p-6 sm:p-8">
            <FloatChip at={{ top: -16, right: 20 }} decorative>
              ✓ Wallet stamped
            </FloatChip>
            {fixedAmount ? (
              <div>
                <p className={LABEL}>You pay</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="text-[clamp(48px,14vw,64px)] font-semibold leading-none tracking-[-0.045em]">
                    {fixedAmount}
                  </span>
                  <span className="text-xl font-semibold text-muted">USDT</span>
                </p>
                {!amountCheck.ok && balanceUnits !== null && balanceUnits > 0n && (
                  <p className="mt-2 text-sm text-error">{amountCheck.message}</p>
                )}
              </div>
            ) : (
              <div>
                <label htmlFor={`${ids}-amount`} className={LABEL}>
                  You pay
                </label>
                <div className="mt-2 flex items-baseline gap-2 rounded-inner border border-line bg-white px-4 py-3 transition-colors focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
                  <input
                    id={`${ids}-amount`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={amountInput}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                    aria-invalid={touched && !amountCheck.ok}
                    aria-describedby={`${ids}-amount-hint`}
                    className="w-full min-w-0 bg-transparent text-[clamp(40px,12vw,56px)] font-semibold leading-none tracking-[-0.045em] focus:outline-none disabled:opacity-60"
                  />
                  <span className="shrink-0 text-xl font-semibold text-muted">USDT</span>
                </div>
                <p id={`${ids}-amount-hint`} className="mt-2 text-sm text-muted">
                  Up to {payConfig.payMaxUsdt} USDT per payment.
                </p>
                {(touched || amountInput !== DEFAULT_PAY_AMOUNT_USDT) && !amountCheck.ok && (
                  <p className="mt-1 text-sm text-error">{amountCheck.message}</p>
                )}
              </div>
            )}

            <dl className={cx("mt-6 border-t", DASHED)}>
              <div className={cx("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-4", DASHED)}>
                <dt className={LABEL}>To</dt>
                <dd className="min-w-0 text-right">
                  {payConfig.demoShop ? (
                    <>
                      <span className="font-semibold">Demo shop</span>{" "}
                      <ExternalLink
                        href={explorerAddressUrl(config.chainId, payConfig.demoShop)}
                        title={payConfig.demoShop}
                        className="font-mono text-sm text-muted"
                      >
                        {shortAddress(payConfig.demoShop)}
                      </ExternalLink>
                    </>
                  ) : (
                    <span className="text-muted">The shop&apos;s wallet, below</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-4">
                <dt className={LABEL}>Fee</dt>
                <dd className="font-semibold text-ok">$0 · we pay it</dd>
              </div>
            </dl>

            {!payConfig.demoShop && (
              <div className="mb-2">
                <label htmlFor={`${ids}-to`} className={LABEL}>
                  The shop&apos;s wallet address
                </label>
                <input
                  id={`${ids}-to`}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x…"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  disabled={busy}
                  aria-invalid={touched && !recipientCheck?.ok}
                  className="mt-2 min-h-12 w-full rounded-inner border border-line bg-white px-4 font-mono text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
                />
                {(touched || recipient !== "") && recipientCheck && !recipientCheck.ok && (
                  <p className="mt-1 text-sm text-error">{recipientCheck.message}</p>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-col">
              <PillButton type="submit" size="lg" disabled={!canPay && !busy} busy={busy} className="w-full">
                {payLabel}
              </PillButton>
            </div>
            <p className="mt-3 text-balance text-center text-sm text-muted" aria-live="polite">
              {payStatus}
            </p>

            <div className="mt-4 flex flex-col gap-3 empty:hidden">
              {own && amountCheck.ok && recipientCheck?.ok && (
                <SmallDetails summary="What your wallet will show">
                  <p data-testid="wallet-popup-hint">
                    {walletPopupHint({ value: amountCheck.value, to: recipientCheck.address, validitySeconds: PAY_VALIDITY_SECONDS })}
                  </p>
                </SmallDetails>
              )}
              {own && walletChainId !== null && walletChainId !== USDT_CHAIN_ID && (
                <p className="text-sm text-muted">
                  {active.name} is on another network. It will ask you to switch to Whitechain Sepolia.
                </p>
              )}
              {quotaUsedUp(stamp.kind, balance?.quotaLeft) && (
                <p className="text-sm text-note">You&apos;ve used today&apos;s free payments. They come back tomorrow.</p>
              )}
              {pay.kind === "wallet-error" && (
                <div role="alert" className="rounded-inner bg-note-bg px-4 py-3 text-note">
                  <p className="font-semibold">{walletErrorCopy(pay.code).title}</p>
                  <p className="text-sm">{walletErrorCopy(pay.code).next}</p>
                </div>
              )}
              {pay.kind === "error" && (
                <ErrorBox
                  code={pay.code}
                  payMaxUsdt={payConfig.payMaxUsdt}
                  verifyHref={verifyHref}
                  txUrl={pay.txHash && explorerTxUrl(config.chainId, pay.txHash)}
                />
              )}
            </div>
          </form>
        )}
      </div>

      {/* Your wallet: ending, stamp, balance */}
      <div className="flex min-w-0 flex-col gap-4 md:col-start-1 md:row-start-2">
        <section aria-label="Your wallet" className="rounded-card border border-line bg-white p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0">
              <p className={LABEL}>Wallet ending</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-wide">
                <span data-testid="wallet-last4">{wallet ? walletLast4(wallet.address) : "····"}</span>
              </p>
            </div>
            <div className="min-w-0">
              <p className={LABEL}>Stamp</p>
              <p className="mt-1.5 flex items-center gap-2 text-lg font-semibold" aria-live="polite">
                <span aria-hidden="true" className={cx("size-2.5 shrink-0 rounded-full", STAMP_DOT[stamp.kind])} />
                <span className={STAMP_TEXT[stamp.kind]}>{PAY_STAMP_LABEL[stamp.kind]}</span>
              </p>
            </div>
            <div className="col-span-2 min-w-0 sm:col-span-1 md:col-span-2 lg:col-span-1">
              <p className={LABEL}>Balance</p>
              <p className="mt-1.5 text-lg font-semibold tabular-nums" aria-live="polite">
                {balance ? `${balance.usdt} USDT` : flow.balanceError ? "Can't read it right now" : "…"}
              </p>
              {/* quotaLeft is 0 for a wallet without the Sponsor's stamp: only a stamped wallet's count means anything. */}
              {quotaLine && <p className="text-sm text-muted">{quotaLine}</p>}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-semibold transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-40"
              disabled={flow.balanceLoading || !wallet}
              onClick={() => {
                void flow.refreshBalance();
                if (!stamped) void flow.checkStamp();
              }}
            >
              <RefreshIcon spinning={flow.balanceLoading} />
              {flow.balanceLoading ? "Refreshing…" : "Refresh"}
            </button>
            {wallet && (
              <ExternalLink href={explorerAddressUrl(config.chainId, wallet.address)} className="text-sm text-muted">
                See this wallet on the explorer
              </ExternalLink>
            )}
          </div>
        </section>
        {wallet && !wallet.persistent && (
          <p className="flex items-start gap-2 text-sm text-muted">
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full border-[1.5px] border-ink" />
            This browser isn&apos;t saving data (private browsing?), so this is a new wallet with no stamp.
          </p>
        )}
      </div>

      {/* Small print (the way back to the drop is in the step bar at the top) */}
      <div className="flex min-w-0 flex-col items-start gap-4 md:col-start-1 md:row-start-3">
        {problems.length > 0 && (
          <div className="w-full rounded-inner border border-dashed border-line px-4 py-3 text-xs text-muted">
            <p className="font-semibold">For the team running this demo</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="max-w-[44ch] text-pretty text-sm text-muted">
          {own
            ? "Test USDT on a test network. No real money moves. You only sign."
            : "Test USDT on a test network. No real money moves. No seed phrase, no fee."}
        </p>
      </div>
    </div>
  );
}

/** You signed, Us (the relayer) sent it and paid the fee, the Business's contract checked the stamp, the Shop got paid. */
function paidRows(
  r: PaidReceipt,
  chainId: WebConfig["chainId"],
  healthRelayer: string | null,
  sponsor: string,
): ReceiptRow[] {
  // The tx's sender from POST /pay's answer, else the relayer from GET /health.
  const relayer = r.from ?? healthRelayer;
  return [
    { role: "user", text: PAY_RECEIPT.you(r.amountUsdt) },
    {
      role: "relayer",
      ...(relayer ? { who: last4(relayer), href: explorerAddressUrl(chainId, relayer), linkLabel: "Our wallet" } : {}),
      text: PAY_RECEIPT.relayer,
    },
    {
      role: "business",
      text: PAY_RECEIPT.business(r.quotaLeft),
      href: explorerAddressUrl(chainId, sponsor),
      linkLabel: "See the contract",
    },
    { role: "shop", who: last4(r.to), text: PAY_RECEIPT.shop(r.amountUsdt), href: explorerAddressUrl(chainId, r.to) },
  ];
}

function NoStampCard({
  kind,
  verifyHref,
  drop,
}: {
  kind: "not-stamped" | "other-app";
  verifyHref: string;
  drop: boolean;
}) {
  const base = payNoStampCopy(kind, LIVE_APP.label);
  // In the drop, "no stamp" means step 1 isn't done: say so (a stamp for another app keeps its own explanation).
  const copy = drop && kind === "not-stamped" ? { ...base, next: PAY_COPY.noStampNext } : base;
  const id = `nostamp-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col items-center rounded-card bg-surface px-6 py-10 text-center sm:px-10 sm:py-12">
      <div className="w-[230px] max-w-full sm:w-[260px]">
        <BankCard float={false} label="A bank card, not stamped yet" />
      </div>
      <h2 id={id} className="mt-8 text-[26px] font-semibold leading-tight sm:text-[30px]">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-[38ch] text-lg text-muted">{copy.next}</p>
      <div className="mt-7">
        <PillButton href={verifyHref}>{drop ? PAY_COPY.toStep1 : PAY_COPY.toVerify}</PillButton>
      </div>
    </section>
  );
}

function ErrorBox({
  code,
  payMaxUsdt,
  verifyHref,
  txUrl,
}: {
  code: Parameters<typeof payErrorCopy>[0];
  payMaxUsdt: string;
  verifyHref?: string;
  /** Explorer link to a transaction the relayer did send (still pending, or reverted). */
  txUrl?: string | null;
}) {
  const copy = payErrorCopy(code, { payMaxUsdt });
  return (
    <div role="alert" className="mt-4 rounded-inner bg-note-bg px-4 py-3 text-note">
      <p className="font-semibold">{copy.title}</p>
      <p className="text-sm">{copy.next}</p>
      {(code === "NOT_STAMPED" && verifyHref) || txUrl ? (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
          {code === "NOT_STAMPED" && verifyHref && (
            <Link href={verifyHref} className="underline decoration-current/35 underline-offset-4">
              {verifyHref === PASS_FLOW.step1 ? PAY_COPY.toStep1 : PAY_COPY.toVerify}
            </Link>
          )}
          {txUrl && <ExternalLink href={txUrl}>See the transaction on the explorer</ExternalLink>}
        </p>
      ) : null}
      {copy.detail && (
        <SmallDetails summary="Details" className="mt-2 bg-transparent px-0 py-0 ring-0">
          <p>{copy.detail}</p>
        </SmallDetails>
      )}
    </div>
  );
}

/** A compact <details> for technical extras (the wallet popup's raw fields, operator hints). Works without JS. */
function SmallDetails({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cx("group rounded-inner text-sm", className ?? "bg-white px-4 py-2 ring-1 ring-line")}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        <span>{summary}</span>
        <span aria-hidden="true" className="text-lg leading-none text-muted transition-transform duration-200 group-open:rotate-45">
          +
        </span>
      </summary>
      <div className="pb-2 leading-relaxed opacity-90">{children}</div>
    </details>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cx("block size-4", spinning && "motion-safe:animate-spin")}
    >
      <path
        d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
