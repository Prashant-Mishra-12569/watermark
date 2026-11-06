/**
 * POST /stamp (interfaces F6, spec K drain protection layers 1 and 5).
 *
 * Flow, per request: strict body check → off-chain checks (known app, configured chain, our registry, our session
 * signer) → then, inside the chain's serial queue: simulate (as the relayer) → estimateGas → GAS_CAP → BUDGET_CAP
 * → send → wait for the receipt. A refused stamp never spends gas. Everything that touches a chain goes through
 * the ChainWriter interface, so the flow is testable without a network.
 */
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { recoverSessionSigner, type Session } from "@watermark/sdk";
import type { ChainConfig } from "./config.ts";

// ------------------------------------------------------------------ chain access

export interface StampCall {
  chain: ChainConfig & { registry: Address };
  session: Session;
  sig: Hex;
  proof: Hex;
  publicInputs: readonly Hex[];
}

export interface StampFees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export type StampReceipt =
  | { status: "success" | "reverted"; costWei: bigint }
  | { status: "timeout" };

/** Thrown by a ChainWriter when the registry would revert. `reason` is the custom error name (or its selector). */
export class StampRejected extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`stamp would revert: ${reason}`);
    this.name = "StampRejected";
    this.reason = reason;
  }
}

/** Writes for /stamp. Any error other than StampRejected means the chain could not be reached or refused the tx. */
export interface ChainWriter {
  /** The relayer account that pays gas. */
  readonly address: Address;
  /** eth_call of stamp(...) from the relayer. Throws StampRejected on a revert. */
  simulate(call: StampCall): Promise<void>;
  /** Throws StampRejected on a revert. */
  estimateGas(call: StampCall): Promise<bigint>;
  fees(chain: ChainConfig): Promise<StampFees>;
  /** Signs and broadcasts. Resolves with the tx hash once the node accepted it. */
  send(call: StampCall, gas: bigint, fees: StampFees): Promise<Hex>;
  /** Never throws: an RPC failure while waiting is reported as a timeout (the tx may still land). */
  waitForReceipt(chain: ChainConfig, hash: Hex, timeoutMs: number): Promise<StampReceipt>;
}

// ------------------------------------------------------------------ queue and budget

/**
 * One job at a time, in arrival order. One per chain: one in-flight stamp tx per chain means no nonce clashes,
 * and each simulation sees the state left by the previous stamp.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  /** Jobs queued or running. */
  get size(): number {
    return this.pending;
  }

  /** null when the queue is full (the caller answers BUSY). */
  run<T>(job: () => Promise<T>): Promise<T> | null {
    if (this.pending >= this.max) return null;
    this.pending++;
    const result = this.tail.then(job);
    this.tail = result.then(
      () => this.pending--,
      () => this.pending--,
    );
    return result;
  }
}

/**
 * The relayer key's send queues, one SerialQueue per chain. Stamps and payments are sent from the same key, so they
 * share these queues (one in-flight tx per chain for the whole relayer): StampService and PayService get one instance.
 */
export class TxQueues {
  private readonly queues = new Map<number, SerialQueue>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get(chainId: number): SerialQueue {
    let q = this.queues.get(chainId);
    if (!q) {
      q = new SerialQueue(this.max);
      this.queues.set(chainId, q);
    }
    return q;
  }
}

/**
 * Daily stamp budget in wei (spec K layer 5), reset at 00:00 UTC. A send first reserves its worst case
 * (gas limit × maxFeePerGas); the receipt then settles the real cost. A tx whose receipt never came keeps its
 * reservation as spent, which errs on the safe side.
 */
export class DailyBudget {
  private day = -1;
  private spent = 0n;
  private reserved = 0n;
  private readonly limitWei: bigint;
  private readonly nowMs: () => number;

  constructor(limitWei: bigint, nowMs: () => number = Date.now) {
    this.limitWei = limitWei;
    this.nowMs = nowMs;
  }

  private roll() {
    const d = Math.floor(this.nowMs() / 86_400_000);
    if (d !== this.day) {
      this.day = d;
      this.spent = 0n;
    }
  }

  left(): bigint {
    this.roll();
    const left = this.limitWei - this.spent - this.reserved;
    return left > 0n ? left : 0n;
  }

  reserve(maxCostWei: bigint): boolean {
    if (maxCostWei > this.left()) return false;
    this.reserved += maxCostWei;
    return true;
  }

  settle(reservedWei: bigint, actualWei: bigint) {
    this.roll();
    this.reserved -= reservedWei;
    this.spent += actualWei;
  }

  release(reservedWei: bigint) {
    this.reserved -= reservedWei;
  }
}

// ------------------------------------------------------------------ request validation

