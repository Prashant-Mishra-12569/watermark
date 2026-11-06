/**
 * POST /pay, POST /fund and GET /balance/:wallet (interfaces F6, F7; spec K drain protection layers 2 to 5).
 *
 * /pay flow, per request: strict F0 body check → rate limit per IP (in app.ts) → off-chain checks (canonical EOA
 * signature by `intent.from`, reverted-relay limit, stamped in the sponsor's app, quota left) → then, inside the
 * relayer's per-chain send queue (shared with /stamp, one key = one nonce sequence): reverted-relay limit again → fees → estimateGas → GAS_CAP → simulate (as the relayer, with the exact gas limit and fee
 * fields it will be sent with) → BUDGET_CAP → send → wait for the receipt. A refused payment
 * never spends gas, and the payer never pays gas at all: the relayer does.
 *
 * Everything that touches a chain goes through PayReader / PayWriter / FundWriter, so the flow is testable without a
 * network (chain.ts has the viem implementations).
 */
import { getAddress, isAddress, recoverTypedDataAddress, type Address, type Hex } from "viem";
import type { ChainConfig } from "./config.ts";
import { DailyBudget, gasLimitFor, SECP256K1_HALF_N, SerialQueue, type StampFees, type StampReceipt, type TxQueues } from "./stamp.ts";
import { transferAuthorizationTypedData, USDT_DOMAIN, type PaymentIntent } from "./usdt.ts";

// ------------------------------------------------------------------ chain access

/** A chain with a sponsor and a token: the only kind /pay and /fund run on (Whitechain Sepolia). */
export type PayChain = ChainConfig & { sponsor: Address; usdt: Address };

/** WatermarkSponsor's immutables, read once from the chain (they never change). */
export interface SponsorInfo {
  appId: bigint;
  registry: Address;
  relayer: Address;
  usdt: Address;
}

export interface PayCall {
  chain: PayChain;
  intent: PaymentIntent;
  signature: Hex;
}

/**
 * Thrown by a PayWriter or FundWriter when the call would revert. `reason` is the custom error name (`NotStamped`,
 * `QuotaUsed`, …), the token's revert string (`TetherToken: auth invalid`, `ERC20: transfer amount exceeds balance`,
 * …) or a 4-byte selector.
 */
export class PayRejected extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`payment would revert: ${reason}`);
    this.name = "PayRejected";
    this.reason = reason;
  }
}

/** Chain reads for /pay, /fund and /balance. Every method may throw when the RPC is down. */
export interface PayReader {
  sponsorInfo(chain: PayChain): Promise<SponsorInfo>;
  /** registry.isStamped(wallet, appId).ok (the registry's `ok` already includes expiry). */
  isStamped(chain: ChainConfig, registry: Address, wallet: Address, appId: bigint): Promise<boolean>;
  /** sponsor.quotaLeft(wallet): sponsored payments left today (UTC). */
  quotaLeft(chain: PayChain, wallet: Address): Promise<number>;
  /** usdt.balanceOf(wallet), in base units. */
  usdtBalance(chain: ChainConfig & { usdt: Address }, wallet: Address): Promise<bigint>;
}

/** Writes for /pay, sent from the relayer key. Any error other than PayRejected means the chain could not be reached. */
export interface PayWriter {
  readonly address: Address;
  fees(chain: ChainConfig): Promise<StampFees>;
  /** eth_call of relayPayment from the relayer, with the gas limit and fee fields it will be sent with (SPONSOR-1). Throws PayRejected. */
  simulate(call: PayCall, gas: bigint, fees: StampFees): Promise<void>;
  /** Throws PayRejected on a revert. */
  estimateGas(call: PayCall, fees: StampFees): Promise<bigint>;
  send(call: PayCall, gas: bigint, fees: StampFees): Promise<Hex>;
  /** Never throws: an RPC failure while waiting is reported as a timeout. */
  waitForReceipt(chain: ChainConfig, hash: Hex, timeoutMs: number): Promise<StampReceipt>;
}

/** Writes for /fund: a plain USDT transfer from the business key, which pays its own gas. */
export interface FundWriter {
  readonly address: Address;
  /** eth_call of usdt.transfer(to, amount) from the business. Throws PayRejected. */
  simulate(chain: PayChain, to: Address, amount: bigint): Promise<void>;
  send(chain: PayChain, to: Address, amount: bigint): Promise<Hex>;
  waitForReceipt(chain: ChainConfig, hash: Hex, timeoutMs: number): Promise<StampReceipt>;
}

