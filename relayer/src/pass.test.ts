/** Genesis Pass: POST /pass, GET /pass/:wallet and GET /pass. No network: every chain access is a fake. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { getAddress, type Address, type Hex } from "viem";
import { createApp } from "./app.ts";
import { KNOWN_SPONSOR_DEPLOY_BLOCKS, loadConfig } from "./config.ts";
import {
  decodeTokenUri,
  LogIndex,
  MAX_PASS_IMAGE_CHARS,
  PASS_SUPPLY_CACHE_MS,
  refusalForMintRevert,
  type MintCall,
  type MintReceipt,
  type PassReader,
  type PassWriter,
} from "./pass.ts";
import { PayRejected, type PayReader, type SponsorInfo } from "./pay.ts";
import type { StampFees } from "./stamp.ts";

// Throwaway test key (session signer only), never used anywhere real.
const SIGNER_KEY = `0x${"42".repeat(32)}` as const;
const WALLET = "0x8943545177806ED17B9F23F0a21ee5948eCaa776" as Address;
const OTHER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as Address;
const RELAYER = "0x00000000000000000000000000000000000000eE" as Address;
const REGISTRY = "0x00000000000000000000000000000000000000AA" as Address;
const SPONSOR = "0x00000000000000000000000000000000000000cc" as Address;
const PASS = getAddress("0x00000000000000000000000000000000000000dd");
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as Address;
/** The current sponsor (bound to the current live app) and the previous one, with their deploy blocks. */
const LIVE_SPONSOR = "0x21B6aE18A412aFB84A09263939C5e787d374939a" as Address;
const LIVE_SPONSOR_BLOCK = 12_378_949n;
const PREVIOUS_SPONSOR = "0xAbD7327f6E6b884aEf395B80De073B8aDd0aD7BA" as Address;
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
/** A stamp's expiry (unix seconds): the end of January 2027. */
const STAMP_EXPIRES = 1_801_439_999;
const GWEI = 1_000_000_000n;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>#1 of 100</text></svg>';
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const TOKEN_URI = `data:application/json;base64,${b64(
  JSON.stringify({ name: "Watermark Genesis Pass #1", image: `data:image/svg+xml;base64,${b64(SVG)}` }),
)}`;

// ------------------------------------------------------------------ fakes

interface Fakes {
  stamped?: boolean;
  /** passOf(WALLET): 0 = not claimed. */
  passOf?: bigint;
  total?: bigint;
  max?: bigint;
  head?: bigint;
  /** PaymentRelayed events: [block, from]. */
  payments?: [bigint, Address][];
  readFails?: boolean;
  logsFail?: boolean;
  estimate?: bigint;
  simulate?: () => Promise<bigint>;
  send?: () => Promise<Hex>;
  receipt?: () => Promise<MintReceipt>;
}

function fakes(o: Fakes = {}) {
  const log: string[] = [];
  const logCalls: string[] = [];
  const sent: { call: MintCall; gas: bigint; fees: StampFees }[] = [];
  const info: SponsorInfo = { appId: 42n, registry: REGISTRY, relayer: RELAYER, usdt: USDT };
  const state = { passOf: o.passOf ?? 0n, total: o.total ?? 3n, totalReads: 0 };
  const payReader: PayReader = {
    sponsorInfo: async () => info,
    async isStamped() {
      if (o.readFails) throw new Error("rpc down");
      return o.stamped ?? true;
    },
    quotaLeft: async () => 20,
    usdtBalance: async () => 0n,
  };
  const inRange = <T>(rows: [bigint, T][], a: bigint, b: bigint) => rows.filter(([n]) => n >= a && n <= b).map(([, v]) => v);
  const passReader: PassReader = {
    blockNumber: async () => o.head ?? 12_380_500n,
    async paymentSenders(c, a, b) {
      logCalls.push(`pay:${c.sponsor}:${a}-${b}`);
      if (o.logsFail) throw new Error("range too large");
      return inRange(o.payments ?? [[12_379_900n, WALLET]], a, b);
    },
    async passOf(_c, pass, wallet) {
      if (o.readFails) throw new Error("rpc down");
      assert.equal(pass, PASS);
      return wallet === WALLET ? state.passOf : 0n;
    },
    async walletStatus(_c, pass, wallet) {
      if (o.readFails) throw new Error("rpc down");
      assert.equal(pass, PASS);
      const stamped = o.stamped ?? true;
      return {
        stamped,
        stampExpiresAt: stamped ? BigInt(STAMP_EXPIRES) : 0n,
        tokenId: wallet === WALLET ? state.passOf : 0n,
        left: (o.max ?? 100n) - state.total,
      };
    },
    async totalSupply() {
      if (o.readFails) throw new Error("rpc down");
      state.totalReads++;
      return state.total;
    },
    maxSupply: async () => o.max ?? 100n,
    tokenURI: async () => TOKEN_URI,
  };
  const writer: PassWriter = {
    address: RELAYER,
    async fees() {
      log.push("fees");
      return { maxFeePerGas: 2n * GWEI, maxPriorityFeePerGas: 1n };
    },
    async estimateGas() {
      log.push("estimate");
      return o.estimate ?? 180_000n;
    },
    async simulate() {
      log.push("simulate");
      return o.simulate ? o.simulate() : state.total + 1n;
    },
    async send(call, gas, fees) {
      log.push("send");
      sent.push({ call, gas, fees });
      return o.send ? o.send() : (`0x${"ab".repeat(32)}` as Hex);
    },
    async waitForReceipt() {
      log.push("receipt");
      if (o.receipt) return o.receipt();
      state.total += 1n;
      state.passOf = state.total;
      return { status: "success", costWei: 150_000n * GWEI, tokenId: state.total };
    },
  };
  return { payReader, passReader, writer, log, logCalls, sent, state };
}

