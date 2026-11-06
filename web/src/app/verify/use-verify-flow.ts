"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { SESSION_TTL_SECONDS } from "@watermark/sdk";
import type { WebConfig } from "@/lib/config.ts";
import { createSession, getStatus, RelayerError, type RelayerErrorCode, type SessionResponse } from "@/lib/relayer.ts";
import {
  FIRST_STATUS_WAIT_MS,
  localSessionDeadline,
  sessionRefreshDelay,
  sessionRetryDelay,
  statusPollDelay,
} from "@/lib/timing.ts";

export interface WalletInfo {
  address: Address;
  persistent: boolean;
}

export interface SessionError {
  code: RelayerErrorCode;
  /** ms timestamp of the automatic retry, or null when only the button retries */
  retryAt: number | null;
}

/** A session plus when it arrived. Timing uses this device's clock from arrival, so a wrong clock can't loop. */
export type HeldSession = SessionResponse & {
  receivedAtMs: number;
  /** When the QR stops being shown, on this device's clock. */
  deadlineMs: number;
  /** This device's clock disagrees with the relayer's by more than a minute. */
  clockSkewed: boolean;
};

export interface Stamp {
  expiresAt: number;
}

/** A /status read failed. The QR keeps working; the next poll is at retryAt (ms, this device's clock). */
export interface StatusNote {
  code: RelayerErrorCode;
  retryAt: number;
}

/**
 * The /verify flow: chosen wallet (burner or the person's own) → POST /session → QR → poll GET /status → Verified.
 *
 * - One POST /session per mount, expiry or explicit retry. React StrictMode runs effects twice in dev, so the
 *   first request is guarded by a ref that survives the simulated remount.
 * - /status is polled one request at a time (3 s, backing off to 10 s on errors), paused while the tab is hidden,
 *   stopped once stamped or unmounted. Status errors never hide the QR.
 * - "Verified" only ever comes from a /status answer with stamped: true.
 */
export function useVerifyFlow(config: WebConfig, wallet: WalletInfo) {
  const { relayerUrl, appId, chainId } = config;

  const [session, setSession] = useState<HeldSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<SessionError | null>(null);
  const [stamp, setStamp] = useState<Stamp | null>(null);
  const [statusNote, setStatusNote] = useState<StatusNote | null>(null);
  const [firstCheckDone, setFirstCheckDone] = useState(false);

  const alive = useRef(false);
  const started = useRef(false);
  const inFlight = useRef(false);
  const stamped = useRef(false);
  const attempts = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refreshPending = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(retryTimer.current);
    };
  }, []);

  // 1. The wallet comes from the page's WalletGate (burner or the person's own wallet). The session only binds its
  //    address: no signature is needed from the wallet here.

  // 2. POST /session. Never runs twice at once, never after unmount, never once stamped.
  const requestSessionRef = useRef<() => Promise<void>>(async () => {});
  const requestSession = useCallback(async () => {
    if (!wallet || inFlight.current || stamped.current || !alive.current) return;
    inFlight.current = true;
    clearTimeout(retryTimer.current);
    setSessionLoading(true);
    try {
      const res = await createSession(relayerUrl, { wallet: wallet.address, appId, chainId });
      if (!alive.current) return;
      attempts.current = 0;
      const receivedAtMs = Date.now();
      setSession({ ...res, receivedAtMs, ...localSessionDeadline(res.session.expiresAt, receivedAtMs, SESSION_TTL_SECONDS) });
      setSessionError(null);
    } catch (e) {
      if (!alive.current) return;
      const code: RelayerErrorCode = e instanceof RelayerError ? e.code : "BAD_RESPONSE";
      const delay = sessionRetryDelay(code, attempts.current);
      attempts.current += 1;
      setSessionError({ code, retryAt: delay === null ? null : Date.now() + delay });
      if (delay !== null) retryTimer.current = setTimeout(() => void requestSessionRef.current(), delay);
    } finally {
      inFlight.current = false;
      if (alive.current) setSessionLoading(false);
    }
  }, [wallet, relayerUrl, appId, chainId]);
  useEffect(() => {
    requestSessionRef.current = requestSession;
  }, [requestSession]);

  // Give the first /status answer a moment: an already-stamped wallet needs no new session.
  useEffect(() => {
    if (!wallet) return;
    const t = setTimeout(() => setFirstCheckDone(true), FIRST_STATUS_WAIT_MS);
    return () => clearTimeout(t);
  }, [wallet]);

  useEffect(() => {
    if (!wallet || !firstCheckDone || stamp || started.current) return;
    started.current = true; // survives StrictMode's simulated remount: exactly one initial POST
    void requestSession();
  }, [wallet, firstCheckDone, stamp, requestSession]);

  // 3. Replace the session well before it expires (paused while the tab is hidden), at most every 30 s.
  useEffect(() => {
    if (!session || stamp) return;
    const t = setTimeout(() => {
      if (document.hidden) refreshPending.current = true;
      else void requestSessionRef.current();
    }, sessionRefreshDelay(session.deadlineMs, session.receivedAtMs, Date.now()));
    return () => clearTimeout(t);
  }, [session, stamp]);

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || !refreshPending.current) return;
      refreshPending.current = false;
      void requestSessionRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // 4. Poll GET /status sequentially until stamped.
  useEffect(() => {
    if (!wallet || stamp) return;
    let stopped = false;
    let paused = false;
    let errors = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const tick = async () => {
      if (stopped) return;
      if (document.hidden) {
        paused = true;
        return;
      }
      controller = new AbortController();
      try {
        const s = await getStatus(relayerUrl, wallet.address, appId, chainId, { signal: controller.signal });
        if (stopped) return;
        errors = 0;
        setStatusNote(null);
        setFirstCheckDone(true);
        if (s.stamped) {
          stamped.current = true;
          clearTimeout(retryTimer.current);
          setStamp({ expiresAt: s.expiresAt });
          return; // stop polling
        }
      } catch (e) {
        if (stopped) return;
        errors += 1;
        setStatusNote({ code: e instanceof RelayerError ? e.code : "HTTP_ERROR", retryAt: Date.now() + statusPollDelay(errors) });
        setFirstCheckDone(true);
      }
      if (!stopped) timer = setTimeout(() => void tick(), statusPollDelay(errors));
    };

    const onVisibility = () => {
      if (!document.hidden && paused && !stopped) {
        paused = false;
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [wallet, stamp, relayerUrl, appId, chainId]);

  /** "New QR code" button and manual retry. Disabled while a rate-limit wait is running. */
  const retryBlockedUntil = sessionError?.code === "RATE_LIMIT" ? sessionError.retryAt : null;
  const newQr = useCallback(() => {
    if (retryBlockedUntil && Date.now() < retryBlockedUntil) return;
    void requestSession();
  }, [requestSession, retryBlockedUntil]);

  return { wallet, session, sessionLoading, sessionError, stamp, statusNote, newQr, retryBlockedUntil };
}
