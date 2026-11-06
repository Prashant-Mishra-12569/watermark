/**
 * The words and tables for /docs (the business docs page). Pure data: no React, no fs, so docs.test.ts checks it under
 * `node --test` against the MCP server, the relayer's settings and web/public/watermark.txt.
 *
 * Every fact here comes from the repo: watermark.txt, mcp/README.md, contracts/src/WatermarkRegistry.sol and
 * WatermarkSponsor.sol, contracts/script/DeploySponsor.s.sol, relayer/src/config.ts and sdk/src. Change those first.
 */

import { LIVE_APP } from "../../lib/site.ts";

export const TOC = [
  { id: "stops", label: "What it stops" },
  { id: "how", label: "How it works" },
  { id: "mcp", label: "AI agents (MCP)" },
  { id: "add", label: "Add it to your app" },
  { id: "customize", label: "Customize it" },
  { id: "pricing", label: "Pricing" },
  { id: "limits", label: "Limits and privacy" },
  { id: "help", label: "Get help" },
] as const;

export const HERO = {
  title: "Watermark for *businesses*.",
  sub: "Stop bot wallets from farming your airdrop, mint or rewards. Only wallets backed by a real bank card can claim. No KYC files to store. Your users pay no fees.",
} as const;

/** "What it stops". */
export const STOPS = [
  { title: "One person, 1,000 wallets", body: "Every extra wallet needs another real bank card. One card gets one claim in your app." },
  { title: "Airdrop farms and sybil scripts", body: "Scripts can make wallets for free. They can't make bank cards." },
  {
    title: "Bots draining your free stuff",
    body: "Free mints, faucets, referral and quest rewards, and gas you sponsor: only stamped wallets get them.",
  },
  { title: "Fake signups for perks", body: "A new account with a fresh wallet gets nothing until a real card stands behind it." },
] as const;

/** "What it does NOT do": honest limits, from watermark.txt sections 1 and 12. */
export const NOT_DOES = [
  "It isn't KYC or identity. We never learn who the user is.",
  "One card is not one person. Two cards can make two stamps.",
  "A borrowed card works too. A contactless tap has no PIN.",
  "RuPay cards (India) only today. Visa and Mastercard are planned, not live.",
] as const;

/** "How it works" in four steps. */
export const HOW_STEPS = [
  {
    title: "The user taps their card, once",
    body: "They open your verify link, scan a QR code with our Android app (Watermark Tap) and tap a bank card on the phone. No payment is made.",
  },
  {
    title: "A private proof",
    body: "Our prover turns the tap into a zero-knowledge proof: a genuine card on your card list signed this session. The card number is never stored and never goes on-chain.",
  },
  {
    title: "A stamp on Whitechain",
    body: "WatermarkRegistry checks the proof and stamps the wallet for your app, for up to 3 months. The user pays no gas.",
  },
  {
    title: "Your app checks the stamp",
    body: "One on-chain read, isStamped(wallet, appId), before you pay out. No API key, no account with us.",
  },
] as const;

/** The 12 MCP tools (names without the watermark_ prefix): what each does and a question a business can ask. */
export const MCP_TOOL_ROWS = [
  { tool: "check_wallet", does: "Is this wallet stamped for this app, and until when?", ask: "Is 0x… stamped for our app?" },
  {
    tool: "check_wallets",
    does: "The same check for up to 200 wallets, in one call.",
    ask: "Which of these 200 wallets are stamped?",
  },
  {
    tool: "stamp_history",
    does: "An app's stamps: total, unique wallets, how many are live, the latest ones with explorer links.",
    ask: "How many wallets has our app stamped, and which are live?",
  },
  {
    tool: "app_info",
    does: "An app's on-chain owner, card list root and session signer, plus an audit against the published list.",
    ask: "Does this app id enforce the card list it publishes?",
  },
  { tool: "get_policy", does: "The card list (policy) an app id uses.", ask: "What card list does this app id use?" },
  {
    tool: "explain_policy",
    does: "Plain words: who passes, what a stamp reveals, what it doesn't prove.",
    ask: "Explain this app's card list in plain words.",
  },
  { tool: "list_apps", does: "The registry address and the deployed apps with their labels.", ask: "Which Watermark apps exist?" },
  {
    tool: "supported_cards",
    does: "Which cards can be proven today. RuPay debit is live; Visa and Mastercard are planned.",
    ask: "Which cards can my users use today?",
  },
  {
    tool: "draft_policy",
    does: "Turns BIN prefixes from a public BIN list and rules into a card list, its root and warnings. Signs nothing.",
    ask: "Draft a card list for my airdrop: RuPay debit, no prepaid.",
  },
  {
    tool: "prepare_register_app",
    does: "An unsigned transaction that registers your own app and card list, plus the app id it will get.",
    ask: "Prepare the transaction to register our app.",
  },
  {
    tool: "create_verify_link",
    does: "The link that sends a user to the verify page for an app.",
    ask: "Give me the verify link for my users.",
  },
  {
    tool: "integration_snippet",
    does: "Solidity or TypeScript code with the real registry address filled in.",
    ask: "Give me the Solidity gate for our claim contract.",
  },
] as const;

