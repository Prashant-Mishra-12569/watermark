/**
 * Tool handlers for the Watermark MCP server (spec P). Plain functions, so they can be tested without a transport.
 * Rules: no tool takes card data, none holds a key, and none signs or sends anything. Outputs are data.
 */
import type { Address, Hex } from "viem";
import {
  check,
  checkMany,
  draftPolicy,
  explainPolicy,
  MAX_CHECK_MANY,
  RegistryNotDeployedError,
  type ChainName,
  type DraftPolicyInput,
  type Policy,
  type PolicyLeaf,
  type StampReader,
} from "@watermark/sdk";

export const STAMP_MEANING =
  "A Watermark stamp means: this wallet was linked to one real bank card that passed this app's filter. " +
  "It is not identity, KYC, age, balance or one-person-one-vote.";

export interface ToolDeps {
  /** Registry address for a chain (from deployments/). Throws RegistryNotDeployedError if absent. */
  registryFor: (chain: ChainName) => Address;
  getPolicy: (appId: string) => Policy | null;
  /** Poseidon2 Merkle root of the filter leaves (interfaces F8). */
  rulesRoot: (leaves: PolicyLeaf[]) => Promise<Hex>;
  /** Injected in tests; otherwise a viem client per chain. */
  reader?: StampReader;
  rpcUrl?: (chain: ChainName) => string | undefined;
  now?: () => number;
}

export class ToolError extends Error {}

function opts(deps: ToolDeps, chain: ChainName) {
  let registry: Address;
  try {
    registry = deps.registryFor(chain);
  } catch (e) {
    if (e instanceof RegistryNotDeployedError) {
      throw new ToolError(`WatermarkRegistry isn't deployed on ${chain} yet, so no wallet can be checked there.`);
    }
    throw e;
  }
  return {
    chain,
    registry,
    ...(deps.reader ? { client: deps.reader } : {}),
    ...(deps.rpcUrl?.(chain) ? { rpcUrl: deps.rpcUrl(chain) } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  };
}

export async function checkWallet(deps: ToolDeps, a: { wallet: string; appId: string; chain?: ChainName }) {
  const chain = a.chain ?? "whitechain";
  const r = await check(a.wallet, a.appId, opts(deps, chain));
  return {
    wallet: a.wallet,
    appId: a.appId,
    chain,
    stamped: r.stamped,
    expiresAt: r.expiresAt,
    expiresAtIso: r.expiresAt ? new Date(r.expiresAt * 1000).toISOString() : null,
    meaning: STAMP_MEANING,
  };
}

export async function checkWallets(deps: ToolDeps, a: { wallets: string[]; appId: string; chain?: ChainName }) {
  if (a.wallets.length > MAX_CHECK_MANY) throw new ToolError(`At most ${MAX_CHECK_MANY} wallets per call.`);
  const chain = a.chain ?? "whitechain";
  const results = await checkMany(a.wallets, a.appId, opts(deps, chain));
  const stamped = Object.values(results).filter((r) => r.stamped).length;
  return { appId: a.appId, chain, total: a.wallets.length, stamped, results, meaning: STAMP_MEANING };
}

export async function draft(deps: ToolDeps, a: DraftPolicyInput) {
  const p = draftPolicy(a);
  const rulesRoot = p.leaves.length ? await deps.rulesRoot(p.leaves) : null;
  const warnings = p.warnings.filter((w) => !w.startsWith("rulesRoot is computed"));
  return {
    policy: { ...p, rulesRoot, warnings: undefined },
    rulesRoot,
    warnings,
    explanation: explainPolicy(p),
    nextStep:
      "Review the leaves, save the policy to policies/<name>.json, then the app owner signs registerApp(salt, rulesRoot, sessionSigner). " +
      "This tool signs nothing.",
  };
}

export function getPolicy(deps: ToolDeps, a: { appId: string }) {
  const p = deps.getPolicy(a.appId);
  if (!p) throw new ToolError(`No committed policy for appId ${a.appId}.`);
  return { policy: p, meaning: STAMP_MEANING };
}

export function explain(deps: ToolDeps, a: { appId: string }) {
  const p = deps.getPolicy(a.appId);
  if (!p) throw new ToolError(`No committed policy for appId ${a.appId}.`);
  return { appId: a.appId, label: p.label, ...explainPolicy(p) };
}

export function integrationSnippet(_deps: ToolDeps, a: { language: "solidity" | "typescript"; appId: string; chain?: ChainName }) {
  if (!/^\d{1,78}$/.test(a.appId)) throw new ToolError("appId must be a decimal number.");
  const chain = a.chain ?? "whitechain";
  if (a.language === "solidity") {
    return {
      language: "solidity",
      code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IWatermarkRegistry {
    function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt);
}

/// Gate a function to wallets with a live Watermark stamp for one app.
/// A stamp = one real bank card that passed the app's filter. Not identity or KYC.
abstract contract WatermarkGated {
    IWatermarkRegistry public immutable watermark;
    uint256 public immutable watermarkAppId;

    constructor(IWatermarkRegistry registry) {
        watermark = registry;
        watermarkAppId = ${a.appId};
    }

    modifier onlyStamped() {
        (bool ok, uint64 expiresAt) = watermark.isStamped(msg.sender, watermarkAppId);
        require(ok && expiresAt > block.timestamp, "Watermark: no live stamp");
        _;
    }
}`,
    };
  }
  return {
    language: "typescript",
    code: `import { check, checkMany } from "@watermark/sdk/node"; // node: reads deployments/; in a browser pass { registry }

const appId = "${a.appId}";
const { stamped, expiresAt } = await check(wallet, appId, { chain: "${chain}" });
if (!stamped) throw new Error("Tap your bank card in Watermark first");

// Airdrops and allowlists: up to 200 wallets per call, one multicall on Whitechain
const results = await checkMany(wallets, appId, { chain: "${chain}" });`,
  };
}
