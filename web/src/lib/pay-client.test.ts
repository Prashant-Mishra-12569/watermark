import { test } from "node:test";
import assert from "node:assert/strict";
import type { Address, Hex } from "viem";
import { errorFromResponse, getBalance, postFund, postPay, RelayerError, type RelayerErrorCode } from "./relayer.ts";
import { payErrorCopy } from "./messages.ts";

const RELAYER = "http://localhost:8788";
const wallet = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as Address;
const TX = `0x${"12".repeat(32)}` as Hex;

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

async function codeOf(p: Promise<unknown>): Promise<RelayerErrorCode> {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof RelayerError, `expected RelayerError, got ${String(e)}`);
    return e.code;
  }
  assert.fail("expected a RelayerError");
}

const payBody = {
  intent: { from: wallet, to: wallet, value: "1000000", validAfter: "0", validBefore: "1800000900", nonce: TX },
  signature: `0x${"cd".repeat(65)}` as Hex,
};

test("postPay POSTs {intent, signature} as JSON and returns txHash and the sender", async () => {
  const calls: Call[] = [];
  const relayer = "0xf95E000000000000000000000000000000000a9B";
  const res = await postPay(RELAYER, payBody, { fetch: fakeFetch(200, { txHash: TX, from: relayer }, calls) });
  assert.deepEqual(res, { txHash: TX, from: relayer });
  assert.equal(calls[0]?.url, `${RELAYER}/pay`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), payBody);
  assert.equal(calls[0]?.init?.credentials, "omit");
});

test("postPay without a from field still works; a bad txHash is BAD_RESPONSE", async () => {
  assert.deepEqual(await postPay(RELAYER, payBody, { fetch: fakeFetch(200, { txHash: TX }) }), { txHash: TX, from: null });
  assert.equal(await codeOf(postPay(RELAYER, payBody, { fetch: fakeFetch(200, { txHash: "0x12" }) })), "BAD_RESPONSE");
});

test("every F6 refusal reason in {reason} maps to its code", async () => {
  const reasons: RelayerErrorCode[] = [
    "NOT_STAMPED",
    "QUOTA_USED",
    "BUDGET_CAP",
    "GAS_CAP",
    "RATE_LIMIT",
    "BAD_SIGNATURE",
    "PAUSED",
    "SPONSOR_NOT_CONFIGURED",
    "FUND_NOT_CONFIGURED",
  ];
  for (const reason of reasons) {
    assert.equal(await codeOf(postPay(RELAYER, payBody, { fetch: fakeFetch(403, { reason }) })), reason);
  }
  // Unknown reasons fall back to the status; {error} still works as on /session.
  assert.equal(errorFromResponse(429, { reason: "SOMETHING_NEW" }).code, "RATE_LIMIT");
  assert.equal(errorFromResponse(500, { reason: "SOMETHING_NEW" }).code, "HTTP_ERROR");
  assert.equal(errorFromResponse(404, { error: "UNKNOWN_APP" }).code, "UNKNOWN_APP");
});

test("postFund POSTs only the wallet", async () => {
  const calls: Call[] = [];
  const res = await postFund(RELAYER, wallet, { fetch: fakeFetch(200, { txHash: TX }, calls) });
  assert.equal(res.txHash, TX);
  assert.equal(calls[0]?.url, `${RELAYER}/fund`);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { wallet });
  assert.equal(
    await codeOf(postFund(RELAYER, wallet, { fetch: fakeFetch(503, { reason: "FUND_NOT_CONFIGURED" }) })),
    "FUND_NOT_CONFIGURED",
  );
});

test("getBalance reads {usdt, quotaLeft} and refuses a malformed balance", async () => {
  const calls: Call[] = [];
  const res = await getBalance(RELAYER, wallet, { fetch: fakeFetch(200, { usdt: "1.5", quotaLeft: 19 }, calls) });
  assert.deepEqual(res, { usdt: "1.5", quotaLeft: 19 });
  assert.equal(calls[0]?.url, `${RELAYER}/balance/${wallet}`);
  assert.deepEqual(await getBalance(RELAYER, wallet, { fetch: fakeFetch(200, { usdt: "0", quotaLeft: "3" }) }), {
    usdt: "0",
    quotaLeft: 3,
  });
  for (const usdt of [1.5, "1.5e3", "-1", "1.0000001"]) {
    assert.equal(await codeOf(getBalance(RELAYER, wallet, { fetch: fakeFetch(200, { usdt, quotaLeft: 1 }) })), "BAD_RESPONSE");
  }
});

test("a network failure is NETWORK and the payment copy says to check the balance first", async () => {
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const code = await codeOf(postPay(RELAYER, payBody, { fetch: down }));
  assert.equal(code, "NETWORK");
  assert.equal(payErrorCopy(code, { payMaxUsdt: "5" }).maybeSent, true);
});

