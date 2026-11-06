import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Address } from "viem";
import {
  canClaim,
  claimPass,
  flowStepOf,
  getPass,
  getPassSupply,
  parsePassStatus,
  parsePassSupply,
  passErrorCopy,
  passSteps,
  passSvgDataUri,
  PASS_COPY,
  PASS_GATE_CODE,
  type PassStatus,
} from "./genesis-pass.ts";
import { svg as passArtSvg } from "./pass-art.ts";
import { errorFromResponse, getHealth, RelayerError, type RelayerErrorCode } from "./relayer.ts";

const RELAYER = "http://localhost:8788";
const wallet = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" as Address;
const PASS = "0x00000000000000000000000000000000000000dd";
const TX = `0x${"ab".repeat(32)}`;
const EXPIRES = 1_801_439_999; // 31 January 2027, 23:59:59 UTC

const sol = readFileSync(new URL("../../../contracts/src/WatermarkGenesisPass.sol", import.meta.url), "utf8");

function fakeFetch(status: number, body: unknown, calls: { url: string; init?: RequestInit }[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const status = (over: Partial<PassStatus> = {}) => ({
  pass: PASS,
  stamped: true,
  stampExpiresAt: EXPIRES,
  paid: true,
  claimed: false,
  tokenId: null,
  remaining: 97,
  totalSupply: "3",
  maxSupply: "100",
  image: null,
  ...over,
});

// ------------------------------------------------------------------ relayer calls

test("getPass reads GET /pass/:wallet, keeps the stamp expiry and only a base64 SVG image", async () => {
  const calls: { url: string }[] = [];
  const img = passSvgDataUri("4")!;
  const s = await getPass(RELAYER, wallet, { fetch: fakeFetch(200, status({ claimed: true, tokenId: "4", image: img }), calls) });
  assert.equal(calls[0]?.url, `${RELAYER}/pass/${wallet}`);
  assert.equal(s.tokenId, "4");
  assert.equal(s.image, img);
  assert.equal(s.stampExpiresAt, EXPIRES);

  for (const image of ["https://evil.example/x.svg", "data:image/png;base64,AAAA", 'data:image/svg+xml;base64,"><b>', "data:text/html;base64,PGI+"]) {
    assert.equal(parsePassStatus(status({ image })).image, null, image);
  }
  assert.equal(parsePassStatus(status({ paid: null })).paid, null);
  // An older relayer without stampExpiresAt, and an unstamped wallet, both give 0.
  const { stampExpiresAt: _drop, ...noExpiry } = status();
  assert.equal(parsePassStatus(noExpiry).stampExpiresAt, 0);
  assert.equal(parsePassStatus(status({ stamped: false })).stampExpiresAt, 0);
  assert.throws(() => parsePassStatus(status({ stamped: "true" as never })), RelayerError);
  assert.throws(() => parsePassStatus(status({ tokenId: "1e3" })), RelayerError);
  assert.throws(() => parsePassStatus(status({ remaining: -1 })), RelayerError);
  assert.throws(() => parsePassStatus(status({ claimed: true, tokenId: null })), RelayerError);
});

test("getPassSupply reads GET /pass (no wallet); 503 PASS_NOT_CONFIGURED keeps its code", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const body = { pass: PASS, remaining: 97, totalSupply: "3", maxSupply: "100" };
  assert.deepEqual(await getPassSupply(RELAYER, { fetch: fakeFetch(200, body, calls) }), body);
  assert.equal(calls[0]?.url, `${RELAYER}/pass`);
  assert.equal(calls[0]?.init?.method, "GET");

  await assert.rejects(
    getPassSupply(RELAYER, { fetch: fakeFetch(503, { reason: "PASS_NOT_CONFIGURED", error: "PASS_NOT_CONFIGURED" }) }),
    (e: unknown) => e instanceof RelayerError && e.code === "PASS_NOT_CONFIGURED",
  );
  await assert.rejects(
    getPassSupply(RELAYER, { fetch: fakeFetch(502, { reason: "CHAIN_UNAVAILABLE" }) }),
    (e: unknown) => e instanceof RelayerError && e.code === "CHAIN_UNAVAILABLE",
  );
  assert.throws(() => parsePassSupply({ ...body, remaining: "97" }), RelayerError);
  assert.throws(() => parsePassSupply({ ...body, pass: "0x1" }), RelayerError);
  assert.throws(() => parsePassSupply({ ...body, maxSupply: 100 }), RelayerError);
});

test("claimPass posts only the wallet and returns the mint", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const r = await claimPass(RELAYER, wallet, { fetch: fakeFetch(200, { txHash: TX, tokenId: "4", from: wallet }, calls) });
  assert.deepEqual(r, { txHash: TX, tokenId: "4", from: wallet });
  assert.equal(calls[0]?.url, `${RELAYER}/pass`);
  assert.equal(calls[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), { wallet });
  await assert.rejects(claimPass(RELAYER, wallet, { fetch: fakeFetch(200, { txHash: "0x1", tokenId: "4" }) }), RelayerError);
});

