"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { claimPass, getPass, passErrorCopy, type PassStatus } from "@/lib/genesis-pass.ts";
import { getHealth, RelayerError, type RelayerErrorCode } from "@/lib/relayer.ts";

export type ClaimState =
  | { kind: "idle" }
  | { kind: "claiming" }
  /** Minted by this page just now: the tx and who sent it are known. */
  | { kind: "claimed"; txHash: Hex; tokenId: string; from: Address | null }
  | { kind: "error"; code: RelayerErrorCode; txHash: Hex | null };

/** Re-read the status this often while the page is visible and the pass isn't claimed yet (spec: every 10 s). */
export const POLL_MS = 10_000;
/** After a claim, read until the token (and its artwork) shows up. */
const AFTER_CLAIM_POLL_MS = 3_000;
const AFTER_CLAIM_TRIES = 10;

const codeOf = (e: unknown): RelayerErrorCode => (e instanceof RelayerError ? e.code : "BAD_RESPONSE");

/** The relayer can't be reached at all (as opposed to an answer we didn't like). */
export const isUnreachable = (code: RelayerErrorCode | null): boolean => code === "NETWORK" || code === "TIMEOUT";

/**
 * The /pass flow for one wallet address → GET /pass/:wallet (both tasks, claim, supply) → POST /pass. The wallet comes
 * from the shared <WalletGate> (the burner or the person's own browser wallet, the same one /verify and /pay use). The
 * browser never sends a transaction, signs nothing and needs no gas: the relayer mints the pass to this address.
 * The page keys PassFlow on the address, so another account starts over with fresh state.
 */
export function usePassFlow(relayerUrl: string, address: Address) {
  const alive = useRef(true);
  const claimInFlight = useRef(false);

  const [status, setStatus] = useState<PassStatus | null>(null);
  const [statusError, setStatusError] = useState<RelayerErrorCode | null>(null);
  const [claim, setClaim] = useState<ClaimState>({ kind: "idle" });
  /** When the last status read started (for "Retrying in {n}s"). */
  const [lastReadAt, setLastReadAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  /** The relayer's address from GET /health, for the receipt when this page didn't send the mint itself. */
  const [healthRelayer, setHealthRelayer] = useState<Address | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<PassStatus | null> => {
    setLastReadAt(Date.now());
    try {
      const s = await getPass(relayerUrl, address);
      if (!alive.current) return null;
      setStatus(s);
      setStatusError(null);
      return s;
    } catch (e) {
      if (alive.current) setStatusError(codeOf(e));
      return null;
    }
  }, [address, relayerUrl]);

  // 1. Read on load, when the tab comes back (after /verify or /pay), and every 10 s until the pass is claimed.
  const claimed = status?.claimed ?? false;
  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = claimed
      ? null
      : setInterval(() => {
          if (document.visibilityState === "visible" && !claimInFlight.current) void refresh();
        }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
    };
  }, [refresh, claimed]);

  // 2. While the relayer can't be reached, tick once a second for "Retrying in {n}s".
  const unreachable = isUnreachable(statusError);
  useEffect(() => {
    if (!unreachable) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [unreachable]);
  const retryInSeconds = Math.max(1, Math.ceil((lastReadAt + POLL_MS - now) / 1000));

  // 3. Claimed earlier (not by this page): ask GET /health who the relayer is, for the receipt's "RELAYER …a9Ba".
  const needsRelayer = claimed && claim.kind !== "claimed";
  useEffect(() => {
    if (!needsRelayer) return;
    let cancelled = false;
    getHealth(relayerUrl)
      .then((h) => {
        if (!cancelled) setHealthRelayer(h.relayer);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [needsRelayer, relayerUrl]);

  // 4. Claim: the relayer checks both tasks again, mints and pays the gas. The browser signs nothing.
  const claimNow = useCallback(async () => {
    if (claimInFlight.current) return;
    claimInFlight.current = true;
    setClaim({ kind: "claiming" });
    try {
      const res = await claimPass(relayerUrl, address);
      if (!alive.current) return;
      setClaim({ kind: "claimed", txHash: res.txHash, tokenId: res.tokenId, from: res.from });
      for (let i = 0; i < AFTER_CLAIM_TRIES && alive.current; i++) {
        const s = await refresh();
        if (s?.claimed && s.image) break;
        await new Promise((r) => setTimeout(r, AFTER_CLAIM_POLL_MS));
      }
    } catch (e) {
      if (!alive.current) return;
      const code = codeOf(e);
      setClaim({ kind: "error", code, txHash: e instanceof RelayerError ? e.txHash : null });
      // An unclear answer (or "already claimed"): read the truth from the chain before offering a retry.
      if (passErrorCopy(code).maybeSent || code === "ALREADY_CLAIMED") void refresh();
    } finally {
      claimInFlight.current = false;
    }
  }, [address, relayerUrl, refresh]);

  const relayer = claim.kind === "claimed" ? (claim.from ?? healthRelayer) : healthRelayer;
  return { status, statusError, claim, refresh, claimNow, retryInSeconds, relayer };
}
