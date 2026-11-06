/**
 * The builders page's wallet checker logic ("Is this wallet stamped?", section "Try to farm it."): what was typed,
 * what the relayer said, and the line the page shows for it. Pure (no React, no fetch), so checker.test.ts runs it
 * under `node --test`.
 */
import { isAddress } from "viem";
// Relative, not "@/lib/…": node --test doesn't know the tsconfig alias.
import { RelayerError, type StatusResponse } from "../../lib/relayer.ts";

export type CheckerApp = "live" | "test";

export type CheckerView =
  | { kind: "empty" }
  | { kind: "invalid"; why: "format" | "checksum" }
  | { kind: "loading" }
  | { kind: "stamped"; until: string }
  | { kind: "not-stamped" }
  | { kind: "error"; why: "unreachable" | "refused" };

export type Tone = "muted" | "ok" | "note" | "error";

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * The wallet to check, or why not. A mixed-case address must carry a valid EIP-55 checksum (the relayer refuses it
 * otherwise); all-lowercase and all-uppercase hex are fine.
 */
export function readWallet(raw: string): { ok: true; wallet: `0x${string}` } | { ok: false; view: CheckerView } {
  const s = raw.trim();
  if (s === "") return { ok: false, view: { kind: "empty" } };
  if (!HEX_ADDRESS.test(s)) return { ok: false, view: { kind: "invalid", why: "format" } };
  if (!isAddress(s, { strict: true })) return { ok: false, view: { kind: "invalid", why: "checksum" } };
  return { ok: true, wallet: s as `0x${string}` };
}

/** "31 January 2027" in UTC, the date format /verify uses for a stamp. Empty for 0 or nonsense. */
export function formatUntil(expiresAt: number): string {
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(expiresAt * 1000),
  );
}

/** GET /status's answer. Only a literal stamped:true from the chain read counts (lib/relayer.ts parses it). */
export function viewFromStatus(status: StatusResponse): CheckerView {
  return status.stamped ? { kind: "stamped", until: formatUntil(status.expiresAt) } : { kind: "not-stamped" };
}

/**
 * No answer at all (relayer down, wrong URL, CORS, timeout) is "unreachable". Any answer that isn't a status
 * (502 chain read failed, 4xx, a malformed body) is "refused". Either way nothing was checked.
 */
export function viewFromError(e: unknown): CheckerView {
  if (e instanceof RelayerError && e.status > 0) return { kind: "error", why: "refused" };
  return { kind: "error", why: "unreachable" };
}

/** The input's placeholder (DESIGN_V2.md's checker copy). */
export const WALLET_PLACEHOLDER = "Paste a wallet address (0x…)";

/** The copy for each state (DESIGN_V2.md's checker copy; the rest in the same voice) and its tone. */
export function describe(view: CheckerView): { text: string; tone: Tone } {
  switch (view.kind) {
    case "empty":
      return { text: "Read-only. Nothing is signed or sent.", tone: "muted" };
    case "invalid":
      return view.why === "format"
        ? { text: "That isn't a wallet address. It needs 0x and 40 hex characters.", tone: "error" }
        : { text: "That address has a typo. Its checksum doesn't match.", tone: "error" };
    case "loading":
      return { text: "Checking Whitechain…", tone: "muted" };
    case "stamped":
      return {
        text: view.until ? `Stamped until ${view.until}. Your app would let it in.` : "Stamped. Your app would let it in.",
        tone: "ok",
      };
    case "not-stamped":
      return { text: "No stamp. Your app would keep it out.", tone: "note" };
    case "error":
      return view.why === "unreachable"
        ? { text: "Couldn't reach our server. Nothing was checked.", tone: "error" }
        : { text: "Our server answered with an error. Nothing was checked.", tone: "error" };
  }
}
