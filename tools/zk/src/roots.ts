/**
 * Recomputes the CA root (written to policies/ca-keys.json) and each policy's rulesRoot (written back to the policy).
 * The contract's setCaRoot and registerApp must use exactly these values.
 *   node src/roots.ts            # print and update policies/*.json
 *   node src/roots.ts --check    # fail if any file is out of date (CI)
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fieldHex, initHash } from "./hash.ts";
import { caTree, rulesTree } from "./inputs.ts";

const root = resolve(import.meta.dirname, "../../..");
const policies = join(root, "policies");
const check = process.argv.includes("--check");

await initHash();
const caFile = join(policies, "ca-keys.json");
const ca = JSON.parse(readFileSync(caFile, "utf8"));
const caRoot = fieldHex(
  caTree(ca.keys.map((k: { networkId: number; modulus: string }) => ({ networkId: k.networkId, modulus: k.modulus.toLowerCase() }))).root,
);
console.log(`caRoot     ${caRoot} (${ca.keys.length} keys) -> WatermarkRegistry.setCaRoot`);

let stale = 0;
if (ca.caRoot !== caRoot) {
  stale++;
  if (!check) writeFileSync(caFile, JSON.stringify({ description: ca.description, caRoot, keys: ca.keys }, null, 2) + "\n");
}
for (const f of readdirSync(policies).filter((f) => f.endsWith(".json") && f !== "ca-keys.json")) {
  const p = JSON.parse(readFileSync(join(policies, f), "utf8"));
  const r = fieldHex(rulesTree(p.leaves.map((l: { networkId: number; prefixLength: 6 | 8; prefix: string }) => l)).root);
  console.log(`${f.padEnd(10)} ${r} (${p.leaves.length} leaves, appId ${p.appId || "not registered"}) -> registerApp rulesRoot`);
  if (p.rulesRoot !== r) {
    stale++;
    if (!check) writeFileSync(join(policies, f), JSON.stringify({ ...p, rulesRoot: r }, null, 2) + "\n");
  }
}
if (check && stale) {
  console.error(`${stale} file(s) have a stale root: run node tools/zk/src/roots.ts`);
  process.exit(1);
}