test("getHealth returns the relayer's addresses (for the receipt) and drops anything malformed", async () => {
  const calls: { url: string }[] = [];
  const relayer = "0xf95E3C36020286117f1c3cd8Efd57Fcfb2e2a9Ba";
  const h = await getHealth(RELAYER, {
    fetch: fakeFetch(200, { ok: true, relayer, sponsor: null, business: "nope", genesisPass: PASS }, calls),
  });
  assert.equal(calls[0]?.url, `${RELAYER}/health`);
  assert.deepEqual(h, { relayer, sponsor: null, business: null, genesisPass: PASS });
});

// ------------------------------------------------------------------ copy

test("every /pass refusal maps to its own code and plain copy, never a raw code", async () => {
  const cases: [string, number, RelayerErrorCode][] = [
    ["NOT_STAMPED", 403, "NOT_STAMPED"],
    ["NO_PAYMENT", 403, "NO_PAYMENT"],
    ["ALREADY_CLAIMED", 409, "ALREADY_CLAIMED"],
    ["CLAIM_PENDING", 409, "CLAIM_PENDING"],
    ["SOLD_OUT", 410, "SOLD_OUT"],
    ["PASS_NOT_CONFIGURED", 503, "PASS_NOT_CONFIGURED"],
    ["SPONSOR_NOT_CONFIGURED", 503, "SPONSOR_NOT_CONFIGURED"],
    ["RELAYER_NOT_CONFIGURED", 503, "RELAYER_NOT_CONFIGURED"],
    ["PASS_REJECTED", 422, "PASS_REJECTED"],
    ["GAS_CAP", 422, "GAS_CAP"],
    ["BUDGET_CAP", 503, "BUDGET_CAP"],
    ["BUSY", 503, "BUSY"],
    ["RATE_LIMIT", 429, "RATE_LIMIT"],
    ["CHAIN_UNAVAILABLE", 502, "CHAIN_UNAVAILABLE"],
    ["PASS_PENDING", 504, "TX_PENDING"],
    ["PASS_REVERTED", 502, "TX_FAILED"],
  ];
  for (const [reason, code, want] of cases) {
    const e = errorFromResponse(code, { reason, error: reason, txHash: TX });
    assert.equal(e.code, want, reason);
    const copy = passErrorCopy(e.code);
    assert.ok(copy.text.length > 0, reason);
    assert.ok(!copy.text.includes(reason) && !copy.text.includes("_"), reason);
  }
  assert.equal(errorFromResponse(504, { reason: "PASS_PENDING", txHash: TX }).txHash, TX);
  assert.ok(passErrorCopy("TX_PENDING").maybeSent);
  assert.ok(passErrorCopy("NETWORK").maybeSent);
  assert.ok(!passErrorCopy("NO_PAYMENT").maybeSent);
});

