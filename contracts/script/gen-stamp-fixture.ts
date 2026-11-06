/**
 * Generates contracts/test/fixtures/synthetic-stamp.json: a REAL UltraHonk proof of the SYNTHETIC test card
 * (tools/testcard/fixtures/rupay-768.json, made-up keys), used by test/RealProofStamp.t.sol.
 *
 *   cd circuits && nargo compile && cd ..
 *   node contracts/script/gen-stamp-fixture.ts <sourceCommit> <circuitSha256> <nargoVersion>
 *
 * circuitSha256 = sha256 of circuits/target/watermark.json (checked here, so the fixture names the exact circuit).
 * The proof is for appOwner 0x...A11CE, salt 0 (appId = keccak256(abi.encode(owner, salt)) >> 8), validUntilMonth 325
 * (Feb 2027), one CA {networkId 1, the synthetic CA modulus} and one rule {networkId 1, prefixLength 6, "990001"}.
 * Never point this at a real card: only the synthetic fixture is allowed in the repo.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const REPO = resolve(import.meta.dirname, "..", "..");
const OUT = resolve(REPO, "contracts", "test", "fixtures", "synthetic-stamp.json");
const CIRCUIT = resolve(REPO, "circuits", "target", "watermark.json");

const [sourceCommit, circuitSha256, nargoVersion] = process.argv.slice(2);
if (!sourceCommit || !circuitSha256 || !nargoVersion) {
  throw new Error("usage: node contracts/script/gen-stamp-fixture.ts <sourceCommit> <circuitSha256> <nargoVersion>");
}
const actualSha = createHash("sha256").update(readFileSync(CIRCUIT)).digest("hex");
if (actualSha !== circuitSha256.replace(/^0x/, "").toLowerCase()) {
  throw new Error(`circuit sha256 mismatch: ${CIRCUIT} is ${actualSha}, not ${circuitSha256}`);
}

const zk = await import(pathToFileURL(resolve(REPO, "tools", "zk", "src", "index.ts")).href);
const { initHash, buildCircuitInputs, WatermarkProver } = zk;
const viem = createRequire(resolve(REPO, "relayer", "package.json"))("viem");
const { keccak256, encodeAbiParameters, getAddress } = viem;
const bbjsVersion: string = JSON.parse(
  readFileSync(resolve(REPO, "tools", "zk", "node_modules", "@aztec-foundation", "bb.js", "package.json"), "utf8"),
).version;

const appOwner: string = getAddress("0x00000000000000000000000000000000000a11ce"); // EIP-55 on output (F0)
const salt = "0x" + "00".repeat(32);
const appId: bigint =
  BigInt(keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [appOwner, salt]))) >> 8n;

await initHash();
const card = JSON.parse(readFileSync(resolve(REPO, "tools", "testcard", "fixtures", "rupay-768.json"), "utf8"));
if (!String(card.description).includes("Synthetic")) throw new Error("refusing: card fixture is not the synthetic one");
const validUntilMonth = 325;
const built = buildCircuitInputs({
  tap: card.card,
  caIndex: 0,
  cas: [{ networkId: 1, modulus: card.caModulus }],
  rules: [{ networkId: 1, prefixLength: 6, prefix: "990001" }],
  appId,
  validUntilMonth,
});

const unHex = createHash("sha256").update(Buffer.from(card.nonce.slice(2), "hex")).digest().subarray(0, 4).toString("hex");
if (unHex !== card.un.replace(/^0x/, "").toLowerCase()) throw new Error(`UN mismatch: ${unHex} vs ${card.un}`);
const unInt = BigInt("0x" + unHex);

const prover = await WatermarkProver.load(CIRCUIT);
const provingMs: number[] = [];
let last: { proof: string; publicInputs: string[] } | undefined;
try {
  for (let i = 0; i < 3; i++) {
    const r = await prover.prove(built.inputs);
    provingMs.push(r.provingMs);
    console.log(`run ${i + 1}: ${r.provingMs} ms, proof ${(r.proof.length - 2) / 2} bytes`);
    if (last && last.publicInputs.join() !== r.publicInputs.join()) throw new Error("public inputs differ between runs");
    last = r;
  }
} finally {
  await prover.destroy();
}
const medianMs = [...provingMs].sort((a, b) => a - b)[1];

const pi = last!.publicInputs;
const check = (name: string, ok: boolean) => {
  console.log(`assert ${name}: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) throw new Error(`assertion failed: ${name}`);
};
check("6 public inputs, 0x + 64 hex each", pi.length === 6 && pi.every((x) => /^0x[0-9a-fA-F]{64}$/.test(x)));
check("[0] == caRoot", BigInt(pi[0]) === BigInt(built.caRoot));
check("[1] == rulesRoot", BigInt(pi[1]) === BigInt(built.rulesRoot));
check("[2] == appId", BigInt(pi[2]) === appId);
check("[3] == UN", BigInt(pi[3]) === unInt);
check("[4] == nullifier", BigInt(pi[4]) === BigInt(built.nullifier));
check("[5] == 325", BigInt(pi[5]) === 325n);

const out = {
  description:
    "Real UltraHonk proof of the SYNTHETIC test card (tools/testcard/fixtures/rupay-768.json, made-up keys). Safe to commit. " +
    "Regenerate with contracts/script/gen-stamp-fixture.ts after any circuit or verifier change.",
  sourceCommit,
  circuitSha256: actualSha,
  nargoVersion,
  bbjsVersion,
  appOwner,
  salt,
  appId: appId.toString(),
  nonce: card.nonce,
  un: "0x" + unHex,
  validUntilMonth,
  caRoot: built.caRoot,
  rulesRoot: built.rulesRoot,
  nullifier: built.nullifier,
  medianProvingMs: medianMs,
  publicInputs: pi,
  proof: last!.proof,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${OUT}`);
console.log(
  JSON.stringify(
    { appId: out.appId, un: out.un, caRoot: out.caRoot, rulesRoot: out.rulesRoot, nullifier: out.nullifier, proofBytes: (out.proof.length - 2) / 2, provingMs, medianMs },
    null,
    2,
  ),
);
