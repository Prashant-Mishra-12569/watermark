import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/**
 * The deployed verifier was generated from one exact compiled circuit, recorded in the contract test fixture. A
 * prover running a different build makes proofs the chain rejects (the stamp fails at the relayer with no hint why),
 * so we check at startup instead.
 *
 * We compare the circuit's bytecode, not the whole file: nargo also writes absolute source paths into the file, so
 * the same circuit compiled on another laptop has a different file hash. Old fixtures without the bytecode hash fall
 * back to the whole-file hash.
 */
export function checkCircuit(circuitPath: string, fixturePath: string): { ok: true } | { ok: false; message: string } {
  const raw = readFileSync(circuitPath);
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { circuitSha256?: string; circuitBytecodeSha256?: string };
  const norm = (h: string) => h.replace(/^0x/, "").toLowerCase();

  let actual: string;
  let expected: string | undefined;
  if (fixture.circuitBytecodeSha256) {
    const bytecode = (JSON.parse(raw.toString("utf8")) as { bytecode?: string }).bytecode;
    if (!bytecode) return { ok: false, message: `${circuitPath} has no bytecode; run "cd circuits && nargo compile"` };
    actual = sha256(bytecode);
    expected = norm(fixture.circuitBytecodeSha256);
  } else {
    actual = sha256(raw);
    expected = fixture.circuitSha256 ? norm(fixture.circuitSha256) : undefined;
  }
  if (!expected) return { ok: false, message: `no circuit hash in ${fixturePath}` };
  if (actual === expected) return { ok: true };
  return {
    ok: false,
    message:
      `compiled circuit does not match the deployed verifier (sha256 ${actual.slice(0, 12)}…, expected ${expected.slice(0, 12)}…). ` +
      `Run "cd circuits && nargo compile" with Noir 1.0.0, then restart. Set ALLOW_CIRCUIT_MISMATCH=1 to start anyway.`,
  };
}
