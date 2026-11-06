import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { BLOCKSCOUT_VERIFIED, EF_ADMITTED_TX, FIRST_PAYMENT_TX, FIRST_STAMP_TX } from "../../lib/evidence.ts";
import { ADDR, PREVIOUS_LIVE_LABEL, isAddress, isTxHash, txUrl } from "../../lib/site.ts";
import { BOT_COUNT } from "../attack/bots.ts";
import {
  ADD_BLOCKS,
  ADD_TITLE,
  CONTROL_TITLE,
  GOOD_TO_KNOW,
  HERO,
  HOW_STEPS,
  HOW_TITLE,
  PRIVACY_ROWS,
  PRIVACY_TRUST,
  PROOF_TITLE,
  TEST_CTA,
  TEST_TITLE,
  PRIVACY_EYEBROW,
  PRIVACY_TITLE,
  acceptedCategories,
  heroDropLabel,
  botTestLead,
  controlFacts,
  type ControlPolicy,
} from "./copy.ts";
import { MCP_CHIPS, MCP_SERVERS_JSON, MCP_TOOL_GROUPS, MCP_TOOL_PREFIX, MCP_TOOLS } from "./mcp-data.ts";
import { FIRST_LIST_NOTE, PROOF_RECEIPTS, buildProofReceipts, type ProofInput } from "./proof-data.ts";

const repoFile = (path: string) => readFileSync(new URL(`../../../../${path}`, import.meta.url), "utf8");

// ------------------------------------------------------------------ the live list, counted the way policy-summary.ts does

const live = JSON.parse(repoFile("policies/live.json"));
const categories = new Map<string, number>();
let prepaid = 0;
for (const raw of live.leaves as Record<string, unknown>[]) {
  const leaf = { ...live.leafDefaults, ...raw };
  const c = typeof leaf.category === "string" && leaf.category.trim() ? leaf.category.trim() : "none";
  categories.set(c, (categories.get(c) ?? 0) + 1);
  if (/prepaid/i.test(String(leaf.category ?? "")) || /prepaid/i.test(String(leaf.type ?? ""))) prepaid++;
}
const LIVE_POLICY: ControlPolicy = {
  label: live.label,
  prefixCount: live.leaves.length,
  prepaid,
  networks: [String(live.leafDefaults.network).toUpperCase()],
  types: [String(live.leafDefaults.type).toLowerCase()],
  categories: [...categories]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  quotaPerDay: live.quotaPerDay,
  stampMonths: live.stampMonths,
};

// ------------------------------------------------------------------ SITE_FINAL "Page 1", word for word

test("hero: SITE_FINAL eyebrow, H1, sub and both pills", () => {
  assert.equal(HERO.eyebrow, "Anti-bot for airdrops, mints and rewards");
  assert.equal(HERO.title, "Stop bots from farming your *airdrop*.");
  assert.equal(
    HERO.sub,
    "Your users tap a real bank card on their phone. Only those wallets can claim. No KYC. No gas.",
  );
  assert.deepEqual(HERO.add, { label: "Add it to my app", href: "#add" });
  assert.deepEqual(HERO.drop, { label: "Try our drop", soonLabel: "Try our drop", href: "/pass" });
  // "live" only while the drop is open.
  assert.equal(heroDropLabel(true), "Try our drop");
  assert.equal(heroDropLabel(false), "Try our drop");
});

test("how it works: the headline and three steps", () => {
  assert.equal(HOW_TITLE, "How it *works*.");
  assert.deepEqual(
    HOW_STEPS.map((s) => [s.title, s.body, s.icon]),
    [
      ["You add one line", "In your contract, your server or your AI agent.", "code"],
      ["Users tap their card", "Once, on our Android app. A private proof checks the card is real.", "tap"],
      ["Bots get refused", "No real card, no claim. One card claims once.", "shield"],
    ],
  );
});

test("section headlines", () => {
  assert.equal(ADD_TITLE, "Add it in *one line*.");
  assert.equal(TEST_TITLE, "Try to *farm* it.");
  assert.equal(CONTROL_TITLE, "You decide who *counts*.");
  assert.equal(PROOF_TITLE, "See it *yourself*.");
  assert.deepEqual(
    [ADD_BLOCKS.solidity.title, ADD_BLOCKS.sdk.title, ADD_BLOCKS.mcp.title],
    ["Solidity", "TypeScript SDK", "AI agents (MCP)"],
  );
});

test("the bot test line uses /attack's own bot count", () => {
  assert.equal(
    botTestLead(BOT_COUNT),
    `We send ${BOT_COUNT} bot wallets at our own drop. Watch every one get refused. Real requests, live.`,
  );
  assert.equal(BOT_COUNT, 5);
  assert.deepEqual(TEST_CTA, { label: "Run the bot test", href: "/attack" });
});