function makeApp(
  o: {
    env?: Record<string, string>;
    f?: ReturnType<typeof fakes>;
    writer?: PassWriter | null;
    ip?: () => string;
    now?: () => number;
  } = {},
) {
  const f = o.f ?? fakes();
  const config = loadConfig({
    SESSION_SIGNER_KEY: SIGNER_KEY,
    PROVER_URL: "http://192.168.1.2:8787",
    APP_IDS: "42",
    REGISTRY_ADDRESS: REGISTRY,
    SPONSOR_ADDRESS: SPONSOR,
    GENESIS_PASS_ADDRESS: PASS,
    PASS_FROM_BLOCK: "12378949",
    PASSES_PER_MINUTE_PER_IP: "1000",
    ...o.env,
  });
  const app = createApp({
    config,
    chain: { status: async () => ({ stamped: true, expiresAt: 0, quotaLeft: 0 }) },
    payReader: f.payReader,
    passReader: f.passReader,
    passWriter: o.writer === undefined ? f.writer : o.writer,
    clientIp: o.ip ?? (() => "10.0.0.1"),
    nowMs: o.now ?? (() => NOW),
  });
  return { app, f };
}

const claim = (app: ReturnType<typeof makeApp>["app"], body: unknown) =>
  app.request("/pass", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const json = async (r: Response) => (await r.json()) as Record<string, unknown>;

// ------------------------------------------------------------------ config

test("PASS_FROM_BLOCK defaults to the current sponsor's deploy block, and can be set", () => {
  const base = { SESSION_SIGNER_KEY: SIGNER_KEY, PROVER_URL: "http://192.168.1.2:8787", APP_IDS: "42" };
  assert.equal(loadConfig({ ...base, SPONSOR_ADDRESS: LIVE_SPONSOR.toLowerCase() }).pass.fromBlock, LIVE_SPONSOR_BLOCK);
  assert.equal(loadConfig({ ...base, SPONSOR_ADDRESS: LIVE_SPONSOR }).pass.fromBlock, LIVE_SPONSOR_BLOCK);
  assert.equal(loadConfig({ ...base, SPONSOR_ADDRESS: PREVIOUS_SPONSOR }).pass.fromBlock, 12_369_271n);
  assert.equal(loadConfig({ ...base, SPONSOR_ADDRESS: SPONSOR }).pass.fromBlock, null);
  assert.equal(loadConfig({ ...base, SPONSOR_ADDRESS: SPONSOR, PASS_FROM_BLOCK: "5" }).pass.fromBlock, 5n);
  const c = loadConfig(base);
  assert.equal(c.pass.address, null);
  assert.equal(c.pass.logsChunkBlocks, 1000n);
  assert.throws(() => loadConfig({ ...base, GENESIS_PASS_ADDRESS: "0x123" }), /GENESIS_PASS_ADDRESS/);
  assert.throws(() => loadConfig({ ...base, PASS_LOGS_CHUNK_BLOCKS: "0" }), /PASS_LOGS_CHUNK_BLOCKS/);

  // A start after the sponsor's deploy block would miss payments: allowed, but warned at startup.
  const late = loadConfig({ ...base, SPONSOR_ADDRESS: LIVE_SPONSOR, PASS_FROM_BLOCK: "12378950" });
  assert.equal(late.pass.fromBlock, 12_378_950n);
  assert.ok(late.warnings.some((w) => /PASS_FROM_BLOCK 12378950 is after the sponsor's deploy block 12378949/.test(w)));
  const early = loadConfig({ ...base, SPONSOR_ADDRESS: LIVE_SPONSOR, PASS_FROM_BLOCK: "12378949" });
  assert.deepEqual(early.warnings, []);
});

test("the sponsor in deployments/whitechain.json has a known deploy block (the pass's payment scan starts there)", () => {
  const file = JSON.parse(
    readFileSync(new URL("../../deployments/whitechain.json", import.meta.url), "utf8"),
  ) as { sponsor: string; liveAppId: string; sponsorAppId: string };
  assert.equal(file.sponsor.toLowerCase(), LIVE_SPONSOR.toLowerCase(), "the current sponsor");
  assert.equal(file.liveAppId, file.sponsorAppId, "the pass's app is the one the sponsor pays for");
  assert.equal(KNOWN_SPONSOR_DEPLOY_BLOCKS[file.sponsor.toLowerCase()], LIVE_SPONSOR_BLOCK);
});

// ------------------------------------------------------------------ LogIndex

test("LogIndex scans in fixed chunks from the start block to the head, then only new blocks", async () => {
  let head = 2_500n;
  let now = 0;
  const calls: string[] = [];
  const seen: number[] = [];
  const idx = new LogIndex<number>(
    { startBlock: async () => 100n, head: async () => head, chunk: 1_000n, refreshMs: 4_000, parallel: 2, nowMs: () => now },
    async (a, b) => {
      calls.push(`${a}-${b}`);
      return [Number(a)];
    },
    (n) => seen.push(n),
  );
  await idx.refresh();
  assert.deepEqual(calls, ["100-1099", "1100-2099", "2100-2500"]);
  assert.equal(idx.scannedUpTo, 2_500n);
  head = 2_600n;
  await idx.refresh(); // cached: refreshed less than refreshMs ago
  assert.equal(calls.length, 3);
  now = 5_000;
  await idx.refresh();
  assert.deepEqual(calls.slice(3), ["2501-2600"]);
  assert.deepEqual(seen, [100, 1100, 2100, 2501]);
});

test("LogIndex keeps the scanned prefix on an RPC failure, retries the rest, and shares one refresh", async () => {
  let failAt: bigint | null = 1_100n;
  const calls: string[] = [];
  let heads = 0;
  const idx = new LogIndex<string>(
    {
      startBlock: async () => 100n,
      head: async () => {
        heads++;
        return 3_000n;
      },
      chunk: 1_000n,
      refreshMs: 0,
      parallel: 3,
    },
    async (a, b) => {
      calls.push(`${a}-${b}`);
      if (a === failAt) throw new Error("range too large");
      return [];
    },
    () => {},
  );
  await assert.rejects(idx.refresh(), /range too large/);
  assert.equal(idx.scannedUpTo, 1_099n); // 2100-3000 finished too, but after the gap: scanned again
  failAt = null;
  await Promise.all([idx.refresh(), idx.refresh()]);
  assert.equal(heads, 2);
  assert.deepEqual(calls.slice(3), ["1100-2099", "2100-3000"]);
  assert.equal(idx.scannedUpTo, 3_000n);
});

// ------------------------------------------------------------------ tokenURI and reverts

test("decodeTokenUri returns the name and a base64 SVG, and refuses anything else", () => {
  const m = decodeTokenUri(TOKEN_URI);
  assert.ok(m);
  assert.equal(m.name, "Watermark Genesis Pass #1");
  assert.equal(Buffer.from(m.image.split(",")[1]!, "base64").toString("utf8"), SVG);

  const plain = decodeTokenUri(
    `data:application/json,${encodeURIComponent(JSON.stringify({ name: "x", image: `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}` }))}`,
  );
  assert.equal(plain?.image, `data:image/svg+xml;base64,${b64(SVG)}`);

  const meta = (image: string) => `data:application/json;base64,${b64(JSON.stringify({ name: "x", image }))}`;
  assert.equal(decodeTokenUri("https://example.com/1.json"), null);
  assert.equal(decodeTokenUri(meta("https://example.com/1.png")), null);
  assert.equal(decodeTokenUri(meta("data:image/png;base64,AAAA")), null);
  assert.equal(decodeTokenUri(meta(`data:image/svg+xml;base64,${"A".repeat(MAX_PASS_IMAGE_CHARS)}`)), null);
  assert.equal(decodeTokenUri(meta('data:image/svg+xml;base64,"><script>')), null);
  assert.equal(decodeTokenUri("data:application/json;base64,bm90IGpzb24="), null);
});

test("mint reverts map to calm refusals by name", () => {
  assert.equal(refusalForMintRevert("AlreadyClaimed").body.reason, "ALREADY_CLAIMED");
  assert.equal(refusalForMintRevert("SoldOut").status, 410);
  assert.equal(refusalForMintRevert("NotStamped").status, 403);
  const other = refusalForMintRevert("NotMinter");
  assert.equal(other.status, 422);
  assert.equal(other.body.reason, "PASS_REJECTED");
  assert.equal(other.body.detail, "NotMinter");
});

// ------------------------------------------------------------------ routes

test("/pass answers 503 PASS_NOT_CONFIGURED until GENESIS_PASS_ADDRESS is set", async () => {
  const { app } = makeApp({ env: { GENESIS_PASS_ADDRESS: "" } });
  const get = await app.request(`/pass/${WALLET}`);
  assert.equal(get.status, 503);
  assert.equal((await json(get)).reason, "PASS_NOT_CONFIGURED");
  const post = await claim(app, { wallet: WALLET });
  assert.equal(post.status, 503);
  assert.equal((await json(post)).reason, "PASS_NOT_CONFIGURED");

  const noRelayer = makeApp({ writer: null }).app;
  const r = await claim(noRelayer, { wallet: WALLET });
  assert.equal(r.status, 503);
  assert.equal((await json(r)).reason, "RELAYER_NOT_CONFIGURED");
  assert.equal((await noRelayer.request(`/pass/${WALLET}`)).status, 200); // reads still work
});

test("GET /pass/:wallet reports the two tasks, the claim and the supply", async () => {
  const { app, f } = makeApp();
  const r = await app.request(`/pass/${WALLET.toLowerCase()}`);
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), {
    pass: PASS,
    stamped: true,
    stampExpiresAt: STAMP_EXPIRES,
    paid: true,
    claimed: false,
    tokenId: null,
    remaining: 97,
    totalSupply: "3",
    maxSupply: "100",
    image: null,
  });
  // Scanned from PASS_FROM_BLOCK in 1000-block chunks, on the sponsor.
  assert.deepEqual(f.logCalls, [
    `pay:${SPONSOR}:12378949-12379948`,
    `pay:${SPONSOR}:12379949-12380500`,
  ]);

  const other = await json(await app.request(`/pass/${OTHER}`));
  assert.equal(other.paid, false); // someone else's payment doesn't count

  const unstamped = await json(await makeApp({ f: fakes({ stamped: false }) }).app.request(`/pass/${WALLET}`));
  assert.equal(unstamped.stamped, false);
  assert.equal(unstamped.stampExpiresAt, 0);
  assert.equal((await app.request("/pass/0x123")).status, 400);
});

