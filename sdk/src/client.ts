/**
 * Watermark SDK (spec section P). Browser-safe: no fs, no proving code.
 * A stamp means "this wallet was linked to one real bank card that passed this app's filter".
 * It is not identity, KYC, age, balance or one-person-one-vote.
 */
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { altmempoolDevnet, whitechainSepolia } from "./chains.ts";
import { WATERMARK_REGISTRY_ABI } from "./registry.ts";
import { NETWORK_ID, type Network, type Policy, type PolicyLeaf } from "./types.ts";

export type ChainName = "whitechain" | "devnet";

export const MAX_CHECK_MANY = 200;

/** Honest status of non-RuPay cards (see supportedCards). */
export const VISA_MASTERCARD_NOT_LIVE =
  "Visa and Mastercard: planned, not live. These filters can be drafted and registered, but no card can be proven " +
  "for them yet: each network needs its own circuit profile, plugged in through the VerifierRouter. Today only " +
  "RuPay debit cards (CA 1984 / bank 1408 / card 768-bit keys, exponent 3) can stamp.";

export interface CardSupport {
  network: "RUPAY" | "VISA" | "MASTERCARD";
  status: "live" | "planned";
  detail: string;
}

/** What can be proven today. Honest by design: "planned" means no proof can be made yet. */
export function supportedCards(): CardSupport[] {
  return [
    {
      network: "RUPAY",
      status: "live",
      detail:
        "RuPay debit cards whose chip uses the RuPay CA key 05 with the 1984/1408/768-bit, exponent-3 key profile " +
        "(fast DDA at GET PROCESSING OPTIONS). Verified on real RuPay cards. Other RuPay key sizes need another profile.",
    },
    { network: "VISA", status: "planned", detail: VISA_MASTERCARD_NOT_LIVE },
    { network: "MASTERCARD", status: "planned", detail: VISA_MASTERCARD_NOT_LIVE },
  ];
}
export const RULES_TREE_CAPACITY = 8192; // depth 13 (interfaces F4)

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

/**
 * Link that sends a user to the website's /verify page for this app (web/src/app/verify reads ?app= and ?chain=).
 * The page stamps its own browser wallet and shows its last 4 characters, so the user compares that with their
 * phone. `wallet` is validated (for callers that track it) but is not sent: the page never takes a wallet from the URL.
 */
export function verifyLink(
  appId: string | bigint,
  wallet: string | null,
  siteUrl: string,
  chain: ChainName = "whitechain",
): string {
  if (wallet !== null) parseWallet(wallet);
  const base = new URL(siteUrl);
  if (base.protocol !== "https:" && base.protocol !== "http:") throw new Error("siteUrl must be http(s)");
  const u = new URL("verify", base.href.endsWith("/") ? base.href : `${base.href}/`);
  u.searchParams.set("app", parseAppId(appId).toString());
  if (chain === "devnet") u.searchParams.set("chain", String(altmempoolDevnet.id));
  return u.toString();
}

