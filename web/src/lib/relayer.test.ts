import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVerifyLink, type Session } from "@watermark/sdk";
import type { Address, Hex } from "viem";
import { createSession, getStatus, RelayerError, type RelayerErrorCode, type SessionRequest } from "./relayer.ts";

const wallet = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as Address; // address of private key 1
const req: SessionRequest = { wallet, appId: "12345", chainId: "1874" };
const RELAYER = "http://localhost:8788";

function okSession(overrides: Partial<Session> = {}) {
  const session: Session = {
    wallet,
    appId: "12345",
    nonce: `0x${"ab".repeat(32)}` as Hex,
    expiresAt: String(1_800_000_000),
    validUntilMonth: 325,
    chainId: "1874",
    registry: "0x0000000000000000000000000000000000000001",
    ...overrides,
  };
  const sig = `0x${"cd".repeat(65)}` as Hex;
  return { session, sig, qr: buildVerifyLink({ session, sig }, "http://192.168.1.2:8787"), sessionId: "AbCdEfGhIjKlMnOpQrStUv" };
}

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

test("createSession posts an F0-encoded body (decimal strings) and returns the qr unchanged", async () => {
  const calls: Call[] = [];
  const body = okSession();
  const res = await createSession(RELAYER, req, { fetch: fakeFetch(200, body, calls) });
  assert.equal(res.qr, body.qr);
  assert.equal(res.sessionId, body.sessionId);
  assert.equal(res.session.wallet, wallet);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, `${RELAYER}/session`);
  assert.equal(calls[0]?.init?.method, "POST");
  const sent = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(sent, { wallet, appId: "12345", chainId: "1874" });
  assert.equal(typeof sent.chainId, "string");
  assert.equal(typeof sent.appId, "string");
});

test("createSession keeps a 248-bit appId exact (no Number())", async () => {
  const big = ((1n << 248n) - 1n).toString();
  const calls: Call[] = [];
  await createSession(RELAYER, { ...req, appId: big }, { fetch: fakeFetch(200, okSession({ appId: big }), calls) });
  assert.equal(JSON.parse(String(calls[0]?.init?.body)).appId, big);
});

test("each F6 error code becomes a typed error", async () => {
  const cases: [number, unknown, RelayerErrorCode][] = [
    [400, { error: "BAD_REQUEST", message: "appId must be a 248-bit decimal string" }, "BAD_REQUEST"],
    [404, { error: "UNKNOWN_APP" }, "UNKNOWN_APP"],
    [429, { error: "RATE_LIMIT" }, "RATE_LIMIT"],
    [503, { error: "CHAIN_NOT_READY", message: "no registry on this chain yet" }, "CHAIN_NOT_READY"],
    [503, { error: "BUSY" }, "BUSY"],
    [502, { error: "CHAIN_UNAVAILABLE" }, "CHAIN_UNAVAILABLE"],
    [429, "not json", "RATE_LIMIT"],
    [500, "oops", "HTTP_ERROR"],
  ];
  for (const [status, body, code] of cases) {
    assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(status, body) })), code, `${status}`);
  }
});

test("network failure (relayer down or CORS) is NETWORK", async () => {
  const failing = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: failing })), "NETWORK");
});

test("a slow relayer times out", async () => {
  const hanging = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: hanging, timeoutMs: 20 })), "TIMEOUT");
});

test("a session for another wallet, app or chain is rejected (no QR)", async () => {
  const other = "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF" as Address;
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, okSession({ wallet: other })) })), "BAD_RESPONSE");
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, okSession({ appId: "99" })) })), "BAD_RESPONSE");
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, okSession({ chainId: "1337" })) })), "BAD_RESPONSE");
});

test("a bad qr, sig or missing field is rejected", async () => {
  const noQr = { ...okSession(), qr: "https://example.com/?w=1" };
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, noQr) })), "BAD_RESPONSE");
  const shortSig = { ...okSession(), sig: "0x1234" };
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, shortSig) })), "BAD_RESPONSE");
  const { sessionId: _drop, ...noId } = okSession();
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, noId) })), "BAD_RESPONSE");
  // qr whose w differs in case from session.wallet: the phone would show different last-4 characters
  const body = okSession();
  const lowerQr = { ...body, qr: body.qr.replace(wallet, wallet.toLowerCase()) };
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, lowerQr) })), "BAD_RESPONSE");
});

test("a relayer started with PROVER_URL=192.168.1.2:8787 (no scheme) gives BAD_RESPONSE, not a QR the app refuses", async () => {
  const body = okSession();
  const noScheme = { ...body, qr: buildVerifyLink(body, "192.168.1.2:8787") };
  const e = await createSession(RELAYER, req, { fetch: fakeFetch(200, noScheme) }).catch((x: unknown) => x);
  assert.ok(e instanceof RelayerError && e.code === "BAD_RESPONSE");
  assert.match(e.message, /PROVER_URL/);
  // a qr that carries a different signature or nonce than the session is refused too
  const otherSig = { ...body, qr: body.qr.replace(body.sig, `0x${"ef".repeat(65)}`) };
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, otherSig) })), "BAD_RESPONSE");
  const otherNonce = { ...body, qr: body.qr.replace(body.session.nonce, `0x${"12".repeat(32)}`) };
  assert.equal(await codeOf(createSession(RELAYER, req, { fetch: fakeFetch(200, otherNonce) })), "BAD_RESPONSE");
});

test("relayer strips leading zeros from appId: still a match", async () => {
  const res = await createSession(RELAYER, { ...req, appId: "0012345" }, { fetch: fakeFetch(200, okSession()) });
  assert.equal(res.session.appId, "12345");
});

test("getStatus builds the F6 URL and parses numbers leniently", async () => {
  const calls: Call[] = [];
  const s = await getStatus(RELAYER, wallet, "12345", "1874", {
    fetch: fakeFetch(200, { stamped: true, expiresAt: "1800000000", quotaLeft: 20 }, calls),
  });
  assert.deepEqual(s, { stamped: true, expiresAt: 1_800_000_000, quotaLeft: 20 });
  assert.equal(calls[0]?.url, `${RELAYER}/status/${wallet}?app=12345&chain=1874`);
});

test("getStatus: stamped must be a real boolean; 502 and 503 are typed", async () => {
  assert.equal(await codeOf(getStatus(RELAYER, wallet, "1", "1874", { fetch: fakeFetch(200, { stamped: "true" }) })), "BAD_RESPONSE");
  assert.equal(
    await codeOf(getStatus(RELAYER, wallet, "1", "1874", { fetch: fakeFetch(502, { error: "CHAIN_UNAVAILABLE" }) })),
    "CHAIN_UNAVAILABLE",
  );
  assert.equal(
    await codeOf(getStatus(RELAYER, wallet, "1", "1874", { fetch: fakeFetch(503, { error: "CHAIN_NOT_READY" }) })),
    "CHAIN_NOT_READY",
  );
  const s = await getStatus(RELAYER, wallet, "1", "1874", { fetch: fakeFetch(200, { stamped: false, expiresAt: 0, quotaLeft: 0 }) });
  assert.equal(s.stamped, false);
});

test("an aborted request reports ABORTED, not NETWORK", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetchHonoringAbort = (async (_u: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    return new Response("{}");
  }) as typeof fetch;
  assert.equal(
    await codeOf(getStatus(RELAYER, wallet, "1", "1874", { fetch: fetchHonoringAbort, signal: controller.signal })),
    "ABORTED",
  );
});