test("GET /pass/:wallet shows the minted token and its on-chain SVG", async () => {
  const f = fakes({ passOf: 7n });
  const { app } = makeApp({ f });
  const body = await json(await app.request(`/pass/${WALLET}`));
  assert.equal(body.claimed, true);
  assert.equal(body.tokenId, "7");
  assert.equal(body.image, `data:image/svg+xml;base64,${b64(SVG)}`);
});

test("GET /pass/:wallet: paid is null when the logs can't be read; the rest still answers", async () => {
  const { app } = makeApp({ f: fakes({ logsFail: true }) });
  const body = await json(await app.request(`/pass/${WALLET}`));
  assert.equal(body.paid, null);
  assert.equal(body.stamped, true);
  const down = makeApp({ f: fakes({ readFails: true }) }).app;
  assert.equal((await down.request(`/pass/${WALLET}`)).status, 502);
});

test("POST /pass mints to a stamped wallet that paid: checks first, simulate before send, gas paid by the relayer", async () => {
  const { app, f } = makeApp();
  const r = await claim(app, { wallet: WALLET.toLowerCase() });
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), { txHash: `0x${"ab".repeat(32)}`, tokenId: "4", from: RELAYER });
  assert.deepEqual(f.log, ["fees", "estimate", "simulate", "send", "receipt"]);
  assert.equal(f.sent[0]!.call.to, WALLET);
  assert.equal(f.sent[0]!.call.pass, PASS);
  assert.equal(f.sent[0]!.gas, 216_000n); // estimate + 20%

  // Now claimed: a second claim is refused before anything is simulated, with the token it already has.
  const again = await claim(app, { wallet: WALLET });
  assert.equal(again.status, 409);
  assert.deepEqual(await json(again), { reason: "ALREADY_CLAIMED", error: "ALREADY_CLAIMED", tokenId: "4" });
  assert.equal(f.log.length, 5);
  const status = await json(await app.request(`/pass/${WALLET}`));
  assert.equal(status.tokenId, "4");
  assert.equal(status.remaining, 96);
});

