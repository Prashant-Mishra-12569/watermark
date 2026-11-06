import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkCircuit } from "./circuit-check.ts";

const dir = mkdtempSync(join(tmpdir(), "wm-circuit-"));
const circuit = join(dir, "watermark.json");
writeFileSync(circuit, '{"noir_version":"1.0.0"}');
const sha = createHash("sha256").update('{"noir_version":"1.0.0"}').digest("hex");
const fixture = (h?: string) => {
  const p = join(dir, `fixture-${h ?? "none"}.json`);
  writeFileSync(p, JSON.stringify(h ? { circuitSha256: h } : {}));
  return p;
};

test("the circuit the verifier was built from passes", () => {
  assert.deepEqual(checkCircuit(circuit, fixture(sha)), { ok: true });
});

test("a different build is refused, with the fix in the message", () => {
  const r = checkCircuit(circuit, fixture("00".repeat(32)));
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /nargo compile/);
});

test("a fixture without a hash is refused", () => {
  assert.equal(checkCircuit(circuit, fixture()).ok, false);
});