// ------------------------------------------------------------------ request validation

export interface PayRequestBody {
  intent: PaymentIntent;
  signature: Hex;
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^\d{1,78}$/;
const INTENT_KEYS = ["from", "to", "value", "validAfter", "validBefore", "nonce"];
/** validBefore may be at most this far in the future (an authorization is a bearer instrument, F7). */
export const MAX_VALIDITY_SECONDS = 3600;
export const MAX_PAY_BODY_BYTES = 4 * 1024;

function uint256(s: unknown): s is string {
  return typeof s === "string" && UINT.test(s) && BigInt(s) < 1n << 256n;
}

/**
 * Strict F0 check of a /pay body against the clock and PAY_MAX_USDT. Returns a normalised copy (EIP-55 addresses,
 * canonical decimals, lowercase hex). The signature itself is checked in PayService.handle.
 */
export function parsePayRequest(body: unknown, nowSec: number, maxValue: bigint): PayRequestBody | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  const i = b.intent;
  if (!i || typeof i !== "object" || Array.isArray(i)) return { error: "intent must be an object" };
  const o = i as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== INTENT_KEYS.length || !INTENT_KEYS.every((k) => Object.hasOwn(o, k)))
    return { error: `intent must have exactly: ${INTENT_KEYS.join(", ")}` };
  if (typeof o.from !== "string" || !isAddress(o.from)) return { error: "intent.from must be an address" };
  if (typeof o.to !== "string" || !isAddress(o.to)) return { error: "intent.to must be an address" };
  if (BigInt(o.from) === 0n) return { error: "intent.from must not be the zero address" };
  if (BigInt(o.to) === 0n) return { error: "intent.to must not be the zero address" };
  if (o.to.toLowerCase() === o.from.toLowerCase()) return { error: "intent.to must not be intent.from" };
  if (!uint256(o.value)) return { error: "intent.value must be a uint256 decimal string (USDT base units)" };
  const value = BigInt(o.value);
  if (value === 0n) return { error: "intent.value must be more than 0" };
  if (value > maxValue) return { error: "intent.value is above PAY_MAX_USDT" };
  if (!uint256(o.validAfter)) return { error: "intent.validAfter must be a uint256 decimal string" };
  if (!uint256(o.validBefore)) return { error: "intent.validBefore must be a uint256 decimal string" };
  const now = BigInt(nowSec);
  if (BigInt(o.validAfter) > now) return { error: "intent.validAfter is in the future" };
  if (BigInt(o.validBefore) <= now) return { error: "intent.validBefore has passed" };
  if (BigInt(o.validBefore) > now + BigInt(MAX_VALIDITY_SECONDS)) return { error: "intent.validBefore must be within 1 hour" };
  if (typeof o.nonce !== "string" || !HEX32.test(o.nonce)) return { error: "intent.nonce must be bytes32 hex" };
  if (typeof b.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(b.signature))
    return { error: "signature must be 65 bytes of hex" };

  return {
    intent: {
      from: getAddress(o.from),
      to: getAddress(o.to),
      value: value.toString(),
      validAfter: BigInt(o.validAfter).toString(),
      validBefore: BigInt(o.validBefore).toString(),
      nonce: o.nonce.toLowerCase() as Hex,
    },
    signature: b.signature.toLowerCase() as Hex,
  };
}

/** A 65-byte r ‖ s ‖ v signature USDT's ECRecover accepts: v is 27 or 28 and s is low (EIP-2). */
export function isUsdtSignature(sig: string): boolean {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return false;
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = Number.parseInt(sig.slice(130, 132), 16);
  return s > 0n && s <= SECP256K1_HALF_N && (v === 27 || v === 28);
}

/** The EIP-3009 typed data for `intent` on `chain`: the shared usdt.ts domain, pointed at the configured token. */
export function intentTypedData(intent: PaymentIntent, chainId: number, usdt: Address) {
  return { ...transferAuthorizationTypedData(intent), domain: { ...USDT_DOMAIN, chainId, verifyingContract: usdt } };
}

// ------------------------------------------------------------------ outcomes and revert mapping