test("POST /pass refuses, without sending, every wallet that hasn't unlocked it", async () => {
  const cases: [Fakes, number, string][] = [
    [{ stamped: false }, 403, "NOT_STAMPED"],
    [{ payments: [[12_379_900n, OTHER]] }, 403, "NO_PAYMENT"],
    [{ payments: [[12_000_000n, WALLET]] }, 403, "NO_PAYMENT"], // before PASS_FROM_BLOCK: not this sponsor
    [{ passOf: 9n }, 409, "ALREADY_CLAIMED"],
    [{ total: 100n }, 410, "SOLD_OUT"],
    [{ readFails: true }, 502, "CHAIN_UNAVAILABLE"],
    [{ logsFail: true }, 502, "CHAIN_UNAVAILABLE"],
    [{ estimate: 900_000n }, 422, "GAS_CAP"],
    [{ simulate: () => Promise.reject(new PayRejected("AlreadyClaimed")) }, 409, "ALREADY_CLAIMED"],
    [{ simulate: () => Promise.reject(new PayRejected("NotMinter")) }, 422, "PASS_REJECTED"],
    [{ simulate: () => Promise.reject(new Error("rpc down")) }, 502, "CHAIN_UNAVAILABLE"],
  ];
  for (const [o, status, reason] of cases) {
    const f = fakes(o);
    const { app } = makeApp({ f });
    const r = await claim(app, { wallet: WALLET });
    assert.equal(r.status, status, reason);
    assert.equal((await json(r)).reason, reason);
    assert.equal(f.sent.length, 0, reason);
  }
});