test("the /pass copy is SITE_FINAL.md's Genesis Drop, word for word", () => {
  const spec: [string, string][] = [
    // SITE_FINAL.md "Page 2: Genesis Drop"
    [`${PASS_COPY.eyebrow} · ${PASS_COPY.eyebrowTail}`, "Watermark Genesis Drop · protected by Watermark"],
    [PASS_COPY.title, "A free NFT for *real* cardholders."],
    [
      PASS_COPY.sub,
      "We're giving away 100 Mumbai stamp NFTs. Tap your bank card once to claim yours. It's free, and we cover the fees.",
    ],
    [PASS_COPY.facts.join(" · "), "Free · No fees · Only 100 · One per bank card"],
    [PASS_COPY.step1Title, "Tap your card"],
    [PASS_COPY.step2Title, "Send a free test payment"],
    // The step says why it is there (no unexplained "test shop").
    [PASS_COPY.step2Body, "Send one test USDT payment. You just sign it, and we pay the fee."],
    // One phrase for the phone everywhere: "the Watermark phone app".
    [PASS_COPY.step1Body, "Tap your RuPay debit card on the Watermark phone app and your wallet gets a stamp. We never store your card number."],
    [PASS_COPY.step3Title, "Claim your NFT"],
    [PASS_COPY.notConfigured, "The drop opens soon, but you can stamp your wallet now."],
    [
      `${PASS_COPY.noteTitle} ${PASS_COPY.noteBody} ${PASS_COPY.noteBody2}`,
      "Why a *card*? Wallets are free, so bots make thousands of them. Bank cards aren't free. Any company can add this same check to its own drop.",
    ],
    [PASS_COPY.noteLink, "Add it to your app"],
    // The states, in the same voice
    [PASS_COPY.step3Button, "Claim my NFT"],
    [PASS_COPY.claiming, "Minting your NFT. About 10 seconds."],
    [PASS_COPY.success("4"), "NFT #4 is *yours*."],
    [PASS_COPY.alreadyClaimed("7"), "This wallet already has NFT #7."],
    [PASS_COPY.soldOut, "All 100 have been claimed, but you can still stamp your wallet."],
    // The same lines through the error mapping
    [passErrorCopy("PASS_NOT_CONFIGURED").text, "The drop opens soon, but you can stamp your wallet now."],
    [passErrorCopy("ALREADY_CLAIMED", "7").text, "This wallet already has NFT #7."],
    [passErrorCopy("SOLD_OUT").text, "All 100 have been claimed, but you can still stamp your wallet."],
    [passErrorCopy("CLAIM_PENDING").text, "Your NFT is on its way. This page updates by itself."],
    [passErrorCopy("TX_PENDING").text, "Your NFT is on its way. This page updates by itself."],
    [passErrorCopy("NOT_STAMPED").text, "This wallet doesn't have a stamp yet. Tap your card first, it only takes 2 minutes."],
    [passErrorCopy("NO_PAYMENT").text, "We can't see your payment yet. If you just paid, wait 30 seconds and try again."],
    [passErrorCopy("RATE_LIMIT").text, "Too many requests right now. Try again in a minute."],
    [passErrorCopy("BUSY").text, "Too many requests right now. Try again in a minute."],
    [PASS_COPY.left(97), "97 left"],
    [PASS_COPY.loading, "Checking your wallet…"],
    [PASS_COPY.unreachable(7), "Can't reach our server. Trying again in 7s."],
    [PASS_COPY.step1Button, "Tap my card"],
    [PASS_COPY.step1Done("31 January 2027"), "Verified. Your stamp lasts until 31 January 2027."],
    [PASS_COPY.step1Hint, "Used this card with another wallet before? Use that wallet, because one card gets one NFT."],
    [PASS_COPY.step2Button, "Send the payment"],
    [PASS_COPY.step2Unknown, "Can't check payments right now. You can still try to claim."],
    [PASS_COPY.step2Done, "Paid. Your fee: $0."],
    [PASS_COPY.step3Locked, "Finish steps 1 and 2 first."],
    [PASS_COPY.burner, "Your NFT lives in this browser's wallet, so don't clear site data or use private mode."],
    [
      PASS_COPY.gated,
      "The NFT contract checks step 1 on-chain. Step 2 is checked off-chain: our relayer reads the Sponsor's PaymentRelayed events.",
    ],
  ];
  for (const [got, want] of spec) assert.equal(got, want);
  const line = (v: unknown): string =>
    typeof v === "function" ? (v as (...a: unknown[]) => string)(1, "100") : Array.isArray(v) ? v.join(" · ") : String(v);
  for (const t of Object.values(PASS_COPY).map(line)) {
    // Never "real person": the tap proves a real bank card.
    assert.ok(!t.toLowerCase().includes("person"), t);
    // Never anything that reads as "100 per card".
    assert.ok(!/100 (only|per)|per card/i.test(t), t);
    // Never the old slogan.
    assert.ok(!/plastic/i.test(t), t);
  }
  // User-facing lines say "fee", never "gas"; jargon stays in the Details disclosure (gated).
  for (const [k, v] of Object.entries(PASS_COPY)) {
    if (k === "gated") continue;
    assert.ok(!/\bgas\b|relayer|nullifier/i.test(line(v)), `${k}: ${line(v)}`);
  }
  for (const code of ["NETWORK", "TIMEOUT", "GAS_CAP", "BUDGET_CAP", "BAD_REQUEST", "RELAYER_NOT_CONFIGURED", "CHAIN_UNAVAILABLE"] as const) {
    assert.ok(!/\bgas\b|relayer/i.test(passErrorCopy(code).text), code);
  }
});

