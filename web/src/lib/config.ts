/**
 * Website configuration from NEXT_PUBLIC_* values (inlined at build or dev start) and the page's query string.
 * Pure logic: no React, no process.env access here, so it runs under `node --test` as is.
 */

import { isTapHttpUrl } from "./tap-link.ts";

export const DEFAULT_RELAYER_URL = "http://localhost:8788";
export const DEFAULT_CHAIN_ID = "1874";
export const DEV_APP_ID_HINT = "12345";

export type ChainIdString = "1874" | "1337";

const UINT248_LIMIT = 1n << 248n;

/**
 * appId as a canonical decimal string (no leading zeros), or null if it isn't a 248-bit unsigned decimal.
 * Never goes through Number(): real appIds are about 75 digits.
 */
export function parseAppId(raw: string | null | undefined): string | null {
  const s = raw?.trim() ?? "";
  if (!/^\d{1,75}$/.test(s)) return null;
  const n = BigInt(s);
  return n < UINT248_LIMIT ? n.toString() : null;
}

/** "1874" (default when empty) or "1337"; anything else is null. */
export function parseChainId(raw: string | null | undefined): ChainIdString | null {
  const s = raw?.trim() || DEFAULT_CHAIN_ID;
  return s === "1874" || s === "1337" ? s : null;
}

/** An http(s) URL with a host, without a trailing slash, or null. */
export function parseHttpUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim() ?? "";
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname) return null;
  return s.replace(/\/+$/, "");
}

/**
 * NEXT_PUBLIC_RELAYER_LAN_URL goes into the short QR's `p`, which Watermark Tap parses with java.net.URI. Returns the
 * normalized URL (lowercase scheme and host, no trailing slash) when the app would accept it, otherwise null:
 * "HTTP://…" is normalized, but "http://my_mac:8788" (no host for java.net.URI), a query, a fragment or user info
 * are refused.
 */
export function parseTapHttpUrl(raw: string | null | undefined): string | null {
  const s = raw?.trim() ?? "";
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password || u.search || u.hash) return null;
  const normalized = `${u.protocol}//${u.host}${u.pathname}`.replace(/\/+$/, "");
  return isTapHttpUrl(normalized) ? normalized : null;
}

export interface WebConfig {
  relayerUrl: string;
  /** Only set when the short-link QR may be offered (the Tap app doesn't support it yet). */
  relayerLanUrl: string | null;
  appId: string;
  chainId: ChainIdString;
}

export interface EnvInput {
  relayerUrl?: string | undefined;
  relayerLanUrl?: string | undefined;
  appId?: string | undefined;
  chainId?: string | undefined;
}

export interface QueryInput {
  /** ?app=<appId> overrides NEXT_PUBLIC_APP_ID (kept stable for the SDK's verifyLink). */
  app?: string | null;
  /** ?chain=1337 is the hidden switch for the EF devnet tap. */
  chain?: string | null;
}

export type ConfigResult = { ok: true; config: WebConfig } | { ok: false; problems: string[] };

export function readWebConfig(env: EnvInput, query: QueryInput = {}): ConfigResult {
  const problems: string[] = [];

  const relayerRaw = env.relayerUrl?.trim() || DEFAULT_RELAYER_URL;
  const relayerUrl = parseHttpUrl(relayerRaw);
  if (!relayerUrl) problems.push(`NEXT_PUBLIC_RELAYER_URL is not an http(s) URL: "${relayerRaw}".`);

  let relayerLanUrl: string | null = null;
  if (env.relayerLanUrl?.trim()) {
    relayerLanUrl = parseTapHttpUrl(env.relayerLanUrl);
    if (!relayerLanUrl)
      problems.push("NEXT_PUBLIC_RELAYER_LAN_URL is set but Watermark Tap can't read it. Use http://<mac-lan-ip>:8788.");
  }

  let appId: string | null;
  if (query.app != null && query.app !== "") {
    appId = parseAppId(query.app);
    if (!appId) problems.push("The ?app= value in the address is not a valid app ID (a decimal number below 2^248).");
  } else if (!env.appId?.trim()) {
    appId = null;
    problems.push(
      `NEXT_PUBLIC_APP_ID is not set. Add it to the repo-root .env (the dev value is ${DEV_APP_ID_HINT}) and restart the web server.`,
    );
  } else {
    appId = parseAppId(env.appId);
    if (!appId) problems.push("NEXT_PUBLIC_APP_ID is not a valid app ID (a decimal number below 2^248).");
  }

  const fromQuery = query.chain != null && query.chain !== "";
  const chainId = parseChainId(fromQuery ? query.chain : env.chainId);
  if (!chainId) {
    // Never echo the query string: a crafted link could put any wording on this page. The env value is the operator's.
    const what = fromQuery ? "The ?chain= value in the address" : `NEXT_PUBLIC_CHAIN_ID "${env.chainId ?? ""}"`;
    problems.push(`${what} isn't supported. Use 1874 (Whitechain Sepolia) or 1337 (devnet).`);
  }

  if (problems.length > 0 || !relayerUrl || !appId || !chainId) return { ok: false, problems };
  return { ok: true, config: { relayerUrl, relayerLanUrl, appId, chainId } };
}

