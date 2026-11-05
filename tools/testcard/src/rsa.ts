import { generateKeyPairSync } from "node:crypto";
import { fromBigInt, modPow, toBigInt } from "./bytes.ts";

/** EMV only uses exponent 3 here. Any other exponent is rejected by the verifier and the circuit. */
export const EMV_EXPONENT = 3n;

export interface RsaKey {
  n: bigint;
  d: bigint;
  /** Modulus length in bytes. */
  len: number;
}

export function generateRsaKey(bits: number): RsaKey {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: bits, publicExponent: 3 });
  const jwk = privateKey.export({ format: "jwk" });
  if (!jwk.n || !jwk.d || jwk.e !== "Aw") throw new Error("unexpected RSA key");
  const nBytes = new Uint8Array(Buffer.from(jwk.n, "base64url"));
  return { n: toBigInt(nBytes), d: toBigInt(new Uint8Array(Buffer.from(jwk.d, "base64url"))), len: nBytes.length };
}

export function modulusBytes(key: { n: bigint; len: number }): Uint8Array {
  return fromBigInt(key.n, key.len);
}

/** Raw RSA private operation (EMV "signing"): block^d mod n. The block must be the modulus length. */
export function rsaSign(key: RsaKey, block: Uint8Array): Uint8Array {
  if (block.length !== key.len) throw new Error(`block must be ${key.len} bytes`);
  return fromBigInt(modPow(toBigInt(block), key.d, key.n), key.len);
}

/** Raw RSA public recovery with e = 3: x^3 mod n, left-padded to the modulus length. */
export function rsaRecover(sig: Uint8Array, modulus: Uint8Array): Uint8Array {
  const n = toBigInt(modulus);
  const x = toBigInt(sig);
  if (sig.length !== modulus.length || x >= n) throw new Error("signature length or range");
  return fromBigInt(modPow(x, EMV_EXPONENT, n), modulus.length);
}
