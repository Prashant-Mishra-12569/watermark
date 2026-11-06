import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import whitechain from "../../../deployments/whitechain.json" with { type: "json" };

// policy-summary.ts starts with `import "server-only"`, which Next resolves at build time. Plain node has no such
// package, so stand in an empty module for it here (and only here).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const {
  LIVE_TARGET,
  NO_CATEGORY,
  findPoliciesDir,
  isPublishedPolicyFile,
  livePolicySummary,
  matchesTarget,
  pickPolicy,
  readPolicies,
  summarizePolicy,
} = await import("./policy-summary.ts");

const ROOT_A = `0x${"a".repeat(64)}` as const;
const ROOT_B = `0x${"b".repeat(64)}` as const;

test("the live target is the Sponsor's app and the recorded live root, from deployments/whitechain.json", () => {
  assert.equal(LIVE_TARGET.appId, whitechain.sponsorAppId);
  assert.equal(LIVE_TARGET.rulesRoot, whitechain.liveRulesRoot);
  assert.equal(whitechain.sponsorAppId, whitechain.liveAppId);
});

test("the repo's live filter is picked and counted from policies/live.json", () => {
  const dir = findPoliciesDir();
  assert.ok(dir, "policies/ is found from web/");
  const live = livePolicySummary(dir);
  assert.ok(live, "a published policy matches sponsorAppId and liveRulesRoot");
  assert.equal(live.file, "live.json");
  assert.equal(live.appId, whitechain.sponsorAppId);
  assert.equal(live.rulesRoot, whitechain.liveRulesRoot);

  // Recount straight from the file, independently of the summary code.
  const raw = JSON.parse(readFileSync(path.join(dir, "live.json"), "utf8")) as { leaves: { category?: string }[] };
  assert.equal(live.prefixCount, raw.leaves.length);
  const total = live.categories.reduce((n, c) => n + c.count, 0);
  assert.equal(total, live.prefixCount, "the category table adds up to the prefix count");
  for (const { category, count } of live.categories)
    assert.equal(count, raw.leaves.filter((l) => (l.category ?? NO_CATEGORY) === category).length, category);
});

test("the live filter matches the FACTS: 4,208 six-digit RuPay debit prefixes, no prepaid, no uncategorised", () => {
  const live = livePolicySummary();
  assert.ok(live);
  assert.equal(live.prefixCount, 4208);
  assert.deepEqual(live.prefixLengths, [6]);
  assert.deepEqual(live.networks, ["RUPAY"]);
  assert.deepEqual(live.types, ["debit"]);
  assert.equal(live.prepaid, 0, "/sponsor says prepaid ranges are left out");
  assert.equal(live.uncategorised, 0, "/sponsor says uncategorised ranges are left out");
  assert.deepEqual(
    live.categories.map((c) => c.category).sort(),
    ["CLASSIC", "PLATINUM", "PMJDY", "RUPAY SELECT", "STANDARD"],
  );
  assert.equal(live.hasBanks, false, "no bank field, so no bank table");
  assert.equal(live.quotaPerDay, 20);
  assert.equal(live.stampMonths, 3);
});

test("the test app's policy is read but never picked for the live app", () => {
  const dir = findPoliciesDir();
  assert.ok(dir);
  const all = readPolicies(dir);
  assert.ok(all.some((p) => p.appId === whitechain.appId), "test.json is a policy too");
  assert.ok(!all.some((p) => p.file === "ca-keys.json"), "ca-keys.json is not a filter policy");
  assert.equal(pickPolicy(all, LIVE_TARGET)?.file, "live.json");
});

