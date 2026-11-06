/**
 * The published card filter of the live app, summarised at build time for the home page's "You stay in control"
 * section (/#control).
 *
 * SERVER ONLY. It reads policies/*.json from disk with node:fs while `next build` prerenders the static pages, so the
 * 480 KB leaf list never reaches the browser. It never reads policies/local*.json (developer files, not published),
 * and it skips any file that isn't a filter policy (ca-keys.json).
 *
 * The file is chosen, not hard-coded: the one whose appId is the Sponsor's app (deployments/whitechain.json
 * `sponsorAppId`) and whose rulesRoot is the recorded live root (`liveRulesRoot`). With no match the result is null,
 * and the home page guesses no numbers instead of showing a list that may not be the one enforced on-chain.
 */
import "server-only";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { LIVE_APP, SPONSOR_APP_ID, isTxHash, type Hex } from "./site.ts";

/** Category shown for leaves that have none. */
export const NO_CATEGORY = "none";

export interface CategoryCount {
  category: string;
  count: number;
}

export interface PolicySummary {
  /** File name inside policies/, e.g. "live.json". */
  file: string;
  label: string;
  /** Canonical decimal string. */
  appId: string;
  rulesRoot: Hex;
  /** Leaves in the filter: one BIN prefix each. */
  prefixCount: number;
  /** Distinct prefix lengths, ascending, e.g. [6]. */
  prefixLengths: number[];
  /** Distinct card networks, e.g. ["RUPAY"]. */
  networks: string[];
  /** Distinct card types, e.g. ["debit"]. */
  types: string[];
  /** Leaves per category, most first (ties by name). Leaves without a category count under NO_CATEGORY. */
  categories: CategoryCount[];
  /** Leaves tagged prepaid, by category or by type. */
  prepaid: number;
  /** Leaves with no category. */
  uncategorised: number;
  /** True when any leaf names a bank. The live list has none, so there is no bank table. */
  hasBanks: boolean;
  /** Where the prefixes come from, and its licence, as the file states them. */
  source: string | null;
  license: string | null;
  quotaPerDay: number | null;
  stampMonths: number | null;
}

export interface PolicyTarget {
  appId: string;
  rulesRoot: string;
}

/** The live app as deployments/whitechain.json records it: the Sponsor's appId and the live rulesRoot. */
export const LIVE_TARGET: PolicyTarget = { appId: SPONSOR_APP_ID, rulesRoot: LIVE_APP.rulesRoot };

const DECIMAL = /^\d{1,78}$/;

/** A published policy file: `*.json` in policies/, never `local*` (any case), never a path. */
export function isPublishedPolicyFile(name: string): boolean {
  return /^[^/\\]+\.json$/i.test(name) && !/^local/i.test(name);
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);

/**
 * Counts a policy's leaves. Returns null for a JSON file that isn't a filter policy (no appId, rulesRoot or leaves);
 * throws for a policy whose leaves are malformed, so a broken published file fails the build instead of showing a
 * wrong table. Each leaf takes the file's `leafDefaults` for any field it doesn't set.
 */
