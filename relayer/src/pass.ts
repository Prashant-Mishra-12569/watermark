/**
 * Watermark Genesis Pass: POST /pass, GET /pass/:wallet and GET /pass.
 *
 * Watermark uses its own service: a 100-piece NFT, one per real bank card, minted gas-free by the relayer. Two unlock
 * tasks, both checked without any third-party API:
 *   1. the wallet is stamped in the live app (on-chain; WatermarkGenesisPass.mint checks it again itself);
 *   2. the wallet made at least one gas-free payment through WatermarkSponsor. A contract can't read past events, so
 *      only the relayer checks this, from the sponsor's PaymentRelayed events (eth_getLogs, read-only, cached).
 * The registry binds one card to one wallet per app, and the pass allows one mint per wallet (passOf is never
 * cleared, even after a transfer), so one card = one pass.
 *
 * POST /pass flow: rate limit per IP (app.ts) → one claim per wallet at a time → stamped → not claimed → supply left →
 * paid → then, inside the relayer's per-chain send queue (shared with stamps and payments): fees → estimateGas →
 * GAS_CAP → simulate (with the exact gas and fees) → BUDGET_CAP → send → receipt. A refused mint never spends gas.
 * Anyone may ask for any wallet: the pass always goes to that wallet, never to the caller.
 */
import type { Address, Hex } from "viem";
import type { ChainConfig } from "./config.ts";
import { PayRejected, type PayChain, type PayOutcome, type SponsorDirectory } from "./pay.ts";
import { DailyBudget, gasLimitFor, type StampFees, type TxQueues } from "./stamp.ts";

// ------------------------------------------------------------------ chain access

/** Chain reads for /pass. Every method may throw when the RPC is down. */
export interface PassReader {
  blockNumber(chain: ChainConfig): Promise<bigint>;
  /** `from` of every PaymentRelayed event the sponsor emitted in [fromBlock, toBlock]. */
  paymentSenders(chain: PayChain, fromBlock: bigint, toBlock: bigint): Promise<Address[]>;
  /** pass.passOf(wallet): the token id the wallet claimed, 0 = not claimed (kept even after a transfer). */
  passOf(chain: ChainConfig, pass: Address, wallet: Address): Promise<bigint>;
  /**
   * pass.status(wallet), one eth_call: the stamp `mint` checks (registry.isStamped for the pass's own appId) with its
   * expiry (unix seconds, 0 = none), the claimed token id (0 = none) and passes left.
   */
  walletStatus(chain: ChainConfig, pass: Address, wallet: Address): Promise<PassWalletStatus>;
  totalSupply(chain: ChainConfig, pass: Address): Promise<bigint>;
  maxSupply(chain: ChainConfig, pass: Address): Promise<bigint>;
  tokenURI(chain: ChainConfig, pass: Address, tokenId: bigint): Promise<string>;
}

export interface PassWalletStatus {
  stamped: boolean;
  stampExpiresAt: bigint;
  tokenId: bigint;
  left: bigint;
}

export interface MintCall {
  chain: ChainConfig;
  pass: Address;
  to: Address;
}

export type MintReceipt =
  | { status: "success"; costWei: bigint; tokenId: bigint | null }
  | { status: "reverted"; costWei: bigint }
  | { status: "timeout" };

/** mint(to) from the relayer key. Reverts are thrown as PayRejected (the same revert decoding as payments). */
export interface PassWriter {
  readonly address: Address;
  fees(chain: ChainConfig): Promise<StampFees>;
  estimateGas(call: MintCall, fees: StampFees): Promise<bigint>;
  /** eth_call of mint(to) with the exact gas and fee fields it will be sent with. Resolves with the tokenId. */
  simulate(call: MintCall, gas: bigint, fees: StampFees): Promise<bigint>;
  send(call: MintCall, gas: bigint, fees: StampFees): Promise<Hex>;
  /** Never throws: an RPC failure while waiting is reported as a timeout. tokenId comes from the Transfer log. */
  waitForReceipt(chain: ChainConfig, hash: Hex, timeoutMs: number): Promise<MintReceipt>;
}

// ------------------------------------------------------------------ log index