export interface StampRequestBody {
  session: Session;
  sig: Hex;
  proof: Hex;
  publicInputs: Hex[];
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const SESSION_KEYS = ["wallet", "appId", "nonce", "expiresAt", "validUntilMonth", "chainId", "registry"];
/** A real UltraHonk proof is ~9.5 KB (14 KB+ is unexpected); this only bounds memory. */
export const MAX_PROOF_BYTES = 32 * 1024;
export const MAX_STAMP_BODY_BYTES = 128 * 1024;

function decimal(s: unknown, maxBits: number): s is string {
  return typeof s === "string" && /^\d{1,78}$/.test(s) && BigInt(s) < 1n << BigInt(maxBits);
}

function exactKeys(o: Record<string, unknown>, keys: string[]): boolean {
  const k = Object.keys(o);
  return k.length === keys.length && keys.every((x) => Object.hasOwn(o, x));
}

/** Strict F0 check of a /stamp body. Returns a normalised copy (canonical decimals, EIP-55, lowercase hex). */
export function parseStampRequest(body: unknown): StampRequestBody | { error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  // Unknown top-level keys are ignored (a caller may forward a whole /session response with qr and sessionId);
  // the session itself must be exactly the signed F1 struct.

  const s = b.session;
  if (!s || typeof s !== "object" || Array.isArray(s)) return { error: "session must be an object" };
  const so = s as Record<string, unknown>;
  if (!exactKeys(so, SESSION_KEYS)) return { error: `session must have exactly: ${SESSION_KEYS.join(", ")}` };
  if (typeof so.wallet !== "string" || !isAddress(so.wallet)) return { error: "session.wallet must be an address" };
  // The registry reverts ZeroWallet for address(0) (its "unbound nullifier" marker). Refused before any RPC.
  if (BigInt(so.wallet) === 0n) return { error: "session.wallet must not be the zero address" };
  if (!decimal(so.appId, 248)) return { error: "session.appId must be a 248-bit decimal string" };
  if (typeof so.nonce !== "string" || !HEX32.test(so.nonce)) return { error: "session.nonce must be bytes32 hex" };
  if (!decimal(so.expiresAt, 64)) return { error: "session.expiresAt must be a uint64 decimal string" };
  if (typeof so.validUntilMonth !== "number" || !Number.isInteger(so.validUntilMonth) || so.validUntilMonth < 0 || so.validUntilMonth > 0xffffffff)
    return { error: "session.validUntilMonth must be a uint32 JSON number" };
  if (!decimal(so.chainId, 256)) return { error: "session.chainId must be a decimal string" };
  if (typeof so.registry !== "string" || !isAddress(so.registry)) return { error: "session.registry must be an address" };

  if (typeof b.sig !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(b.sig)) return { error: "sig must be 65 bytes of hex" };
  if (typeof b.proof !== "string" || !/^0x([0-9a-fA-F]{2})+$/.test(b.proof)) return { error: "proof must be non-empty hex" };
  if ((b.proof.length - 2) / 2 > MAX_PROOF_BYTES) return { error: "proof is too large" };
  const pi = b.publicInputs;
  if (!Array.isArray(pi) || pi.length !== 6 || !pi.every((x) => typeof x === "string" && HEX32.test(x)))
    return { error: "publicInputs must be exactly 6 bytes32 hex strings" };

  return {
    session: {
      wallet: getAddress(so.wallet),
      appId: BigInt(so.appId).toString(),
      nonce: so.nonce.toLowerCase() as Hex,
      expiresAt: BigInt(so.expiresAt).toString(),
      validUntilMonth: so.validUntilMonth,
      chainId: BigInt(so.chainId).toString(),
      registry: getAddress(so.registry),
    },
    sig: b.sig.toLowerCase() as Hex,
    proof: b.proof.toLowerCase() as Hex,
    publicInputs: (pi as string[]).map((x) => x.toLowerCase() as Hex),
  };
}

/** secp256k1n / 2: the largest `s` the registry accepts (EIP-2). */
export const SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

/** A 65-byte r ‖ s ‖ v signature the registry's _recover would accept: v in {0, 1, 27, 28} and low s. */
export function isCanonicalSignature(sig: string): boolean {
  if (!/^0x[0-9a-fA-F]{130}$/.test(sig)) return false;
  const s = BigInt(`0x${sig.slice(66, 130)}`);
  const v = Number.parseInt(sig.slice(130, 132), 16);
  return s <= SECP256K1_HALF_N && (v === 0 || v === 1 || v === 27 || v === 28);
}

// ------------------------------------------------------------------ the flow

export interface StampSettings {
  appIds: Set<string>;
  chains: Map<number, ChainConfig>;
  sessionSigner: Address;
  budgetWei: bigint;
  maxGas: bigint;
  maxQueue: number;
  receiptTimeoutMs: number;
}

export interface StampOutcome {
  status: 200 | 400 | 401 | 404 | 422 | 502 | 503 | 504;
  body: Record<string, string>;
  /** Set for refusals and failures: what the route may log (with a truncated wallet). Never the body. */
  logReason?: string;
}

/** Gas limit = estimate + 20 %, never above the cap. */
export function gasLimitFor(estimate: bigint, maxGas: bigint): bigint {
  const padded = (estimate * 6n) / 5n;
  return padded > maxGas ? maxGas : padded;
}

export class StampService {
  private readonly queues: TxQueues;
  private readonly budgets = new Map<number, DailyBudget>();
  private readonly settings: StampSettings;
  private readonly writer: ChainWriter;
  private readonly nowMs: () => number;

