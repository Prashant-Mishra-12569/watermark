import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * The deployed verifier was generated from one exact compiled circuit. Its sha256 is recorded in the
 * contract test fixture. A prover running a different build makes proofs the chain rejects
 * (the stamp fails at the relayer with no hint why), so we check at startup instead.
 */
export function checkCircuit(circuitPath: string, fixturePath: string): { ok: true } | { ok: false; message: string } {
  const actual = createHash("sha256").update(readFileSync(circuitPath)).digest("hex");
  const expected = (JSON.parse(readFileSync(fixturePath, "utf8")) as { circuitSha256?: string }).circuitSha256;
  if (!expected) return { ok: false, message: `no circuitSha256 in ${fixturePath}` };
  if (actual === expected.replace(/^0x/, "").toLowerCase()) return { ok: true };
  return {
    ok: false,
    message:
      `compiled circuit does not match the deployed verifier (sha256 ${actual.slice(0, 12)}…, expected ${expected.slice(0, 12)}…). ` +
      `Run "cd circuits && nargo compile" with Noir 1.0.0, then restart. Set ALLOW_CIRCUIT_MISMATCH=1 to start anyway.`,
  };
}
