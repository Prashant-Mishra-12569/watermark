import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildIntent, checkAmount, checkRecipient, PAY_VALIDITY_SECONDS, randomNonce, readPayConfig, signPayment } from "./pay.ts";
import { transferAuthorizationTypedData } from "./usdt.ts";

const account = privateKeyToAccount(`0x${"01".padStart(64, "0")}`);
const shop = "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF" as Address; // address of private key 2

test("readPayConfig: demo shop checksummed, max defaults to 5, bad values are reported", () => {
  assert.deepEqual(readPayConfig({}), { demoShop: null, payMaxUsdt: "5", problems: [] });
  const ok = readPayConfig({ demoShop: shop.toLowerCase(), payMaxUsdt: "2.50" });
  assert.equal(ok.demoShop, shop);
  assert.equal(ok.payMaxUsdt, "2.5");
  const bad = readPayConfig({ demoShop: "shop", payMaxUsdt: "0" });
  assert.equal(bad.demoShop, null);
  assert.equal(bad.payMaxUsdt, "5");
  assert.equal(bad.problems.length, 2);
  assert.equal(readPayConfig({ demoShop: `0x${"0".repeat(40)}` }).demoShop, null);
});

test("checkAmount: positive, at most 6 decimals, within the max and the balance", () => {
  assert.deepEqual(checkAmount("1", "5", "2"), { ok: true, value: 1_000_000n });
  assert.deepEqual(checkAmount("5", "5", null), { ok: true, value: 5_000_000n });
  for (const [raw, max, bal] of [
    ["", "5", "2"],
    ["0", "5", "2"],
    ["0.0000001", "5", "2"],
    ["5.01", "5", "10"],
    ["3", "5", "2"],
    ["-1", "5", "2"],
  ] as const) {
    assert.equal(checkAmount(raw, max, bal).ok, false, `${raw} / max ${max} / balance ${bal}`);
  }
});

test("checkRecipient: valid checksum, not zero, not the payer", () => {
  assert.deepEqual(checkRecipient(shop.toLowerCase(), account.address), { ok: true, address: shop });
  assert.equal(checkRecipient("", account.address).ok, false);
  assert.equal(checkRecipient("0x1234", account.address).ok, false);
  assert.equal(checkRecipient(shop.replace("B5AD", "b5AD"), account.address).ok, false); // bad checksum
  assert.equal(checkRecipient(`0x${"0".repeat(40)}`, account.address).ok, false);
  assert.equal(checkRecipient(account.address.toLowerCase(), account.address).ok, false);
});

test("randomNonce is a bytes32 from the injected randomness", () => {
  const fixed = randomNonce((a) => a.fill(0xab));
  assert.equal(fixed, `0x${"ab".repeat(32)}`);
  const a = randomNonce();
  const b = randomNonce();
  assert.match(a, /^0x[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("buildIntent: F0 strings, validAfter 0, validBefore now + 15 min", () => {
  const nonce = `0x${"cd".repeat(32)}` as Hex;
  const intent = buildIntent({ from: account.address, to: shop, value: 1_000_000n, nowMs: 1_800_000_000_500, nonce });
  assert.deepEqual(intent, {
    from: account.address,
    to: shop,
    value: "1000000",
    validAfter: "0",
    validBefore: String(1_800_000_000 + PAY_VALIDITY_SECONDS),
    nonce,
  });
  assert.equal(PAY_VALIDITY_SECONDS, 900);
});

test("signPayment returns exactly the POST /pay body, signed by the wallet in intent.from", async () => {
  const intent = buildIntent({ from: account.address, to: shop, value: 1n, nowMs: 0, nonce: randomNonce() });
  const body = await signPayment(account, intent);
  assert.deepEqual(Object.keys(body).sort(), ["intent", "signature"]);
  assert.deepEqual(Object.keys(body.intent).sort(), ["from", "nonce", "to", "validAfter", "validBefore", "value"]);
  assert.match(body.signature, /^0x[0-9a-f]{130}$/);
  const signer = await recoverTypedDataAddress({ ...transferAuthorizationTypedData(intent), signature: body.signature });
  assert.equal(signer, account.address);
  // The JSON is all strings (F0): no bigint ever reaches JSON.stringify.
  assert.doesNotThrow(() => JSON.stringify(body));
});

test("signPayment refuses an intent for another wallet", async () => {
  const intent = buildIntent({ from: shop, to: account.address, value: 1n, nowMs: 0, nonce: randomNonce() });
  await assert.rejects(signPayment(account, intent));
});
