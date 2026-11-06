import { test } from "node:test";
import assert from "node:assert/strict";
import { getHealth, parseHealthResponse } from "./relayer-health.ts";

const RELAYER = "http://localhost:8788";
const relayer = "0xf95E3C36020286117f1c3cd8Efd57Fcfb2e2a9Ba";
const sponsor = "0x21B6aE18A412aFB84A09263939C5e787d374939a";

function answer(status: number, body: unknown, calls: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}

test("parseHealthResponse: the relayer and sponsor addresses, null for anything else", () => {
  const full = { ok: true, sessionSigner: relayer, relayer, sponsor, business: relayer, genesisPass: null };
  assert.deepEqual(parseHealthResponse(full), { relayer, sponsor });
  // A relayer without a key or a sponsor answers null for them.
  assert.deepEqual(parseHealthResponse({ ok: true, relayer: null, sponsor: null }), { relayer: null, sponsor: null });
  assert.deepEqual(parseHealthResponse({ ok: true, relayer: "0x12", sponsor: `0x${"0".repeat(40)}` }), {
    relayer: null,
    sponsor: null,
  });
  assert.equal(parseHealthResponse({ ok: false, relayer }), null);
  assert.equal(parseHealthResponse(null), null);
  assert.equal(parseHealthResponse("ok"), null);
});

test("getHealth: one plain GET without credentials; never throws", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  assert.deepEqual(await getHealth(RELAYER, { fetch: answer(200, { ok: true, relayer, sponsor }, calls) }), { relayer, sponsor });
  assert.equal(calls[0]?.url, `${RELAYER}/health`);
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(calls[0]?.init?.credentials, "omit");
  assert.equal(calls[0]?.init?.body, undefined);

  assert.equal(await getHealth(RELAYER, { fetch: answer(503, { ok: true, relayer }) }), null);
  assert.equal(await getHealth(RELAYER, { fetch: answer(200, "not json") }), null);
  const down = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  assert.equal(await getHealth(RELAYER, { fetch: down }), null);
});

test("getHealth: gives up after its timeout instead of hanging", async () => {
  const hang = ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch;
  assert.equal(await getHealth(RELAYER, { fetch: hang, timeoutMs: 20 }), null);
});
