/** Pins the EIP-3009 typed data the browser signs and the relayer verifies (interfaces F7). */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { hashDomain, hashStruct, keccak256, recoverTypedDataAddress, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDT_WHITECHAIN } from "@watermark/sdk";
import * as usdt from "./usdt.ts";

// anvil account #1: a public test key, never used on a real network.
const PAYER = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const SHOP = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;

const EIP712_DOMAIN = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

test("the USDT domain hashes to the DOMAIN_SEPARATOR() read from 0xcedf…55a7 on chain 1874", () => {
  const sep = hashDomain({ domain: { ...usdt.USDT_DOMAIN, chainId: BigInt(usdt.USDT_DOMAIN.chainId) }, types: { EIP712Domain: EIP712_DOMAIN } });
  assert.equal(sep, "0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25");
  assert.equal(sep, usdt.USDT_DOMAIN_SEPARATOR);
  assert.equal(usdt.USDT_ADDRESS, USDT_WHITECHAIN);
  assert.equal(usdt.USDT_DECIMALS, 6);
});

test("TransferWithAuthorization has the EIP-3009 type hash, and a signature recovers to `from`", async () => {
  const typeHash = keccak256(
    toHex("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"),
  );
  // TRANSFER_WITH_AUTHORIZATION_TYPEHASH in EIP-3009 and in TetherTokenV2.
  assert.equal(typeHash, "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267");
  const intent = {
    from: PAYER.address,
    to: SHOP,
    value: "1500000",
    validAfter: "0",
    validBefore: "1800000000",
    nonce: `0x${"07".repeat(32)}` as Hex,
  } as const;
  const td = usdt.transferAuthorizationTypedData(intent);
  const struct = hashStruct({ data: td.message, primaryType: "TransferWithAuthorization", types: td.types });
  assert.match(struct, /^0x[0-9a-f]{64}$/);
  const sig = await PAYER.signTypedData(td);
  assert.equal(await recoverTypedDataAddress({ ...td, signature: sig }), PAYER.address);
});

test("parseUsdt / formatUsdt use 6 decimals and refuse anything else", () => {
  assert.equal(usdt.parseUsdt("1.5"), 1_500_000n);
  assert.equal(usdt.parseUsdt("5"), 5_000_000n);
  assert.equal(usdt.parseUsdt("0.000001"), 1n);
  assert.equal(usdt.parseUsdt("0.0000001"), null);
  assert.equal(usdt.parseUsdt("-1"), null);
  assert.equal(usdt.parseUsdt("1e6"), null);
  assert.equal(usdt.formatUsdt(1_500_000n), "1.5");
  assert.equal(usdt.formatUsdt(0n), "0");
});

test("web/src/lib/usdt.ts holds the same constants and builds the same typed data", async (t) => {
  const webFile = new URL("../../web/src/lib/usdt.ts", import.meta.url);
  if (!existsSync(webFile)) return t.skip("web/src/lib/usdt.ts not present");
  const web = (await import(webFile.href)) as typeof usdt;
  assert.deepEqual(web.USDT_DOMAIN, usdt.USDT_DOMAIN);
  assert.deepEqual(web.TRANSFER_WITH_AUTHORIZATION_TYPES, usdt.TRANSFER_WITH_AUTHORIZATION_TYPES);
  assert.equal(web.USDT_DOMAIN_SEPARATOR, usdt.USDT_DOMAIN_SEPARATOR);
  const intent = { from: PAYER.address, to: SHOP, value: "1", validAfter: "0", validBefore: "2", nonce: `0x${"00".repeat(32)}` as Hex };
  assert.deepEqual(web.transferAuthorizationTypedData(intent), usdt.transferAuthorizationTypedData(intent));
});
