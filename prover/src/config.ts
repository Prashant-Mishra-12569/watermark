/** Prover configuration, read once from the environment (see .env.example). The decrypt key never leaves this module. */
import { createPrivateKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getAddress, isAddress, type Address } from "viem";
import type { CaEntry, RuleEntry } from "@watermark/zk";

export interface AppPolicy {
  appId: bigint;
  rules: RuleEntry[];
  label: string;
  environment: string;
  rulesRoot: string;
}

export interface Config {
  port: number;
  decryptKey: KeyObject;
  circuitPath: string;
  /** Where finished proofs go (POST /stamp). Unset = keep the proof and report it (dev only). */
  relayerUrl: string | undefined;
  /** Allowed session signers. Until the registry is deployed, from ALLOWED_SESSION_SIGNERS. */
  sessionSigners: Set<string>;
  cas: CaEntry[];
  /** CA tree index by RID + CA index, e.g. "A000000524:05". */
  caIndexByKey: Map<string, number>;
  apps: Map<string, AppPolicy>;
  maxQueue: number;
  demoMode: boolean;
}

interface CaFile {
  keys: { rid: string; index: string; networkId: number; modulus: string; note?: string }[];
}

interface PolicyFile {
  appId: string;
  label?: string;
  environment?: string;
  rulesRoot?: string;
  leaves: { networkId: number; prefixLength: 6 | 8; prefix: string }[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, repoRoot = resolve(import.meta.dirname, "../..")): Config {
  const keyPath = env.PROVER_DECRYPT_KEY_PATH?.trim();
  if (!keyPath) throw new Error("PROVER_DECRYPT_KEY_PATH must point to the RSA private key, outside the repo");
  if (resolve(keyPath).startsWith(repoRoot)) throw new Error("PROVER_DECRYPT_KEY_PATH must be outside the repo");

  const signers = (env.ALLOWED_SESSION_SIGNERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const s of signers) if (!isAddress(s)) throw new Error(`ALLOWED_SESSION_SIGNERS: ${s} is not an address`);
  if (signers.length === 0) throw new Error("ALLOWED_SESSION_SIGNERS must list the relayer's session signer address");

  const caFile: CaFile = JSON.parse(readFileSync(resolve(repoRoot, env.CA_KEYS_PATH ?? "policies/ca-keys.json"), "utf8"));
  const cas = caFile.keys.map((k) => ({ networkId: k.networkId, modulus: k.modulus.toLowerCase() }));
  const caIndexByKey = new Map(caFile.keys.map((k, i) => [`${k.rid.toUpperCase()}:${k.index.toUpperCase()}`, i]));

  const apps = new Map<string, AppPolicy>();
  for (const file of (env.POLICY_FILES ?? "policies/test.json").split(",").map((s) => s.trim()).filter(Boolean)) {
    const p: PolicyFile = JSON.parse(readFileSync(resolve(repoRoot, file), "utf8"));
    if (!/^\d+$/.test(p.appId)) continue; // not registered yet
    apps.set(p.appId, {
      appId: BigInt(p.appId),
      rules: p.leaves.map((l) => ({ networkId: l.networkId, prefixLength: l.prefixLength, prefix: l.prefix })),
      label: p.label ?? "",
      environment: p.environment ?? "test",
      rulesRoot: p.rulesRoot ?? "",
    });
  }

  return {
    port: Number(env.PROVER_PORT ?? 8787),
    decryptKey: createPrivateKey(readFileSync(keyPath)),
    circuitPath: resolve(repoRoot, env.CIRCUIT_PATH ?? "circuits/target/watermark.json"),
    relayerUrl: env.RELAYER_URL?.trim() || undefined,
    sessionSigners: new Set(signers.map((s) => getAddress(s as Address))),
    cas,
    caIndexByKey,
    apps,
    maxQueue: Number(env.PROVER_MAX_QUEUE ?? 3),
    demoMode: env.DEMO_MODE !== "false",
  };
}
