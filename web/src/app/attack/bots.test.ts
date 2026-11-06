import { test } from "node:test";
import assert from "node:assert/strict";
import { recoverTypedDataAddress, type Address, type Hex } from "viem";
import { RelayerError } from "../../lib/relayer.ts";
import { PAY_VALIDITY_SECONDS } from "../../lib/pay.ts";
import { USDT_DOMAIN, transferAuthorizationTypedData, type PaymentIntent } from "../../lib/usdt.ts";
import {
  BOT_COUNT,
  doorCopy,
  doorFromAnswer,
  doorFromError,
  doorsFor,
  limitLine,
  postPass,
  readAttackConfig,
  relayerReachable,
  runAttack,
  summarize,
  summaryLines,
  type AttackConfig,
  type BotView,
  type DoorState,
} from "./bots.ts";

const SHOP = "0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF" as Address; // address of private key 2
const RELAYER = "http://relayer.test";
const TX = `0x${"ab".repeat(32)}` as Hex;
const NOW = 1_800_000_000_000;

const config = (passLive: boolean): AttackConfig => ({ relayerUrl: RELAYER, demoShop: SHOP, passLive });

/** Deterministic, distinct bot keys (never real ones). */
function keys() {
  let i = 10;
  return () => `0x${(i++).toString(16).padStart(64, "0")}` as Hex;
}
const nonce = () => `0x${"11".repeat(32)}` as Hex;

interface Call {
  path: string;
  method: string;
  body: unknown;
}

