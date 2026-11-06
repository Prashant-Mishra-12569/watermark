/** Relayer configuration, read once from the environment (see .env.example). Secrets never leave this module. */
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { altmempoolDevnet, whitechainSepolia } from "@watermark/sdk";

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  /** WatermarkRegistry on this chain. Sessions for a chain are refused until it is set. */
  registry: Address | null;
  /** WatermarkSponsor (Whitechain only), for quotaLeft. */
  sponsor: Address | null;
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
  /** Pays gas for stamps. null = POST /stamp answers 503 RELAYER_NOT_CONFIGURED (sessions still work). */
  relayerKey: Hex | null;
  stamp: StampConfig;
  pay: PayConfig;
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
}

/** 0.1 WBT: ~6 stamps at 3M gas and 5 gwei. Set STAMP_BUDGET_WEI to change it. */
export const DEFAULT_STAMP_BUDGET_WEI = 100_000_000_000_000_000n;
export const DEFAULT_MAX_GAS_PER_STAMP = 3_500_000n;
/** 0.1 WBT: ~200 payments at 100k gas and 5 gwei. Set DAILY_BUDGET_WEI to change it. */
export const DEFAULT_DAILY_BUDGET_WEI = 100_000_000_000_000_000n;
export const DEFAULT_MAX_GAS_PER_PAY = 300_000n;

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
      },
    ],
    [
      altmempoolDevnet.id,
      {
        chainId: altmempoolDevnet.id,
        rpcUrl: env.ALTMEMPOOL_EXEC_RPC?.trim() || altmempoolDevnet.rpcUrls.default.http[0],
        registry: optionalAddress("DEVNET_REGISTRY_ADDRESS", env),
        sponsor: null,
      },
    ],
  ]);

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
    },
    warnings,
  };
}
