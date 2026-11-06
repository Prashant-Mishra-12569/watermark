import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkCircuit } from "./circuit-check.ts";

const dir = mkdtempSync(join(tmpdir(), "wm-circuit-"));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const write = (name: string, body: unknown) => {
  const p = join(dir, name);
  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
  return p;
};

// The same circuit compiled on two laptops: same bytecode, different absolute paths in file_map
const onMine = write("mine.json", { noir_version: "1.0.0", bytecode: "H4sIAAAA", file_map: { 1: { path: "C:/Users/me/watermark/circuits/src/main.nr" } } });
const onTheirs = write("theirs.json", { noir_version: "1.0.0", bytecode: "H4sIAAAA", file_map: { 1: { path: "/Users/them/watermark/circuits/src/main.nr" } } });
const changed = write("changed.json", { noir_version: "1.0.0", bytecode: "H4sIBBBB", file_map: {} });

test("the same bytecode passes on any machine, whatever paths the file holds", () => {
  const fixture = write("fx-bytecode.json", { circuitBytecodeSha256: sha("H4sIAAAA") });
  assert.deepEqual(checkCircuit(onMine, fixture), { ok: true });
  assert.deepEqual(checkCircuit(onTheirs, fixture), { ok: true });
});

test("a different circuit is refused, with the fix in the message", () => {
  const r = checkCircuit(changed, write("fx-bytecode2.json", { circuitBytecodeSha256: sha("H4sIAAAA") }));
  assert.equal(r.ok, false);
  assert.match((r as { message: string }).message, /nargo compile/);
});

test("an old fixture with only the whole-file hash still works", () => {
  const body = '{"noir_version":"1.0.0","bytecode":"H4sIAAAA"}';
  const file = write("whole.json", body);
  assert.deepEqual(checkCircuit(file, write("fx-file.json", { circuitSha256: sha(body) })), { ok: true });
});

test("a fixture without any hash is refused", () => {
  assert.equal(checkCircuit(onMine, write("fx-none.json", {})).ok, false);
});