/** What the B2B functions below need from viem. A PublicClient satisfies it; tests pass a mock. */
export interface ChainReader {
  readContract(args: {
    address: Address;
    abi: typeof WATERMARK_REGISTRY_ABI;
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
  getContractEvents(args: {
    address: Address;
    abi: typeof WATERMARK_REGISTRY_ABI;
    eventName: "Stamped";
    args?: { appId?: bigint };
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<readonly { args: unknown; blockNumber: bigint | null; transactionHash: Hex | null }[]>;
  getBlockNumber(): Promise<bigint>;
}

/**
 * Whitechain's official RPC answers bounded eth_getLogs ranges. The Ankr RPC (the chain's default) refuses a
 * range from block 0, so history always starts at the deploy block and is read in chunks.
 */
export const LOGS_RPC: Record<ChainName, string | undefined> = {
  whitechain: "https://rpc.testnet.whitechain.io",
  devnet: undefined,
};

export interface ReadOptions {
  chain?: ChainName;
  registry?: Address;
  rpcUrl?: string;
  client?: ChainReader;
  now?: () => number;
}

function chainReader(opts: ReadOptions, forLogs = false): ChainReader {
  if (opts.client) return opts.client;
  const name = opts.chain ?? "whitechain";
  const url = opts.rpcUrl ?? (forLogs ? LOGS_RPC[name] : undefined);
  return createPublicClient({ chain: chainFor(name), transport: http(url) }) as unknown as ChainReader;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

export interface AppInfo {
  appId: string;
  exists: boolean;
  owner: Address;
  rulesRoot: Hex;
  /** Signs the sessions behind every stamp in this app: it decides who can start a verification. */
  sessionSigner: Address;
}

/** An app's on-chain record: owner, filter root and session signer. Anyone can read it. */
export async function appInfo(appId: string | bigint, opts: ReadOptions = {}): Promise<AppInfo> {
  const registry = opts.registry ?? fail(opts.chain ?? "whitechain");
  const id = parseAppId(appId);
  const [owner, rulesRoot, sessionSigner] = (await chainReader(opts).readContract({
    address: registry,
    abi: WATERMARK_REGISTRY_ABI,
    functionName: "apps",
    args: [id],
  })) as readonly [Address, Hex, Address];
  return { appId: id.toString(), exists: owner !== ZERO_ADDRESS, owner, rulesRoot, sessionSigner };
}

export interface StampRecord {
  wallet: Address;
  /** Unix seconds. */
  expiresAt: number;
  block: number;
  tx: Hex | null;
}

export interface StampHistory {
  appId: string;
  fromBlock: number;
  toBlock: number;
  /** Stamped events, renewals included. */
  total: number;
  uniqueWallets: number;
  /** Of the newest wallets re-checked with isStamped (at most 200), how many are live now. */
  active: number;
  checked: number;
  /** Newest first, one row per event. */
  stamps: StampRecord[];
}

export interface HistoryOptions extends ReadOptions {
  /** The registry's deploy block. The node helper reads it from deployments/; the browser must pass it. */
  fromBlock?: bigint;
  toBlock?: bigint;
  /** Block span per eth_getLogs call. */
  chunk?: number;
  /** How many of the newest wallets to re-check with isStamped (max 200). */
  recheck?: number;
}

/**
 * Every stamp an app has given, read from Stamped events in chunks (transparency: anyone can audit an app).
 * Only public on-chain data: wallets, expiries and transactions. No card data exists on-chain.
 */
export async function stampHistory(appId: string | bigint, opts: HistoryOptions = {}): Promise<StampHistory> {
  const registry = opts.registry ?? fail(opts.chain ?? "whitechain");
  if (opts.fromBlock === undefined) throw new Error("stampHistory needs fromBlock (the registry's deploy block)");
  const id = parseAppId(appId);
  const reader = chainReader(opts, true);
  const chunk = BigInt(Math.max(1, Math.floor(opts.chunk ?? 2000)));
  const from = opts.fromBlock;
  const to = opts.toBlock ?? (await reader.getBlockNumber());

  const stamps: StampRecord[] = [];
  for (let start = from; start <= to; start += chunk) {
    const end = start + chunk - 1n < to ? start + chunk - 1n : to;
    const logs = await reader.getContractEvents({
      address: registry,
      abi: WATERMARK_REGISTRY_ABI,
      eventName: "Stamped",
      args: { appId: id },
      fromBlock: start,
      toBlock: end,
    });
    for (const l of logs) {
      const a = l.args as { wallet: Address; appId?: bigint; expiresAt: bigint };
      if (a.appId !== undefined && a.appId !== id) continue; // a node or mock that ignores the topic filter
      stamps.push({
        wallet: getAddress(a.wallet),
        expiresAt: Number(a.expiresAt),
        block: Number(l.blockNumber ?? 0n),
        tx: l.transactionHash,
      });
    }
  }
  stamps.sort((x, y) => y.block - x.block);

  const newestFirst = [...new Set(stamps.map((s) => s.wallet))];
  const recheck = newestFirst.slice(0, Math.min(opts.recheck ?? MAX_CHECK_MANY, MAX_CHECK_MANY));
  const live = recheck.length
    ? await checkMany(recheck, id, {
        chain: opts.chain ?? "whitechain",
        registry,
        ...(opts.client ? { client: opts.client as unknown as StampReader } : {}),
        ...(opts.rpcUrl ? { rpcUrl: opts.rpcUrl } : {}),
        ...(opts.now ? { now: opts.now } : {}),
      })
    : {};

  return {
    appId: id.toString(),
    fromBlock: Number(from),
    toBlock: Number(to),
    total: stamps.length,
    uniqueWallets: newestFirst.length,
    active: Object.values(live).filter((r) => r.stamped).length,
    checked: recheck.length,
    stamps,
  };
}

/** appId = uint256(keccak256(abi.encode(owner, salt))) >> 8, as the registry's computeAppId (interfaces F5). */
export function computeAppId(owner: string, salt: Hex): bigint {
  const encoded = encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [parseWallet(owner), salt]);
  return BigInt(keccak256(encoded)) >> 8n;
}

export interface RegisterAppInput {
  /** The account that will send the transaction; it owns the app. */
  owner: string;
  /** Any 32 bytes; a new salt (or owner) gives a new appId. */
  salt: Hex;
  /** Poseidon2 root of the app's filter (watermark_draft_policy / tools/zk). Immutable for this appId. */
  rulesRoot: Hex;
  /** The address that signs this app's sessions (your relayer's session key). */
  sessionSigner: string;
  chain?: ChainName;
  registry?: Address;
}

export interface PreparedTx {
  to: Address;
  data: Hex;
  value: "0";
  chainId: number;
}

/**
 * An UNSIGNED registerApp transaction for a company's own app and filter. The owner reviews and signs it;
 * the SDK never holds a key or sends anything.
 */
export function prepareRegisterApp(input: RegisterAppInput): { tx: PreparedTx; appId: string; warnings: string[] } {
  const chain = input.chain ?? "whitechain";
  const registry = input.registry ?? fail(chain);
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.salt)) throw new Error("salt must be 32 bytes of 0x-hex");
  if (!/^0x[0-9a-fA-F]{64}$/.test(input.rulesRoot)) throw new Error("rulesRoot must be 32 bytes of 0x-hex");
  if (input.rulesRoot.toLowerCase() === ZERO_BYTES32) throw new Error("rulesRoot is zero: the registry refuses an empty filter");
  const signer = parseWallet(input.sessionSigner);
  if (signer === ZERO_ADDRESS) throw new Error("sessionSigner is the zero address: the registry refuses it");
  const owner = parseWallet(input.owner);
  return {
    tx: {
      to: registry,
      data: encodeFunctionData({
        abi: WATERMARK_REGISTRY_ABI,
        functionName: "registerApp",
        args: [input.salt, input.rulesRoot, signer],
      }),
      value: "0",
      chainId: chainFor(chain).id,
    },
    appId: computeAppId(owner, input.salt).toString(),
    warnings: [
      "Rules are immutable: a different filter needs a new appId (a new salt).",
      `The session signer ${signer} decides who can start a verification in this app. Keep its key on your relayer only.`,
      "Send this from the owner account: the appId depends on the sender.",
    ],
  };
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
  if (leaves.length > RULES_TREE_CAPACITY) throw new Error(`at most ${RULES_TREE_CAPACITY} leaves (tree depth 13)`);
  const untested = leaves.filter((l) => l.status !== "tested").length;
  if (untested) warnings.push(`${untested} leaf/leaves are "listed" (from a BIN list), not tested with a real card.`);
  if (networks.has("VISA") || networks.has("MASTERCARD")) {
    warnings.push(VISA_MASTERCARD_NOT_LIVE);
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