export function summarizePolicy(file: string, json: unknown): PolicySummary | null {
  if (!isObject(json)) return null;
  const appId = str(json.appId);
  const rulesRoot = json.rulesRoot;
  if (!appId || !DECIMAL.test(appId) || !isTxHash(rulesRoot) || !Array.isArray(json.leaves)) return null;

  const defaults = isObject(json.leafDefaults) ? json.leafDefaults : {};
  const categories = new Map<string, number>();
  const prefixLengths = new Set<number>();
  const networks = new Set<string>();
  const types = new Set<string>();
  let prepaid = 0;
  let uncategorised = 0;
  let hasBanks = false;

  json.leaves.forEach((raw, i) => {
    if (!isObject(raw)) throw new Error(`policy-summary: ${file} leaf ${i} is not an object`);
    const leaf = { ...defaults, ...raw };
    const prefix = str(leaf.prefix);
    if (!prefix || !/^\d+$/.test(prefix)) throw new Error(`policy-summary: ${file} leaf ${i} has no digit prefix`);
    const length = int(leaf.prefixLength) ?? prefix.length;
    prefixLengths.add(length);

    const network = str(leaf.network);
    if (network) networks.add(network.toUpperCase());
    const type = str(leaf.type);
    if (type) types.add(type.toLowerCase());
    if (str(leaf.bank)) hasBanks = true;

    const category = str(leaf.category);
    if (!category) uncategorised++;
    const key = category ?? NO_CATEGORY;
    categories.set(key, (categories.get(key) ?? 0) + 1);
    if (/prepaid/i.test(category ?? "") || /prepaid/i.test(type ?? "")) prepaid++;
  });

  return {
    file,
    label: str(json.label) ?? file,
    appId: BigInt(appId).toString(),
    rulesRoot,
    prefixCount: json.leaves.length,
    prefixLengths: [...prefixLengths].sort((a, b) => a - b),
    networks: [...networks].sort(),
    types: [...types].sort(),
    categories: [...categories]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    prepaid,
    uncategorised,
    hasBanks,
    source: str(json.source),
    license: str(json.license),
    quotaPerDay: int(json.quotaPerDay),
    stampMonths: int(json.stampMonths),
  };
}

/** Same app (appIds compared as numbers) and same rulesRoot (any hex case). */
export function matchesTarget(summary: Pick<PolicySummary, "appId" | "rulesRoot">, target: PolicyTarget): boolean {
  if (!DECIMAL.test(summary.appId) || !DECIMAL.test(target.appId)) return false;
  return (
    BigInt(summary.appId) === BigInt(target.appId) && summary.rulesRoot.toLowerCase() === target.rulesRoot.toLowerCase()
  );
}

/** The first summary (by file name) that matches the target, never a local* file; null when none does. */
export function pickPolicy(summaries: readonly PolicySummary[], target: PolicyTarget): PolicySummary | null {
  return (
    [...summaries]
      .filter((s) => isPublishedPolicyFile(s.file))
      .sort((a, b) => a.file.localeCompare(b.file))
      .find((s) => matchesTarget(s, target)) ?? null
  );
}

/**
 * The repo's policies/ folder: the first one, from `start` upwards, that sits next to deployments/whitechain.json.
 * Next builds from web/ and the tests run from web/, so this is normally ../policies.
 *
 * The pages that call this are prerendered: the files are read during `next build` only. The ignore comment keeps
 * Turbopack from tracing the whole project into the server output because of this one dynamic path.
 */
export function findPoliciesDir(start: string = process.cwd()): string | null {
  let dir = path.resolve(/* turbopackIgnore: true */ start);
  for (let i = 0; i < 5; i++) {
    const policies = path.join(dir, "policies");
    if (existsSync(path.join(dir, "deployments", "whitechain.json")) && existsSync(policies)) return policies;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Every published filter policy in `dir`, summarised. local* files are never opened. */
export function readPolicies(dir: string): PolicySummary[] {
  return readdirSync(dir)
    .filter(isPublishedPolicyFile)
    .sort()
    .flatMap((file) => {
      let json: unknown;
      try {
        json = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
      } catch {
        throw new Error(`policy-summary: policies/${file} is not valid JSON`);
      }
      const summary = summarizePolicy(file, json);
      return summary ? [summary] : [];
    });
}

const cache = new Map<string, PolicySummary | null>();

/**
 * The live app's published filter, or null when this build has no file for it (or no policies/ folder). Read once
 * per build process.
 */
export function livePolicySummary(dir: string | null = findPoliciesDir()): PolicySummary | null {
  if (!dir) return null;
  if (!cache.has(dir)) cache.set(dir, pickPolicy(readPolicies(dir), LIVE_TARGET));
  return cache.get(dir) ?? null;
}
