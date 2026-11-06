/**
 * Tool handlers for the Watermark MCP server (spec P). Plain functions, so they can be tested without a transport.
 * Rules: no tool takes card data, none holds a key, and none signs or sends anything. Outputs are data.
 */
import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";
import {
  appInfo,
  check,
  checkMany,
  draftPolicy,
  explainPolicy,
  MAX_CHECK_MANY,
  prepareRegisterApp,
  RegistryNotDeployedError,
  stampHistory,
  supportedCards,
  verifyLink,
  type ChainName,
  type ChainReader,
  type DraftPolicyInput,
  type Policy,
  type PolicyLeaf,
  type StampReader,
} from "@watermark/sdk";
import type { DeployedApp } from "@watermark/sdk/node";

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
  /** Injected in tests for app info and history; otherwise a viem client per chain. */
  chainReader?: ChainReader;
  rpcUrl?: (chain: ChainName) => string | undefined;
  /** RPC for event history (eth_getLogs). Defaults to the SDK's LOGS_RPC (Whitechain's official RPC). */
  logsRpcUrl?: (chain: ChainName) => string | undefined;
  /** The registry's deploy block (deployments/<chain>.json blockNumber), where history starts. */
  deployBlock?: (chain: ChainName) => number | undefined;
  /** The apps the deployment registered, labelled from the policies. */
  deployedApps?: (chain: ChainName) => DeployedApp[];
  now?: () => number;
}

const EXPLORER: Record<ChainName, string> = {
  whitechain: "https://explorer.testnet.whitechain.io",
  devnet: "https://explorer.altmempool.wtf",
};

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

