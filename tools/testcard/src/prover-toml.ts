/**
 * Builds the circuit's Prover.toml from a card tap (interfaces F2) plus the network CA modulus.
 * The prover service uses the same mapping. Never write a real card's Prover.toml into the repo.
 *
 *   node src/prover-toml.ts [fixture.json] [validUntilMonth] [un-override] > ../../circuits/Prover.toml
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toBigInt, unhex } from "./bytes.ts";
import { verifyOda } from "./verify.ts";

/** noir-bignum Barrett parameter: floor(2^(2 * bits + 6) / n), as N little-endian 120-bit limbs. */
export function redcLimbs(modulusHex: string, bits: number, limbs: number): string[] {
  const n = toBigInt(unhex(modulusHex));
  if (n.toString(2).length !== bits) throw new Error(`modulus is not ${bits} bits`);
  let redc = (1n << BigInt(2 * bits + 6)) / n;
  const out: string[] = [];
  for (let i = 0; i < limbs; i++) {
    out.push("0x" + (redc & ((1n << 120n) - 1n)).toString(16));
    redc >>= 120n;
  }
  if (redc !== 0n) throw new Error("redc does not fit");
  return out;
}

const bytes = (h: string) => `[${Array.from(unhex(h)).join(", ")}]`;
const strs = (a: string[]) => `[${a.map((x) => `"${x}"`).join(", ")}]`;

export interface CircuitInputs {
  caModulus: string;
  card: { issuerCert: string; iccCert: string; staticData: string; sdad: string; un: string } & Record<string, string>;
}

export function proverToml(f: CircuitInputs, validUntilMonth: number, unOverride?: string): string {
  // The recovered keys are needed for the Barrett parameters; this also refuses a broken tap early.
  const chain = verifyOda({ ...(f.card as never), caModulus: f.caModulus });
  const issuerModulus = recoverIssuerModulus(f);
  const un = unOverride ?? f.card.un;
  return [
    `ca_root = "0"`,
    `rules_root = "0"`,
    `app_id = "0"`,
    `un = "0x${un}"`,
    `nullifier = "0"`,
    `valid_until_month = "${validUntilMonth}"`,
    `n_ca = ${bytes(f.caModulus)}`,
    `ca_redc = ${strs(redcLimbs(f.caModulus, 1984, 17))}`,
    `issuer_cert = ${bytes(f.card.issuerCert)}`,
    `issuer_redc = ${strs(redcLimbs(issuerModulus, 1408, 12))}`,
    `icc_cert = ${bytes(f.card.iccCert)}`,
    `static_data = ${bytes(f.card.staticData)}`,
    `icc_redc = ${strs(redcLimbs(chain.iccModulus, 768, 7))}`,
    `sdad = ${bytes(f.card.sdad)}`,
    "",
  ].join("\n");
}

/** Bank key = bytes 15..15+176 of the recovered bank certificate (no remainder in this profile). */
function recoverIssuerModulus(f: CircuitInputs): string {
  const n = toBigInt(unhex(f.caModulus));
  const s = toBigInt(unhex(f.card.issuerCert));
  const m = ((s * s) % n) * s % n;
  const hex = m.toString(16).padStart(496, "0");
  const ni = Number.parseInt(hex.slice(26, 28), 16);
  return hex.slice(30, 30 + ni * 2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] || new URL("../fixtures/rupay-768.json", import.meta.url);
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  process.stdout.write(proverToml(fixture, Number(process.argv[3] || 325), process.argv[4] || undefined));
}
