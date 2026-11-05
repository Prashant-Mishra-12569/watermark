import { createHash } from "node:crypto";

export function hex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}

export function unhex(s: string): Uint8Array {
  const clean = s.startsWith("0x") ? s.slice(2) : s;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) throw new Error("bad hex");
  return new Uint8Array(Buffer.from(clean, "hex"));
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(Buffer.concat(parts));
}

export function sha1(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha1").update(data).digest());
}

export function toBigInt(b: Uint8Array): bigint {
  return b.length === 0 ? 0n : BigInt("0x" + hex(b));
}

/** Big-endian bytes, left-padded to `len`. */
export function fromBigInt(x: bigint, len: number): Uint8Array {
  let s = x.toString(16);
  if (s.length % 2) s = "0" + s;
  if (s.length / 2 > len) throw new Error("value too large");
  return unhex(s.padStart(len * 2, "0"));
}

export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return result;
}

export function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Encode one BER-TLV with a 1- or 2-byte tag given as hex. */
export function tlv(tag: string, value: Uint8Array): Uint8Array {
  const t = unhex(tag);
  const len = value.length;
  const l =
    len < 0x80 ? Uint8Array.of(len) : len < 0x100 ? Uint8Array.of(0x81, len) : Uint8Array.of(0x82, len >> 8, len & 0xff);
  return concat(t, l, value);
}

/** BCD-encode digits, right-padded with F nibbles to `len` bytes. */
export function bcdPadF(digits: string, len: number): Uint8Array {
  if (!/^\d*$/.test(digits) || digits.length > len * 2) throw new Error("bad digits");
  return unhex(digits.padEnd(len * 2, "F"));
}

/** Decode BCD digits, stopping at the first F nibble. */
export function bcdDigits(b: Uint8Array): string {
  const s = hex(b).toUpperCase();
  const f = s.indexOf("F");
  return f === -1 ? s : s.slice(0, f);
}
