/** Relayer configuration, read once from the environment (see .env.example). Secrets never leave this module. */
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { altmempoolDevnet, USDT_WHITECHAIN, whitechainSepolia } from "@watermark/sdk";
import { parseUsdt } from "./usdt.ts";

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  /** WatermarkRegistry on this chain. Sessions for a chain are refused until it is set. */
  registry: Address | null;
  /** WatermarkSponsor (Whitechain only): quotaLeft and POST /pay. null = /pay answers 503 SPONSOR_NOT_CONFIGURED. */
  sponsor: Address | null;
  /** The EIP-3009 token payments move (Whitechain USDT). null on chains without one. */
  usdt: Address | null;
}

export interface Config {
  port: number;
  sessionSignerKey: Hex;
  /** LAN URL of the prover, written into the QR (F1 `p`). */
  proverUrl: string;
  /** appIds this relayer signs sessions for (decimal strings). */
  appIds: Set<string>;
  chains: Map<number, ChainConfig>;
  /** true = no request logs at all. */
  demoMode: boolean;
  /** Browser origins allowed by CORS. */
  corsOrigins: string[];
  sessionsPerMinutePerIp: number;
  maxOpenSessions: number;
  /** Pays gas for stamps and payments. null = POST /stamp and POST /pay answer 503 RELAYER_NOT_CONFIGURED. */
  relayerKey: Hex | null;
  /** The business wallet that funds demo users (POST /fund). null = /fund answers 503 FUND_NOT_CONFIGURED. */
  businessKey: Hex | null;
  stamp: StampConfig;
  pay: PayConfig;
  pass: PassConfig;
  /** Deprecated settings that were still honoured; index.ts prints them at startup. */
  warnings: string[];
}

/** POST /stamp drain protection (spec K layers 1, 4, 5). */
export interface StampConfig {
  /** Daily stamp budget in wei, per chain, reset at 00:00 UTC (STAMP_BUDGET_WEI). Separate from the payment budget. */
  budgetWei: bigint;
  /** Refuse GAS_CAP when the estimate is above this (MAX_GAS_PER_STAMP). A stamp is ~2.9M gas with the real verifier. */
  maxGas: bigint;
  perMinutePerIp: number;
  /** Stamps waiting or in flight per chain before BUSY (STAMP_MAX_QUEUE). */
  maxQueue: number;
  receiptTimeoutMs: number;
}

/** Sponsored payments (POST /pay, spec K layers 4 and 5). Kept apart from stamps: a stamp costs ~10× a payment. */
export interface PayConfig {
  /** Daily payment budget in wei, per chain, reset at 00:00 UTC (DAILY_BUDGET_WEI). */
  budgetWei: bigint;
  /** Refuse GAS_CAP when a payment's estimate is above this (MAX_GAS_PER_PAY). */
  maxGas: bigint;
  /** Largest payment in USDT base units (PAY_MAX_USDT, default 5 USDT). */
  maxValue: bigint;
  /** What POST /fund sends once per wallet per relayer run, in USDT base units (DEMO_FUND_USDT, default 2 USDT). */
  demoFund: bigint;
  /** POST /pay and POST /fund requests per IP per minute (PAYS_PER_MINUTE_PER_IP). */
  perMinutePerIp: number;
  /**
   * Sponsored relays that were mined but reverted, per wallet per UTC day, before the wallet is refused QUOTA_USED
   * (PAY_MAX_REVERTS_PER_WALLET). The sponsor's quota counts successful payments only (review finding SPONSOR-1).
   */
  maxRevertsPerWallet: number;
  /** PAY_PAUSED=true: every POST /pay is refused PAUSED (an operator switch; nothing else changes). */
  paused: boolean;
}

