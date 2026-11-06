/**
 * Watermark SDK (spec section P). Browser-safe: no fs, no proving code.
 * A stamp means "this wallet was linked to one real bank card that passed this app's filter".
 * It is not identity, KYC, age, balance or one-person-one-vote.
 */
import { createPublicClient, getAddress, http, isAddress, type Address, type Hex } from "viem";
import { altmempoolDevnet, whitechainSepolia } from "./chains.ts";
import { WATERMARK_REGISTRY_ABI } from "./registry.ts";
import { NETWORK_ID, type Network, type Policy, type PolicyLeaf } from "./types.ts";

export type ChainName = "whitechain" | "devnet";

export const MAX_CHECK_MANY = 200;
export const RULES_TREE_CAPACITY = 4096; // depth 12

/** The two viem calls the SDK needs. A viem PublicClient satisfies it; tests pass a mock. */
export interface StampReader {
  readContract(args: {
    address: Address;
    abi: typeof WATERMARK_REGISTRY_ABI;
    functionName: "isStamped";
    args: readonly [Address, bigint];
  }): Promise<readonly [boolean, bigint]>;
  multicall?(args: {
    contracts: readonly {
      address: Address;
      abi: typeof WATERMARK_REGISTRY_ABI;
      functionName: "isStamped";
      args: readonly [Address, bigint];
    }[];
    allowFailure: true;
  }): Promise<({ status: "success"; result: readonly [boolean, bigint] } | { status: "failure"; error: Error })[]>;
}

export interface CheckOptions {
  chain?: ChainName;
  /** WatermarkRegistry on that chain. Node callers can omit it (see "@watermark/sdk/node"). */
  registry?: Address;
  rpcUrl?: string;
  client?: StampReader;
  /** Unix seconds; defaults to the local clock. */
  now?: () => number;
}

export interface CheckResult {
  stamped: boolean;
  /** Unix seconds; 0 = never stamped. */
  expiresAt: number;
}

export class RegistryNotDeployedError extends Error {
  readonly chain: ChainName;
  constructor(chain: ChainName) {
    super(`WatermarkRegistry is not deployed on ${chain} yet (no registry address given or in deployments/)`);
    this.chain = chain;
  }
}

export function chainFor(name: ChainName) {
  return name === "devnet" ? altmempoolDevnet : whitechainSepolia;
}

function readerFor(opts: CheckOptions): StampReader {
  if (opts.client) return opts.client;
  const chain = chainFor(opts.chain ?? "whitechain");
  // A viem PublicClient structurally provides readContract and multicall.
  return createPublicClient({ chain, transport: http(opts.rpcUrl) }) as unknown as StampReader;
}

function parseWallet(w: string): Address {
  if (!isAddress(w, { strict: false })) throw new Error(`not an address: ${w}`);
  return getAddress(w);
}

function parseAppId(appId: string | bigint): bigint {
  const id = typeof appId === "bigint" ? appId : /^\d{1,78}$/.test(appId) ? BigInt(appId) : -1n;
  if (id < 0n || id >= 1n << 248n) throw new Error(`appId must be a 248-bit decimal: ${String(appId)}`);
  return id;
}

/** The contract decides; the expiry check here only guards against a clock or caching mismatch. */
function toResult(ok: boolean, expiresAt: bigint, now: number): CheckResult {
  const exp = Number(expiresAt);
  return { stamped: ok && exp > now, expiresAt: exp };
}

/** Is this wallet stamped for this app? Reads the chain directly (no relayer, no API key). */
export async function check(wallet: string, appId: string | bigint, opts: CheckOptions = {}): Promise<CheckResult> {
  const registry = opts.registry ?? fail(opts.chain ?? "whitechain");
  const [ok, exp] = await readerFor(opts).readContract({
    address: registry,
    abi: WATERMARK_REGISTRY_ABI,
    functionName: "isStamped",
    args: [parseWallet(wallet), parseAppId(appId)],
  });
  return toResult(ok, exp, (opts.now ?? nowSec)());
}

/**
 * The same check for up to 200 wallets (airdrops, allowlists). One multicall on chains that have Multicall3
 * (Whitechain does), parallel reads otherwise. A failed read counts as not stamped.
 */
export async function checkMany(
  wallets: string[],
  appId: string | bigint,
  opts: CheckOptions = {},
): Promise<Record<string, CheckResult>> {
  if (wallets.length > MAX_CHECK_MANY) throw new Error(`checkMany takes at most ${MAX_CHECK_MANY} wallets`);
  const registry = opts.registry ?? fail(opts.chain ?? "whitechain");
  const id = parseAppId(appId);
  const addrs = wallets.map(parseWallet);
  const now = (opts.now ?? nowSec)();
  const reader = readerFor(opts);
  const call = (w: Address) =>
    ({ address: registry, abi: WATERMARK_REGISTRY_ABI, functionName: "isStamped", args: [w, id] }) as const;
  const hasMulticall = Boolean(chainFor(opts.chain ?? "whitechain").contracts?.multicall3) && reader.multicall;

  const out: Record<string, CheckResult> = {};
  if (hasMulticall) {
    const res = await reader.multicall!({ contracts: addrs.map(call), allowFailure: true });
    addrs.forEach((w, i) => {
      const r = res[i];
      out[w] = r && r.status === "success" ? toResult(r.result[0], r.result[1], now) : { stamped: false, expiresAt: 0 };
    });
  } else {
    const res = await Promise.allSettled(addrs.map((w) => reader.readContract(call(w))));
    addrs.forEach((w, i) => {
      const r = res[i]!;
      out[w] = r.status === "fulfilled" ? toResult(r.value[0], r.value[1], now) : { stamped: false, expiresAt: 0 };
    });
  }
  return out;
}