export interface LogIndexSettings {
  /** First block to scan (resolved once; a failure is retried on the next refresh). */
  startBlock: () => Promise<bigint>;
  head: () => Promise<bigint>;
  /** Blocks per eth_getLogs call. */
  chunk: bigint;
  /** A refresh younger than this is reused (cache). */
  refreshMs: number;
  /** eth_getLogs calls in flight at once. */
  parallel?: number;
  nowMs?: () => number;
}

/**
 * Scans a contract's events from a start block to the chain head in fixed-size chunks, once, then only the new
 * blocks. Concurrent callers share one refresh. On an RPC failure it keeps what it already scanned and throws.
 */
export class LogIndex<T> {
  private next: bigint | null = null;
  private lastRefreshMs = Number.NEGATIVE_INFINITY;
  private inflight: Promise<void> | null = null;
  private readonly s: LogIndexSettings;
  private readonly fetch: (from: bigint, to: bigint) => Promise<T[]>;
  private readonly add: (item: T) => void;
  private readonly now: () => number;

  constructor(settings: LogIndexSettings, fetch: (from: bigint, to: bigint) => Promise<T[]>, add: (item: T) => void) {
    if (settings.chunk <= 0n) throw new Error("chunk must be positive");
    this.s = settings;
    this.fetch = fetch;
    this.add = add;
    this.now = settings.nowMs ?? Date.now;
  }

  /** The first block not scanned yet (null before the first refresh). */
  get scannedUpTo(): bigint | null {
    return this.next === null ? null : this.next - 1n;
  }

  /** Brings the index up to the chain head, unless a refresh finished less than refreshMs ago. */
  refresh(): Promise<void> {
    if (this.now() - this.lastRefreshMs < this.s.refreshMs) return Promise.resolve();
    if (!this.inflight) {
      this.inflight = this.scan().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async scan(): Promise<void> {
    if (this.next === null) this.next = await this.s.startBlock();
    const head = await this.s.head();
    const parallel = Math.max(1, this.s.parallel ?? 4);
    while (this.next <= head) {
      const ranges: [bigint, bigint][] = [];
      let from = this.next;
      while (ranges.length < parallel && from <= head) {
        const to = from + this.s.chunk - 1n < head ? from + this.s.chunk - 1n : head;
        ranges.push([from, to]);
        from = to + 1n;
      }
      const results = await Promise.allSettled(ranges.map(([a, b]) => this.fetch(a, b)));
      // Keep only the unbroken prefix of finished ranges, so `next` never skips a block.
      for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        if (r.status === "rejected") throw r.reason;
        for (const item of r.value) this.add(item);
        this.next = ranges[i]![1] + 1n;
      }
    }
    this.lastRefreshMs = this.now();
  }
}

/** Wallets that made at least one sponsored payment (PaymentRelayed.from). Payments never disappear, so a hit is final. */
export class PaymentIndex {
  private readonly payers = new Set<string>();
  readonly index: LogIndex<Address>;

  constructor(settings: LogIndexSettings, reader: PassReader, chain: PayChain) {
    this.index = new LogIndex(
      settings,
      (from, to) => reader.paymentSenders(chain, from, to),
      (w) => this.payers.add(w.toLowerCase()),
    );
  }