/** Watermark Genesis Pass (POST /pass, GET /pass/:wallet). Runs on the chain that has the sponsor. */
export interface PassConfig {
  /** WatermarkGenesisPass (GENESIS_PASS_ADDRESS). null = /pass answers 503 PASS_NOT_CONFIGURED. */
  address: Address | null;
  /**
   * First block scanned for the sponsor's PaymentRelayed events (PASS_FROM_BLOCK). Default: the sponsor's deploy
   * block when SPONSOR_ADDRESS is a known sponsor (KNOWN_SPONSOR_DEPLOY_BLOCKS), else null (= the last
   * PASS_LOOKBACK_BLOCKS).
   */
  fromBlock: bigint | null;
  /** How far back to scan when fromBlock is null (PASS_LOOKBACK_BLOCKS, default 50000). */
  lookbackBlocks: bigint;
  /** Blocks per eth_getLogs call (PASS_LOGS_CHUNK_BLOCKS, default 1000: Ankr's Whitechain RPC refuses 2000). */
  logsChunkBlocks: bigint;
  /** Refuse GAS_CAP when a mint's estimate is above this (MAX_GAS_PER_PASS). */
  maxGas: bigint;
  /** Daily mint budget in wei, reset at 00:00 UTC (PASS_BUDGET_WEI). Separate from stamps and payments. */
  budgetWei: bigint;
  /** POST /pass requests per IP per minute (PASSES_PER_MINUTE_PER_IP). */
  perMinutePerIp: number;
}

/**
 * Deploy blocks of known sponsors on Whitechain Sepolia (read from each deploy tx's receipt): no PaymentRelayed event
 * can be older. The pass's payment task counts only payments through SPONSOR_ADDRESS, so the scan starts at that
 * sponsor's deploy block. pass.test.ts checks that deployments/whitechain.json's "sponsor" is listed here.
 */
export const KNOWN_SPONSOR_DEPLOY_BLOCKS: Readonly<Record<string, bigint>> = {
  // Current sponsor, bound to the current live app: tx 0x64e89664…1e9c (deployments/whitechain.json txHashes.sponsor).
  "0x21b6ae18a412afb84a09263939c5e787d374939a": 12_378_949n,
  // Previous sponsor (first live app, before the stricter filter): tx 0x8def6437…ac8c (txHashes.previousSponsor).
  "0xabd7327f6e6b884aef395b80de073b8add0ad7ba": 12_369_271n,
};
export const DEFAULT_PASS_LOOKBACK_BLOCKS = 50_000n;
export const DEFAULT_PASS_LOGS_CHUNK_BLOCKS = 1_000n;
/** A mint with an on-chain SVG stays well under this; the cap only stops a runaway estimate. */
export const DEFAULT_MAX_GAS_PER_PASS = 500_000n;
/**
 * 0.1 WBT: all 100 mints in one UTC day with room to spare. A mint used 120,584 gas on a Whitechain fork (gas limit
 * 144,700 after the 1.2x estimate margin); at Whitechain's ~5 gwei that is ~0.0006-0.0007 WBT each, ~0.07 WBT for 100.
 * Set PASS_BUDGET_WEI to change it.
 */
export const DEFAULT_PASS_BUDGET_WEI = 100_000_000_000_000_000n;

/** 0.1 WBT: ~6 stamps at 3M gas and 5 gwei. Set STAMP_BUDGET_WEI to change it. */
export const DEFAULT_STAMP_BUDGET_WEI = 100_000_000_000_000_000n;
export const DEFAULT_MAX_GAS_PER_STAMP = 3_500_000n;
/** 0.1 WBT: ~200 payments at 100k gas and 5 gwei. Set DAILY_BUDGET_WEI to change it. */
export const DEFAULT_DAILY_BUDGET_WEI = 100_000_000_000_000_000n;
export const DEFAULT_MAX_GAS_PER_PAY = 300_000n;
export const DEFAULT_PAY_MAX_USDT = "5";
export const DEFAULT_DEMO_FUND_USDT = "2";

function usdtAmount(name: string, env: NodeJS.ProcessEnv, fallback: string): bigint {
  const v = env[name]?.trim() || fallback;
  const units = parseUsdt(v);
  if (units === null || units <= 0n) throw new Error(`${name} must be a positive USDT amount like 5 or 1.5 (6 decimals at most)`);
  return units;
}

