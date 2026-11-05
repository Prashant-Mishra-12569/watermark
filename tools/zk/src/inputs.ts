/**
 * Builds the circuit's private and public inputs (circuits/src/main.nr) from one tap (interfaces F2), the allowed
 * CA keys and the app's filter. The prover service and the test tools both use this; it never touches disk.
 */
import { verifyOda } from "@watermark/testcard";
import { fieldHex } from "./hash.ts";
import { caLeaf, CA_TREE_DEPTH, MerkleTree, nullifier, RULES_TREE_DEPTH, ruleLeaf } from "./tree.ts";

/** One allowed network CA key (a leaf of the CA tree). */
export interface CaEntry {
  networkId: number;
  /** Hex modulus, 1984-bit for the current circuit profile. */
  modulus: string;
}

/** One filter leaf of an app's policy (interfaces F8). */
export interface RuleEntry {
  networkId: number;
  prefixLength: 6 | 8;
  prefix: string;
}

export interface CardTap {
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

export type InputMap = Record<string, string | number | (string | number)[]>;

export class PolicyError extends Error {
  readonly code: "NOT_IN_POLICY" | "EXPIRES_TOO_SOON" | "UNSUPPORTED_CARD";
  constructor(code: "NOT_IN_POLICY" | "EXPIRES_TOO_SOON" | "UNSUPPORTED_CARD") {
    super(code);
    this.code = code;
  }
}

export function caTree(cas: CaEntry[]): MerkleTree {
  return new MerkleTree(CA_TREE_DEPTH, cas.map((c) => caLeaf(c.networkId, Buffer.from(c.modulus, "hex"))));
}

export function rulesTree(rules: RuleEntry[]): MerkleTree {
  return new MerkleTree(RULES_TREE_DEPTH, rules.map((r) => ruleLeaf(r.networkId, r.prefixLength, r.prefix)));
}

/** noir-bignum Barrett parameter floor(2^(2*bits+6) / n), as N little-endian 120-bit limbs. */
export function redcLimbs(modulusHex: string, bits: number, limbs: number): string[] {
  const n = BigInt("0x" + modulusHex);
  if (n.toString(2).length !== bits) throw new PolicyError("UNSUPPORTED_CARD");
  let redc = (1n << BigInt(2 * bits + 6)) / n;
  const out: string[] = [];
  for (let i = 0; i < limbs; i++) {
    out.push("0x" + (redc & ((1n << 120n) - 1n)).toString(16));
    redc >>= 120n;
  }
  return out;
}

const bytes = (h: string) => Array.from(Buffer.from(h, "hex"));
const fields = (xs: bigint[]) => xs.map((x) => fieldHex(x));

/**
 * Throws PolicyError if the card isn't allowed, so the prover refuses before proving.
 * Returns the inputs plus the nullifier the proof will expose.
 */
export function buildCircuitInputs(args: {
  tap: CardTap;
  caIndex: number;
  cas: CaEntry[];
  rules: RuleEntry[];
  appId: bigint;
  validUntilMonth: number;
}): { inputs: InputMap; nullifier: `0x${string}`; caRoot: `0x${string}`; rulesRoot: `0x${string}` } {
  const ca = args.cas[args.caIndex];
  if (!ca) throw new PolicyError("UNSUPPORTED_CARD");
  // Same checks the circuit makes, so a bad tap fails fast and with a clear reason
  const chain = verifyOda({ ...args.tap, caModulus: ca.modulus });
  if (ca.modulus.length !== 496 || chain.issuerModulus.length !== 352 || chain.iccModulus.length !== 192) {
    throw new PolicyError("UNSUPPORTED_CARD"); // the circuit is built for the RuPay 1984/1408/768 profile
  }
  if (args.tap.issuerRem !== "" || args.tap.iccRem !== "" || args.tap.staticData.length !== 366) {
    throw new PolicyError("UNSUPPORTED_CARD");
  }
  if (chain.validThroughMonth < args.validUntilMonth) throw new PolicyError("EXPIRES_TOO_SOON");

  const ruleIndex = args.rules.findIndex(
    (r) => r.networkId === ca.networkId && chain.pan.startsWith(r.prefix) && r.prefix.length === r.prefixLength,
  );
  if (ruleIndex < 0) throw new PolicyError("NOT_IN_POLICY");
  const rule = args.rules[ruleIndex]!;

  const caT = caTree(args.cas);
  const rulesT = rulesTree(args.rules);
  const n = nullifier(Buffer.from(chain.iccModulus, "hex"), args.appId);

  const inputs: InputMap = {
    ca_root: fieldHex(caT.root),
    rules_root: fieldHex(rulesT.root),
    app_id: fieldHex(args.appId),
    un: "0x" + args.tap.un,
    nullifier: fieldHex(n),
    valid_until_month: String(args.validUntilMonth),
    n_ca: bytes(ca.modulus),
    ca_redc: redcLimbs(ca.modulus, 1984, 17),
    issuer_cert: bytes(args.tap.issuerCert),
    issuer_redc: redcLimbs(chain.issuerModulus, 1408, 12),
    icc_cert: bytes(args.tap.iccCert),
    static_data: bytes(args.tap.staticData),
    icc_redc: redcLimbs(chain.iccModulus, 768, 7),
    sdad: bytes(args.tap.sdad),
    network_id: String(ca.networkId),
    ca_index: String(args.caIndex),
    ca_siblings: fields(caT.path(args.caIndex).siblings),
    prefix_length: rule.prefixLength,
    rule_index: String(ruleIndex),
    rule_siblings: fields(rulesT.path(ruleIndex).siblings),
  };
  return { inputs, nullifier: fieldHex(n), caRoot: fieldHex(caT.root), rulesRoot: fieldHex(rulesT.root) };
}
