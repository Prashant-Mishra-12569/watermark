/**
 * Every line of the builders home page (SITE_FINAL.md "Page 1"), in one pure module so builders.test.ts can check
 * the words against SITE_FINAL and the numbers against the published files. No React, no fs.
 *
 * Numbers are never typed here: the card count, the daily limit and the stamp length come from the live app's
 * published policy (lib/policy-summary.ts reads policies/live.json at build time) and the bot count from /attack's
 * own settings. With no policy, a line drops its number instead of guessing one.
 */

// ------------------------------------------------------------------ 1. Hero

export const HERO = {
  eyebrow: "For airdrops, mints and rewards",
  title: "Stop bots from farming your *airdrop*.",
  sub: "Watermark lets only wallets backed by a real bank card claim. Add it with one line. No KYC. Your users pay no fees.",
  add: { label: "Add Watermark", href: "#add" },
  /** SITE_FINAL's "Try the live drop" only while the drop is open (PASS_LIVE); until then it doesn't say "live". */
  drop: { label: "Try the live drop", soonLabel: "Try the drop", href: "/pass" },
} as const;

/** The hero's second pill: never promises a live drop that hasn't opened. */
export function heroDropLabel(passLive: boolean): string {
  return passLive ? HERO.drop.label : HERO.drop.soonLabel;
}

// ------------------------------------------------------------------ 2. How it works

export type StepIcon = "code" | "tap" | "shield";

export interface HowStep {
  title: string;
  body: string;
  icon: StepIcon;
}

export const HOW_TITLE = "Three steps. *Zero* bots.";

export const HOW_STEPS: readonly HowStep[] = [
  { title: "You add one check", body: "In your contract, your backend or your AI agent.", icon: "code" },
  {
    title: "Users tap their card once",
    body: "On our phone app. A private proof checks the card is real. No card number is stored.",
    icon: "tap",
  },
  { title: "Only stamped wallets claim", body: "Bots get refused before they touch your tokens.", icon: "shield" },
];

// ------------------------------------------------------------------ 3. Add it

export const ADD_TITLE = "Add it in *one line*.";
export const ADD_LEAD = "Check a stamp from Solidity, TypeScript or your AI agent. No API key.";

/** Each block's words. The code itself is docs/INTEGRATE.md's and mcp/README.md's, verbatim (snippets.ts, mcp-data.ts). */
export const ADD_BLOCKS = {
  solidity: {
    title: "Solidity",
    body: "Any contract can check a stamp in one call. A wallet with no live stamp gets refused.",
    label: "Solidity · onlyStamped",
    /** The one line: the modifier on your own function (How step 1 shows the same). */
    useLabel: "Your contract: the one line",
    pasteOnce: "Paste once, from docs/INTEGRATE.md",
  },
  sdk: {
    title: "TypeScript SDK",
    body: "Check one wallet, or up to 200 in one call. It reads the chain directly, with no API key and no server of ours.",
    note: "The SDK lives in the repo (sdk/). It isn't on npm yet.",
    label: "TypeScript · @watermark/sdk",
  },
  mcp: {
    title: "AI agents (MCP)",
    body: "Your agent checks a wallet before paying a reward or giving access, audits an app, or drafts a card list. It holds no keys and never takes card data.",
    label: "MCP client config (JSON)",
  },
} as const;

export const LIVE_TITLE = "Live on Whitechain Sepolia";

// ------------------------------------------------------------------ 4. Try to break it

export const TEST_TITLE = "Try to *farm* it.";

/** The body line, with /attack's real bot count. */
export function botTestLead(count: number): string {
  return `Press the button. We make ${count} bot wallets and send them at our own drop. Every one gets refused. These are real requests.`;
}

export const TEST_CTA = { label: "Run the bot test", href: "/attack" } as const;

// ------------------------------------------------------------------ 5. You stay in control

export const CONTROL_TITLE = "You decide who *counts*.";
export const CONTROL_LEAD =
  "Use our live card list, or register your own app with your own. Every list is public, and fixed for its app.";

/** The parts of lib/policy-summary.ts's PolicySummary this section needs. */
export interface ControlPolicy {
  label: string;
  prefixCount: number;
  prepaid: number;
  networks: readonly string[];
  types: readonly string[];
  categories: readonly { category: string; count: number }[];
  quotaPerDay: number | null;
  stampMonths: number | null;
}

export type ControlIcon = "card" | "coin" | "stamp" | "lock";

export interface ControlFact {
  key: "cards" | "fees" | "stamps" | "store";
  icon: ControlIcon;
  title: string;
  line: string;
  /** Big figures under the line (the fees card): from the published policy, never typed. */
  stats?: { value: string; label: string }[];
}

