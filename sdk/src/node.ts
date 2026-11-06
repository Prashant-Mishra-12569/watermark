/**
 * Node-only SDK helpers ("@watermark/sdk/node"): they read the committed deployments/ and policies/ files.
 * Kept out of the main entry so the website never bundles fs.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isAddress, type Address } from "viem";
import {
  check as checkWith,
  checkMany as checkManyWith,
  RegistryNotDeployedError,
  type ChainName,
  type CheckOptions,
  type CheckResult,
} from "./client.ts";
import type { Policy } from "./types.ts";

export const REPO_ROOT = resolve(import.meta.dirname, "../..");

export interface Deployment {
  chainId: number;
  registry: Address | null;
  verifier?: Address | null;
  sponsor?: Address | null;
  paymaster?: Address | null;
  usdt?: Address | null;
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
