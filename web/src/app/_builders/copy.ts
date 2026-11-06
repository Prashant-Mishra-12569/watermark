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
  eyebrow: "Bot protection for any onchain app",
  title: "Keep *bots* out of your app.",
  sub: "Your users tap their bank card on their phone once, and their wallet gets a stamp. Bots can make endless wallets, but they can't make bank cards, so they never get in. No KYC, and no gas fees for your users.",
  add: { label: "Add it to my app", href: "#add" },
  /** SITE_FINAL's "Try the live drop" only while the drop is open (PASS_LIVE); until then it doesn't say "live". */
  drop: { label: "Try our drop", soonLabel: "Try our drop", href: "/pass" },
} as const;

/** The hero's second pill: never promises a live drop that hasn't opened. */
export function heroDropLabel(passLive: boolean): string {
  return passLive ? HERO.drop.label : HERO.drop.soonLabel;
}

// ------------------------------------------------------------------ 1b. Where it works

export const USES_TITLE = "Anywhere bots cost you *money*.";
export const USES_LEAD = "A bot can make a thousand wallets in a minute, but it can't make a thousand bank cards. That one fact protects all of these.";

export const USES: readonly { title: string; body: string; icon: "ticket" | "coin" | "wallet" | "check" | "building" | "agent" }[] = [
  { title: "Airdrops and mints", body: "Each real card gets one claim, so someone with 1,000 wallets gets nothing extra.", icon: "ticket" },
  { title: "Gas you sponsor", body: "You only pay gas for stamped wallets, so bots can't burn through your budget.", icon: "coin" },
  { title: "Faucets", body: "Free test tokens go to people with real cards, not to scripts.", icon: "wallet" },
  { title: "Rewards and referrals", body: "Points, quests and referral bonuses go to real users instead of bot farms.", icon: "check" },
  { title: "Votes and grants", body: "Every voter needs a real card, so faking a crowd gets expensive fast.", icon: "building" },
  { title: "AI agents", body: "Your AI agent can check a wallet before it sends money or gives access.", icon: "agent" },
];

/** The one function behind every use above (the registry's view, docs/INTEGRATE.md). */
export const USES_CHECK = "isStamped(wallet, appId)";

// ------------------------------------------------------------------ 2. How it works

export type StepIcon = "code" | "tap" | "shield";

export interface HowStep {
  title: string;
  body: string;
  icon: StepIcon;
}

export const HOW_TITLE = "How it *works*.";

export const HOW_STEPS: readonly HowStep[] = [
  { title: "You add one line", body: "Put one check in your contract, your server or your AI agent.", icon: "code" },
  {
    title: "Users tap their card",
    body: "They tap their bank card on our Android app once, and a private proof checks that it's real.",
    icon: "tap",
  },
  { title: "Bots get refused", body: "No real card means no stamp, and no stamp means no way in.", icon: "shield" },
];

// ------------------------------------------------------------------ 3. Add it

export const ADD_TITLE = "Add it in *one line*.";
export const ADD_LEAD = "Use Solidity, TypeScript or your AI agent. There's no API key and nothing to sign up for.";

/** Each block's words. The code itself is docs/INTEGRATE.md's and mcp/README.md's, verbatim (snippets.ts, mcp-data.ts). */
export const ADD_BLOCKS = {
  solidity: {
    title: "Solidity",
    body: "Add one modifier to your contract, and wallets without a stamp get turned away.",
    label: "Solidity · onlyStamped",
    /** The one line: the modifier on your own function (How step 1 shows the same). */
    useLabel: "Your contract: the one line",
    pasteOnce: "Paste once, from docs/INTEGRATE.md",
  },
  sdk: {
    title: "TypeScript SDK",
    body: "Check one wallet or 200 at once. It reads straight from the chain.",
    note: "The SDK lives in the repo (sdk/). It isn't on npm yet.",
    label: "TypeScript · @watermark/sdk",
  },
  mcp: {
    title: "AI agents (MCP)",
    body: "Your agent can check wallets before it pays anyone. It holds no keys and never sees card data.",
    label: "MCP client config (JSON)",
  },
} as const;

export const LIVE_TITLE = "Live on Whitechain Sepolia";

// ------------------------------------------------------------------ 4. Try to break it

export const TEST_TITLE = "Try to *farm* it.";

/** The body line, with /attack's real bot count. */
export function botTestLead(count: number): string {
  return `Press the button and we'll send ${count} bot wallets at our own drop. You'll watch every one of them get turned away, and these are real requests.`;
}

export const TEST_CTA = { label: "Run the bot test", href: "/attack" } as const;

// ------------------------------------------------------------------ 5. You stay in control

export const CONTROL_TITLE = "You decide who *counts*.";
export const CONTROL_LEAD = "You can use our card list or bring your own. Either way, the list is public.";

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
    { key: "store", icon: "lock", title: "Nothing to store", line: "You never hold KYC files or card numbers." },
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
export const PROOF_LEAD = "Everything below happened on a public chain. Tap any card to check it yourself.";

// ------------------------------------------------------------------ 7. Privacy and limits

export const PRIVACY_TITLE = "The honest *part*.";
/** The small label over it: not a repeat of the headline. */
export const PRIVACY_EYEBROW = "Privacy and limits";

/**
 * What we see, store and put on-chain (docs/PRIVACY.md: the prover sees card data briefly, in memory, then wipes it).
 * Never claim the data stays on the phone.
 */
export const PRIVACY_ROWS: readonly { label: string; text: string }[] = [
  { label: "What we see", text: "Your card data, just long enough to make the proof. Then we wipe it." },
  { label: "What we keep", text: "Nothing from your card." },
  { label: "What goes on-chain", text: "A proof, a one-way card ID, your wallet and an end date." },
];

export const PRIVACY_TRUST = "For now, you have to trust us to wipe it. Making the proof on the phone itself fixes that, and it's next on our list.";

/** "Good to know" (docs/INTEGRATE.md "Limits" and "Which cards work today"). */
export const GOOD_TO_KNOW: readonly string[] = [
  // "Visa and Mastercard: coming soon" is said once, in "You stay in control".
  "Right now, only RuPay debit cards from India work.",
  "Everything runs on test networks for now.",
  "One card works for one wallet per app, and it can't be reset.",
  "A stamp isn't KYC. Someone with two cards can get two stamps.",
  "There's no PIN, so a stamp shows someone had a real card, not who they are.",
];