export interface PayOutcome {
  status: 200 | 400 | 401 | 403 | 409 | 422 | 429 | 502 | 503 | 504;
  /** 200: { txHash, from } (from = the address that paid the gas). Otherwise { reason, error, detail?, message?, txHash? } (error = reason, for F6 clients). */
  body: Record<string, string>;
  /** Set for refusals and failures: what the route may log (with a truncated wallet). Never the body. */
  logReason?: string;
}

function outcome(status: PayOutcome["status"], reason: string, extra: Record<string, string> = {}): PayOutcome {
  return {
    status,
    body: { reason, error: reason, ...extra },
    logReason: extra.detail ? `${reason}:${extra.detail}` : reason,
  };
}

/** A revert reason from the chain, made safe to return and log: printable ASCII, 120 characters at most. */
function cleanDetail(reason: string): string {
  return reason.replace(/[^\x20-\x7e]/g, "?").slice(0, 120);
}

/**
 * Maps a simulated revert (sponsor custom error or USDT revert string) to an F6 refusal. The sponsor's checks run
 * first, then USDT's (time window, used nonce, signature, balance).
 */
export function refusalForRevert(reason: string): PayOutcome {
  const detail = cleanDetail(reason);
  switch (reason) {
    case "NotStamped":
      return outcome(403, "NOT_STAMPED", { detail });
    case "QuotaUsed":
      return outcome(429, "QUOTA_USED", { detail });
    case "AuthorizationNotYetValid":
    case "TetherToken: auth early":
      return outcome(400, "BAD_REQUEST", { detail, message: "the authorization is not valid yet" });
    case "AuthorizationExpired":
    case "TetherToken: auth expired":
      return outcome(400, "BAD_REQUEST", { detail, message: "the authorization has expired" });
    case "ZeroValue":
    case "InvalidRecipient":
      return outcome(400, "BAD_REQUEST", { detail });
    case "TetherToken: auth invalid": // this (from, nonce) authorization was already used or cancelled
      return outcome(409, "NONCE_USED", { detail });
    case "TetherToken: invalid signature":
    case "EIP2612: invalid signature":
      return outcome(401, "BAD_SIGNATURE", { detail });
    case "ERC20: transfer amount exceeds balance":
      return outcome(422, "INSUFFICIENT_USDT", { detail });
  }
  if (reason.startsWith("ECRecover:")) return outcome(401, "BAD_SIGNATURE", { detail });
  // NotRelayer (SPONSOR_ADDRESS / RELAYER_PRIVATE_KEY mismatch), a blocked address, an unknown selector, ...
  return outcome(422, "PAY_REJECTED", { detail });
}

// ------------------------------------------------------------------ per-wallet reverted-relay limit

/**
 * Relays that were mined but reverted, per wallet per UTC day (review finding SPONSOR-1). WatermarkSponsor's quota
 * rolls back with the revert, so without this a wallet whose signature is valid only inside eth_call could make the
 * relayer pay gas again and again. In memory: a restart resets it, like the budgets.
 */
export class RevertCounter {
  private readonly counts = new Map<string, { day: number; n: number }>();
  private readonly nowMs: () => number;

  constructor(nowMs: () => number = Date.now) {
    this.nowMs = nowMs;
  }

  private today(): number {
    return Math.floor(this.nowMs() / 86_400_000);
  }

  count(wallet: Address): number {
    const e = this.counts.get(wallet.toLowerCase());
    return e && e.day === this.today() ? e.n : 0;
  }

  add(wallet: Address) {
    const day = this.today();
    if (this.counts.size > 10_000) for (const [k, v] of this.counts) if (v.day !== day) this.counts.delete(k);
    const key = wallet.toLowerCase();
    const e = this.counts.get(key);
    this.counts.set(key, { day, n: e && e.day === day ? e.n + 1 : 1 });
  }
}

/** sponsorInfo, read once and cached. A failed read is not cached, so the next request tries again. */
export class SponsorDirectory {
  private cached: Promise<SponsorInfo> | null = null;
  private readonly reader: PayReader;
  readonly chain: PayChain;

  constructor(reader: PayReader, chain: PayChain) {
    this.reader = reader;
    this.chain = chain;
  }

  info(): Promise<SponsorInfo> {
    if (!this.cached) {
      const p = this.reader.sponsorInfo(this.chain);
      this.cached = p;
      p.catch(() => {
        if (this.cached === p) this.cached = null;
      });
    }
    return this.cached;
  }

  /** Is `wallet` stamped in the sponsor's app, on the registry the sponsor itself checks? Throws on RPC trouble. */
  async isStamped(wallet: Address): Promise<boolean> {
    const info = await this.info();
    return this.reader.isStamped(this.chain, info.registry, wallet, info.appId);
  }
}