/** Section 13 step 2b of watermark.txt, verbatim: the server-side check before a payout. */
export const BACKEND_CHECK = `import { check, type CheckOptions } from "@watermark/sdk";

const REGISTRY = "0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6";
const APP_ID = "393344891601835728760966937624776276735512086066329273346256164761263100630";

export async function assertStamped(wallet: string, opts: CheckOptions = {}): Promise<void> {
  const { stamped } = await check(wallet, APP_ID, { registry: REGISTRY, ...opts });
  if (!stamped) throw new Error(\`NOT_STAMPED: verify at https://usewatermark.xyz/verify?app=\${APP_ID}\`);
}`;

/** The live app's verify link (what watermark_create_verify_link and the SDK's verifyLink return). */
export const LIVE_VERIFY_LINK = `https://usewatermark.xyz/verify?app=${LIVE_APP.appId}`;

/** "live" = running now, "yours" = you set it, "planned" = not live. */
export type Today = "live" | "yours" | "planned";

export interface CustomizeRow {
  setting: string;
  options: string;
  how: string;
  /** One or more chips, each with a short note. */
  today: readonly { kind: Today; note?: string }[];
}

/** "Customize it": what a business can change, how, and what runs today. */
export const CUSTOMIZE_ROWS: readonly CustomizeRow[] = [
  {
    setting: "Stamp length",
    options: "1, 2 or 3 months",
    how: "A stamp lasts until the end of a month 1 to 3 months ahead. The registry enforces that range on-chain. Your app's session signer picks the month when it signs each session; a renewal only ever extends a stamp.",
    today: [{ kind: "live", note: "3 months (our app)" }, { kind: "yours", note: "own app" }],
  },
  {
    setting: "Tapped recently (last hour, 24 hours, 7 days)",
    options: "Any window you like",
    how: "Your backend reads when the wallet was last stamped: the SDK's stampHistory (or the registry's Stamped event) gives each stamp's block; read that block's time and decide. A contract can't read past events, so do this off-chain.",
    today: [{ kind: "yours" }],
  },
  {
    setting: "Longer than 3 months",
    options: "6 or 12 months",
    how: "Not possible today: the 3-month cap is in the registry, so it needs a registry upgrade.",
    today: [{ kind: "planned" }],
  },
  {
    setting: "Claims per wallet per day",
    options: "1, 5, 20 or any number",
    how: "Airdrops and mints: your own contract counts claims (the Drop example keeps one claim per wallet). Sponsored payments: each sponsor contract has its own daily quota per wallet, fixed when it is deployed (QUOTA_PER_DAY).",
    today: [{ kind: "yours" }, { kind: "live", note: "20 a day (our sponsor)" }],
  },
  {
    setting: "Which cards count",
    options: "Your own card list of BIN prefixes (6 or 8 digits, up to 8,192): leave out prepaid, or only some banks' listed ranges",
    how: "Draft it with watermark_draft_policy (SDK draftPolicy), then register it as your own app with watermark_prepare_register_app (SDK prepareRegisterApp) and send that transaction from your wallet. A list can't change after you register it: a new list means a new app id. Your own app runs its own session signer.",
    today: [{ kind: "live", note: "4,208 RuPay bank-debit ranges, no prepaid" }, { kind: "yours", note: "own app" }],
  },
  {
    setting: "One card, one wallet per app",
    options: "Always on",
    how: "The registry ties each card to one wallet per app with a one-way card id. For a new campaign where the same cards may join again, use a new app id.",
    today: [{ kind: "live" }],
  },
  {
    setting: "Who pays network fees",
    options: "You do, so your users pay $0",
    how: "Stamps: the relayer pays the gas. Payments: deploy your own WatermarkSponsor (DeploySponsor.s.sol with APP_ID, RELAYER_ADDRESS, QUOTA_PER_DAY) and run the relayer with SPONSOR_ADDRESS. Caps per payment and per day: PAY_MAX_USDT, MAX_GAS_PER_PAY, DAILY_BUDGET_WEI.",
    today: [{ kind: "live", note: "our sponsor" }, { kind: "yours", note: "own sponsor" }],
  },
  {
    setting: "Rate limits and budgets",
    options: "Requests per minute, gas caps, daily budgets",
    how: "Environment settings on the relayer (it is in the repo). The full list with defaults is below.",
    today: [{ kind: "yours" }],
  },
  {
    setting: "Card networks",
    options: "RuPay, Visa, Mastercard",
    how: "RuPay debit cards can be proven today. Visa and Mastercard card lists can be drafted, but no card can be proven yet: each needs its own circuit.",
    today: [{ kind: "live", note: "RuPay" }, { kind: "planned", note: "Visa, Mastercard" }],
  },
  {
    setting: "Chains",
    options: "Whitechain Sepolia, other EVM chains",
    how: "Contracts on Whitechain Sepolia check the stamp directly. On any other chain, check from your backend before you pay out. Running the registry on another chain means deploying it there, and our relayer only serves Whitechain Sepolia and the alt mempool devnet today.",
    today: [{ kind: "live", note: "Whitechain Sepolia" }, { kind: "yours", note: "backend check" }],
  },
];

