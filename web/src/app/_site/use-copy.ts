"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CopyState = "idle" | "copied" | "manual";

/** Select an element's text so the person can press ⌘C / Ctrl+C themselves. */
export function selectContents(el: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * "Copy" → "Copied ✓" for 2 s. If the clipboard fails (insecure origin such as http://192.168.x.x, permission
 * denied), select the text instead and show "Press ⌘C / Ctrl+C." until the next attempt.
 */
export function useCopy(resetMs = 2000) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (text: string, el: HTMLElement | null) => {
      if (timer.current) clearTimeout(timer.current);
      try {
        if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
        await navigator.clipboard.writeText(text);
        setState("copied");
        timer.current = setTimeout(() => setState("idle"), resetMs);
      } catch {
        if (el) selectContents(el);
        setState("manual");
      }
    },
    [resetMs],
  );

  return { state, copy };
}