// ------------------------------------------------------------------ checklist

test("the checklist, the claim button and the header step follow the two tasks", () => {
  assert.deepEqual(passSteps(null), { verify: "unknown", pay: "unknown", claim: "unknown" });
  const unknownPay = parsePassStatus(status({ stamped: true, paid: null }));
  assert.deepEqual(passSteps(unknownPay), { verify: "done", pay: "unknown", claim: "todo" });
  // "Can't check payments right now. You can still try to claim."
  assert.equal(canClaim(unknownPay), true);
  assert.equal(canClaim(parsePassStatus(status())), true);
  assert.equal(canClaim(parsePassStatus(status({ stamped: false }))), false);
  assert.equal(canClaim(parsePassStatus(status({ paid: false }))), false);
  assert.equal(canClaim(parsePassStatus(status({ claimed: true, tokenId: "1" }))), false);
  assert.equal(canClaim(parsePassStatus(status({ remaining: 0 }))), false);

  assert.equal(flowStepOf(null), null);
  assert.equal(flowStepOf(parsePassStatus(status({ stamped: false, paid: false }))), 1);
  assert.equal(flowStepOf(parsePassStatus(status({ paid: false }))), 2);
  assert.equal(flowStepOf(parsePassStatus(status())), 3);
  assert.equal(flowStepOf(parsePassStatus(status({ paid: null }))), 3);
  assert.equal(flowStepOf(parsePassStatus(status({ stamped: false, claimed: true, tokenId: "2" }))), 3);
});

// ------------------------------------------------------------------ the contract

test("the fallback artwork is the renderer's Mumbai stamp, the same image tokenURI embeds", () => {
  // WatermarkGenesisPass takes its art from WatermarkPassRenderer, and tokenURI embeds svg(tokenId) as base64.
  // pass-art.test.ts pins the page's copy of that art to the generator and the renderer's fixtures, byte for byte.
  assert.match(sol, /return renderer\.svg\(tokenId\);/);
  assert.match(sol, /string\.concat\("data:image\/svg\+xml;base64,", bytes\(svg\(tokenId\)\)\.encode\(\)\)/);
  const decode = (uri: string) => Buffer.from(uri.split(",")[1]!, "base64").toString("utf8");
  assert.equal(decode(passSvgDataUri("42")!), passArtSvg(42));
  assert.ok(decode(passSvgDataUri("7")!).includes(">007</text>"));
  const svg = decode(passSvgDataUri("100")!);
  assert.ok(svg.includes(">100</text>"));
  assert.ok(svg.endsWith("</svg>"));
  // Only canonical ids the drop can have.
  for (const bad of ["4x", "0", "101", "042", ""]) assert.equal(passSvgDataUri(bad), null, bad);
});

test("'How we gated this' quotes WatermarkGenesisPass.mint as written", () => {
  const [locator, ...lines] = PASS_GATE_CODE.split("\n");
  assert.equal(lines.length, 2);
  assert.match(locator!, /^\/\/ WatermarkGenesisPass\.mint\(to\)/);
  const mint = sol.slice(sol.indexOf("function mint(address to)"));
  for (const line of lines) assert.ok(mint.slice(0, mint.indexOf("\n    }\n")).includes(line), line);
});
