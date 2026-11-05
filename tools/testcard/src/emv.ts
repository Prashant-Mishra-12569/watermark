/**
 * Builders for the EMV ODA objects (spec section H, EMV Book 2 formats).
 * Used only to make the synthetic test card. A real card makes these itself.
 */
import { bcdPadF, concat, sha1, tlv, unhex } from "./bytes.ts";
import { modulusBytes, rsaSign, type RsaKey } from "./rsa.ts";

const BB = 0xbb;
const EXP3 = Uint8Array.of(0x03);

function pad(len: number): Uint8Array {
  return new Uint8Array(len).fill(BB);
}

/** Issuer (bank) public key certificate, tag 90, signed by the CA key. Header 6A 02, trailer BC. */
export function buildIssuerCert(opts: {
  ca: RsaKey;
  issuer: RsaKey;
  issuerIdDigits: string; // leftmost PAN digits (3-8), F padded to 4 bytes
  expiryMMYY: string;
  serial: Uint8Array; // 3 bytes
}): { cert: Uint8Array; remainder: Uint8Array } {
  const L = opts.ca.len;
  const field = L - 36;
  const nI = modulusBytes(opts.issuer);
  const inCert = nI.slice(0, Math.min(nI.length, field));
  const remainder = nI.slice(inCert.length);
  const body = concat(
    Uint8Array.of(0x02),
    bcdPadF(opts.issuerIdDigits, 4),
    unhex(opts.expiryMMYY),
    opts.serial,
    Uint8Array.of(0x01, 0x01, nI.length, 0x01),
    inCert,
    pad(field - inCert.length),
  );
  const hash = sha1(concat(body, remainder, EXP3));
  const block = concat(Uint8Array.of(0x6a), body, hash, Uint8Array.of(0xbc));
  return { cert: rsaSign(opts.ca, block), remainder };
}

/** ICC (card) public key certificate, tag 9F46, signed by the issuer key. Header 6A 04, trailer BC. */
export function buildIccCert(opts: {
  issuer: RsaKey;
  icc: RsaKey;
  pan: string;
  expiryMMYY: string;
  serial: Uint8Array;
  staticData: Uint8Array;
}): { cert: Uint8Array; remainder: Uint8Array } {
  const L = opts.issuer.len;
  const field = L - 42;
  const nC = modulusBytes(opts.icc);
  const inCert = nC.slice(0, Math.min(nC.length, field));
  const remainder = nC.slice(inCert.length);
  const body = concat(
    Uint8Array.of(0x04),
    bcdPadF(opts.pan, 10),
    unhex(opts.expiryMMYY),
    opts.serial,
    Uint8Array.of(0x01, 0x01, nC.length, 0x01),
    inCert,
    pad(field - inCert.length),
  );
  const hash = sha1(concat(body, remainder, EXP3, opts.staticData));
  const block = concat(Uint8Array.of(0x6a), body, hash, Uint8Array.of(0xbc));
  return { cert: rsaSign(opts.issuer, block), remainder };
}

/** Signed Dynamic Application Data, tag 9F4B, format 05, signed by the ICC key over termData (starts with UN). */
export function buildSdad(opts: { icc: RsaKey; dynamicData: Uint8Array; termData: Uint8Array }): Uint8Array {
  const L = opts.icc.len;
  const ldd = opts.dynamicData.length;
  const body = concat(Uint8Array.of(0x05, 0x01, ldd), opts.dynamicData, pad(L - ldd - 25));
  const hash = sha1(concat(body, opts.termData));
  return rsaSign(opts.icc, concat(Uint8Array.of(0x6a), body, hash, Uint8Array.of(0xbc)));
}

/**
 * The single ODA record (SFI 1, record 3) as a 70 template. Synthetic tags only.
 * Its value (without 70 and the length) is what goes into the static data.
 */
export function buildOdaRecord(pan: string, appExpiryYYMMDD: string, valueLen = 181): Uint8Array {
  const fixed = concat(
    tlv("5A", bcdPadF(pan, Math.ceil(pan.length / 2))),
    tlv("5F24", unhex(appExpiryYYMMDD)),
    tlv("5F25", unhex("260101")),
    tlv("5F28", unhex("0356")),
    tlv("9F07", unhex("FF00")),
    tlv("8E", unhex("000000000000000042031E031F00")),
  );
  // Pad with a proprietary filler tag so the record value has the same length as on our real cards.
  const room = valueLen - fixed.length;
  // DF70 + length: 1 byte for up to 127 bytes, otherwise 81 xx
  const fillerLen = room - 3 <= 0x7f ? room - 3 : room - 4;
  if (fillerLen < 0 || fillerLen > 0xff) throw new Error("record size out of range");
  const record = concat(fixed, tlv("DF70", new Uint8Array(fillerLen)));
  if (record.length !== valueLen) throw new Error("record size mismatch");
  return record;
}
