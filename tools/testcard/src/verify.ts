/**
 * Reference verifier for the EMV offline data authentication chain (spec section H, steps 1-4).
 * The circuit proves exactly these checks. The phone and the prover run the same checks before proving.
 */
import { bcdDigits, concat, equal, hex, sha1, unhex } from "./bytes.ts";
import { rsaRecover } from "./rsa.ts";

export type OdaFailure =
  | "BAD_EXPONENT"
  | "BAD_LENGTH"
  | "ISSUER_HEADER"
  | "ISSUER_HASH"
  | "ICC_HEADER"
  | "ICC_HASH"
  | "PAN_MISMATCH"
  | "SDAD_HEADER"
  | "SDAD_HASH"
  | "UN_MISMATCH";

export interface OdaInput {
  caModulus: string;
  issuerCert: string;
  issuerRem: string;
  issuerExp: string;
  iccCert: string;
  iccRem: string;
  iccExp: string;
  staticData: string;
  sdad: string;
  termData: string;
  un: string;
}

export interface OdaResult {
  pan: string;
  issuerId: string;
  /** MMYY strings as found in the certificates. */
  issuerCertExpiry: string;
  iccCertExpiry: string;
  /** Month index (F1 formula) through which both certificates are valid. */
  validThroughMonth: number;
  iccModulus: string;
  dynamicDataLength: number;
}

export class OdaError extends Error {
  readonly code: OdaFailure;
  constructor(code: OdaFailure) {
    super(code);
    this.code = code;
  }
}

function fail(code: OdaFailure): never {
  throw new OdaError(code);
}

/** Inclusive byte range m[a..b], as written in spec H. */
function range(m: Uint8Array, a: number, b: number): Uint8Array {
  return m.slice(a, b + 1);
}

/** MMYY → month index: (YY) * 12 + (MM - 1), since the years are 20YY. */
export function mmyyToMonth(mmyy: string): number {
  const mm = Number.parseInt(mmyy.slice(0, 2), 10);
  const yy = Number.parseInt(mmyy.slice(2, 4), 10);
  return yy * 12 + (mm - 1);
}

function recover(cert: Uint8Array, modulus: Uint8Array): Uint8Array {
  if (cert.length !== modulus.length) fail("BAD_LENGTH");
  try {
    return rsaRecover(cert, modulus);
  } catch {
    return fail("BAD_LENGTH");
  }
}

export function verifyOda(input: OdaInput): OdaResult {
  if (input.issuerExp !== "03" || input.iccExp !== "03") fail("BAD_EXPONENT");
  const exp = unhex("03");

  // Step 1 · bank certificate, with the network key
  const nCA = unhex(input.caModulus);
  const issuerRem = unhex(input.issuerRem);
  const m = recover(unhex(input.issuerCert), nCA);
  const L1 = m.length;
  if (m[0] !== 0x6a || m[1] !== 0x02 || m[L1 - 1] !== 0xbc) fail("ISSUER_HEADER");
  if (!equal(sha1(concat(range(m, 1, L1 - 22), issuerRem, exp)), range(m, L1 - 21, L1 - 2))) fail("ISSUER_HASH");
  const NI = m[13]!;
  const nI = concat(range(m, 15, L1 - 22), issuerRem).slice(0, NI);
  if (nI.length !== NI) fail("BAD_LENGTH");
  const issuerId = bcdDigits(range(m, 2, 5));
  const issuerCertExpiry = hex(range(m, 6, 7));

  // Step 2 · card certificate, with the bank key
  const iccRem = unhex(input.iccRem);
  const c = recover(unhex(input.iccCert), nI);
  const L2 = c.length;
  if (c[0] !== 0x6a || c[1] !== 0x04 || c[L2 - 1] !== 0xbc) fail("ICC_HEADER");
  const staticData = unhex(input.staticData);
  if (!equal(sha1(concat(range(c, 1, L2 - 22), iccRem, exp, staticData)), range(c, L2 - 21, L2 - 2))) fail("ICC_HASH");
  const pan = bcdDigits(range(c, 2, 11));
  const iccCertExpiry = hex(range(c, 12, 13));
  const NIC = c[19]!;
  if (!pan.startsWith(issuerId)) fail("PAN_MISMATCH");
  const nC = concat(range(c, 21, L2 - 22), iccRem).slice(0, NIC);
  if (nC.length !== NIC) fail("BAD_LENGTH");

  // Step 3 · the card's signature, with the card key
  const s = recover(unhex(input.sdad), nC);
  const L3 = s.length;
  if (s[0] !== 0x6a || (s[1] !== 0x05 && s[1] !== 0x95) || s[L3 - 1] !== 0xbc) fail("SDAD_HEADER");
  const ldd = s[3]!;

  // Step 4 · freshness: the signature covers termData, which must start with this session's UN
  const termData = unhex(input.termData);
  if (input.un.length !== 8 || hex(termData.slice(0, 4)) !== input.un.toLowerCase()) fail("UN_MISMATCH");
  if (!equal(sha1(concat(range(s, 1, L3 - 22), termData)), range(s, L3 - 21, L3 - 2))) fail("SDAD_HASH");

  return {
    pan,
    issuerId,
    issuerCertExpiry,
    iccCertExpiry,
    validThroughMonth: Math.min(mmyyToMonth(issuerCertExpiry), mmyyToMonth(iccCertExpiry)),
    iccModulus: hex(nC),
    dynamicDataLength: ldd,
  };
}