test("local* files are never opened or picked, and only *.json counts", () => {
  assert.equal(isPublishedPolicyFile("live.json"), true);
  assert.equal(isPublishedPolicyFile("local.json"), false);
  assert.equal(isPublishedPolicyFile("local-live.json"), false);
  assert.equal(isPublishedPolicyFile("LOCAL.json"), false);
  assert.equal(isPublishedPolicyFile("live.json.bak"), false);
  assert.equal(isPublishedPolicyFile("../live.json"), false);

  const dir = mkdtempSync(path.join(tmpdir(), "policy-summary-"));
  try {
    const policies = fakeRepo(dir);
    const policy = (label: string) => ({
      label,
      appId: "7",
      rulesRoot: ROOT_A,
      leaves: [{ prefix: "990001", category: "CLASSIC" }],
    });
    // A local file that matches the target, plus one that isn't even JSON: neither may be read.
    writeFileSync(path.join(policies, "local.json"), JSON.stringify(policy("local")));
    writeFileSync(path.join(policies, "local-broken.json"), "{ not json");
    assert.equal(livePolicySummary(policies), null, "the real live target isn't here");
    assert.equal(pickPolicy(readPolicies(policies), { appId: "7", rulesRoot: ROOT_A }), null);

    writeFileSync(path.join(policies, "shop.json"), JSON.stringify(policy("published")));
    assert.equal(pickPolicy(readPolicies(policies), { appId: "7", rulesRoot: ROOT_A })?.label, "published");
    assert.equal(findPoliciesDir(path.join(dir, "web", "src")), policies, "found from a sub-folder");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a file must match both the appId and the rulesRoot", () => {
  const a = { appId: "42", rulesRoot: ROOT_A };
  const upper = { appId: "42", rulesRoot: `0x${"A".repeat(64)}` as const };
  assert.equal(matchesTarget(a, { appId: "0042", rulesRoot: ROOT_A }), true, "appIds compare as numbers");
  assert.equal(matchesTarget(upper, { appId: "42", rulesRoot: ROOT_A }), true, "roots compare in any hex case");
  assert.equal(matchesTarget(a, { appId: "43", rulesRoot: ROOT_A }), false);
  assert.equal(matchesTarget(a, { appId: "42", rulesRoot: ROOT_B }), false);
  assert.equal(matchesTarget(a, { appId: "", rulesRoot: ROOT_A }), false);
});

test("summaries apply leafDefaults, count none and prepaid, and sort categories by count", () => {
  const s = summarizePolicy("x.json", {
    label: "X",
    appId: "0012",
    rulesRoot: ROOT_A,
    leafDefaults: { network: "rupay", prefixLength: 6, type: "debit" },
    leaves: [
      { prefix: "100001", category: "CLASSIC" },
      { prefix: "100002", category: "CLASSIC" },
      { prefix: "100003", category: "PREPAID PLATINUM" },
      { prefix: "100004" },
      { prefix: "10000005", prefixLength: 8, type: "prepaid", category: "GIFT", bank: "Some bank" },
    ],
    quotaPerDay: 5,
  });
  assert.ok(s);
  assert.equal(s.appId, "12", "canonical decimal");
  assert.equal(s.prefixCount, 5);
  assert.deepEqual(s.prefixLengths, [6, 8]);
  assert.deepEqual(s.networks, ["RUPAY"]);
  assert.deepEqual(s.types, ["debit", "prepaid"]);
  assert.deepEqual(s.categories, [
    { category: "CLASSIC", count: 2 },
    { category: "GIFT", count: 1 },
    { category: NO_CATEGORY, count: 1 },
    { category: "PREPAID PLATINUM", count: 1 },
  ]);
  assert.equal(s.prepaid, 2);
  assert.equal(s.uncategorised, 1);
  assert.equal(s.hasBanks, true);
  assert.equal(s.quotaPerDay, 5);
  assert.equal(s.stampMonths, null);
  assert.equal(s.source, null);
});

test("files that aren't policies are skipped; malformed leaves fail loudly", () => {
  assert.equal(summarizePolicy("ca-keys.json", { caRoot: ROOT_A, keys: [] }), null);
  assert.equal(summarizePolicy("a.json", { appId: "1", rulesRoot: "0x1234", leaves: [] }), null);
  assert.equal(summarizePolicy("a.json", { appId: "abc", rulesRoot: ROOT_A, leaves: [] }), null);
  assert.equal(summarizePolicy("a.json", []), null);
  assert.throws(() => summarizePolicy("a.json", { appId: "1", rulesRoot: ROOT_A, leaves: [42] }), /a\.json leaf 0/);
  assert.throws(() => summarizePolicy("a.json", { appId: "1", rulesRoot: ROOT_A, leaves: [{ category: "X" }] }), /prefix/);
});

/** A fake repo: deployments/whitechain.json next to policies/, plus web/src to search from. */
function fakeRepo(root: string): string {
  for (const sub of ["deployments", "policies", path.join("web", "src")]) mkdirSync(path.join(root, sub), { recursive: true });
  writeFileSync(path.join(root, "deployments", "whitechain.json"), "{}");
  return path.join(root, "policies");
}
