/**
 * Site-wide facts every page shares: the PASS_LIVE switch, the drop's step links, and the addresses, appIds
 * and roots. Addresses, appIds and roots are imported from deployments/*.json, never typed in here. The only values
 * that live nowhere else (the relayer and business wallets) come from SITE_SPEC.md's FACTS OVERRIDE.
 *
 * Pure data and helpers: safe in server and client components, and it runs under `node --test` as is. Only the
 * literal process.env.NEXT_PUBLIC_GENESIS_PASS_ADDRESS read below depends on the build (Next inlines it).
 */

import whitechain from "../../../deployments/whitechain.json" with { type: "json" };
import devnet from "../../../deployments/devnet.json" with { type: "json" };

export type Address = `0x${string}`;
export type Hex = `0x${string}`;
export type FlowStep = 1 | 2 | 3;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const TX_RE = /^0x[0-9a-fA-F]{64}$/;
const APP_ID_RE = /^\d{1,75}$/;

export function isAddress(v: unknown): v is Address {
  return typeof v === "string" && ADDRESS_RE.test(v);
}

export function isTxHash(v: unknown): v is Hex {
  return typeof v === "string" && TX_RE.test(v);
}

/** Fails the build (and the tests) if a deployment file is missing a value, instead of rendering a dead link. */
function need<T extends string>(v: unknown, name: string, check: (x: unknown) => x is T): T {
  if (!check(v)) throw new Error(`site.ts: ${name} is missing or malformed in deployments/*.json`);
  return v;
}
const isAppId = (v: unknown): v is string => typeof v === "string" && APP_ID_RE.test(v);
const isRoot = isTxHash;

// ------------------------------------------------------------------ links

export const REPO_URL = "https://github.com/Prashant-Mishra-12569/watermark";
/** Same as @watermark/sdk's whitechainSepolia explorer (site.test.ts checks). Kept here so pages don't pull viem. */
export const WHITECHAIN_EXPLORER = "https://explorer.testnet.whitechain.io";
/** Same as @watermark/sdk's altmempoolDevnet explorer (site.test.ts checks). */
export const ALTMEMPOOL_EXPLORER = "https://explorer.altmempool.wtf";
/** The node the alt-mempool explorer reads from: the miner sidecar that admitted our frame tx. */
export const ALTMEMPOOL_NODE = devnet.altMempool.sidecarRpc;

export const txUrl = (hash: string): string => `${WHITECHAIN_EXPLORER}/tx/${hash}`;
export const addressUrl = (address: string): string => `${WHITECHAIN_EXPLORER}/address/${address}`;
export const altmempoolTxUrl = (hash: string): string =>
  `${ALTMEMPOOL_EXPLORER}/tx/${hash}?node=${encodeURIComponent(ALTMEMPOOL_NODE)}`;
/** A file in the public repo, e.g. repoFileUrl("docs/INTEGRATE.md"). */
export const repoFileUrl = (path: string): string => `${REPO_URL}/blob/main/${path.replace(/^\/+/, "")}`;

export const DOCS = {
  integrate: repoFileUrl("docs/INTEGRATE.md"),
  privacy: repoFileUrl("docs/PRIVACY.md"),
  efAltmempool: repoFileUrl("docs/EF_ALTMEMPOOL.md"),
  mcp: repoFileUrl("mcp/README.md"),
} as const;

// ------------------------------------------------------------------ display helpers