// ------------------------------------------------------------------ POST /pay

export interface PaySettings {
  /** MAX_GAS_PER_PAY */
  maxGas: bigint;
  /** DAILY_BUDGET_WEI */
  budgetWei: bigint;
  receiptTimeoutMs: number;
  /** PAY_MAX_REVERTS_PER_WALLET */
  maxRevertsPerWallet: number;
}

export class PayService {
  readonly budget: DailyBudget;
  readonly reverts: RevertCounter;
  private readonly settings: PaySettings;
  private readonly sponsor: SponsorDirectory;
  private readonly reader: PayReader;
  private readonly writer: PayWriter;
  private readonly queues: TxQueues;

  constructor(
    settings: PaySettings,
    sponsor: SponsorDirectory,
    reader: PayReader,
    writer: PayWriter,
    queues: TxQueues,
    nowMs: () => number = Date.now,
  ) {
    this.settings = settings;
    this.sponsor = sponsor;
    this.reader = reader;
    this.writer = writer;
    this.queues = queues;
    this.budget = new DailyBudget(settings.budgetWei, nowMs);
    this.reverts = new RevertCounter(nowMs);
  }

  /** The reverted-relay limit, for GET /balance: a wallet past it has no sponsored payments left today. */
  revertLimitReached(wallet: Address): boolean {
    return this.reverts.count(wallet) >= this.settings.maxRevertsPerWallet;
  }

  async handle(req: PayRequestBody): Promise<PayOutcome> {
    const { intent, signature } = req;
    const chain = this.sponsor.chain;

    // Off-chain checks first: no gas, and the signature check needs no RPC either.
    // EOA wallets only: USDT also accepts ERC-1271 signatures from contract wallets, but those can sign "valid" in
    // eth_call and "invalid" when mined (SPONSOR-1), so the relayer recovers the signer itself and wants `from`.
    if (!isUsdtSignature(signature)) return outcome(401, "BAD_SIGNATURE", { message: "v must be 27 or 28 and s must be low" });
    let signer: Address;
    try {
      signer = await recoverTypedDataAddress({ ...intentTypedData(intent, chain.chainId, chain.usdt), signature });
    } catch {
      return outcome(401, "BAD_SIGNATURE");
    }
    if (signer !== intent.from) return outcome(401, "BAD_SIGNATURE", { message: "not signed by intent.from" });
    if (this.revertLimitReached(intent.from)) return outcome(429, "QUOTA_USED", { detail: "REVERTED_RELAYS" });

    try {
      if (!(await this.sponsor.isStamped(intent.from))) return outcome(403, "NOT_STAMPED");
      if ((await this.reader.quotaLeft(chain, intent.from)) <= 0) return outcome(429, "QUOTA_USED");
    } catch {
      return outcome(502, "CHAIN_UNAVAILABLE");
    }

    const call: PayCall = { chain, intent, signature };
    const job = this.queues.get(chain.chainId).run(() => this.send(call));
    if (!job) return outcome(503, "BUSY");
    return job;
  }

