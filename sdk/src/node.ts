/**
 * Node-only SDK helpers ("@watermark/sdk/node"): they read the committed deployments/ and policies/ files.
 * Kept out of the main entry so the website never bundles fs.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isAddress, type Address, type Hex } from "viem";
import {
  appInfo as appInfoWith,
  check as checkWith,
  checkMany as checkManyWith,
  prepareRegisterApp as prepareRegisterAppWith,
  RegistryNotDeployedError,
  stampHistory as stampHistoryWith,
  type AppInfo,
  type ChainName,
  type CheckOptions,
  type CheckResult,
  type HistoryOptions,
  type ReadOptions,
  type RegisterAppInput,
  type StampHistory,
} from "./client.ts";
import type { Policy } from "./types.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");

/** deployments/<chain>.json, as contracts/script/deployment-json.ts writes it (interfaces F11). */
export interface Deployment {
  chainId: number;
  registry: Address | null;
  verifier?: Address | null;
  sponsor?: Address | null;
  paymaster?: Address | null;
  usdt?: Address | null;
  /** The test app (synthetic card policy). */
  appId?: string | null;
  rulesRoot?: Hex | null;
  liveAppId?: string | null;
  liveRulesRoot?: Hex | null;
  sessionSigner?: Address | null;
  caRoot?: Hex | null;
  /** The registry's deploy block: where event history starts. */
  blockNumber?: number;
  txHashes?: Record<string, string>;
}

const DEPLOYMENT_FILE: Record<ChainName, string> = { whitechain: "whitechain.json", devnet: "devnet.json" };

/** deployments/<chain>.json (interfaces F11), or null if that chain isn't deployed yet. */
export function loadDeployment(chain: ChainName, root = REPO_ROOT): Deployment | null {
  const file = join(root, "deployments", DEPLOYMENT_FILE[chain]);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Deployment;
}

export function registryFor(chain: ChainName, root = REPO_ROOT): Address {
  const d = loadDeployment(chain, root);
  if (!d?.registry || !isAddress(d.registry)) throw new RegistryNotDeployedError(chain);
  return d.registry;
}

function withRegistry(opts: CheckOptions, root?: string): CheckOptions {
  return opts.registry ? opts : { ...opts, registry: registryFor(opts.chain ?? "whitechain", root) };
}

/** check() that finds the registry in deployments/ when it isn't given. */
export function check(wallet: string, appId: string | bigint, opts: CheckOptions = {}, root?: string): Promise<CheckResult> {
  return checkWith(wallet, appId, withRegistry(opts, root));
}

export function checkMany(
  wallets: string[],
  appId: string | bigint,
  opts: CheckOptions = {},
  root?: string,
): Promise<Record<string, CheckResult>> {
  return checkManyWith(wallets, appId, withRegistry(opts, root));
}

/**
 * The committed policy for an app (policies/*.json). Local-only files (policies/local*.json) are skipped:
 * they're for dev testing and are never served.
 */
export function getPolicy(appId: string | bigint, root = REPO_ROOT): Policy | null {
  const dir = join(root, "policies");
  const id = String(appId);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json") || f === "ca-keys.json" || f.startsWith("local")) continue;
    const p = JSON.parse(readFileSync(join(dir, f), "utf8")) as Policy;
    if (p.appId === id) return p;
  }
  return null;
}

/** All committed policies (same exclusions as getPolicy). */
export function listPolicies(root = REPO_ROOT): Policy[] {
  const dir = join(root, "policies");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json") && f !== "ca-keys.json" && !f.startsWith("local"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as Policy);
}

export interface DeployedApp {
  appId: string;
  environment: "test" | "live";
  label: string;
  rulesRoot: Hex | null;
}

/** The apps a deployment registered (test + live), labelled from the committed policies. */
export function deployedApps(chain: ChainName = "whitechain", root = REPO_ROOT): DeployedApp[] {
  const d = loadDeployment(chain, root);
  if (!d) return [];
  const apps: DeployedApp[] = [];
  for (const [env, id, rr] of [
    ["test", d.appId, d.rulesRoot],
    ["live", d.liveAppId, d.liveRulesRoot],
  ] as const) {
    if (!id) continue;
    const p = getPolicy(id, root) ?? policyByEnvironment(env, root);
    apps.push({ appId: id, environment: env, label: p?.label ?? "", rulesRoot: rr ?? null });
  }
  return apps;
}

/** Falls back to the committed policy of that environment when its appId field isn't filled in yet. */
function policyByEnvironment(env: "test" | "live", root: string): Policy | null {
  return listPolicies(root).find((p) => p.environment === env) ?? null;
}

/** The committed policy for an appId, directly or through the deployment's test/live mapping. */
export function policyForApp(appId: string, chain: ChainName = "whitechain", root = REPO_ROOT): Policy | null {
  const direct = getPolicy(appId, root);
  if (direct) return direct;
  const app = deployedApps(chain, root).find((a) => a.appId === appId);
  return app ? policyByEnvironment(app.environment, root) : null;
}

function readOpts<T extends ReadOptions>(opts: T, root?: string): T {
  return opts.registry ? opts : { ...opts, registry: registryFor(opts.chain ?? "whitechain", root) };
}

/** appInfo() that finds the registry in deployments/. */
export function appInfo(appId: string | bigint, opts: ReadOptions = {}, root?: string): Promise<AppInfo> {
  return appInfoWith(appId, readOpts(opts, root));
}

/** stampHistory() that starts at the deploy block from deployments/. */
export function stampHistory(appId: string | bigint, opts: HistoryOptions = {}, root?: string): Promise<StampHistory> {
  const chain = opts.chain ?? "whitechain";
  const fromBlock = opts.fromBlock ?? BigInt(loadDeployment(chain, root)?.blockNumber ?? 0);
  return stampHistoryWith(appId, { ...readOpts(opts, root), fromBlock });
}

/** prepareRegisterApp() that finds the registry in deployments/. */
export function prepareRegisterApp(input: RegisterAppInput, root?: string) {
  const registry = input.registry ?? registryFor(input.chain ?? "whitechain", root);
  return prepareRegisterAppWith({ ...input, registry });
}

export interface AppAudit {
  appId: string;
  onChain: AppInfo;
  published: { label: string; environment: string; rulesRoot: string; leaves: number } | null;
  /** On-chain filter == the filter published in the repo. */
  matches: boolean;
  issues: string[];
}

/**
 * Accountability check: does the filter enforced on-chain equal the filter the app publishes?
 * Anyone can recompute the published root from its leaves (tools/zk/src/roots.ts --check; CI does it on every push).
 */
export async function auditApp(appId: string | bigint, opts: ReadOptions = {}, root?: string): Promise<AppAudit> {
  const chain = opts.chain ?? "whitechain";
  const onChain = await appInfo(appId, opts, root);
  const p = policyForApp(onChain.appId, chain, root ?? REPO_ROOT);
  const issues: string[] = [];
  if (!onChain.exists) issues.push("No app with this appId is registered on-chain.");
  if (!p) issues.push("No committed policy file publishes this app's filter.");
  const matches = Boolean(p && onChain.exists && p.rulesRoot.toLowerCase() === onChain.rulesRoot.toLowerCase());
  if (p && onChain.exists && !matches) {
    issues.push(`On-chain rulesRoot ${onChain.rulesRoot} differs from the published ${p.rulesRoot}.`);
  }
  return {
    appId: onChain.appId,
    onChain,
    published: p ? { label: p.label, environment: p.environment, rulesRoot: p.rulesRoot, leaves: p.leaves.length } : null,
    matches,
    issues,
  };
}