/** A fetch that records each call and answers with `answer(path)`; throws when the answer is "network". */
function mockFetch(answer: (path: string, n: number) => { status: number; body?: unknown } | "network") {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ path: url.pathname, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
    const a = answer(url.pathname, calls.length);
    if (a === "network") throw new TypeError("fetch failed");
    return new Response(a.body === undefined ? null : JSON.stringify(a.body), {
      status: a.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const notStamped = { status: 403, body: { reason: "NOT_STAMPED", error: "NOT_STAMPED" } };

const states = (bots: readonly BotView[]) => bots.flatMap((b) => b.doors.map((d) => d.state));

// ------------------------------------------------------------------ config

test("readAttackConfig: default relayer, shop required, bad URL reported", () => {
  const ok = readAttackConfig({ demoShop: SHOP.toLowerCase() }, false);
  assert.deepEqual(ok, { ok: true, config: { relayerUrl: "http://localhost:8788", demoShop: SHOP, passLive: false } });
  const trimmed = readAttackConfig({ relayerUrl: " https://relay.example/ ", demoShop: SHOP }, true);
  assert.ok(trimmed.ok && trimmed.config.relayerUrl === "https://relay.example" && trimmed.config.passLive);

  const noShop = readAttackConfig({}, true);
  assert.equal(noShop.ok, false);
  assert.match(!noShop.ok ? noShop.problems.join() : "", /NEXT_PUBLIC_DEMO_SHOP/);
  const bad = readAttackConfig({ relayerUrl: "ftp://x", demoShop: "nope" }, true);
  assert.equal(!bad.ok && bad.problems.length, 2);
  assert.equal(readAttackConfig({ demoShop: `0x${"0".repeat(40)}` }, true).ok, false);
});

test("doorsFor: the pass door only while PASS_LIVE", () => {
  assert.deepEqual(doorsFor(true), ["fund", "pay", "pass"]);
  assert.deepEqual(doorsFor(false), ["fund", "pay"]);
});

// ------------------------------------------------------------------ classifying answers

test("doorFromAnswer: 403 NOT_STAMPED refused, 429 RATE_LIMIT slowed, any 2xx got through", () => {
  assert.deepEqual(doorFromAnswer(403, { reason: "NOT_STAMPED" }), { kind: "refused" });
  assert.deepEqual(doorFromAnswer(403, { error: "NOT_STAMPED" }), { kind: "refused" });
  assert.deepEqual(doorFromAnswer(429, { error: "RATE_LIMIT" }), { kind: "slowed" });
  assert.deepEqual(doorFromAnswer(200, { txHash: TX, tokenId: "1" }), { kind: "through", txHash: TX });
  // A 2xx is a bug even with a body we can't read.
  assert.deepEqual(doorFromAnswer(201, null), { kind: "through", txHash: null });
  assert.deepEqual(doorFromAnswer(204, { txHash: "0x12" }), { kind: "through", txHash: null });
});

test("doorFromAnswer: anything else is an other answer, never a refusal", () => {
  assert.deepEqual(doorFromAnswer(403, { reason: "NO_PAYMENT" }), { kind: "other", answer: "403 NO_PAYMENT", txHash: null });
  assert.deepEqual(doorFromAnswer(429, { reason: "QUOTA_USED" }), { kind: "other", answer: "429 QUOTA_USED", txHash: null });
  assert.deepEqual(doorFromAnswer(403, null), { kind: "other", answer: "403", txHash: null });
  assert.deepEqual(doorFromAnswer(503, { error: "PASS_NOT_CONFIGURED" }), {
    kind: "other",
    answer: "503 PASS_NOT_CONFIGURED",
    txHash: null,
  });
  // Free text from a response is never shown; a tx the relayer did send is kept.
  assert.deepEqual(doorFromAnswer(500, { error: "<b>hi</b> there" }), { kind: "other", answer: "500", txHash: null });
  assert.deepEqual(doorFromAnswer(409, { reason: "CLAIM_PENDING", txHash: TX }), {
    kind: "other",
    answer: "409 CLAIM_PENDING",
    txHash: TX,
  });
});

test("doorFromError: maps lib/relayer.ts errors", () => {
  assert.deepEqual(doorFromError(new RelayerError("NOT_STAMPED", 403)), { kind: "refused" });
  assert.deepEqual(doorFromError(new RelayerError("RATE_LIMIT", 429)), { kind: "slowed" });
  assert.deepEqual(doorFromError(new RelayerError("NETWORK", 0)), { kind: "network" });
  assert.deepEqual(doorFromError(new RelayerError("TIMEOUT", 0)), { kind: "other", answer: "TIMEOUT", txHash: null });
  assert.deepEqual(doorFromError(new RelayerError("BAD_RESPONSE", 200)), { kind: "through", txHash: null });
  assert.deepEqual(doorFromError(new RelayerError("QUOTA_USED", 429)), { kind: "other", answer: "429 QUOTA_USED", txHash: null });
  assert.deepEqual(doorFromError(new RelayerError("HTTP_ERROR", 500)), { kind: "other", answer: "500", txHash: null });
  assert.deepEqual(doorFromError(new RelayerError("TX_FAILED", 502, undefined, TX)), {
    kind: "other",
    answer: "502 TX_FAILED",
    txHash: TX,
  });
  assert.equal(doorFromError(new Error("boom")).kind, "other");
});

test("doorCopy: DESIGN_V2's copy and the spec's tones", () => {
  assert.deepEqual(doorCopy("fund", { kind: "idle" }), { text: "Not asked yet", tone: "muted" });
  assert.deepEqual(doorCopy("fund", { kind: "running" }), { text: "Asking…", tone: "muted" });
  assert.deepEqual(doorCopy("pay", { kind: "refused" }), { text: "Refused: no stamp", tone: "ok" });
  assert.deepEqual(doorCopy("pay", { kind: "slowed" }), {
    text: "Slowed down: too many tries (a second guard)",
    tone: "note",
  });
  assert.deepEqual(doorCopy("fund", { kind: "through", txHash: TX }), { text: "Got through. That's a bug.", tone: "error" });
  assert.deepEqual(doorCopy("pass", { kind: "other", answer: "503 PASS_NOT_CONFIGURED", txHash: null }), {
    text: "Other answer: 503 PASS_NOT_CONFIGURED",
    tone: "muted",
  });
  assert.deepEqual(doorCopy("fund", { kind: "network" }), { text: "Can't reach our server", tone: "note" });
});

test("limitLine: the relayer's per-minute limits; /pass has its own, smaller one only while the pass is live", () => {
  assert.equal(
    limitLine(false),
    'The relayer allows 10 /fund and 10 /pay calls a minute per IP. More gets 429 RATE_LIMIT, shown as "Slowed down".',
  );
  // PASSES_PER_MINUTE_PER_IP, default 5.
  assert.match(limitLine(true), /, and 5 \/pass calls, a minute per IP\./);
});

// ------------------------------------------------------------------ summary

const bot = (n: number, ...doors: DoorState[]): BotView => ({
  n,
  address: SHOP,
  doors: doors.map((state, i) => ({ door: (["fund", "pay", "pass"] as const)[i]!, state })),
});

test("summary: every request refused (429 counts as a refusal) says $0 moved, $0 in fees", () => {
  const bots = [1, 2, 3, 4, 5].map((n) =>
    bot(n, { kind: "refused" }, { kind: "refused" }, n === 5 ? { kind: "slowed" } : { kind: "refused" }),
  );
  const s = summarize(bots);
  assert.deepEqual(s, { answered: 15, refused: 15, through: 0, other: 0, network: 0 });
  assert.deepEqual(summaryLines(s), [
    { text: "15 of 15 tries refused. $0 moved. $0 in fees.", tone: "ok" },
  ]);
});

test("summary: anything through is a bug; other answers drop the $0 claim; network errors are named", () => {
  const through = summarize([bot(1, { kind: "through", txHash: TX }, { kind: "refused" }, { kind: "network" })]);
  assert.deepEqual(through, { answered: 2, refused: 1, through: 1, other: 0, network: 1 });
  assert.deepEqual(summaryLines(through), [
    { text: "1 got through. That's a bug.", tone: "error" },
    { text: "1 of 2 tries refused.", tone: "muted" },
    { text: "1 couldn't reach our server.", tone: "note" },
  ]);

  const other = summarize([bot(1, { kind: "refused" }, { kind: "other", answer: "TIMEOUT", txHash: null })]);
  assert.deepEqual(summaryLines(other), [
    { text: "1 of 2 tries refused.", tone: "muted" },
  ]);

  const allDown = summarize([bot(1, { kind: "network" }, { kind: "network" })]);
  assert.deepEqual(summaryLines(allDown), [{ text: "2 couldn't reach our server.", tone: "note" }]);

  // Unfinished doors are not counted.
  assert.deepEqual(summarize([bot(1, { kind: "refused" }, { kind: "running" }, { kind: "idle" })]), {
    answered: 1,
    refused: 1,
    through: 0,
    other: 0,
    network: 0,
  });
  assert.deepEqual(summaryLines(summarize([bot(1, { kind: "refused" })])), [
    { text: "1 of 1 try refused. $0 moved. $0 in fees.", tone: "ok" },
  ]);
});

// ------------------------------------------------------------------ the run (mocked fetch, never the real relayer)

test("runAttack: 5 bots one after another, fund → pay → pass each, real EIP-3009 signatures", async () => {
  const { fetch, calls } = mockFetch(() => notStamped);
  const updates: (readonly BotView[])[] = [];
  const bots = await runAttack({
    config: config(true),
    fetch,
    newKey: keys(),
    nowMs: () => NOW,
    nonce,
    onUpdate: (b) => updates.push(b),
  });

  assert.equal(bots.length, BOT_COUNT);
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    Array.from({ length: BOT_COUNT }, () => ["POST /fund", "POST /pay", "POST /pass"]).flat(),
  );
  assert.equal(new Set(bots.map((b) => b.address)).size, BOT_COUNT);
  assert.ok(states(bots).every((s) => s.kind === "refused"));
  assert.equal(summaryLines(summarize(bots))[0]!.text, "15 of 15 tries refused. $0 moved. $0 in fees.");

  for (const [i, b] of bots.entries()) {
    const [fund, pay, pass] = calls.slice(i * 3, i * 3 + 3);
    assert.deepEqual(fund!.body, { wallet: b.address });
    assert.deepEqual(pass!.body, { wallet: b.address });
    const { intent, signature } = pay!.body as { intent: PaymentIntent; signature: Hex };
    assert.deepEqual(intent, {
      from: b.address,
      to: SHOP,
      value: "1000000",
      validAfter: "0",
      validBefore: String(NOW / 1000 + PAY_VALIDITY_SECONDS),
      nonce: nonce(),
    });
    const typed = transferAuthorizationTypedData(intent);
    assert.deepEqual(typed.domain, USDT_DOMAIN);
    assert.equal(await recoverTypedDataAddress({ ...typed, signature }), b.address);
  }

  // The page sees each row appear, then each door go "Asking…" before its answer.
  assert.equal(updates[0]!.length, 1);
  assert.deepEqual(states(updates[0]!), [{ kind: "idle" }, { kind: "idle" }, { kind: "idle" }]);
  assert.deepEqual(states(updates[1]!)[0], { kind: "running" });
  assert.deepEqual(states(updates[2]!)[0], { kind: "refused" });
});

test("runAttack: no /pass call while the pass is off", async () => {
  const { fetch, calls } = mockFetch(() => notStamped);
  const bots = await runAttack({ config: config(false), fetch, newKey: keys(), nowMs: () => NOW, nonce });
  assert.equal(calls.length, BOT_COUNT * 2);
  assert.ok(calls.every((c) => c.path !== "/pass"));
  assert.ok(bots.every((b) => b.doors.map((d) => d.door).join() === "fund,pay"));
});

test("runAttack: a 2xx is shown as a bug with its tx; rate limits, other answers and network errors are kept apart", async () => {
  const { fetch } = mockFetch((path, n) => {
    if (n > 3) return "network";
    if (path === "/fund") return { status: 429, body: { reason: "RATE_LIMIT", error: "RATE_LIMIT" } };
    if (path === "/pay") return { status: 200, body: { txHash: TX, from: SHOP } };
    return { status: 503, body: { reason: "PASS_NOT_CONFIGURED", error: "PASS_NOT_CONFIGURED" } };
  });
  const bots = await runAttack({ config: config(true), fetch, newKey: keys(), nowMs: () => NOW, nonce });
  assert.deepEqual(states(bots).slice(0, 3), [
    { kind: "slowed" },
    { kind: "through", txHash: TX },
    { kind: "other", answer: "503 PASS_NOT_CONFIGURED", txHash: null },
  ]);
  assert.ok(states(bots).slice(3).every((s) => s.kind === "network"));
  assert.deepEqual(summaryLines(summarize(bots)), [
    { text: "1 got through. That's a bug.", tone: "error" },
    { text: "1 of 3 tries refused.", tone: "muted" },
    { text: "12 couldn't reach our server.", tone: "note" },
  ]);
});

test("runAttack: stops when the page aborts, and sends nothing after", async () => {
  const before = new AbortController();
  before.abort();
  const none = mockFetch(() => notStamped);
  assert.deepEqual(await runAttack({ config: config(true), fetch: none.fetch, signal: before.signal, newKey: keys() }), []);
  assert.equal(none.calls.length, 0);

  // Aborted while the second request (/pay) is in flight: its answer is dropped and no further request goes out.
  const ac = new AbortController();
  const during = mockFetch((_path, n) => {
    if (n === 2) ac.abort();
    return notStamped;
  });
  const updates: (readonly BotView[])[] = [];
  const partial = await runAttack({
    config: config(true),
    fetch: during.fetch,
    signal: ac.signal,
    newKey: keys(),
    nowMs: () => NOW,
    nonce,
    onUpdate: (b) => updates.push(b),
  });
  assert.equal(during.calls.length, 2);
  assert.equal(partial.length, 1);
  assert.deepEqual(states(partial), [{ kind: "refused" }, { kind: "running" }, { kind: "idle" }]);
  assert.deepEqual(updates.at(-1), partial);
});

// ------------------------------------------------------------------ /pass and /health with this page's own fetch

test("postPass: posts {wallet}; network error, timeout and answers classified", async () => {
  const { fetch, calls } = mockFetch(() => ({ status: 200, body: { txHash: TX, tokenId: "7", from: SHOP } }));
  assert.deepEqual(await postPass(RELAYER, SHOP, { fetch }), { kind: "through", txHash: TX });
  assert.deepEqual(calls, [{ path: "/pass", method: "POST", body: { wallet: SHOP } }]);

  assert.deepEqual(await postPass(RELAYER, SHOP, { fetch: mockFetch(() => "network").fetch }), { kind: "network" });

  // Like a real fetch that never gets an answer: it rejects only when its signal aborts (at once if already aborted).
  const hang = ((_: unknown, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      if (init?.signal?.aborted) return rej(new Error("aborted"));
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
    })) as typeof globalThis.fetch;
  assert.deepEqual(await postPass(RELAYER, SHOP, { fetch: hang, timeoutMs: 10 }), { kind: "other", answer: "TIMEOUT", txHash: null });

  const ac = new AbortController();
  ac.abort();
  await assert.rejects(postPass(RELAYER, SHOP, { fetch: hang, signal: ac.signal }), (e: unknown) => e instanceof RelayerError && e.code === "ABORTED");
});

test("relayerReachable: any answer counts, a network failure doesn't", async () => {
  assert.equal(await relayerReachable(RELAYER, { fetch: mockFetch(() => ({ status: 200, body: { ok: true } })).fetch }), true);
  assert.equal(await relayerReachable(RELAYER, { fetch: mockFetch(() => ({ status: 503 })).fetch }), true);
  assert.equal(await relayerReachable(RELAYER, { fetch: mockFetch(() => "network").fetch }), false);
});