  /** Runs inside the chain's send queue: at most one relayer tx per chain at any time, stamps included. */
  private async send(call: PayCall): Promise<PayOutcome> {
    const { writer, settings } = this;
    // Checked again here, inside the serial queue (PAY-DRAIN-1): requests from one wallet that were queued before its
    // earlier relays were mined would otherwise all be sent and all revert at the relayer's cost.
    if (this.revertLimitReached(call.intent.from)) return outcome(429, "QUOTA_USED", { detail: "REVERTED_RELAYS" });

    let fees: StampFees;
    let estimate: bigint;
    try {
      fees = await writer.fees(call.chain);
      estimate = await writer.estimateGas(call, fees);
    } catch (err) {
      if (err instanceof PayRejected) return refusalForRevert(err.reason);
      return outcome(502, "CHAIN_UNAVAILABLE");
    }

    // Layer 4: per-tx gas cap.
    if (estimate > settings.maxGas) return outcome(422, "GAS_CAP");
    const gas = gasLimitFor(estimate, settings.maxGas);
    try {
      // Simulated exactly as it will be sent: the same gas limit and the same fee fields (SPONSOR-1, PAY-DRAIN-2), so a
      // contract wallet can't answer "valid" only when gasleft() or tx.gasprice differ from the mined transaction.
      await writer.simulate(call, gas, fees);
    } catch (err) {
      if (err instanceof PayRejected) return refusalForRevert(err.reason);
      return outcome(502, "CHAIN_UNAVAILABLE");
    }

    // Layer 5: the daily payment budget (separate from stamps), reserved at the worst case.
    const maxCost = gas * fees.maxFeePerGas;
    if (!this.budget.reserve(maxCost)) return outcome(503, "BUDGET_CAP");

    let txHash: Hex;
    try {
      txHash = await writer.send(call, gas, fees);
    } catch {
      this.budget.release(maxCost);
      return outcome(502, "PAY_SEND_FAILED");
    }

    const receipt = await writer.waitForReceipt(call.chain, txHash, settings.receiptTimeoutMs);
    if (receipt.status === "timeout") {
      this.budget.settle(maxCost, maxCost);
      return outcome(504, "PAY_PENDING", { txHash });
    }
    this.budget.settle(maxCost, receipt.costWei);
    if (receipt.status === "reverted") {
      this.reverts.add(call.intent.from);
      return outcome(502, "PAY_REVERTED", { txHash });
    }
    // `from` lets the website show who paid the gas (the relayer, never the payer).
    return { status: 200, body: { txHash, from: writer.address } };
  }
}

// ------------------------------------------------------------------ POST /fund

export interface FundSettings {
  /** DEMO_FUND_USDT, in base units. */
  amount: bigint;
  receiptTimeoutMs: number;
  maxQueue: number;
}

/**
 * Demo funding by the business: a stamped wallet gets DEMO_FUND_USDT once per relayer run, as a plain USDT transfer
 * from BUSINESS_PRIVATE_KEY. The business pays this gas itself; it is not sponsored and not part of the relayer budget.
 */
export class FundService {
  private readonly funded = new Set<string>();
  private readonly queue: SerialQueue;
  private readonly settings: FundSettings;
  private readonly sponsor: SponsorDirectory;
  private readonly funder: FundWriter;

  constructor(settings: FundSettings, sponsor: SponsorDirectory, funder: FundWriter) {
    this.settings = settings;
    this.sponsor = sponsor;
    this.funder = funder;
    // Its own queue: the business key has its own nonce sequence.
    this.queue = new SerialQueue(settings.maxQueue);
  }

  async handle(wallet: Address): Promise<PayOutcome> {
    const key = wallet.toLowerCase();
    if (this.funded.has(key)) return outcome(409, "ALREADY_FUNDED");
    // Claimed before any await, so two parallel requests for one wallet can't both send.
    this.funded.add(key);
    const unclaim = (o: PayOutcome) => {
      this.funded.delete(key);
      return o;
    };

    try {
      if (!(await this.sponsor.isStamped(wallet))) return unclaim(outcome(403, "NOT_STAMPED"));
    } catch {
      return unclaim(outcome(502, "CHAIN_UNAVAILABLE"));
    }
    const job = this.queue.run(() => this.send(wallet));
    if (!job) return unclaim(outcome(503, "BUSY"));
    const out = await job;
    // Only a sent tx (success, or still pending) keeps the claim; anything that sent nothing or reverted frees it.
    return out.status === 200 || out.status === 504 ? out : unclaim(out);
  }

  private async send(wallet: Address): Promise<PayOutcome> {
    const { funder, settings } = this;
    const chain = this.sponsor.chain;
    try {
      await funder.simulate(chain, wallet, settings.amount);
    } catch (err) {
      if (err instanceof PayRejected) {
        const detail = cleanDetail(err.reason);
        if (err.reason === "ERC20: transfer amount exceeds balance") return outcome(503, "FUND_EMPTY", { detail });
        return outcome(502, "FUND_REJECTED", { detail });
      }
      return outcome(502, "CHAIN_UNAVAILABLE");
    }
    let txHash: Hex;
    try {
      txHash = await funder.send(chain, wallet, settings.amount);
    } catch {
      return outcome(502, "FUND_SEND_FAILED");
    }
    const receipt = await funder.waitForReceipt(chain, txHash, settings.receiptTimeoutMs);
    if (receipt.status === "timeout") return outcome(504, "FUND_PENDING", { txHash });
    if (receipt.status === "reverted") return outcome(502, "FUND_REVERTED", { txHash });
    return { status: 200, body: { txHash, from: funder.address } };
  }
}
