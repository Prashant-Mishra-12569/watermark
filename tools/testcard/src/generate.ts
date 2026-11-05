/**
 * Writes fixtures/rupay-768.json: one synthetic tap plus the test CA modulus.
 * Usage: pnpm --filter @watermark/testcard generate
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createTestCard, RUPAY_SIZES } from "./card.ts";
import { verifyOda } from "./verify.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "fixtures");

// Fixed session nonce, so the UN in the fixture is reproducible: UN = sha256(nonce)[0..4]
const nonce = "0x" + "11".repeat(32);
const un = createHash("sha256").update(Buffer.from(nonce.slice(2), "hex")).digest("hex").slice(0, 8);

const card = createTestCard();
const tap = card.tap(un);
const check = verifyOda({ ...tap, caModulus: card.caModulus });

const fixture = {
  description: "Synthetic RuPay-shaped test card. All keys and numbers are made up; safe to commit.",
  sizes: RUPAY_SIZES,
  caIndex: card.caIndex,
  caModulus: card.caModulus,
  nonce,
  un,
  card: tap,
  expected: {
    issuerId: check.issuerId,
    validThroughMonth: check.validThroughMonth,
    staticDataBytes: tap.staticData.length / 2,
    dynamicDataLength: check.dynamicDataLength,
  },
};

mkdirSync(outDir, { recursive: true });
const file = join(outDir, "rupay-768.json");
writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n");
console.log(`wrote ${file} (un ${un}, verifies: yes)`);