test("POST /pass: bad bodies, the rate limit and the daily budget", async () => {
  const { app } = makeApp({ env: { PASSES_PER_MINUTE_PER_IP: "2" } });
  assert.equal((await claim(app, "not json")).status, 400);
  assert.equal((await claim(app, { wallet: "0x0000000000000000000000000000000000000000" })).status, 400);
  assert.equal((await claim(app, { wallet: OTHER })).status, 403); // NO_PAYMENT
  assert.equal((await claim(app, { wallet: OTHER })).status, 403);
  const limited = await claim(app, { wallet: WALLET });
  assert.equal(limited.status, 429);
  assert.equal((await json(limited)).reason, "RATE_LIMIT");

  const f = fakes();
  const broke = makeApp({ f, env: { PASS_BUDGET_WEI: "1000" } }).app;
  const r = await claim(broke, { wallet: WALLET });
  assert.equal(r.status, 503);
  assert.equal((await json(r)).reason, "BUDGET_CAP");
  assert.equal(f.sent.length, 0);
});

test("POST /pass: a mint without a receipt blocks a second send for that wallet; a revert is reported", async () => {
  const f = fakes({ receipt: async () => ({ status: "timeout" }) });
  const { app } = makeApp({ f });
  const first = await claim(app, { wallet: WALLET });
  assert.equal(first.status, 504);
  assert.deepEqual(await json(first), { reason: "PASS_PENDING", error: "PASS_PENDING", txHash: `0x${"ab".repeat(32)}` });
  const second = await claim(app, { wallet: WALLET });
  assert.equal(second.status, 409);
  assert.equal((await json(second)).reason, "CLAIM_PENDING");
  assert.equal(f.sent.length, 1);

  const reverted = makeApp({ f: fakes({ receipt: async () => ({ status: "reverted", costWei: 1n }) }) }).app;
  const r = await claim(reverted, { wallet: WALLET });
  assert.equal(r.status, 502);
  assert.equal((await json(r)).reason, "PASS_REVERTED");
});

