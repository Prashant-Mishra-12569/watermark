"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FlowStep } from "@/lib/site.ts";

/*
 * A tiny store for the step of the Genesis Drop a page is on: /pass reports it with useFlowStep(n). Since SITE_FINAL.md
 * the drop page shows the site nav (its own checklist carries the steps), so the header no longer reads it; the
 * drop's step pages (/verify?next=pass and /pay?next=pass) get "Genesis Drop · Step n of 3" from the URL. Kept so
 * callers compile and the step stays available.
 */

let current: FlowStep | null = null;
const listeners = new Set<() => void>();

function publish(step: FlowStep | null): void {
  if (step === current) return;
  current = step;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Call from a client component on /pass: useFlowStep(stamped ? (paid ? 3 : 2) : 1). Cleared on unmount. */
export function useFlowStep(step: FlowStep | null): void {
  useEffect(() => {
    publish(step);
    return () => publish(null);
  }, [step]);
}

/** The step the current page reported, or null. Used by the header. */
export function useReportedFlowStep(): FlowStep | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