function readOpts(deps: ToolDeps, chain: ChainName) {
  const o = opts(deps, chain);
  return {
    chain,
    registry: o.registry,
    ...(deps.chainReader ? { client: deps.chainReader } : {}),
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

export function integrationSnippet(deps: ToolDeps, a: { language: "solidity" | "typescript"; appId: string; chain?: ChainName }) {
  if (!/^\d{1,78}$/.test(a.appId)) throw new ToolError("appId must be a decimal number.");
  const chain = a.chain ?? "whitechain";
  let registry = "<WatermarkRegistry address: not deployed on this chain yet>";
  try {
    registry = deps.registryFor(chain);
  } catch {
    // keep the placeholder: the snippet is still useful before a deploy
  }
  if (a.language === "solidity") {
    return {
      language: "solidity",
      registry,
      code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IWatermarkRegistry {
    function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt);
}

/// Gate a function to wallets with a live Watermark stamp for one app.
/// A stamp = one real bank card that passed the app's filter. Not identity or KYC.
abstract contract WatermarkGated {
    // WatermarkRegistry on ${chain}: ${registry}
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
}

// Example: one claim per stamped wallet
contract Drop is WatermarkGated {
    mapping(address => bool) public claimed;
    constructor(IWatermarkRegistry r) WatermarkGated(r) {}
    function claim() external onlyStamped {
        require(!claimed[msg.sender], "already claimed");
        claimed[msg.sender] = true;
        // ... send the reward
    }
}`,
    };
  }
  return {
    language: "typescript",
    registry,
    code: `import { check, checkMany } from "@watermark/sdk";

const registry = "${registry}"; // WatermarkRegistry on ${chain}
const appId = "${a.appId}";

// 1. Gate one wallet (e.g. before login, a reward or a gasless transaction)
const { stamped, expiresAt } = await check(wallet, appId, { chain: "${chain}", registry });
if (!stamped) throw new Error("Tap your bank card in Watermark first");

// 2. Allowlist export for an airdrop: up to 200 wallets per call, one multicall on Whitechain
const results = await checkMany(wallets, appId, { chain: "${chain}", registry });
const allowlist = Object.entries(results).filter(([, r]) => r.stamped).map(([w]) => w);`,
  };
}

/** On-chain app record plus the accountability check: is the enforced filter the published one? */
export async function appInfoTool(deps: ToolDeps, a: { appId: string; chain?: ChainName }) {
  const chain = a.chain ?? "whitechain";
  const info = await appInfo(a.appId, readOpts(deps, chain));
  const p = deps.getPolicy(info.appId);
  const matches = Boolean(p && info.exists && p.rulesRoot.toLowerCase() === info.rulesRoot.toLowerCase());
  const issues: string[] = [];
  if (!info.exists) issues.push("No app with this appId is registered on-chain.");
  if (!p) issues.push("No published policy file for this appId, so its filter cannot be audited here.");
  if (p && info.exists && !matches) issues.push(`On-chain rulesRoot ${info.rulesRoot} differs from the published ${p.rulesRoot}.`);
  return {
    chain,
    ...info,
    audit: {
      matches,
      published: p ? { label: p.label, environment: p.environment, rulesRoot: p.rulesRoot, leaves: p.leaves.length } : null,
      issues,
      howToVerify:
        "Recompute the published root from its leaves with node tools/zk/src/roots.ts --check (CI does it on every push), " +
        "then compare it with apps(appId).rulesRoot on the explorer.",
    },
    meaning: STAMP_MEANING,
  };
}

/** Transparency: how many stamps an app has given, how many are live, and the latest ones. */
export async function stampHistoryTool(deps: ToolDeps, a: { appId: string; chain?: ChainName; limit?: number }) {
  const chain = a.chain ?? "whitechain";
  const fromBlock = deps.deployBlock?.(chain);
  if (fromBlock === undefined) throw new ToolError(`The deploy block for ${chain} is not known (deployments/${chain}.json blockNumber).`);
  const logsUrl = deps.logsRpcUrl?.(chain);
  const h = await stampHistory(a.appId, {
    ...readOpts(deps, chain),
    ...(logsUrl ? { rpcUrl: logsUrl } : {}),
    fromBlock: BigInt(fromBlock),
  });
  const limit = Math.min(Math.max(a.limit ?? 20, 1), 200);
  return {
    appId: h.appId,
    chain,
    blocks: { from: h.fromBlock, to: h.toBlock },
    totalStamps: h.total,
    uniqueWallets: h.uniqueWallets,
    liveNow: h.active,
    liveCheckedOf: h.checked,
    latest: h.stamps.slice(0, limit).map((s) => ({
      wallet: s.wallet,
      expiresAt: new Date(s.expiresAt * 1000).toISOString(),
      block: s.block,
      tx: s.tx,
      explorer: s.tx ? `${EXPLORER[chain]}/tx/${s.tx}` : null,
    })),
    note: "Public on-chain data only (wallet, expiry, transaction). No card number, BIN or card expiry exists on-chain.",
  };
}

/** An UNSIGNED registerApp transaction for a company's own app and filter. Signs and sends nothing. */
export function prepareRegisterAppTool(
  deps: ToolDeps,
  a: { owner: string; rulesRoot: string; sessionSigner: string; salt?: string; chain?: ChainName },
) {
  const chain = a.chain ?? "whitechain";
  const salt = (a.salt ?? `0x${randomBytes(32).toString("hex")}`) as Hex;
  let r: ReturnType<typeof prepareRegisterApp>;
  try {
    r = prepareRegisterApp({
      owner: a.owner,
      salt,
      rulesRoot: a.rulesRoot as Hex,
      sessionSigner: a.sessionSigner,
      chain,
      registry: opts(deps, chain).registry,
    });
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
  return {
    chain,
    unsignedTransaction: r.tx,
    salt,
    appId: r.appId,
    warnings: [
      ...r.warnings,
      "A narrow filter (one bank, few prefixes, 8-digit prefixes) makes each stamp reveal more. Draft it with watermark_draft_policy and read its warnings first.",
      "Publish the policy (its leaves) so anyone can audit that the on-chain rulesRoot is the filter you claim.",
    ],
    nextStep: "The owner signs and sends this transaction from their own wallet. This tool holds no key and sends nothing.",
  };
}

/** A link that sends a user to the website's /verify page for an app. */
export function createVerifyLink(_deps: ToolDeps, a: { appId: string; siteUrl: string; chain?: ChainName }) {
  const chain = a.chain ?? "whitechain";
  let link: string;
  try {
    link = verifyLink(a.appId, null, a.siteUrl, chain);
  } catch (e) {
    throw new ToolError(e instanceof Error ? e.message : String(e));
  }
  return {
    link,
    howItWorks:
      "The page creates the user's browser wallet and shows a QR. The user scans it with an Android phone and taps a bank card. " +
      "When the stamp lands, check it with watermark_check_wallet.",
  };
}

/** The apps the current deployment registered. */
export function listApps(deps: ToolDeps, a: { chain?: ChainName }) {
  const chain = a.chain ?? "whitechain";
  const apps = deps.deployedApps?.(chain) ?? [];
  let registry: string | null = null;
  try {
    registry = deps.registryFor(chain);
  } catch {
    registry = null;
  }
  return { chain, registry, apps, ...(apps.length ? {} : { note: `Nothing is deployed on ${chain} yet.` }) };
}

/** Which cards can be proven today. Honest by design. */
export function supportedCardsTool() {
  return {
    cards: supportedCards(),
    filters:
      "The network is proven by the CA key that signed the card. Bank, card type and country come only from the BIN list behind the filter's prefixes.",
  };
}