function privateKey(name: string, env: NodeJS.ProcessEnv): Hex | null {
  const v = env[name]?.trim();
  if (!v) return null;
  if (!isHex(v) || v.length !== 66) throw new Error(`${name} must be a 32-byte 0x-hex private key`);
  return v as Hex;
}

function wei(name: string, env: NodeJS.ProcessEnv, fallback: bigint): bigint {
  const v = env[name]?.trim();
  if (!v) return fallback;
  if (!/^\d{1,78}$/.test(v)) throw new Error(`${name} must be a decimal integer`);
  return BigInt(v);
}

function positiveGas(name: string, env: NodeJS.ProcessEnv, fallback: bigint): bigint {
  const g = wei(name, env, fallback);
  if (g <= 0n) throw new Error(`${name} must be positive`);
  return g;
}

/**
 * Renamed settings. MAX_GAS_PER_TX (one cap for everything) became MAX_GAS_PER_PAY plus MAX_GAS_PER_STAMP, and the
 * pre-release STAMP_MAX_GAS became MAX_GAS_PER_STAMP. An old name is still honoured when the new one is unset, with a
 * startup warning, so an existing .env keeps working; it can never raise the stamp cap through MAX_GAS_PER_TX.
 */
function renamed(env: NodeJS.ProcessEnv, warnings: string[]): NodeJS.ProcessEnv {
  const out = { ...env };
  for (const [oldName, newName] of [
    ["MAX_GAS_PER_TX", "MAX_GAS_PER_PAY"],
    ["STAMP_MAX_GAS", "MAX_GAS_PER_STAMP"],
  ] as const) {
    if (!env[oldName]?.trim()) continue;
    if (env[newName]?.trim()) {
      warnings.push(`${oldName} is ignored: ${newName} is set (${oldName} was renamed to ${newName})`);
    } else {
      out[newName] = env[oldName];
      warnings.push(`${oldName} was renamed to ${newName}; using its value. Rename it in .env`);
    }
  }
  return out;
}