/** "0xd7e0…bc07" for a hash or address; anything short is returned as is. Full value belongs in a title. */
export function shortHex(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

/** "…a9Ba": the last 4 characters, case kept (the same 4 Watermark Tap shows for a wallet). */
export function last4(value: string): string {
  return `…${value.slice(-4)}`;
}

/** "2457…106": a long appId shortened the way SITE_SPEC.md writes it. */
export function shortAppId(appId: string): string {
  return appId.length > 10 ? `${appId.slice(0, 4)}…${appId.slice(-3)}` : appId;
}

// ------------------------------------------------------------------ chain, contracts, apps

export const CHAIN_ID = whitechain.chainId; // 1874 Whitechain Sepolia
/** The block the registry was deployed in: a safe fromBlock for event reads. */
export const DEPLOY_BLOCK = whitechain.blockNumber;

/** The relayer wallet: sends stamps and payments and pays their gas. SITE_SPEC.md FACTS; matches tx.from on-chain. */
const RELAYER_ADDRESS: Address = "0xf95E3C36020286117f1c3cd8Efd57Fcfb2e2a9Ba";
/** The business wallet that funds demo USDT. SITE_SPEC.md FACTS. */
const BUSINESS_ADDRESS: Address = "0x30D55f6B9e0dfBc849e97ddbf5807A74CCE46b21";

export const ADDR = {
  registry: need(whitechain.registry, "registry", isAddress),
  /** VerifierRouter (the file calls it `verifier`). */
  router: need(whitechain.verifier, "verifier", isAddress),
  /** The current Sponsor, bound to the current live app. */
  sponsor: need(whitechain.sponsor, "sponsor", isAddress),
  usdt: need(whitechain.usdt, "usdt", isAddress),
  sessionSigner: need(whitechain.sessionSigner, "sessionSigner", isAddress),
  deployer: need(whitechain.deployer, "deployer", isAddress),
  relayer: RELAYER_ADDRESS,
  business: BUSINESS_ADDRESS,
  /** Superseded Sponsor of the previous live app (still on-chain). */
  previousSponsor: need(whitechain.previousLive.sponsor, "previousLive.sponsor", isAddress),
  /** WatermarkQuotaPaymaster on the EF alt-mempool devnet (chain 1337). */
  devnetPaymaster: need(devnet.paymaster, "devnet paymaster", isAddress),
} as const;

/** Deploy txs on Whitechain Sepolia (deployments/whitechain.json txHashes). */
export const DEPLOY_TX = {
  registry: need(whitechain.txHashes.registry, "txHashes.registry", isTxHash),
  router: need(whitechain.txHashes.router, "txHashes.router", isTxHash),
  sponsor: need(whitechain.txHashes.sponsor, "txHashes.sponsor", isTxHash),
  registerLiveApp: need(whitechain.txHashes.registerLiveApp, "txHashes.registerLiveApp", isTxHash),
} as const;

/** The paymaster's deploy tx on the alt-mempool devnet (the explorer's tx page is the link form we know works). */
export const DEVNET_PAYMASTER_TX = need(devnet.txHashes.paymaster, "devnet txHashes.paymaster", isTxHash);

export interface AppInfo {
  appId: string;
  rulesRoot: Hex;
}

/**
 * The live app: RuPay bank debit (India), the one the Sponsor, free payments and the Genesis Pass accept.
 * `liveAppId` must equal `sponsorAppId` (decision 1); site.test.ts checks.
 */
export const LIVE_APP: AppInfo & { label: string; sponsor: Address } = {
  appId: need(whitechain.liveAppId, "liveAppId", isAppId),
  rulesRoot: need(whitechain.liveRulesRoot, "liveRulesRoot", isRoot),
  label: "RuPay (India)",
  sponsor: ADDR.sponsor,
};

/** The appId the Sponsor contract is bound to. */
export const SPONSOR_APP_ID = need(whitechain.sponsorAppId, "sponsorAppId", isAppId);

/** The test app: synthetic test card only (tools/testcard). */
export const TEST_APP: AppInfo = {
  appId: need(whitechain.appId, "appId", isAppId),
  rulesRoot: need(whitechain.rulesRoot, "rulesRoot", isRoot),
};

/**
 * The first live app, superseded by the stricter filter but still on-chain. The first real-card stamp and the first
 * gas-free USDT payment happened under it. Label it "first live app (before the stricter filter)" wherever shown.
 */
export const PREVIOUS_LIVE_APP: AppInfo & { sponsor: Address } = {
  appId: need(whitechain.previousLive.liveAppId, "previousLive.liveAppId", isAppId),
  rulesRoot: need(whitechain.previousLive.liveRulesRoot, "previousLive.liveRulesRoot", isRoot),
  sponsor: ADDR.previousSponsor,
};

export const PREVIOUS_LIVE_LABEL = "first live app (before the stricter filter)";

// ------------------------------------------------------------------ the PASS_LIVE switch

/** A non-zero 0x address, or null. Anything else (unset, typo, zero address) keeps the pass hidden. */
export function parsePassAddress(raw: string | undefined | null): Address | null {
  const s = raw?.trim() ?? "";
  if (!isAddress(s) || /^0x0{40}$/.test(s)) return null;
  return s;
}

/** WatermarkGenesisPass on Whitechain Sepolia, from NEXT_PUBLIC_GENESIS_PASS_ADDRESS (fixed at build or dev start). */
export const PASS_ADDRESS: Address | null = parsePassAddress(process.env.NEXT_PUBLIC_GENESIS_PASS_ADDRESS);

/**
 * On only when NEXT_PUBLIC_GENESIS_PASS_ADDRESS is set to an address. Off: /pass says the drop opens soon, its
 * steps 1 and 2 still work (they need no NFT contract), step 3 says "Opens soon", and nothing links to a contract
 * that isn't there.
 */
export const PASS_LIVE: boolean = PASS_ADDRESS !== null;

// ------------------------------------------------------------------ links, flow

/*
 * The header and footer links live in app/_site/nav.ts (SITE_FINAL.md: two pages, Builders at / and the Genesis
 * Drop at /pass). This file keeps only the drop's step links.
 */

export interface NavItem {
  href: string;
  label: string;
}

/** The Genesis Drop walk: step 1 stamps, step 2 pays, the hub claims (step 3). */
export const PASS_FLOW = {
  hub: "/pass",
  step1: "/verify?next=pass",
  step2: "/pay?next=pass",
} as const;

export type HeaderMode = { mode: "site" } | { mode: "flow"; step?: FlowStep };

/**
 * On the Genesis Drop's walk: ?next=pass, which /pass's step links add (PASS_FLOW). /verify and /pay then show the
 * flow header and the drop's three-step bar. Without it they are the plain pages any company can send its users to
 * (the SDK's verifyLink), with no drop in sight. Independent of PASS_LIVE: the drop page always exists.
 */
export function isDropWalk(next: string | null | undefined): boolean {
  return next === "pass";
}

/**
 * Which header a route gets (SITE_FINAL.md): the drop's steps, ?next=pass on /verify (step 1) and /pay (step 2), get
 * the flow header ("Genesis Drop · Step n of 3" and Exit, back to /pass), whether or not the drop is open yet. Every
 * other route gets the site nav, /pass included (its own checklist carries the steps).
 */
export function headerModeFor(pathname: string, next: string | null): HeaderMode {
  if (!isDropWalk(next)) return { mode: "site" };
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/verify") return { mode: "flow", step: 1 };
  if (path === "/pay") return { mode: "flow", step: 2 };
  return { mode: "site" };
}

/** True when the nav item is the current page (exact, or a sub-path). */
export function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
