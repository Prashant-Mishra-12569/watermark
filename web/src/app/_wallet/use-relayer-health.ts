"use client";

import { useEffect, useState } from "react";
import { getHealth, type RelayerHealth } from "./relayer-health";

const HEALTH_RETRY_MS = 5_000;
const HEALTH_TRIES = 3;

/**
 * The relayer's addresses from GET /health, read once `enabled` turns true (a few tries, then it gives up quietly).
 * null until then, and for good if the relayer never answers: receipts then show no relayer address.
 */
export function useRelayerHealth(relayerUrl: string, enabled = true): RelayerHealth | null {
  const [health, setHealth] = useState<RelayerHealth | null>(null);
  const done = health !== null;

  useEffect(() => {
    if (!enabled || done) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const run = async () => {
      const h = await getHealth(relayerUrl, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (h) setHealth(h);
      else if (++tries < HEALTH_TRIES) timer = setTimeout(() => void run(), HEALTH_RETRY_MS);
    };
    void run();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [relayerUrl, enabled, done]);

  return health;
}
