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
}

function optionalAddress(name: string, env: NodeJS.ProcessEnv): Address | null {
  const v = env[name]?.trim();
  if (!v) return null;
  if (!isAddress(v)) throw new Error(`${name} is not an address`);
  return getAddress(v);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
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
  };
}
