/**
 * Proves the synthetic test card end to end, in memory, and prints the timing.
 *   node src/prove-fixture.ts [../../circuits/target/watermark.json]
 */
import { readFileSync } from "node:fs";
import { initHash } from "./hash.ts";
import { buildCircuitInputs } from "./inputs.ts";
import { WatermarkProver } from "./prove.ts";

await initHash();
const fixture = JSON.parse(readFileSync(new URL("../../testcard/fixtures/rupay-768.json", import.meta.url), "utf8"));
const built = buildCircuitInputs({
  tap: fixture.card,
  caIndex: 0,
  cas: [{ networkId: 1, modulus: fixture.caModulus }],
  rules: [{ networkId: 1, prefixLength: 6, prefix: "990001" }],
  appId: 12345n,
  validUntilMonth: 325,
});
const circuit = process.argv[2] ?? new URL("../../../circuits/target/watermark.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const prover = await WatermarkProver.load(circuit);
const r = await prover.prove(built.inputs);
console.log(`proof ${(r.proof.length - 2) / 2} bytes, ${r.publicInputs.length} public inputs, ${r.provingMs} ms (witness + prove + verify)`);
console.log(`nullifier ${built.nullifier}`);
console.log(`public inputs match: ${r.publicInputs[4] === built.nullifier && r.publicInputs[0] === built.caRoot}`);
await prover.destroy();