// ------------------------------------------------------------------ "You decide who counts", from the published list

test("control facts read SITE_FINAL's lines with the live list's own numbers", () => {
  const facts = controlFacts(LIVE_POLICY);
  assert.deepEqual(
    facts.map((f) => [f.title, f.line]),
    [
      ["Which cards count", "4,208 RuPay bank debit ranges from India. No prepaid cards, because anyone can buy many."],
      ["Sponsor your users' fees", "They pay $0, up to 20 payments a day each."],
      ["Stamps last up to 3 months", "One card, one wallet per app."],
      ["Nothing to store", "No KYC files. No card numbers."],
    ],
  );
  assert.equal(LIVE_POLICY.prefixCount, 4208);
  assert.equal(LIVE_POLICY.prepaid, 0);
  // The fees card's figures: $0 and the published daily quota.
  assert.deepEqual(facts.find((f) => f.key === "fees")?.stats, [
    { value: "$0", label: "Fees your users pay" },
    { value: "20", label: "Free payments per wallet, per day" },
  ]);
});

test("privacy: the eyebrow doesn't repeat the headline; Visa and Mastercard are said once, in Control", () => {
  assert.notEqual(PRIVACY_EYEBROW.toLowerCase(), PRIVACY_TITLE.replaceAll("*", "").replace(/\.$/, "").toLowerCase());
  assert.doesNotMatch(GOOD_TO_KNOW.join(" "), /Visa|Mastercard/);
});

test("with no published list, no number is guessed", () => {
  const text = controlFacts(null)
    .map((f) => `${f.title} ${f.line}`)
    .join(" ");
  // "$0" is what users pay, not a count from the list.
  assert.doesNotMatch(text.replaceAll("$0", ""), /\d/);
  assert.deepEqual(acceptedCategories(null), []);
});

test("the card types are the live list's categories, most ranges first, never prepaid", () => {
  assert.deepEqual(acceptedCategories(LIVE_POLICY), ["Classic", "Platinum", "PMJDY (Jan Dhan)", "RuPay Select", "Standard"]);
});

// ------------------------------------------------------------------ MCP block, verbatim

