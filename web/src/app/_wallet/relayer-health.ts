/**
 * GET /health: the relayer's public addresses, for the receipts on /verify and /pay. /status returns no tx hash, so the
 * stamp receipt links the relayer's address instead (SITE_SPEC.md section 4). Pure apart from fetch, which tests inject.
 * Never throws: a missing or odd answer only means the receipt shows no address.
 */
import type { Address } from "viem";

export interface RelayerHealth {
  /** The wallet that sends stamps and payments and pays their gas; null when the relayer runs without a key. */
  relayer: Address | null;
  /** The Sponsor contract POST /pay goes through; null when payments aren't configured. */
  sponsor: Address | null;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const HEALTH_TIMEOUT_MS = 8_000;

function address(v: unknown): Address | null {
  return typeof v === "string" && ADDRESS.test(v) && BigInt(v) !== 0n ? (v as Address) : null;
}

/** {ok:true, relayer, sponsor, ...} → the two addresses, or null for anything that isn't a healthy answer. */
export function parseHealthResponse(body: unknown): RelayerHealth | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.ok !== true) return null;
  return { relayer: address(b.relayer), sponsor: address(b.sponsor) };
}

export async function getHealth(
  relayerUrl: string,
  opts: { fetch?: typeof fetch; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<RelayerHealth | null> {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? HEALTH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts.signal?.aborted) controller.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await doFetch(`${relayerUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!res.ok) return null;
    return parseHealthResponse(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}