  async hasPaid(wallet: Address): Promise<boolean> {
    if (this.payers.has(wallet.toLowerCase())) return true;
    await this.index.refresh();
    return this.payers.has(wallet.toLowerCase());
  }
}

// ------------------------------------------------------------------ tokenURI

/** Largest image the relayer passes on (the contract's SVG is a few kB). */
export const MAX_PASS_IMAGE_CHARS = 64 * 1024;

export interface PassMetadata {
  name: string;
  /** Always a data:image/svg+xml;base64,… URI (the page shows it with <img>, so no script in it can run). */
  image: string;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/**
 * Decodes an on-chain tokenURI (data:application/json;base64,… or a plain data:application/json,…) into its name and
 * SVG image. Anything else (an http URL, a non-SVG image, malformed JSON, an oversized image) gives null.
 */
export function decodeTokenUri(uri: string): PassMetadata | null {
  let json: string;
  try {
    if (uri.startsWith("data:application/json;base64,")) {
      json = Buffer.from(uri.slice("data:application/json;base64,".length), "base64").toString("utf8");
    } else if (/^data:application\/json(;charset=utf-8|;utf8)?,/i.test(uri)) {
      json = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
    } else {
      return null;
    }
    const meta = JSON.parse(json) as unknown;
    if (!meta || typeof meta !== "object") return null;
    const { name, image } = meta as Record<string, unknown>;
    if (typeof image !== "string") return null;
    let svg64: string;
    if (image.startsWith("data:image/svg+xml;base64,")) {
      svg64 = image.slice("data:image/svg+xml;base64,".length);
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(svg64)) return null;
    } else if (/^data:image\/svg\+xml(;charset=utf-8|;utf8)?,/i.test(image)) {
      svg64 = base64(decodeURIComponent(image.slice(image.indexOf(",") + 1)));
    } else {
      return null;
    }
    const out = `data:image/svg+xml;base64,${svg64}`;
    if (out.length > MAX_PASS_IMAGE_CHARS) return null;
    return { name: typeof name === "string" ? name.slice(0, 100) : "Watermark Genesis Pass", image: out };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ outcomes

function outcome(status: PayOutcome["status"] | 410, reason: string, extra: Record<string, string> = {}): PassOutcome {
  return { status, body: { reason, error: reason, ...extra }, logReason: extra.detail ? `${reason}:${extra.detail}` : reason };
}

export interface PassOutcome {
  status: PayOutcome["status"] | 410;
  body: Record<string, string>;
  logReason?: string;
}

/**
 * Maps a simulated mint revert (WatermarkGenesisPass's custom errors) to a refusal: AlreadyClaimed, SoldOut,
 * NotStamped; anything else (NotMinter = GENESIS_PASS_ADDRESS and RELAYER_PRIVATE_KEY don't match) is PASS_REJECTED.
 */
export function refusalForMintRevert(reason: string): PassOutcome {
  const detail = reason.replace(/[^\x20-\x7e]/g, "?").slice(0, 120);
  switch (reason) {
    case "AlreadyClaimed":
      return outcome(409, "ALREADY_CLAIMED", { detail });
    case "SoldOut":
      return outcome(410, "SOLD_OUT", { detail });
    case "NotStamped":
      return outcome(403, "NOT_STAMPED", { detail });
  }
  return outcome(422, "PASS_REJECTED", { detail });
}

// ------------------------------------------------------------------ service

export interface PassSettings {
  /** MAX_GAS_PER_PASS */
  maxGas: bigint;
  /** PASS_BUDGET_WEI */
  budgetWei: bigint;
  receiptTimeoutMs: number;
  /** A claim whose tx got no receipt blocks new claims for that wallet this long (it may still land). */
  pendingHoldMs?: number;
}

/** GET /pass: the supply only, for the landing page's counter. */
export interface PassSupply {
  pass: Address;
  remaining: number;
  /** Decimal strings. */
  totalSupply: string;
  maxSupply: string;
}

/** GET /pass answers from a read at most this old (the landing page reads it on every view). */
export const PASS_SUPPLY_CACHE_MS = 5_000;

export interface PassStatus {
  pass: Address;
  /** The stamp `mint` checks, read from the pass contract itself. */
  stamped: boolean;
  /** Unix seconds the stamp lasts until; 0 when not stamped. */
  stampExpiresAt: number;
  /** null = the payment history couldn't be read right now. */
  paid: boolean | null;
  claimed: boolean;
  /** Decimal string; null when not claimed. */
  tokenId: string | null;
  remaining: number;
  totalSupply: string;
  maxSupply: string;
  /** data:image/svg+xml;base64,… from the token's on-chain tokenURI, or null. */
  image: string | null;
}

export interface PassDeps {
  sponsor: SponsorDirectory;
  chain: PayChain;
  pass: Address;
  reader: PassReader;
  /** null = POST /pass answers 503 RELAYER_NOT_CONFIGURED (GET still works). */
  writer: PassWriter | null;
  queues: TxQueues;
  payments: PaymentIndex;
  nowMs?: () => number;
}

export class PassService {
  readonly budget: DailyBudget;
  private readonly settings: PassSettings;
  private readonly d: PassDeps;
  private readonly now: () => number;
  private maxSupplyCache: Promise<bigint> | null = null;
  private readonly images = new Map<string, PassMetadata>();
  /** Wallets with a claim in progress (claimed before any await, so two requests can't both send). */
  private readonly claiming = new Set<string>();
  /** Wallets whose mint tx got no receipt: txHash and when. */
  private readonly pending = new Map<string, { txHash: Hex; atMs: number }>();
  /** GET /pass cache. A failed read is not cached; concurrent misses share one read. */
  private supplyCache: { atMs: number; value: PassSupply } | null = null;
  private supplyRead: Promise<PassSupply> | null = null;

  constructor(settings: PassSettings, deps: PassDeps) {
    this.settings = settings;
    this.d = deps;
    this.now = deps.nowMs ?? Date.now;
    this.budget = new DailyBudget(settings.budgetWei, this.now);
  }

  get canMint(): boolean {
    return this.d.writer !== null;
  }

  /** MAX_SUPPLY is a constant: read once. A failed read is not cached. */
  private maxSupply(): Promise<bigint> {
    if (!this.maxSupplyCache) {
      const p = this.d.reader.maxSupply(this.d.chain, this.d.pass);
      this.maxSupplyCache = p;
      p.catch(() => {
        if (this.maxSupplyCache === p) this.maxSupplyCache = null;
      });
    }
    return this.maxSupplyCache;
  }

  /** The token's name and SVG from its on-chain tokenURI (cached), or null when it can't be read or decoded. */
  async metadata(tokenId: bigint): Promise<PassMetadata | null> {
    const key = tokenId.toString();
    const hit = this.images.get(key);
    if (hit) return hit;
    try {
      const meta = decodeTokenUri(await this.d.reader.tokenURI(this.d.chain, this.d.pass, tokenId));
      if (meta && this.images.size < 1_000) this.images.set(key, meta);
      return meta;
    } catch {
      return null;
    }
  }

  /** GET /pass: totalSupply() and MAX_SUPPLY(), cached for PASS_SUPPLY_CACHE_MS. Throws when the chain can't be read. */
  supply(): Promise<PassSupply> {
    const hit = this.supplyCache;
    if (hit && this.now() - hit.atMs < PASS_SUPPLY_CACHE_MS) return Promise.resolve(hit.value);
    if (!this.supplyRead) {
      const { reader, chain, pass } = this.d;
      this.supplyRead = Promise.all([reader.totalSupply(chain, pass), this.maxSupply()])
        .then(([total, max]) => {
          const value: PassSupply = {
            pass,
            remaining: Number(max > total ? max - total : 0n),
            totalSupply: total.toString(),
            maxSupply: max.toString(),
          };
          this.supplyCache = { atMs: this.now(), value };
          return value;
        })
        .finally(() => {
          this.supplyRead = null;
        });
    }
    return this.supplyRead;
  }

  /**
   * GET /pass/:wallet. The stamp, its expiry, the claim and the supply come from one pass.status(wallet) call, so the
   * page shows exactly the stamp `mint` will check. Throws when the chain can't be read (paid alone may be null).
   */
  async status(wallet: Address): Promise<PassStatus> {
    const { reader, chain, pass, payments } = this.d;
    const [w, max, paid] = await Promise.all([
      reader.walletStatus(chain, pass, wallet),
      this.maxSupply(),
      payments.hasPaid(wallet).catch(() => null),
    ]);
    const claimed = w.tokenId !== 0n;
    const image = claimed ? ((await this.metadata(w.tokenId))?.image ?? null) : null;
    const left = w.left < max ? w.left : max;
    return {
      pass,
      stamped: w.stamped,
      stampExpiresAt: w.stamped ? Number(w.stampExpiresAt) : 0,
      paid,
      claimed,
      tokenId: claimed ? w.tokenId.toString() : null,
      remaining: Number(left),
      totalSupply: (max - left).toString(),
      maxSupply: max.toString(),
      image,
    };
  }

  /** POST /pass. */
  async claim(wallet: Address): Promise<PassOutcome> {
    if (!this.d.writer) return outcome(503, "RELAYER_NOT_CONFIGURED");
    const key = wallet.toLowerCase();
    const pend = this.pending.get(key);
    if (pend && this.now() - pend.atMs < (this.settings.pendingHoldMs ?? 600_000))
      return outcome(409, "CLAIM_PENDING", { txHash: pend.txHash });
    if (this.claiming.has(key)) return outcome(409, "CLAIM_PENDING");
    this.claiming.add(key);
    try {
      return await this.checkAndMint(wallet);
    } finally {
      this.claiming.delete(key);
    }
  }

  private async checkAndMint(wallet: Address): Promise<PassOutcome> {
    const { reader, chain, pass, sponsor, payments, queues } = this.d;
    // Cheapest and most telling first. No gas is spent on any of these.
    try {
      if (!(await sponsor.isStamped(wallet))) return outcome(403, "NOT_STAMPED");
      const id = await reader.passOf(chain, pass, wallet);
      if (id !== 0n) return outcome(409, "ALREADY_CLAIMED", { tokenId: id.toString() });
      const [total, max] = await Promise.all([reader.totalSupply(chain, pass), this.maxSupply()]);
      if (total >= max) return outcome(410, "SOLD_OUT");
    } catch {
      return outcome(502, "CHAIN_UNAVAILABLE");
    }
    let paid: boolean;
    try {
      paid = await payments.hasPaid(wallet);
    } catch {
      return outcome(502, "CHAIN_UNAVAILABLE", { detail: "PAYMENT_LOGS" });
    }
    if (!paid) return outcome(403, "NO_PAYMENT");

    const job = queues.get(chain.chainId).run(() => this.mint({ chain, pass, to: wallet }));
    if (!job) return outcome(503, "BUSY");
    return job;
  }

  /** Runs inside the chain's send queue: at most one relayer tx per chain at any time. */
  private async mint(call: MintCall): Promise<PassOutcome> {
    const writer = this.d.writer!;
    const { settings } = this;
    let fees: StampFees;
    let estimate: bigint;
    try {
      fees = await writer.fees(call.chain);
      estimate = await writer.estimateGas(call, fees);
    } catch (err) {
      if (err instanceof PayRejected) return refusalForMintRevert(err.reason);
      return outcome(502, "CHAIN_UNAVAILABLE");
    }
    if (estimate > settings.maxGas) return outcome(422, "GAS_CAP");
    const gas = gasLimitFor(estimate, settings.maxGas);

    let simulatedId: bigint;
    try {
      simulatedId = await writer.simulate(call, gas, fees);
    } catch (err) {
      if (err instanceof PayRejected) return refusalForMintRevert(err.reason);
      return outcome(502, "CHAIN_UNAVAILABLE");
    }

    const maxCost = gas * fees.maxFeePerGas;
    if (!this.budget.reserve(maxCost)) return outcome(503, "BUDGET_CAP");

    let txHash: Hex;
    try {
      txHash = await writer.send(call, gas, fees);
    } catch {
      this.budget.release(maxCost);
      return outcome(502, "PASS_SEND_FAILED");
    }

    const receipt = await writer.waitForReceipt(call.chain, txHash, settings.receiptTimeoutMs);
    if (receipt.status === "timeout") {
      this.budget.settle(maxCost, maxCost);
      this.pending.set(call.to.toLowerCase(), { txHash, atMs: this.now() });
      return outcome(504, "PASS_PENDING", { txHash });
    }
    this.budget.settle(maxCost, receipt.costWei);
    if (receipt.status === "reverted") return outcome(502, "PASS_REVERTED", { txHash });
    this.supplyCache = null; // one fewer left: the next GET /pass reads the chain again
    // Mints are serialized through this queue, so the simulated id is the minted one; the Transfer log confirms it.
    const tokenId = receipt.tokenId ?? simulatedId;
    return { status: 200, body: { txHash, tokenId: tokenId.toString(), from: writer.address } };
  }
}