  /** `queues`: pass the relayer's shared TxQueues so stamps and payments never send two txs at once. */
  constructor(settings: StampSettings, writer: ChainWriter, nowMs: () => number = Date.now, queues?: TxQueues) {
    this.settings = settings;
    this.writer = writer;
    this.nowMs = nowMs;
    this.queues = queues ?? new TxQueues(settings.maxQueue);
  }

  /** Each chain has its own budget: WBT on 1874 and devnet ETH on 1337 are different money. */
  budget(chainId: number): DailyBudget {
    let b = this.budgets.get(chainId);
    if (!b) {
      b = new DailyBudget(this.settings.budgetWei, this.nowMs);
      this.budgets.set(chainId, b);
    }
    return b;
  }

  queue(chainId: number): SerialQueue {
    return this.queues.get(chainId);
  }

  async handle(req: StampRequestBody): Promise<StampOutcome> {
    const { session } = req;
    const refuse = (status: StampOutcome["status"], error: string, extra: Record<string, string> = {}): StampOutcome => ({
      status,
      body: { error, ...extra },
      logReason: extra.reason ? `${error}:${extra.reason}` : error,
    });

    // Off-chain checks first: they cost neither gas nor an RPC call.
    if (!this.settings.appIds.has(session.appId)) return refuse(404, "UNKNOWN_APP");
    const chainId = Number(session.chainId);
    const chain = this.settings.chains.get(chainId);
    if (!chain) return refuse(400, "BAD_REQUEST", { message: "session.chainId must be 1874 or 1337" });
    if (!chain.registry) return refuse(503, "CHAIN_NOT_READY", { message: "no registry on this chain yet" });
    if (session.registry !== chain.registry) return refuse(422, "STAMP_REJECTED", { reason: "WrongRegistry" });
    // Same rules as the registry's _recover (and Android): v in {27, 28} (0/1 mapped), s <= secp256k1n / 2. The sdk's
    // recoverSessionSigner also accepts the high-s twin of a valid signature, which the chain would then refuse.
    if (!isCanonicalSignature(req.sig)) return refuse(401, "BAD_SIGNATURE");
    let signer: Address;
    try {
      signer = await recoverSessionSigner({ session, sig: req.sig });
    } catch {
      return refuse(401, "BAD_SIGNATURE");
    }
    if (signer !== this.settings.sessionSigner) return refuse(401, "BAD_SIGNATURE");

    const call: StampCall = { ...req, chain: { ...chain, registry: chain.registry } };
    const job = this.queue(chainId).run(() => this.send(call, refuse));
    if (!job) return refuse(503, "BUSY");
    return job;
  }

  /** Runs inside the chain's queue: at most one of these per chain at any time. */
  private async send(call: StampCall, refuse: (s: StampOutcome["status"], e: string, x?: Record<string, string>) => StampOutcome): Promise<StampOutcome> {
    const { writer, settings } = this;
    // Layer 1: simulate as the relayer. A revert is answered before any gas is spent.
    let estimate: bigint;
    let fees: StampFees;
    try {
      await writer.simulate(call);
      estimate = await writer.estimateGas(call);
      fees = await writer.fees(call.chain);
    } catch (err) {
      if (err instanceof StampRejected) return refuse(422, "STAMP_REJECTED", { reason: err.reason });
      return refuse(502, "CHAIN_UNAVAILABLE");
    }

    // Layer 4: per-tx gas cap. Layer 5: the separate daily stamp budget, reserved at the worst case.
    if (estimate > settings.maxGas) return refuse(422, "GAS_CAP");
    const gas = gasLimitFor(estimate, settings.maxGas);
    const maxCost = gas * fees.maxFeePerGas;
    const budget = this.budget(call.chain.chainId);
    if (!budget.reserve(maxCost)) return refuse(503, "BUDGET_CAP");

    let txHash: Hex;
    try {
      txHash = await writer.send(call, gas, fees);
    } catch {
      budget.release(maxCost);
      return refuse(502, "STAMP_SEND_FAILED");
    }

    const receipt = await writer.waitForReceipt(call.chain, txHash, settings.receiptTimeoutMs);
    if (receipt.status === "timeout") {
      budget.settle(maxCost, maxCost);
      return refuse(504, "STAMP_PENDING", { txHash });
    }
    budget.settle(maxCost, receipt.costWei);
    if (receipt.status === "reverted") return refuse(502, "STAMP_REVERTED", { txHash });
    return { status: 200, body: { txHash } };
  }
}