/** Link that sends a user to the website's /verify page for this app and wallet. */
export function verifyLink(appId: string | bigint, wallet: string, siteUrl: string): string {
  const base = new URL(siteUrl);
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("siteUrl must be http(s)");
  const u = new URL("verify", base.href.endsWith("/") ? base.href : `${base.href}/`);
  u.searchParams.set("app", parseAppId(appId).toString());
  u.searchParams.set("wallet", parseWallet(wallet));
  return u.toString();
}

export interface DraftPrefix {
  network: Network;
  /** The first 6 or 8 PAN digits (a BIN/IIN from a public list). Never digits from your own card. */
  prefix: string;
  bank?: string;
  type?: PolicyLeaf["type"];
  status?: PolicyLeaf["status"];
}

export interface DraftPolicyInput {
  label?: string;
  environment?: Policy["environment"];
  networks: Network[];
  banks?: string[];
  types?: PolicyLeaf["type"][];
  prefixes: DraftPrefix[];
  quotaPerDay?: number;
  stampMonths?: number;
}

export interface DraftPolicy extends Omit<Policy, "rulesRoot"> {
  /** Null until computed with Poseidon2 (tools/zk or the MCP's watermark_draft_policy). */
  rulesRoot: Hex | null;
  warnings: string[];
}

/**
 * Turns "SBI RuPay debit only" style rules into filter leaves (interfaces F8, spec I2). Only the network is
 * proven cryptographically; bank and card type are only as good as the BIN list behind the prefixes.
 */
export function draftPolicy(input: DraftPolicyInput): DraftPolicy {
  const warnings: string[] = [];
  const networks = new Set(input.networks);
  const banks = input.banks?.length ? new Set(input.banks.map((b) => b.toLowerCase())) : null;
  const types = input.types?.length ? new Set(input.types) : null;
  const seen = new Set<string>();
  const leaves: PolicyLeaf[] = [];

  for (const p of input.prefixes) {
    if (!/^\d{6}$|^\d{8}$/.test(p.prefix)) throw new Error(`prefix must be 6 or 8 digits: ${p.prefix}`);
    if (!networks.has(p.network)) continue;
    if (banks && !banks.has((p.bank ?? "").toLowerCase())) continue;
    if (types && !(p.type && types.has(p.type))) continue;
    const key = `${p.network}:${p.prefix}`;
    if (seen.has(key)) continue;
    seen.add(key);
    leaves.push({
      network: p.network,
      networkId: NETWORK_ID[p.network],
      prefixLength: p.prefix.length as 6 | 8,
      prefix: p.prefix,
      bank: p.bank ?? "unknown",
      type: p.type ?? "debit",
      status: p.status ?? "listed",
    });
  }

  if (leaves.length === 0) warnings.push("Empty filter: no card can pass this policy.");
  if (leaves.length > RULES_TREE_CAPACITY) throw new Error(`at most ${RULES_TREE_CAPACITY} leaves (tree depth 12)`);
  const untested = leaves.filter((l) => l.status !== "tested").length;
  if (untested) warnings.push(`${untested} leaf/leaves are "listed" (from a BIN list), not tested with a real card.`);
  if (leaves.some((l) => l.network !== "RUPAY")) {
    warnings.push("Visa and Mastercard are implemented but untested on real cards.");
  }
  const bankNames = [...new Set(leaves.map((l) => l.bank))];
  if (leaves.length > 0 && (leaves.length <= 3 || bankNames.length === 1 || leaves.some((l) => l.prefixLength === 8))) {
    warnings.push(
      `Narrow filter: a stamp in this app publicly shows the wallet passed "${bankNames.join(", ")}" ` +
        "rules. The narrower the filter, the more a stamp reveals.",
    );
  }
  if (types?.has("debit") && !types.has("prepaid")) {
    warnings.push("Debit-only depends on the BIN list: prepaid cards also pass the card maths.");
  }
  warnings.push("rulesRoot is computed with Poseidon2 by tools/zk (node tools/zk/src/roots.ts) or the MCP server.");

  return {
    label: input.label ?? `${[...networks].join("/")} ${bankNames.join("/") || "any bank"}`,
    environment: input.environment ?? "test",
    appId: "",
    leaves,
    rulesRoot: null,
    quotaPerDay: input.quotaPerDay ?? 20,
    stampMonths: input.stampMonths ?? 3,
    warnings,
  };
}

/** Plain-language summary of who passes and what a stamp reveals publicly. */
export function explainPolicy(p: Pick<Policy, "label" | "environment" | "leaves" | "quotaPerDay" | "stampMonths">) {
  const nets = [...new Set(p.leaves.map((l) => l.network))];
  const banks = [...new Set(p.leaves.map((l) => l.bank))];
  return {
    whoPasses:
      p.leaves.length === 0
        ? "Nobody: the filter is empty."
        : `A real ${nets.join(" or ")} card whose number starts with one of ${p.leaves.length} listed prefixes (${banks.join(", ")}). One card, one stamp per app.`,
    whatAStampReveals:
      "On-chain: the wallet, the app, a random-looking nullifier and the stamp expiry. Anyone can see that the " +
      `wallet passed "${p.label}". No card number, BIN or card expiry is ever on-chain.`,
    whatItDoesNotProve: "Identity, KYC, age, balance or one-person-one-vote. A person with three cards can get three stamps.",
    limits: `Stamps last about ${p.stampMonths} months. ${p.quotaPerDay} sponsored transactions per stamp per day. ${p.environment === "test" ? "TEST policy: not for real rewards." : "LIVE policy."}`,
  };
}

function fail(chain: ChainName): never {
  throw new RegistryNotDeployedError(chain);
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
