import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import type { ChainConfig } from "./config.ts";
import { PUBLIC_TEST_ADDRESSES, sessionSignerWarnings } from "./preflight.ts";

const SIGNER = "0x1111111111111111111111111111111111111111" as Address;
const OTHER = "0x2222222222222222222222222222222222222222" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function chains(registry: Address | null) {
  return new Map<number, ChainConfig>([
    [1874, { chainId: 1874, rpcUrl: "x", registry, sponsor: null }],
    [1337, { chainId: 1337, rpcUrl: "y", registry: null, sponsor: null }],
  ]);
}

test("no warning when every app's on-chain session signer is ours; chains without a registry are not read", async () => {
  const reads: string[] = [];
  const w = await sessionSignerWarnings(
    { appIds: new Set(["42", "43"]), chains: chains("0x00000000000000000000000000000000000000AA") },
    SIGNER,
    async (c, id) => {
      reads.push(`${c.chainId}:${id}`);
      return SIGNER.toUpperCase().replace("0X", "0x") as Address;
    },
  );
  assert.deepEqual(w, []);
  assert.deepEqual(reads, ["1874:42", "1874:43"]);
});

test("warns on a different signer, an unregistered app and a failed read", async () => {
  const w = await sessionSignerWarnings(
    { appIds: new Set(["1", "2", "3"]), chains: chains("0x00000000000000000000000000000000000000AA") },
    SIGNER,
    async (_c, id) => {
      if (id === 1n) return OTHER;
      if (id === 2n) return ZERO;
      throw new Error("rpc down");
    },
  );
  assert.equal(w.length, 3);
  assert.match(w[0] ?? "", /appId 1 on chain 1874: .*WrongSessionSigner/);
  assert.match(w[1] ?? "", /appId 2 is not registered/);
  assert.match(w[2] ?? "", /could not read apps\(3\)/);
});

test("warns when the session signer is a public anvil key and a registry is configured", async () => {
  const anvil0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
  assert.equal(PUBLIC_TEST_ADDRESSES.size, 10);
  const w = await sessionSignerWarnings(
    { appIds: new Set(["1"]), chains: chains("0x00000000000000000000000000000000000000AA") },
    anvil0,
    async () => anvil0,
  );
  assert.equal(w.length, 1);
  assert.match(w[0] ?? "", /public test key/);
  // No registry anywhere (dev before the deploy): nothing to protect yet, no warning.
  assert.deepEqual(await sessionSignerWarnings({ appIds: new Set(["1"]), chains: chains(null) }, anvil0, async () => anvil0), []);
});
