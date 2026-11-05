/**
 * Poseidon2 (BN254) exactly as the circuit computes it: noir-lang/poseidon `Poseidon2::hash(inputs, len)`.
 * Backed by Barretenberg's own implementation (bb.js), the same code the prover uses.
 * Cross-checked against values computed by the circuit itself in zk.test.ts.
 */
import { BarretenbergSync } from "@aztec-foundation/bb.js";

let api: BarretenbergSync | undefined;

/** Must be awaited once before hashing. */
export async function initHash(): Promise<void> {
  api ??= await BarretenbergSync.initSingleton();
}

export const FIELD_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

export function toField32(x: bigint): Uint8Array {
  if (x < 0n || x >= FIELD_MODULUS) throw new Error("not a field element");
  const out = new Uint8Array(32);
  let v = x;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

export function fromBytes(b: Uint8Array): bigint {
  return b.length === 0 ? 0n : BigInt("0x" + Buffer.from(b).toString("hex"));
}

export function poseidon2(inputs: bigint[]): bigint {
  if (!api) throw new Error("call initHash() first");
  return fromBytes(api.poseidon2Hash({ inputs: inputs.map(toField32) }).hash);
}

export function fieldHex(x: bigint): `0x${string}` {
  return `0x${x.toString(16).padStart(64, "0")}`;
}
