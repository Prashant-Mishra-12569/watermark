"use client";

import Link from "next/link";
import { useState } from "react";
import type { WebConfig } from "@/lib/config.ts";
import { payErrorCopy, walletErrorCopy, walletPopupHint } from "@/lib/messages.ts";
import { checkAmount, checkRecipient, DEFAULT_PAY_AMOUNT_USDT, PAY_VALIDITY_SECONDS, type PayConfig } from "@/lib/pay.ts";
import { formatUsdt, parseUsdt } from "@/lib/usdt.ts";
import { explorerAddressUrl, explorerTxUrl, shortAddress, walletLast4 } from "@/lib/view.ts";
import { USDT_CHAIN_ID } from "@/lib/usdt.ts";
import type { ActiveWallet } from "../_wallet/use-wallet";
import { usePayFlow } from "./use-pay-flow";

const linkProps = { target: "_blank", rel: "noreferrer noopener" } as const;

export function PayFlow({
  config,
  pay: payConfig,
  wallet: active,
  walletChainId,
  onWalletStale,
}: {
  config: WebConfig;
  pay: PayConfig;
  wallet: ActiveWallet;
  /** The external wallet's active chain (null for the burner or when unknown). */
  walletChainId: number | null;
  /** Re-reads the own wallet's account after Pay found it changed or missing. */
  onWalletStale?: () => void;
}) {
  const flow = usePayFlow(config, active, onWalletStale);
  const { wallet, stamp, balance, fund, pay } = flow;
  const own = active.kind === "injected";

  const [amount, setAmount] = useState(DEFAULT_PAY_AMOUNT_USDT);
  const [recipient, setRecipient] = useState(payConfig.demoShop ?? "");
  const [touched, setTouched] = useState(false);

  // Keep a ?app= override when sending the person to /verify, so they verify the same wallet.
  const appQuery = new URLSearchParams(window.location.search).get("app");
  const verifyHref = appQuery ? `/verify?app=${encodeURIComponent(appQuery)}` : "/verify";

  const stamped = stamp.kind === "stamped";
  const balanceUnits = balance ? (parseUsdt(balance.usdt) ?? 0n) : null;
  const busy = pay.kind === "signing" || pay.kind === "sending";
  const amountCheck = checkAmount(amount, payConfig.payMaxUsdt, balance?.usdt ?? null);
  const recipientCheck = wallet ? checkRecipient(recipient, wallet.address) : null;
  const canPay = stamped && !!wallet && balanceUnits !== null && balanceUnits > 0n && amountCheck.ok && !!recipientCheck?.ok && !busy;

  const onPay = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canPay || !amountCheck.ok || !recipientCheck?.ok) return;
    void flow.submitPayment(recipientCheck.address, amountCheck.value, formatUsdt(amountCheck.value));
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">Pay a shop</h1>
        <p className="text-sm text-muted">USDT on Whitechain Sepolia · no gas needed</p>
      </div>

      {/* Wallet, stamp, balance */}
      <section className="grid gap-3 rounded-xl border border-line bg-surface px-4 py-3 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted">Wallet ending</p>
          <p className="font-mono text-3xl font-bold tracking-wider" data-testid="wallet-last4">
            {wallet ? walletLast4(wallet.address) : "····"}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Real-card stamp</p>
          <p className="text-lg font-semibold" aria-live="polite">
            {stamp.kind === "checking" && <span className="text-muted">Checking…</span>}
            {stamp.kind === "stamped" && <span className="text-ok">Verified ✓</span>}
            {stamp.kind === "not-stamped" && <span>Not verified</span>}
            {stamp.kind === "error" && <span className="text-note">Can&apos;t check right now</span>}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Balance</p>
          <p className="text-lg font-semibold tabular-nums" aria-live="polite">
            {balance ? `${balance.usdt} USDT` : flow.balanceError ? "Can't read it right now" : "…"}
          </p>
          {balance && stamped && (
            <p className="text-xs text-muted">
              {balance.quotaLeft === 1 ? "1 free payment" : `${balance.quotaLeft} free payments`} left today
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-sm sm:col-span-3">
          <button
            type="button"
            className="underline disabled:opacity-50"
            disabled={flow.balanceLoading || !wallet}
            onClick={() => {
              void flow.refreshBalance();
              if (!stamped) void flow.checkStamp();
            }}
          >
            {flow.balanceLoading ? "Refreshing…" : "Refresh"}
          </button>
          {wallet && (
            <a className="underline text-muted" href={explorerAddressUrl(config.chainId, wallet.address)} {...linkProps}>
              See this wallet on the explorer
            </a>
          )}
        </div>
      </section>

      {wallet && !wallet.persistent && (
        <p className="text-sm text-muted">
          This browser isn&apos;t saving data (private browsing?), so this is a new, unverified wallet.
        </p>
      )}

      {/* Not verified: send them to /verify */}
      {stamp.kind === "not-stamped" && (
        <section className="rounded-xl bg-note-bg px-4 py-3 text-note">
          <p className="font-semibold">Verify this wallet first</p>
          <p className="mt-1 text-sm">
            Free payments are for wallets with a real-card stamp. It takes one tap of your bank card on an Android phone.
          </p>
          <Link
            href={verifyHref}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-accent-text hover:opacity-90"
          >
            Verify with a card tap
          </Link>
        </section>
      )}

      {stamp.kind === "error" && (
        <section role="alert" className="rounded-xl bg-note-bg px-4 py-3 text-note">
          <p className="font-semibold">Can&apos;t check your stamp right now.</p>
          <p className="mt-1 text-sm">The relayer or the chain isn&apos;t answering. Nothing has been sent.</p>
          <button type="button" className="mt-2 text-sm font-semibold underline" onClick={() => void flow.checkStamp()}>
            Check again
          </button>
        </section>
      )}

      {/* Demo money from the business */}
      {stamped && (balanceUnits === 0n || fund.kind !== "idle") && pay.kind !== "paid" && (
        <section className="rounded-xl border border-line bg-surface px-4 py-3">
          {fund.kind === "sent" ? (
            <p className="text-sm">
              <span className="font-semibold text-ok">The shop sent you demo USDT ✓</span>{" "}
              <a className="underline" href={explorerTxUrl(config.chainId, fund.txHash)} {...linkProps}>
                See the transfer
              </a>
              {balanceUnits === 0n && <span className="text-muted"> · it can take a few seconds to show.</span>}
            </p>
          ) : (
            <>
              <p className="font-semibold">You don&apos;t have any USDT yet</p>
              <p className="mt-1 text-sm text-muted">
                For this demo, the shop gives each verified wallet a little test USDT to try a payment.
              </p>
              <button
                type="button"
                onClick={() => void flow.getDemoUsdt()}
                disabled={fund.kind === "sending"}
                className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-accent px-4 font-semibold text-accent-text hover:opacity-90 disabled:opacity-50"
              >
                {fund.kind === "sending" ? "Asking the shop…" : "Get demo USDT (from the business)"}
              </button>
              {fund.kind === "error" && (
                <ErrorBox code={fund.code} payMaxUsdt={payConfig.payMaxUsdt} txUrl={fund.txHash && explorerTxUrl(config.chainId, fund.txHash)} />
              )}
            </>
          )}
        </section>
      )}

      {/* Paid */}
      {pay.kind === "paid" && (
        <section aria-live="polite" className="space-y-2 rounded-xl bg-ok-bg px-4 py-4 text-ok">
          <p className="text-3xl font-bold">Paid ✓</p>
          <p>
            {pay.receipt.amountUsdt} USDT to{" "}
            <span className="font-mono">
              {payConfig.demoShop && pay.receipt.to === payConfig.demoShop ? "the demo shop" : shortAddress(pay.receipt.to)}
            </span>
          </p>
          <p className="font-semibold">
            Gas paid by the relayer, not you
            {pay.receipt.from && (
              <span className="font-normal">
                {" "}
                (sent by <span className="font-mono">{shortAddress(pay.receipt.from)}</span>)
              </span>
            )}
            .
          </p>
          <p className="text-sm">
            <a className="font-semibold underline" href={explorerTxUrl(config.chainId, pay.receipt.txHash)} {...linkProps}>
              See the payment on the Whitechain explorer
            </a>
          </p>
          <button type="button" className="text-sm underline" onClick={flow.resetPayment}>
            Make another payment
          </button>
        </section>
      )}

      {/* The payment form */}
      {stamped && pay.kind !== "paid" && (
        <form onSubmit={onPay} noValidate className="flex flex-col gap-3 rounded-xl border border-line bg-surface px-4 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Amount (USDT)</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
              aria-invalid={touched && !amountCheck.ok}
              className="min-h-11 rounded-lg border border-line bg-bg px-3 text-lg tabular-nums"
            />
            <span className="text-xs text-muted">Up to {payConfig.payMaxUsdt} USDT per payment.</span>
            {(touched || amount !== DEFAULT_PAY_AMOUNT_USDT) && !amountCheck.ok && (
              <span className="text-sm text-error">{amountCheck.message}</span>
            )}
          </label>

          {payConfig.demoShop ? (
            <div>
              <p className="text-sm font-semibold">To</p>
              <p>
                Demo shop{" "}
                <a
                  className="font-mono text-sm text-muted underline"
                  href={explorerAddressUrl(config.chainId, payConfig.demoShop)}
                  {...linkProps}
                >
                  {shortAddress(payConfig.demoShop)}
                </a>
              </p>
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold">To (the shop&apos;s wallet address)</span>
              <input
                autoComplete="off"
                spellCheck={false}
                placeholder="0x…"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={busy}
                aria-invalid={touched && !recipientCheck?.ok}
                className="min-h-11 rounded-lg border border-line bg-bg px-3 font-mono text-sm"
              />
              {(touched || recipient !== "") && recipientCheck && !recipientCheck.ok && (
                <span className="text-sm text-error">{recipientCheck.message}</span>
              )}
            </label>
          )}

          <button
            type="submit"
            disabled={!canPay}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-6 text-lg font-semibold text-accent-text hover:opacity-90 disabled:opacity-50"
          >
            {pay.kind === "signing"
              ? own
                ? `Confirm in ${active.name}…`
                : "Approving…"
              : pay.kind === "sending"
                ? "Paying…"
                : "Pay"}
          </button>
          <p className="text-xs text-muted">
            {own
              ? "You'll sign a payment permission. No gas, nothing is sent until you confirm. The relayer sends it and pays the gas."
              : "You approve the payment in this browser. The relayer sends it and pays the gas."}
          </p>
          {own && amountCheck.ok && recipientCheck?.ok && (
            <p className="text-xs text-muted" data-testid="wallet-popup-hint">
              {walletPopupHint({ value: amountCheck.value, to: recipientCheck.address, validitySeconds: PAY_VALIDITY_SECONDS })}
            </p>
          )}
          {own && walletChainId !== null && walletChainId !== USDT_CHAIN_ID && (
            <p className="text-xs text-muted">
              {active.name} is on another network. It will ask to switch to Whitechain Sepolia (and add it if needed).
            </p>
          )}
          {balance && stamped && balance.quotaLeft === 0 && (
            <p className="text-sm text-note">No free payments left today for this wallet, so the relayer may refuse.</p>
          )}
          {pay.kind === "wallet-error" && (
            <div role="alert" className="mt-2 rounded-lg bg-note-bg px-3 py-2 text-note">
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
        </form>
      )}

      {payConfig.problems.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted">
          {payConfig.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <p className="text-sm text-muted">
        {own
          ? "Testnet USDT only. Your wallet never needs gas: you only sign, the relayer pays."
          : "Testnet USDT only. Your wallet never needs gas, seed phrases or a network switch."}
      </p>
    </div>
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
    <div role="alert" className="mt-2 rounded-lg bg-note-bg px-3 py-2 text-note">
      <p className="font-semibold">{copy.title}</p>
      <p className="text-sm">{copy.next}</p>
      {code === "NOT_STAMPED" && verifyHref && (
        <Link href={verifyHref} className="text-sm font-semibold underline">
          Verify with a card tap
        </Link>
      )}
      {txUrl && (
        <a href={txUrl} className="block text-sm font-semibold underline" {...linkProps}>
          See the transaction on the Whitechain explorer
        </a>
      )}
    </div>
  );
}