test("the mcpServers JSON is the block in mcp/README.md, character for character", () => {
  const readme = repoFile("mcp/README.md");
  const blocks = [...readme.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const block = blocks.find((b) => b?.includes('"mcpServers"'));
  assert.ok(block, "mcp/README.md has no ```json block with mcpServers");
  assert.equal(MCP_SERVERS_JSON, block);
  assert.doesNotThrow(() => JSON.parse(MCP_SERVERS_JSON));
});

test("the chips list exactly the 12 tools the MCP server registers", () => {
  const full = MCP_TOOLS.map((t) => `${MCP_TOOL_PREFIX}${t}`);
  assert.equal(full.length, 12);
  assert.equal(new Set(full).size, 12);
  const server = repoFile("mcp/src/server.ts");
  const registered = new Set([...server.matchAll(/"(watermark_[a-z_]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...full].sort(), [...registered].sort());
  assert.deepEqual(
    MCP_TOOL_GROUPS.map((g) => g.title),
    ["Check", "Audit", "Build"],
  );
  assert.deepEqual([...MCP_CHIPS], ["Read-only", "No keys", "Runs locally"]);
});

// ------------------------------------------------------------------ proof receipts

const base: ProofInput = {
  payment: { txHash: FIRST_PAYMENT_TX, href: txUrl(FIRST_PAYMENT_TX), note: PREVIOUS_LIVE_LABEL },
  stamp: { txHash: FIRST_STAMP_TX, href: txUrl(FIRST_STAMP_TX), note: PREVIOUS_LIVE_LABEL },
  efTx: EF_ADMITTED_TX,
  efBlock: 3699,
  verified: { registry: true, sponsor: false },
};

test("five receipts: stamp, payment, EF, Sponsor, Registry, each linking over https", () => {
  assert.deepEqual(
    PROOF_RECEIPTS.map((r) => r.id),
    ["stamp", "payment", "ef", "sponsor", "registry"],
  );
  for (const r of PROOF_RECEIPTS) assert.match(r.href, /^https:\/\//, r.id);
  const byId = Object.fromEntries(PROOF_RECEIPTS.map((r) => [r.id, r]));
  assert.equal(byId.stamp?.ref, FIRST_STAMP_TX);
  assert.ok(isTxHash(byId.payment?.ref));
  assert.equal(byId.ef?.ref, EF_ADMITTED_TX);
  assert.ok(byId.ef?.href.includes(EF_ADMITTED_TX));
  assert.equal(byId.sponsor?.ref, ADDR.sponsor);
  assert.equal(byId.registry?.ref, ADDR.registry);
  assert.ok(isAddress(byId.sponsor?.ref) && isAddress(byId.registry?.ref));
  // The Sponsor card's daily cap is the live list's own number.
  assert.equal(byId.sponsor?.total.value, String(LIVE_POLICY.quotaPerDay));
});

test("a contract reads Verified only after a human saw it verified", () => {
  const byId = Object.fromEntries(PROOF_RECEIPTS.map((r) => [r.id, r]));
  assert.equal(byId.sponsor?.status, BLOCKSCOUT_VERIFIED.sponsor ? "verified" : "deployed");
  assert.equal(byId.registry?.status, BLOCKSCOUT_VERIFIED.registry ? "verified" : "deployed");
  const pending = buildProofReceipts(base).find((r) => r.id === "sponsor");
  assert.equal(pending?.status, "deployed");
  assert.match(pending?.note ?? "", /pending/);
  const done = buildProofReceipts({ ...base, verified: { registry: true, sponsor: true } }).find((r) => r.id === "sponsor");
  assert.equal(done?.status, "verified");
});

test("the first live app's records keep a plain-words label; a recorded live payment drops it", () => {
  assert.equal(buildProofReceipts(base).find((r) => r.id === "payment")?.note, FIRST_LIST_NOTE);
  assert.equal(buildProofReceipts(base).find((r) => r.id === "stamp")?.note, FIRST_LIST_NOTE);
  // No internal jargon in the small print.
  for (const r of PROOF_RECEIPTS) assert.doesNotMatch(r.note ?? "", /stricter filter|live app/i, r.id);
  // The build's own payment card is the live app's main-flow payment (README.md), with no label.
  const live = PROOF_RECEIPTS.find((r) => r.id === "payment");
  assert.equal(live?.ref, "0xb848b7c8c589335d17ab1570f0cb1765325a1d065e58a2f9447e9d333e376879");
  assert.equal(live?.note, null);
  const tx = `0x${"ab".repeat(32)}` as const;
  const paid = buildProofReceipts({ ...base, payment: { txHash: tx, href: txUrl(tx), note: null } }).find(
    (r) => r.id === "payment",
  );
  assert.equal(paid?.ref, tx);
  assert.equal(paid?.note, null);
});

// ------------------------------------------------------------------ words rules (SITE_FINAL "Words")

test("plain, honest words in every section file: no banned phrases, no emoji art", () => {
  const dir = new URL("./", import.meta.url);
  const sources = readdirSync(dir)
    .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".test.ts"))
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .join("\n");
  const copy = [
    ...Object.values(HERO).flatMap((v) => (typeof v === "string" ? [v] : [v.label])),
    ...HOW_STEPS.flatMap((s) => [s.title, s.body]),
    ...Object.values(ADD_BLOCKS).flatMap((b) => Object.values(b)),
    ...PRIVACY_ROWS.flatMap((r) => [r.label, r.text]),
    PRIVACY_TRUST,
    ...GOOD_TO_KNOW,
    ...PROOF_RECEIPTS.flatMap((r) => [r.kicker, r.title, r.total.label, r.total.value, r.note ?? ""]),
  ].join(" ");
  assert.doesNotMatch(sources, /hold plastic|real person/i);
  assert.doesNotMatch(copy, /real person|human|free money|per card|nullifier|relayer|calldata|EIP-|guaranteed/i);
  assert.doesNotMatch(sources, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "no emoji");
  assert.doesNotMatch(sources, /assets\/3d\//, "no Fluent emoji PNGs");
});

// ------------------------------------------------------------------ Mumbai in the hero (SITE_FINAL "MUMBAI IN THE HERO")

test("the hero draws the Mumbai skyline on load, and the footer keeps it", () => {
  const hero = readFileSync(new URL("./hero.tsx", import.meta.url), "utf8");
  assert.match(hero, /<MumbaiSkyline\s+draw="load"/u, "hero renders the skyline in load mode");
  const footer = readFileSync(new URL("../_site/site-footer.tsx", import.meta.url), "utf8");
  assert.match(footer, /<MumbaiSkyline\s+draw\b/u, "footer keeps the self-drawing skyline");
  const art = readFileSync(new URL("../_art/mumbai-skyline.tsx", import.meta.url), "utf8");
  assert.equal(art.match(/accent: true/gu)?.length, 1, "exactly one saffron detail");
  assert.match(art, /prefers-reduced-motion: reduce/u, "drawn at once under reduced motion");
  assert.match(art, /const PALMS/u, "a few palms");
});