test("payErrorCopy: plain language for every code, no raw codes, refusals are not 'maybe sent'", () => {
  const all: RelayerErrorCode[] = [
    "NOT_STAMPED",
    "QUOTA_USED",
    "BUDGET_CAP",
    "GAS_CAP",
    "RATE_LIMIT",
    "BAD_SIGNATURE",
    "PAUSED",
    "SPONSOR_NOT_CONFIGURED",
    "FUND_NOT_CONFIGURED",
    "ALREADY_FUNDED",
    "INSUFFICIENT_FUNDS",
    "TX_FAILED",
    "TX_PENDING",
    "NONCE_USED",
    "PAY_REJECTED",
    "FUND_EMPTY",
    "BUSY",
    "BAD_REQUEST",
    "CHAIN_UNAVAILABLE",
    "NETWORK",
    "TIMEOUT",
    "ABORTED",
    "BAD_RESPONSE",
    "HTTP_ERROR",
  ];
  const titles = new Set<string>();
  for (const code of all) {
    const copy = payErrorCopy(code, { payMaxUsdt: "5" });
    assert.ok(copy.title.length > 0 && copy.next.length > 0, code);
    assert.ok(!copy.title.includes(code), `${code} leaks into the title`);
    titles.add(copy.title);
  }
  // Each F6 refusal gets its own message.
  assert.ok(titles.size >= 15);
  for (const code of ["NOT_STAMPED", "QUOTA_USED", "BUDGET_CAP", "GAS_CAP", "BAD_SIGNATURE", "PAUSED"] as const) {
    assert.ok(!payErrorCopy(code, { payMaxUsdt: "5" }).maybeSent, code);
  }
  assert.match(payErrorCopy("BAD_REQUEST", { payMaxUsdt: "2.5" }).next, /2\.5 USDT/);
});

test("every /pay and /fund reason the relayer sends maps to a specific code, never the generic HTTP_ERROR", () => {
  // [relayer reason (relayer/src/pay.ts), HTTP status it is sent with, web code, payment may have been sent?]
  const cases: [string, number, RelayerErrorCode, boolean][] = [
    ["NOT_STAMPED", 403, "NOT_STAMPED", false],
    ["QUOTA_USED", 429, "QUOTA_USED", false],
    ["BUDGET_CAP", 503, "BUDGET_CAP", false],
    ["GAS_CAP", 422, "GAS_CAP", false],
    ["BAD_SIGNATURE", 401, "BAD_SIGNATURE", false],
    ["PAUSED", 503, "PAUSED", false],
    ["RATE_LIMIT", 429, "RATE_LIMIT", false],
    ["BUSY", 503, "BUSY", false],
    ["CHAIN_UNAVAILABLE", 502, "CHAIN_UNAVAILABLE", false],
    ["SPONSOR_NOT_CONFIGURED", 503, "SPONSOR_NOT_CONFIGURED", false],
    ["FUND_NOT_CONFIGURED", 503, "FUND_NOT_CONFIGURED", false],
    ["ALREADY_FUNDED", 409, "ALREADY_FUNDED", false],
    ["INSUFFICIENT_USDT", 422, "INSUFFICIENT_FUNDS", false],
    ["NONCE_USED", 409, "NONCE_USED", true],
    ["PAY_REJECTED", 422, "PAY_REJECTED", false],
    ["FUND_REJECTED", 502, "PAY_REJECTED", false],
    ["FUND_EMPTY", 503, "FUND_EMPTY", false],
    ["PAY_REVERTED", 502, "TX_FAILED", false],
    ["FUND_REVERTED", 502, "TX_FAILED", false],
    ["PAY_PENDING", 504, "TX_PENDING", true],
    ["FUND_PENDING", 504, "TX_PENDING", true],
  ];
  for (const [reason, status, code, maybeSent] of cases) {
    const e = errorFromResponse(status, { reason, error: reason });
    assert.equal(e.code, code, reason);
    assert.equal(Boolean(payErrorCopy(e.code, { payMaxUsdt: "5" }).maybeSent), maybeSent, reason);
  }
  // A send failure might have reached the chain: it stays generic, and the copy says to check the balance first.
  assert.equal(errorFromResponse(502, { reason: "PAY_SEND_FAILED" }).code, "HTTP_ERROR");
  assert.equal(payErrorCopy("HTTP_ERROR", { payMaxUsdt: "5" }).maybeSent, true);
});

test("a pending or reverted payment keeps its txHash so the page can link it; a malformed one is dropped", () => {
  const pending = errorFromResponse(504, { reason: "PAY_PENDING", error: "PAY_PENDING", txHash: TX });
  assert.equal(pending.code, "TX_PENDING");
  assert.equal(pending.txHash, TX);
  assert.equal(errorFromResponse(502, { reason: "PAY_REVERTED", txHash: TX }).txHash, TX);
  assert.equal(errorFromResponse(504, { reason: "PAY_PENDING", txHash: "0x12" }).txHash, null);
  assert.equal(errorFromResponse(403, { reason: "NOT_STAMPED" }).txHash, null);
});