// ---- Page setup for /verify and /pay (SITE_SPEC.md section 3) ----

/** The query string a flow page reads. Never echoed onto the page. */
export interface PageQuery {
  app?: string | null;
  chain?: string | null;
  /** "pass": the Genesis Pass walk (step 1 on /verify, step 2 on /pay). */
  next?: string | null;
}

export interface PageSetup {
  config: ConfigResult;
  /** True only for ?next=pass while the pass is live: flow header, fixed app, fixed payment, step buttons. */
  passFlow: boolean;
}

/** ?next=pass counts only while the Genesis Pass is live (PASS_LIVE); otherwise the page is the normal one. */
export function isPassFlow(next: string | null | undefined, passLive: boolean): boolean {
  return passLive && next === "pass";
}

/**
 * /verify. In the Genesis Pass walk, ?app= and ?chain= are ignored: the stamp must be for the live app on Whitechain
 * Sepolia, the only one the pass and free payments accept. Otherwise ?app= and ?chain= work as before.
 */
export function readVerifySetup(env: EnvInput, query: PageQuery, site: { liveAppId: string; passLive: boolean }): PageSetup {
  const passFlow = isPassFlow(query.next, site.passLive);
  const config = passFlow
    ? readWebConfig(env, { app: site.liveAppId, chain: DEFAULT_CHAIN_ID })
    : readWebConfig(env, { app: query.app ?? null, chain: query.chain ?? null });
  return { config, passFlow };
}

/**
 * /pay. The stamp it reads is always the Sponsor's app: NEXT_PUBLIC_APP_ID, the current live app. ?app= and ?chain=
 * are ignored, because the relayer and the Sponsor contract refuse every other app's stamp. In the Genesis Pass walk
 * the live app is forced, so step 2 uses the same browser wallet as step 1 (/verify?next=pass).
 */
export function readPaySetup(env: EnvInput, query: PageQuery, site: { liveAppId: string; passLive: boolean }): PageSetup {
  const passFlow = isPassFlow(query.next, site.passLive);
  const config = readWebConfig({ ...env, relayerLanUrl: undefined }, passFlow ? { app: site.liveAppId } : {});
  return { config, passFlow };
}

/**
 * A setup problem for /pay's list when, on Whitechain, the page's app isn't the one the Sponsor contract is bound to
 * (`sponsorAppId` in deployments/whitechain.json). Every free payment would then be refused NOT_STAMPED.
 */
export function sponsorAppProblem(config: WebConfig, sponsorAppId: string): string | null {
  if (config.chainId !== "1874" || config.appId === sponsorAppId) return null;
  return "NEXT_PUBLIC_APP_ID is not sponsorAppId in deployments/whitechain.json, so the relayer will refuse free payments for this page's stamps.";
}

/**
 * Apps whose stamp /pay reads only to explain a refusal ("its stamp is for another app"): for example the ?app= the
 * visitor came with, the test app and the first live app. Never the Sponsor's own app, no duplicates, no invalid ids.
 */
export function otherAppIds(payAppId: string, candidates: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of candidates) {
    const id = parseAppId(raw);
    if (id && id !== payAppId && !out.includes(id)) out.push(id);
  }
  return out;
}