test("POST /pass: two requests for one wallet at once send one mint", async () => {
  const { app, f } = makeApp();
  const [a, b] = await Promise.all([claim(app, { wallet: WALLET }), claim(app, { wallet: WALLET })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(f.sent.length, 1);
});

// ------------------------------------------------------------------ GET /pass (supply, for the landing counter)

test("GET /pass answers the supply, cached for 5 s, and reads again after a mint", async () => {
  let now = NOW;
  const { app, f } = makeApp({ now: () => now });
  const r = await app.request("/pass");
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), { pass: PASS, remaining: 97, totalSupply: "3", maxSupply: "100" });
  assert.equal(f.state.totalReads, 1);

  // Within 5 s: the cached answer, no new chain read (even if the chain moved).
  f.state.total = 4n;
  now += PASS_SUPPLY_CACHE_MS - 1;
  assert.equal((await json(await app.request("/pass"))).remaining, 97);
  assert.equal(f.state.totalReads, 1);
  // Concurrent misses after expiry share one read.
  now += 1;
  const [a, b] = await Promise.all([app.request("/pass"), app.request("/pass")]);
  assert.equal((await json(a)).remaining, 96);
  assert.equal((await json(b)).totalSupply, "4");
  assert.equal(f.state.totalReads, 2);

  // A mint clears the cache, so the counter drops right away.
  assert.equal((await claim(app, { wallet: WALLET })).status, 200);
  assert.deepEqual(await json(await app.request("/pass")), { pass: PASS, remaining: 95, totalSupply: "5", maxSupply: "100" });
});

test("GET /pass: 503 PASS_NOT_CONFIGURED, 502 CHAIN_UNAVAILABLE (not cached), 429 RATE_LIMIT", async () => {
  const off = makeApp({ env: { GENESIS_PASS_ADDRESS: "" } }).app;
  const r = await off.request("/pass");
  assert.equal(r.status, 503);
  assert.deepEqual(await json(r), { reason: "PASS_NOT_CONFIGURED", error: "PASS_NOT_CONFIGURED" });

  const f = fakes({ readFails: true });
  const down = makeApp({ f }).app;
  const d = await down.request("/pass");
  assert.equal(d.status, 502);
  assert.equal((await json(d)).reason, "CHAIN_UNAVAILABLE");

  const { app } = makeApp();
  for (let i = 0; i < 60; i++) assert.equal((await app.request("/pass")).status, 200);
  const limited = await app.request("/pass");
  assert.equal(limited.status, 429);
  assert.equal((await json(limited)).reason, "RATE_LIMIT");
  // The same per-IP budget as GET /pass/:wallet (passReadLimiter).
  assert.equal((await app.request(`/pass/${WALLET}`)).status, 429);
});

test("/health names the pass", async () => {
  const { app } = makeApp();
  assert.equal((await json(await app.request("/health"))).genesisPass, getAddress(PASS));
});

test("passWarnings: silent when the pass matches; a different minter, registry or app is reported", async () => {
  const { passWarnings } = await import("./preflight.ts");
  const config = loadConfig({
    SESSION_SIGNER_KEY: SIGNER_KEY,
    PROVER_URL: "http://192.168.1.2:8787",
    APP_IDS: "42",
    REGISTRY_ADDRESS: REGISTRY,
    SPONSOR_ADDRESS: SPONSOR,
    GENESIS_PASS_ADDRESS: PASS,
  });
  const good = { minter: RELAYER, registry: REGISTRY, appId: 42n };
  assert.deepEqual(await passWarnings(config, RELAYER, async () => good, async () => 42n), []);
  const bad = await passWarnings(config, RELAYER, async () => ({ minter: OTHER, registry: OTHER, appId: 7n }), async () => 42n);
  assert.equal(bad.length, 3);
  assert.match(bad[0]!, /NotMinter/);
  const down = await passWarnings(config, RELAYER, () => Promise.reject(new Error("rpc")), async () => 42n);
  assert.match(down[0]!, /could not read WatermarkGenesisPass/);
  const off = loadConfig({ SESSION_SIGNER_KEY: SIGNER_KEY, PROVER_URL: "http://x:1", APP_IDS: "42" });
  assert.deepEqual(await passWarnings(off, RELAYER, async () => good, async () => 42n), []);
});