const grouped = (n: number) => n.toLocaleString("en-US");

/** "4,208 RuPay bank debit ranges from India" for the live list; plain words for anything else. */
function rangesLine(p: ControlPolicy): string {
  const rupayOnly = p.networks.length === 1 && p.networks[0] === "RUPAY";
  const debitOnly = p.types.length === 1 && p.types[0] === "debit";
  const kind = rupayOnly && debitOnly ? "RuPay bank debit" : "card";
  const where = /\bIndia\b/.test(p.label) ? " from India" : "";
  return `${grouped(p.prefixCount)} ${kind} ranges${where}.`;
}

export function controlFacts(p: ControlPolicy | null): ControlFact[] {
  const months = p?.stampMonths ?? null;
  return [
    {
      key: "cards",
      icon: "card",
      title: "Which cards count",
      line: p
        ? `${rangesLine(p)}${p.prepaid === 0 ? " No prepaid cards, because anyone can buy many." : ""}`
        : "Choose the card ranges you accept.",
    },
    {
      key: "fees",
      icon: "coin",
      title: "Sponsor your users' fees",
      line: p?.quotaPerDay ? `They pay $0, up to ${p.quotaPerDay} payments a day each.` : "They pay $0.",
      stats: [
        { value: "$0", label: "Fees your users pay" },
        ...(p?.quotaPerDay ? [{ value: String(p.quotaPerDay), label: "Free payments per wallet, per day" }] : []),
      ],
    },
    {
      key: "stamps",
      icon: "stamp",
      title: months ? `Stamps last up to ${months} ${months === 1 ? "month" : "months"}` : "Stamps expire",
      line: "One card, one wallet per app.",
    },
    { key: "store", icon: "lock", title: "Nothing sensitive to store", line: "No KYC files, no card numbers." },
  ];
}

/** Display names for the list's category labels. */
const CATEGORY_NAME: Record<string, string> = {
  CLASSIC: "Classic",
  PLATINUM: "Platinum",
  // India's Jan Dhan accounts: the scheme's name is unexplained jargon outside India.
  PMJDY: "PMJDY (Jan Dhan)",
  "RUPAY SELECT": "RuPay Select",
  STANDARD: "Standard",
};

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** The accepted card types, most ranges first. Leaves without a category, and prepaid ones, are left out. */
export function acceptedCategories(p: ControlPolicy | null): string[] {
  if (!p) return [];
  return p.categories
    .filter((c) => c.category !== "none" && c.count > 0 && !/prepaid/i.test(c.category))
    .map((c) => CATEGORY_NAME[c.category.toUpperCase()] ?? titleCase(c.category));
}

export const COMING_SOON = { title: "Visa and Mastercard", status: "Coming soon" } as const;
export const DOWNLOAD_LIST = "Download the card list";
export const OWN_LIST = "Use your own card list";

// ------------------------------------------------------------------ 6. Proof

export const PROOF_TITLE = "See it *yourself*.";
export const PROOF_LEAD = "Every step leaves a public record. Tap any one to check it.";

// ------------------------------------------------------------------ 7. Privacy and limits

export const PRIVACY_TITLE = "Privacy and *limits*.";
/** The small label over it: not a repeat of the headline. */
export const PRIVACY_EYEBROW = "The fine print";

/**
 * What we see, store and put on-chain (docs/PRIVACY.md: the prover sees card data briefly, in memory, then wipes it).
 * Never claim the data stays on the phone.
 */
export const PRIVACY_ROWS: readonly { label: string; text: string }[] = [
  { label: "Briefly, in memory", text: "Your card data, to make the proof, then wiped." },
  { label: "Stored", text: "Nothing from your card." },
  { label: "On-chain", text: "A proof, a one-way card ID, your wallet and an expiry month." },
];

export const PRIVACY_TRUST = "You have to trust us on the wipe. Proving on the phone is the real fix. It's on our roadmap.";

/** "Good to know" (docs/INTEGRATE.md "Limits" and "Which cards work today"). */
export const GOOD_TO_KNOW: readonly string[] = [
  // "Visa and Mastercard: coming soon" is said once, in "You stay in control".
  "Only RuPay bank debit cards from India work today.",
  "Everything runs on test networks: Whitechain Sepolia and an Ethereum test network.",
  "One card gets one stamp per app. A stamp is not KYC: three cards, three stamps.",
  "A tap has no PIN, so a stamp shows a wallet is backed by a real bank card, not who holds it.",
];
