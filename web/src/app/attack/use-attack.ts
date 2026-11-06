"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COOLDOWN_MS,
  HEALTH_RETRY_MS,
  relayerReachable,
  runAttack,
  summarize,
  type AttackConfig,
  type AttackSummary,
  type BotView,
} from "./bots.ts";

export type AttackPhase = "idle" | "running" | "done";

type Health = { kind: "unknown" } | { kind: "ok" } | { kind: "down"; retryAt: number };

export interface AttackView {
  phase: AttackPhase;
  bots: readonly BotView[];
  /** Set once a run has finished. */
  summary: AttackSummary | null;
  /** Seconds until the next run is allowed, 0 when it is. */
  cooldownSeconds: number;
  /** Seconds until the next /health retry while the relayer can't be reached (0: retrying now), null when fine. */
  relayerRetrySeconds: number | null;
  launch: () => void;
}

/**
 * Drives one bot run at a time and keeps a minute between runs that reached the relayer (its limits are per IP per
 * minute, and the stage's own payment shares them). Reads GET /health on load, and again after a run that couldn't reach the relayer,
 * so the page can say "Can't reach our server. Retrying in {n}s." Keys never enter React state: only addresses.
 */
export function useAttack(config: AttackConfig | null): AttackView {
  const [phase, setPhase] = useState<AttackPhase>("idle");
  const [bots, setBots] = useState<readonly BotView[]>([]);
  const [summary, setSummary] = useState<AttackSummary | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [health, setHealth] = useState<Health>({ kind: "unknown" });
  /** Bumped to (re)read /health. */
  const [healthCheck, setHealthCheck] = useState(0);
  const [now, setNow] = useState(0);
  const running = useRef(false);
  const runAbort = useRef<AbortController | null>(null);

  // Leaving the page abandons the run: no more updates, no more requests.
  useEffect(
    () => () => {
      runAbort.current?.abort();
    },
    [],
  );

  // GET /health. Any answer means reachable; only a network failure shows the retry line.
  useEffect(() => {
    if (!config) return;
    const ac = new AbortController();
    void relayerReachable(config.relayerUrl, { signal: ac.signal }).then((ok) => {
      if (ac.signal.aborted) return;
      const t = Date.now();
      setNow(t);
      setHealth(ok ? { kind: "ok" } : { kind: "down", retryAt: t + HEALTH_RETRY_MS });
    });
    return () => ac.abort();
  }, [config, healthCheck]);

  // A 1 s tick only while something counts down.
  const down = health.kind === "down";
  const retryDue = down && now >= health.retryAt;
  const ticking = (down && !retryDue) || cooldownUntil > now;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [ticking]);

  // Retry /health when its countdown reaches 0. The line stays up until an answer arrives.
  useEffect(() => {
    if (retryDue) setHealthCheck((n) => n + 1);
  }, [retryDue]);

  const launch = useCallback(() => {
    if (!config || running.current || Date.now() < cooldownUntil) return;
    running.current = true;
    const ac = new AbortController();
    runAbort.current = ac;
    setBots([]);
    setSummary(null);
    setPhase("running");

    void runAttack({
      config,
      signal: ac.signal,
      onUpdate: (b) => {
        if (!ac.signal.aborted) setBots(b);
      },
    })
      .catch(() => null)
      .then((result) => {
        running.current = false;
        if (ac.signal.aborted) return;
        const final = result ?? [];
        const s = summarize(final);
        const t = Date.now();
        setBots(final);
        setSummary(s);
        setPhase("done");
        setNow(t);
        // Only a run the relayer answered used its per-minute budget.
        if (s.answered > 0) setCooldownUntil(t + COOLDOWN_MS);
        // Any answer proves the relayer is up; a network failure re-reads /health to start the retry line.
        if (s.network > 0) setHealthCheck((n) => n + 1);
        else if (s.answered > 0) setHealth({ kind: "ok" });
      });
  }, [config, cooldownUntil]);

  return {
    phase,
    bots,
    summary,
    cooldownSeconds: cooldownUntil > now ? Math.ceil((cooldownUntil - now) / 1_000) : 0,
    relayerRetrySeconds: down ? Math.max(0, Math.ceil((health.retryAt - now) / 1_000)) : null,
    launch,
  };
}
