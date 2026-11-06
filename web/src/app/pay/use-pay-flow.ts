"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import type { WebConfig } from "@/lib/config.ts";
import { buildIntent, randomNonce } from "@/lib/pay.ts";
import {
  getBalance,
  getStatus,
  postFund,
  postPay,
  RelayerError,
  type BalanceResponse,
  type RelayerErrorCode,
} from "@/lib/relayer.ts";
import { parseUsdt } from "@/lib/usdt.ts";
import { WalletError, type WalletErrorCode } from "@/lib/wallet.ts";
import type { ActiveWallet } from "../_wallet/use-wallet";

export interface PayWallet {
  address: Address;
  persistent: boolean;
}

export type StampState =
  | { kind: "checking" }
  | { kind: "stamped"; expiresAt: number }
  | { kind: "not-stamped" }
  | { kind: "error"; code: RelayerErrorCode };

export type FundState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; txHash: Hex }
  | { kind: "error"; code: RelayerErrorCode; txHash: Hex | null };

export interface PaidReceipt {
  txHash: Hex;
  /** The transaction's sender, from the relayer's answer (null when it didn't say). */
  from: Address | null;
  to: Address;
  amountUsdt: string;
}

export type PayState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "sending" }
  | { kind: "paid"; receipt: PaidReceipt }
  | { kind: "error"; code: RelayerErrorCode; txHash: Hex | null }
  /** The person's own wallet didn't sign (cancelled, wrong chain, account changed...). Nothing was sent. */
  | { kind: "wallet-error"; code: WalletErrorCode };

/** After a top-up, read the balance a few times until the transfer shows (the relayer may answer before indexing). */
const FUND_POLL_MS = 3_000;
const FUND_POLL_TRIES = 10;

const codeOf = (e: unknown): RelayerErrorCode => (e instanceof RelayerError ? e.code : "BAD_RESPONSE");
/** A transaction the relayer did send even though the request failed (still pending, or reverted). */
const txHashOf = (e: unknown): Hex | null => (e instanceof RelayerError ? e.txHash : null);

/**
 * The /pay flow: the wallet chosen in the WalletGate (the /verify burner, or the person's own wallet) → GET /status (stamped?) → GET /balance → optional POST /fund →
 * sign EIP-3009 (burner: in the background; own wallet: the wallet asks) → POST /pay. The browser never sends a
 * transaction and never holds gas.
 */
export function usePayFlow(
  config: WebConfig,
  active: ActiveWallet,
  /** Called when the own wallet's account changed or went missing at Pay time (re-reads it; see WalletControls.resync). */
  onWalletStale: () => void = () => {},
) {
  const { relayerUrl, appId, chainId } = config;

  const alive = useRef(true);
  const payInFlight = useRef(false);
  const fundInFlight = useRef(false);

  // The flow is keyed on the address, so `active` never changes under a mounted flow.
  const wallet: PayWallet = active;
  const [stamp, setStamp] = useState<StampState>({ kind: "checking" });
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [balanceError, setBalanceError] = useState<RelayerErrorCode | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [fund, setFund] = useState<FundState>({ kind: "idle" });
  const [pay, setPay] = useState<PayState>({ kind: "idle" });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const checkStamp = useCallback(async () => {
    if (!wallet) return;
    setStamp({ kind: "checking" });
    try {
      const s = await getStatus(relayerUrl, wallet.address, appId, chainId);
      if (!alive.current) return;
      setStamp(s.stamped ? { kind: "stamped", expiresAt: s.expiresAt } : { kind: "not-stamped" });
    } catch (e) {
      if (alive.current) setStamp({ kind: "error", code: codeOf(e) });
    }
  }, [wallet, relayerUrl, appId, chainId]);

  const refreshBalance = useCallback(async (): Promise<BalanceResponse | null> => {
    if (!wallet) return null;
    setBalanceLoading(true);
    try {
      const b = await getBalance(relayerUrl, wallet.address);
      if (!alive.current) return null;
      setBalance(b);
      setBalanceError(null);
      return b;
    } catch (e) {
      if (alive.current) setBalanceError(codeOf(e));
      return null;
    } finally {
      if (alive.current) setBalanceLoading(false);
    }
  }, [wallet, relayerUrl]);

  // 2. Read the stamp and the balance once the wallet is known.
  useEffect(() => {
    if (!wallet) return;
    void checkStamp();
    void refreshBalance();
  }, [wallet, checkStamp, refreshBalance]);

  // 3. "Get demo USDT": the business sends a stamped wallet a little USDT (it pays its own gas).
  const getDemoUsdt = useCallback(async () => {
    if (!wallet || fundInFlight.current) return;
    fundInFlight.current = true;
    setFund({ kind: "sending" });
    try {
      const res = await postFund(relayerUrl, wallet.address);
      if (!alive.current) return;
      setFund({ kind: "sent", txHash: res.txHash });
      for (let i = 0; i < FUND_POLL_TRIES && alive.current; i++) {
        const b = await refreshBalance();
        if (b && (parseUsdt(b.usdt) ?? 0n) > 0n) break;
        await new Promise((r) => setTimeout(r, FUND_POLL_MS));
      }
    } catch (e) {
      if (!alive.current) return;
      setFund({ kind: "error", code: codeOf(e), txHash: txHashOf(e) });
      void refreshBalance();
    } finally {
      fundInFlight.current = false;
    }
  }, [wallet, relayerUrl, refreshBalance]);

  // 4. Pay: sign the EIP-3009 authorization (no gas: burner locally, own wallet in its popup), hand it to the relayer.
  const submitPayment = useCallback(
    async (to: Address, value: bigint, amountUsdt: string) => {
      if (payInFlight.current) return;
      payInFlight.current = true;
      setPay({ kind: "signing" });
      try {
        const intent = buildIntent({ from: active.address, to, value, nowMs: Date.now(), nonce: randomNonce() });
        let body;
        try {
          // isCurrent: once this flow is unmounted (another account), the wallet never opens a signature popup for it.
          body = await active.signPayment(intent, { isCurrent: () => alive.current });
        } catch (e) {
          // Not signed, so nothing can have been sent.
          if (!alive.current) return;
          const code: WalletErrorCode = e instanceof WalletError ? e.code : "FAILED";
          setPay({ kind: "wallet-error", code });
          // The wallet shows another account, or none: follow it, so "the page now uses your wallet's account" is true.
          if (code === "ACCOUNT_CHANGED" || code === "NO_ACCOUNT") onWalletStale();
          return;
        }
        // Unmounted (e.g. the account changed while the wallet popup was open): never send it.
        if (!alive.current) return;
        setPay({ kind: "sending" });
        const res = await postPay(relayerUrl, body);
        if (!alive.current) return;
        setPay({ kind: "paid", receipt: { txHash: res.txHash, from: res.from, to, amountUsdt } });
      } catch (e) {
        if (alive.current) setPay({ kind: "error", code: codeOf(e), txHash: txHashOf(e) });
      } finally {
        payInFlight.current = false;
        // The balance and quota changed (or, after an unclear error, may have): read them again.
        if (alive.current) void refreshBalance();
      }
    },
    [active, relayerUrl, refreshBalance, onWalletStale],
  );

  const resetPayment = useCallback(() => setPay({ kind: "idle" }), []);

  return {
    wallet,
    stamp,
    balance,
    balanceError,
    balanceLoading,
    fund,
    pay,
    checkStamp,
    refreshBalance,
    getDemoUsdt,
    submitPayment,
    resetPayment,
  };
}
