import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { getAddress, type Address } from "viem";
import {
  check,
  checkMany,
  draftPolicy,
  explainPolicy,
  MAX_CHECK_MANY,
  RegistryNotDeployedError,
  verifyLink,
  type StampReader,
} from "./client.ts";
import { check as nodeCheck, getPolicy, registryFor } from "./node.ts";

const REGISTRY = "0x00000000000000000000000000000000000000aa" as Address;
const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b2";
const NOW = 1_800_000_000;

/** A fake chain: wallet → [ok, expiresAt]. Records every call. */
function fakeReader(stamps: Record<string, [boolean, bigint]>, withMulticall = true) {
  const calls: string[] = [];
  const read = (w: string): readonly [boolean, bigint] => stamps[w.toLowerCase()] ?? [false, 0n];
  const reader: StampReader = {
    async readContract(args) {
      calls.push("read");
      if (args.args[0].toLowerCase() === "0x00000000000000000000000000000000000000ff") throw new Error("rpc down");
      return read(args.args[0]);
    },
  };
  if (withMulticall) {
    reader.multicall = async (args) => {
      calls.push("multicall");
      return args.contracts.map((c) => ({ status: "success" as const, result: read(c.args[0]) }));
    };
  }
  return { reader, calls };
}

test("check returns the stamp and its expiry", async () => {
  const { reader } = fakeReader({ [A]: [true, BigInt(NOW + 3600)] });
  const r = await check(A, "12345", { registry: REGISTRY, client: reader, now: () => NOW });
  assert.deepEqual(r, { stamped: true, expiresAt: NOW + 3600 });
});

test("an expired stamp is not stamped, even if the contract still says ok", async () => {
  const { reader } = fakeReader({ [A]: [true, BigInt(NOW - 1)] });
  const r = await check(A, 12345n, { registry: REGISTRY, client: reader, now: () => NOW });
  assert.equal(r.stamped, false);
  assert.equal(r.expiresAt, NOW - 1);
});

test("check refuses bad input and a missing registry", async () => {
  const { reader } = fakeReader({});
  await assert.rejects(check("nope", "1", { registry: REGISTRY, client: reader }), /not an address/);
  await assert.rejects(check(A, "-1", { registry: REGISTRY, client: reader }), /248-bit/);
  await assert.rejects(check(A, (1n << 248n).toString(), { registry: REGISTRY, client: reader }), /248-bit/);
  await assert.rejects(check(A, "1", { client: reader }), RegistryNotDeployedError);
});

test("checkMany uses one multicall on Whitechain", async () => {
  const { reader, calls } = fakeReader({ [A]: [true, BigInt(NOW + 10)] });
  const r = await checkMany([A, B], "7", { registry: REGISTRY, client: reader, now: () => NOW });
  assert.deepEqual(calls, ["multicall"]);
  assert.equal(r[getAddress(A)]?.stamped, true);
  assert.equal(r[getAddress(B)]?.stamped, false);
});

test("checkMany falls back to parallel reads on the devnet, and a failed read is not stamped", async () => {
  const { reader, calls } = fakeReader({ [A]: [true, BigInt(NOW + 10)] });
  const bad = "0x00000000000000000000000000000000000000ff";
  const r = await checkMany([A, bad], "7", { chain: "devnet", registry: REGISTRY, client: reader, now: () => NOW });
  assert.deepEqual(calls, ["read", "read"]);
  assert.equal(Object.values(r).filter((x) => x.stamped).length, 1);
  assert.deepEqual(r[getAddress(bad)], { stamped: false, expiresAt: 0 });
});

test("checkMany caps the list at 200 wallets", async () => {
  const { reader } = fakeReader({});
  const many = Array.from({ length: MAX_CHECK_MANY + 1 }, () => A);
  await assert.rejects(checkMany(many, "1", { registry: REGISTRY, client: reader }), /at most 200/);
});

test("verifyLink encodes the app and a checksummed wallet", () => {
  assert.equal(
    verifyLink("12345", A, "https://watermark.example/demo"),
    "https://watermark.example/demo/verify?app=12345&wallet=0x00000000000000000000000000000000000000A1",
  );
  assert.throws(() => verifyLink("1", A, "javascript:alert(1)"), /http/);
});

test("draftPolicy builds leaves and warns about narrow, untested and empty filters", () => {
  const p = draftPolicy({
    networks: ["RUPAY"],
    banks: ["Test Bank"],
    types: ["debit"],
    prefixes: [
      { network: "RUPAY", prefix: "990001", bank: "Test Bank", type: "debit", status: "tested" },
      { network: "RUPAY", prefix: "99000200", bank: "Test Bank", type: "debit" },
      { network: "RUPAY", prefix: "990001", bank: "Test Bank", type: "debit" }, // duplicate
      { network: "VISA", prefix: "412345", bank: "Test Bank", type: "debit" }, // network not allowed
      { network: "RUPAY", prefix: "990003", bank: "Other Bank", type: "debit" }, // bank not allowed
    ],
  });
  assert.equal(p.leaves.length, 2);
  assert.deepEqual(p.leaves.map((l) => [l.networkId, l.prefixLength]), [[1, 6], [1, 8]]);
  assert.equal(p.rulesRoot, null);
  assert.ok(p.warnings.some((w) => w.startsWith("Narrow filter")));
  assert.ok(p.warnings.some((w) => w.includes("not tested")));
  assert.ok(p.warnings.some((w) => w.includes("prepaid")));

  const empty = draftPolicy({ networks: ["RUPAY"], prefixes: [] });
  assert.ok(empty.warnings.some((w) => w.startsWith("Empty filter")));
  assert.throws(() => draftPolicy({ networks: ["RUPAY"], prefixes: [{ network: "RUPAY", prefix: "12345" }] }), /6 or 8/);
});

test("explainPolicy says what a stamp is not", () => {
  const p = draftPolicy({ networks: ["RUPAY"], prefixes: [{ network: "RUPAY", prefix: "990001", bank: "Test Bank" }] });
  const e = explainPolicy(p);
  assert.match(e.whatItDoesNotProve, /KYC/);
  assert.match(e.whatAStampReveals, /No card number/);
});

test("node helpers read deployments/ and policies/, and skip local policy files", async () => {
  const root = mkdtempSync(join(tmpdir(), "wm-sdk-"));
  mkdirSync(join(root, "deployments"));
  mkdirSync(join(root, "policies"));
  assert.throws(() => registryFor("whitechain", root), RegistryNotDeployedError);
  writeFileSync(join(root, "deployments", "whitechain.json"), JSON.stringify({ chainId: 1874, registry: REGISTRY }));
  assert.equal(registryFor("whitechain", root), REGISTRY);
  writeFileSync(join(root, "policies", "test.json"), JSON.stringify({ appId: "12345", leaves: [] }));
  writeFileSync(join(root, "policies", "local.json"), JSON.stringify({ appId: "777", leaves: [] }));
  assert.equal(getPolicy("12345", root)?.appId, "12345");
  assert.equal(getPolicy("777", root), null);

  const { reader } = fakeReader({ [A]: [true, BigInt(NOW + 5)] });
  assert.equal((await nodeCheck(A, "12345", { client: reader, now: () => NOW }, root)).stamped, true);
});
