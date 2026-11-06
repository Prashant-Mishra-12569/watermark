/**
 * Builds policies/live.json from a public BIN dataset: every Indian RuPay DEBIT BIN with a known, non-prepaid
 * product category, as "listed" leaves.
 *
 * Prepaid cards (gift, transit, payroll) are sold over the counter with little or no KYC, so one person can buy many.
 * Ranges the dataset marks PREPAID are dropped, and so are ranges with no category at all, because we can't tell
 * whether they are prepaid.
 * Source: github.com/mostafa19950/bin-list-data (CC BY 4.0, a lite version of BinLookup.io data). Unofficial,
 * possibly outdated: a listed leaf is unproven until a real card passes.
 *
 *   node src/build-live-policy.ts <bin-list-data.csv> [--max N]
 *
 * Then run node src/roots.ts to compute rulesRoot.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { RULES_TREE_DEPTH } from "./tree.ts";

const SOURCE = "https://github.com/mostafa19950/bin-list-data";
const LICENSE = "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)";

const csvPath = process.argv[2];
if (!csvPath) throw new Error("usage: node src/build-live-policy.ts <bin-list-data.csv> [--max N]");
const maxArg = process.argv.indexOf("--max");
const max = maxArg > 0 ? Number(process.argv[maxArg + 1]) : 2 ** RULES_TREE_DEPTH;

/** RFC 4180-style split: quoted fields may contain commas. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean);
const header = splitCsv(lines[0]!);
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`column ${name} missing`);
  return i;
};
const [iBin, iBrand, iType, iCat, iCountry] = ["BIN", "Brand", "Type", "Category", "isoCode2"].map(col) as number[];

// Only data, never code: each row is validated before it becomes a leaf.
const prefixes = new Map<string, string>();
const skipped = { prepaid: 0, unknown: 0 };
for (const line of lines.slice(1)) {
  const r = splitCsv(line);
  const bin = r[iBin!] ?? "";
  if (!/^\d{6}$/.test(bin)) continue;
  if ((r[iBrand!] ?? "").toUpperCase() !== "RUPAY") continue; // RuPay-signed; JCB/RuPay co-brands need a JCB key
  if ((r[iType!] ?? "").toUpperCase() !== "DEBIT") continue;
  if ((r[iCountry!] ?? "").toUpperCase() !== "IN") continue;
  const category = (r[iCat!] ?? "").trim();
  if (!category) { skipped.unknown++; continue; } // can't tell if it's prepaid, so leave it out
  if (/PREPAID/i.test(category)) { skipped.prepaid++; continue; } // bought over the counter, no bank account behind it
  prefixes.set(bin, category);
}

const sorted = [...prefixes.keys()].sort();
if (sorted.length > max) {
  throw new Error(`${sorted.length} prefixes exceed ${max} leaves (rules tree depth ${RULES_TREE_DEPTH}); raise the depth or pass --max`);
}

const repo = resolve(import.meta.dirname, "../../..");
const file = join(repo, "policies/live.json");
const old = JSON.parse(readFileSync(file, "utf8"));
const policy = {
  label: "RuPay bank debit (India, no prepaid)",
  environment: "live",
  appId: process.env.LIVE_APP_ID ?? old.appId ?? "",
  source: SOURCE,
  license: LICENSE,
  note:
    "Every 6-digit Indian RuPay DEBIT BIN in the public dataset above that has a known product category, except " +
    "prepaid ones (gift, transit, payroll), which can be bought over the counter. BINs with no category are left out " +
    "too. Unofficial and possibly outdated, so every leaf is " +
    "'listed' (unproven). No prefix is chosen because of a team member's card. The network is proven by the RuPay CA " +
    "key in the circuit; bank and card type come only from this list.",
  leafDefaults: { network: "RUPAY", networkId: 1, prefixLength: 6, type: "debit", status: "listed" },
  leaves: sorted.map((prefix) => ({ networkId: 1, prefixLength: 6, prefix, category: prefixes.get(prefix) || undefined })),
  rulesRoot: "",
  quotaPerDay: old.quotaPerDay ?? 20,
  stampMonths: old.stampMonths ?? 3,
};
writeFileSync(file, JSON.stringify(policy, null, 1) + "\n");
console.log(
  `live.json: ${sorted.length} RuPay bank debit prefixes (max ${max}); left out ${skipped.prepaid} prepaid and ` +
    `${skipped.unknown} uncategorised. Now run: node src/roots.ts`,
);