/** Relayer environment settings (relayer/src/config.ts), with their defaults. */
export const RELAYER_SETTINGS = [
  { name: "SESSIONS_PER_MINUTE_PER_IP", what: "New verify sessions per IP per minute", def: "10" },
  { name: "MAX_OPEN_SESSIONS", what: "Open sessions at once", def: "5,000" },
  { name: "STAMPS_PER_MINUTE_PER_IP", what: "Stamp requests per IP per minute", def: "30" },
  { name: "STAMP_MAX_QUEUE", what: "Stamps waiting per chain before BUSY", def: "20" },
  { name: "MAX_GAS_PER_STAMP", what: "Gas cap for one stamp", def: "3,500,000" },
  { name: "STAMP_BUDGET_WEI", what: "Gas budget for stamps per UTC day", def: "0.1 WBT" },
  { name: "PAYS_PER_MINUTE_PER_IP", what: "Payment requests per IP per minute", def: "10" },
  { name: "MAX_GAS_PER_PAY", what: "Gas cap for one payment", def: "300,000" },
  { name: "DAILY_BUDGET_WEI", what: "Gas budget for payments per UTC day", def: "0.1 WBT" },
  { name: "PAY_MAX_USDT", what: "Largest payment the relayer sponsors", def: "5 USDT" },
  { name: "PAY_MAX_REVERTS_PER_WALLET", what: "Failed payments per wallet per UTC day", def: "2" },
  { name: "PAY_PAUSED", what: "Stop every sponsored payment at once", def: "false" },
  { name: "CORS_ORIGINS", what: "Websites allowed to call the relayer", def: "http://localhost:3000" },
] as const;

/** "Limits and privacy", short (watermark.txt sections 11 and 12). */
export const LIMITS = [
  "Test networks only. A real launch needs PCI and legal review and bank and network terms.",
  "Our prover sees the card data briefly, in memory, to make the proof, then wipes it. You trust that wipe; proving on the phone is the real fix.",
  "We store nothing from the card: no KYC files, no documents, no card numbers. On-chain: the wallet, the app id, a one-way card id and the expiry month.",
  "No early revoke: a stamp runs to its expiry. A lost wallet can't move its stamp.",
  "Your code never needs card data: only a wallet address and a yes or no.",
] as const;

export const X_URL = "https://x.com/usewatermark";
