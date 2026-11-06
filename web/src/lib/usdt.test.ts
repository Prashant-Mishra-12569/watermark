import { test } from "node:test";
import assert from "node:assert/strict";
import { domainSeparator, hashTypedData, keccak256, recoverTypedDataAddress, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  formatUsdt,
  parseUsdt,
  transferAuthorizationTypedData,
  USDT_ADDRESS,
  USDT_DOMAIN,
  USDT_DOMAIN_SEPARATOR,
  type PaymentIntent,
} from "./usdt.ts";

const account = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
const intent: PaymentIntent = {
  from: account.address,
  to: "0x000000000000000000000000000000000000dEaD",
  value: "1000000",
  validAfter: "0",
  validBefore: "1800000900",
  nonce: `0x${"ab".repeat(32)}` as Hex,
};

test("the USDT domain hashes to the token's DOMAIN_SEPARATOR() on chain 1874 (same pin as relayer/src/usdt.ts)", () => {
  assert.equal(domainSeparator({ domain: USDT_DOMAIN }), USDT_DOMAIN_SEPARATOR);
  assert.equal(USDT_DOMAIN_SEPARATOR, "0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25");
  assert.equal(USDT_ADDRESS, "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7");
  assert.equal(USDT_DOMAIN.chainId, 1874);
});

test("the struct is EIP-3009 TransferWithAuthorization (typehash matches the standard)", () => {
  const typeString =
    "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)";
  assert.equal(keccak256(toHex(typeString)), "0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267");
  const td = transferAuthorizationTypedData(intent);
  const fields = td.types.TransferWithAuthorization.map((f) => `${f.type} ${f.name}`).join(",");
  assert.equal(`TransferWithAuthorization(${fields})`, typeString);
});

test("typed data carries uint256 fields as bigints and recovers to the signer", async () => {
  const td = transferAuthorizationTypedData(intent);
  assert.equal(td.message.value, 1_000_000n);
  assert.equal(td.message.validBefore, 1_800_000_900n);
  const sig = await account.signTypedData(td);
  assert.match(sig, /^0x[0-9a-f]{130}$/);
  assert.equal(await recoverTypedDataAddress({ ...td, signature: sig }), account.address);
  // Any change to the intent changes the digest.
  assert.notEqual(hashTypedData(td), hashTypedData(transferAuthorizationTypedData({ ...intent, value: "1000001" })));
});

test("USDT amounts use 6 decimals and refuse anything else", () => {
  assert.equal(parseUsdt("1"), 1_000_000n);
  assert.equal(parseUsdt("0.5"), 500_000n);
  assert.equal(parseUsdt(" 2.000001 "), 2_000_001n);
  for (const bad of ["", "1.0000001", "-1", "1e6", "0x10", "1,5", ".5", "abc"]) assert.equal(parseUsdt(bad), null, bad);
  assert.equal(formatUsdt(1_500_000n), "1.5");
  assert.equal(formatUsdt(0n), "0");
});