function positiveInt(name: string, env: NodeJS.ProcessEnv, fallback: number): number {
  const v = env[name]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${name} must be a positive integer`);
  return n;
}

function optionalAddress(name: string, env: NodeJS.ProcessEnv): Address | null {
  const v = env[name]?.trim();
  if (!v) return null;
  if (!isAddress(v)) throw new Error(`${name} is not an address`);
  return getAddress(v);
}

export function loadConfig(rawEnv: NodeJS.ProcessEnv = process.env): Config {
  const warnings: string[] = [];
  const env = renamed(rawEnv, warnings);
  const key = env.SESSION_SIGNER_KEY?.trim();
  if (!key || !isHex(key) || key.length !== 66) {
    throw new Error("SESSION_SIGNER_KEY must be set to a 32-byte 0x-hex private key (in .env, never committed)");
  }
  const proverUrl = env.PROVER_URL?.trim();
  if (!proverUrl) throw new Error("PROVER_URL must be set (the prover's LAN URL, e.g. http://192.168.x.x:8787)");

  const appIds = new Set(
    (env.APP_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const id of appIds) {
    if (!/^\d+$/.test(id) || BigInt(id) >= 1n << 248n) throw new Error(`APP_IDS: ${id} is not a 248-bit decimal`);
  }
  if (appIds.size === 0) throw new Error("APP_IDS must list at least one appId (comma-separated decimals)");

  const chains = new Map<number, ChainConfig>([
    [
      whitechainSepolia.id,
      {
        chainId: whitechainSepolia.id,
        rpcUrl: env.WHITECHAIN_RPC?.trim() || whitechainSepolia.rpcUrls.default.http[0],
        registry: optionalAddress("REGISTRY_ADDRESS", env),
        sponsor: optionalAddress("SPONSOR_ADDRESS", env),
        usdt: optionalAddress("USDT_ADDRESS", env) ?? USDT_WHITECHAIN,
      },
    ],
    [
      altmempoolDevnet.id,
      {
        chainId: altmempoolDevnet.id,
        rpcUrl: env.ALTMEMPOOL_EXEC_RPC?.trim() || altmempoolDevnet.rpcUrls.default.http[0],
        registry: optionalAddress("DEVNET_REGISTRY_ADDRESS", env),
        sponsor: null,
        usdt: null,
      },
    ],
  ]);

  const sponsorAddress = chains.get(whitechainSepolia.id)?.sponsor ?? null;
  const sponsorDeployBlock = sponsorAddress ? (KNOWN_SPONSOR_DEPLOY_BLOCKS[sponsorAddress.toLowerCase()] ?? null) : null;
  const passFromBlock = env.PASS_FROM_BLOCK?.trim() ? wei("PASS_FROM_BLOCK", env, 0n) : sponsorDeployBlock;
  if (passFromBlock !== null && sponsorDeployBlock !== null && passFromBlock > sponsorDeployBlock) {
    warnings.push(
      `PASS_FROM_BLOCK ${passFromBlock} is after the sponsor's deploy block ${sponsorDeployBlock}: ` +
        "earlier payments won't unlock the Genesis Pass. Leave it empty to use the deploy block",
    );
  }

  return {
    port: Number(env.RELAYER_PORT ?? 8788),
    sessionSignerKey: key as Hex,
    proverUrl,
    appIds,
    chains,
    demoMode: env.DEMO_MODE !== "false",
    corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    sessionsPerMinutePerIp: Number(env.SESSIONS_PER_MINUTE_PER_IP ?? 10),
    maxOpenSessions: Number(env.MAX_OPEN_SESSIONS ?? 5000),
    relayerKey: privateKey("RELAYER_PRIVATE_KEY", env),
    businessKey: privateKey("BUSINESS_PRIVATE_KEY", env),
    stamp: {
      budgetWei: wei("STAMP_BUDGET_WEI", env, DEFAULT_STAMP_BUDGET_WEI),
      maxGas: positiveGas("MAX_GAS_PER_STAMP", env, DEFAULT_MAX_GAS_PER_STAMP),
      perMinutePerIp: positiveInt("STAMPS_PER_MINUTE_PER_IP", env, 30),
      maxQueue: positiveInt("STAMP_MAX_QUEUE", env, 20),
      receiptTimeoutMs: positiveInt("STAMP_RECEIPT_TIMEOUT_MS", env, 90_000),
    },
    pay: {
      budgetWei: wei("DAILY_BUDGET_WEI", env, DEFAULT_DAILY_BUDGET_WEI),
      maxGas: positiveGas("MAX_GAS_PER_PAY", env, DEFAULT_MAX_GAS_PER_PAY),
      maxValue: usdtAmount("PAY_MAX_USDT", env, DEFAULT_PAY_MAX_USDT),
      demoFund: usdtAmount("DEMO_FUND_USDT", env, DEFAULT_DEMO_FUND_USDT),
      perMinutePerIp: positiveInt("PAYS_PER_MINUTE_PER_IP", env, 10),
      maxRevertsPerWallet: positiveInt("PAY_MAX_REVERTS_PER_WALLET", env, 2),
      paused: env.PAY_PAUSED?.trim() === "true",
    },
    pass: {
      address: optionalAddress("GENESIS_PASS_ADDRESS", env),
      fromBlock: passFromBlock,
      lookbackBlocks: positiveGas("PASS_LOOKBACK_BLOCKS", env, DEFAULT_PASS_LOOKBACK_BLOCKS),
      logsChunkBlocks: positiveGas("PASS_LOGS_CHUNK_BLOCKS", env, DEFAULT_PASS_LOGS_CHUNK_BLOCKS),
      maxGas: positiveGas("MAX_GAS_PER_PASS", env, DEFAULT_MAX_GAS_PER_PASS),
      budgetWei: wei("PASS_BUDGET_WEI", env, DEFAULT_PASS_BUDGET_WEI),
      perMinutePerIp: positiveInt("PASSES_PER_MINUTE_PER_IP", env, 5),
    },
    warnings,
  };
}
