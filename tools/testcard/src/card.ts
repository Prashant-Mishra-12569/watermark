/**
 * A synthetic RuPay-shaped card. It uses the same key sizes and record layout as the real cards we tested
 * (CA 1984-bit → bank 1408-bit → card 768-bit, all e=3; static data 183 bytes; 25 bytes of dynamic data).
 * Every key and number here is made up, so it is safe to commit.
 */
import { randomBytes } from "node:crypto";
import type { CardData } from "@watermark/sdk";
import { concat, hex, unhex } from "./bytes.ts";
import { buildIccCert, buildIssuerCert, buildOdaRecord, buildSdad } from "./emv.ts";
import { generateRsaKey, modulusBytes, type RsaKey } from "./rsa.ts";

/** A fake BIN: the 99 prefix is not used by any payment network. */
export const TEST_BIN = "990001";
export const RUPAY_AID = "A0000005241010";
export const TEST_CA_INDEX = "F1"; // not a production CA index
export const AIP = "1900";

export const RUPAY_SIZES = { caBits: 1984, issuerBits: 1408, iccBits: 768 } as const;

/** Luhn check digit for a digit string. */
export function luhnDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let d = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

/** 16-digit synthetic PAN built from parts, so no full card-number literal appears in the source. */
export function testPan(account = "000012345"): string {
  const body = TEST_BIN + account;
  return body + luhnDigit(body);
}

export interface TestCardOptions {
  pan?: string;
  /** Digits placed in the bank certificate; normally the BIN. */
  issuerIdDigits?: string;
  issuerExpiryMMYY?: string;
  iccExpiryMMYY?: string;
}

export interface TestCard {
  caIndex: string;
  caModulus: string;
  pan: string;
  /** Simulates GET PROCESSING OPTIONS with this UN: the card signs a fresh SDAD. */
  tap(un: string): CardData;
}

export interface TestCardKeys {
  ca: RsaKey;
  issuer: RsaKey;
  icc: RsaKey;
}

export function generateKeys(): TestCardKeys {
  return {
    ca: generateRsaKey(RUPAY_SIZES.caBits),
    issuer: generateRsaKey(RUPAY_SIZES.issuerBits),
    icc: generateRsaKey(RUPAY_SIZES.iccBits),
  };
}

export function createTestCard(opts: TestCardOptions = {}, keys: TestCardKeys = generateKeys()): TestCard {
  const pan = opts.pan ?? testPan();
  const issuerIdDigits = opts.issuerIdDigits ?? pan.slice(0, 6);
  const recordValue = buildOdaRecord(pan, "301231");
  const staticData = concat(recordValue, unhex(AIP)); // tag 9F4A = 82, so the AIP is appended

  const issuerCert = buildIssuerCert({
    ca: keys.ca,
    issuer: keys.issuer,
    issuerIdDigits,
    expiryMMYY: opts.issuerExpiryMMYY ?? "1230",
    serial: unhex("000001"),
  });
  const iccCert = buildIccCert({
    issuer: keys.issuer,
    icc: keys.icc,
    pan,
    expiryMMYY: opts.iccExpiryMMYY ?? "1229",
    serial: unhex("000001"),
    staticData,
  });

  return {
    caIndex: TEST_CA_INDEX,
    caModulus: hex(modulusBytes(keys.ca)),
    pan,
    tap(un: string): CardData {
      if (!/^[0-9a-fA-F]{8}$/.test(un)) throw new Error("UN must be 4 bytes of hex");
      // 25 bytes of ICC dynamic data: length + 8-byte ICC dynamic number + 16 bytes of card state.
      const dynamicData = concat(Uint8Array.of(0x08), randomBytes(8), new Uint8Array(16));
      const termData = unhex(un); // RuPay fDDA: termData is just the UN
      const sdad = buildSdad({ icc: keys.icc, dynamicData, termData });
      return {
        aid: RUPAY_AID,
        un: un.toLowerCase(),
        caIndex: TEST_CA_INDEX,
        issuerCert: hex(issuerCert.cert),
        issuerRem: hex(issuerCert.remainder),
        issuerExp: "03",
        iccCert: hex(iccCert.cert),
        iccRem: hex(iccCert.remainder),
        iccExp: "03",
        staticData: hex(staticData),
        sdad: hex(sdad),
        sigPath: "GPO_FDDA",
        termData: hex(termData),
      };
    },
  };
}
