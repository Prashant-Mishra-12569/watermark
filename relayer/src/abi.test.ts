/** Guards abi.ts against drifting from contracts/src/interfaces/IWatermarkRegistry.sol (interfaces F5) and from the
 * errors WatermarkRegistry.sol and MonthMath.sol declare. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { toFunctionSelector, toFunctionSignature, type Abi, type AbiFunction, type AbiParameter } from "viem";
import { SESSION_TYPES } from "@watermark/sdk";
import { registryAbi } from "./abi.ts";

const sol = readFileSync(new URL("../../contracts/src/interfaces/IWatermarkRegistry.sol", import.meta.url), "utf8");
const registrySol = readFileSync(new URL("../../contracts/src/WatermarkRegistry.sol", import.meta.url), "utf8");
const monthMathSol = readFileSync(new URL("../../contracts/src/libraries/MonthMath.sol", import.meta.url), "utf8");

function structFields(name: string): { type: string; name: string }[] {
  const m = sol.match(new RegExp(`struct\\s+${name}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `struct ${name} in IWatermarkRegistry.sol`);
  return m[1]!
    .split(";")
    .map((f) => f.replace(/\/\/.*$/gm, "").trim())
    .filter(Boolean)
    .map((f) => {
      const [type = "", fname = ""] = f.split(/\s+/);
      return { type, name: fname };
    });
}

/** Canonical signature of a Solidity function declaration, with struct types expanded to tuples. */
function solSignature(fn: string): string {
  const m = sol.match(new RegExp(`function\\s+${fn}\\s*\\(([^)]*)\\)`));
  assert.ok(m, `function ${fn} in IWatermarkRegistry.sol`);
  const types = m[1]!
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/\s+/)[0])
    .map((t) => (t === "Session" ? `(${structFields("Session").map((f) => f.type).join(",")})` : t));
  return `${fn}(${types.join(",")})`;
}

const fnAbi = (name: string) => (registryAbi as readonly Abi[number][]).find((x) => x.type === "function" && x.name === name) as AbiFunction;

test("Session tuple order matches IWatermarkRegistry.sol and the sdk's EIP-712 type", () => {
  const sessionParam = fnAbi("stamp").inputs[0] as AbiParameter & { components: readonly AbiParameter[] };
  const abiFields = sessionParam.components.map((c) => ({ type: c.type, name: c.name }));
  assert.deepEqual(abiFields, structFields("Session"));
  assert.deepEqual(abiFields, SESSION_TYPES.Session.map((f) => ({ type: f.type, name: f.name })));
});

test("stamp / isStamped / apps / caRoot selectors match the interface", () => {
  for (const fn of ["stamp", "isStamped", "apps", "caRoot"]) {
    const ours = toFunctionSignature(fnAbi(fn)).replace(/\s/g, "");
    assert.equal(toFunctionSelector(ours), toFunctionSelector(solSignature(fn)), fn);
  }
  assert.equal(
    toFunctionSignature(fnAbi("stamp")),
    "stamp((address,uint256,bytes32,uint64,uint32,uint256,address),bytes,bytes,bytes32[])",
  );
});

test("return shapes match the interface", () => {
  assert.deepEqual(fnAbi("isStamped").outputs.map((o) => o.type), ["bool", "uint64"]);
  assert.deepEqual(fnAbi("apps").outputs.map((o) => o.type), ["address", "bytes32", "address"]);
  assert.match(sol, /function isStamped\(address wallet, uint256 appId\) external view returns \(bool ok, uint64 expiresAt\)/);
  assert.match(sol, /function apps\(uint256 appId\) external view returns \(address owner, bytes32 rulesRoot, address sessionSigner\)/);
});

test("error selectors are unique", () => {
  const errs = registryAbi.filter((x) => x.type === "error");
  const sel = new Set(errs.map((e) => toFunctionSelector(toFunctionSignature(e as never))));
  assert.equal(sel.size, errs.length);
});

/** `error Name(type a, type b);` declarations in a .sol file, as canonical `Name(type,type)` signatures. */
function solErrors(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...code.matchAll(/\berror\s+(\w+)\s*\(([^)]*)\)\s*;/g)].map(([, name, params]) => {
    const types = params!.split(",").map((p) => p.trim().split(/\s+/)[0]).filter(Boolean);
    return `${name}(${types.join(",")})`;
  });
}

test("the error list is exactly WatermarkRegistry.sol + MonthMath.sol (InvalidProof, ZeroWallet, NotPendingOwner, ...)", () => {
  const ours = registryAbi
    .filter((x) => x.type === "error")
    .map((e) => toFunctionSignature(e as never).replace(/\s/g, ""))
    .sort();
  const declared = [...solErrors(registrySol), ...solErrors(monthMathSol)].sort();
  assert.ok(declared.includes("InvalidProof()"));
  assert.ok(declared.length >= 20, `parsed ${declared.length} errors`);
  assert.deepEqual(ours, declared);
});

test("stamp() turns every verifier failure into InvalidProof, so no HonkVerifier error is listed", () => {
  assert.match(registrySol, /try\s+verifier\.verify\(/);
  const names = registryAbi.filter((x) => x.type === "error").map((e) => (e as { name: string }).name);
  for (const v of ["SumcheckFailed", "ShpleminiFailed", "ValueGeFieldOrder", "PublicInputsLengthWrong", "ProofLengthWrongWithLogN"])
    assert.ok(!names.includes(v), v);
});
