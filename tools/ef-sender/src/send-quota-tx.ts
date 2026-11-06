// Builds (and with --send, submits) a WatermarkQuotaPaymaster-sponsored frame transaction for the alt mempool
// devnet (chain 1337), and keeps the paymaster's clock fresh (`poke` mode). Modelled on the alt mempool workshop's
// src/lib/frameTx/{build,send,predeploys}.ts and uses the same library, @forshtat/hegota-support (profile
// "ethrex-eip8141-tracer"). Runbook with the commands that worked on 2026-11-06: ../README.md.
//
// Run from tools/ef-sender (Node 24 strips the types itself):
//   node src/send-quota-tx.ts --paymaster 0x.. --target 0x.. [--data 0x..] [--seq N] [--deadline-in 840]
//                         [--max-fee-wei 1000000000] [--tip-wei 1000000] [--rpc https://altmempool.forshtat.com/rpc]
//                         [--send]                                    (SENDER_KEY env or --sender-key)
//   node src/send-quota-tx.ts poke --paymaster 0x.. [--send] [--every 60] (RELAYER_KEY env; a plain EIP-1559 tx)
//
// Without --send it never touches the network: it prints the frames, the encoded tx and the JSON-RPC payload (or
// the unsigned poke tx). With --send it first reads, read-only, the head block, the paymaster's lastSeen, TICK,
// MIN_LIFETIME, SPONSORED_MAX_FEE, SPONSORED_TIP and MAX_COST_PER_TX (eth_call), and the keyed-nonce sequence from
// NONCE_MANAGER (eth_getStorageAt); then it calls eth_sendFrameTransaction on the sidecar. Keys are never printed.
//
// Frame layout (docs/EF_PAYMASTER_DESIGN.md §1):
//   0 VERIFY  flags 0   -> 0x..8141   data = uint64be(deadline)          expiry_verify (protocol upper time bound)
//   1 VERIFY  flags 0x2 -> null       EOA default code, signatures[0]    only_verify
//   2 VERIFY  flags 0x1 -> paymaster  data = verifyAndPay()              pay
//   3 SENDER  flags 0   -> target     data = the user's call             user_op
//   4 DEFAULT flags 0   -> paymaster  data = consume()                   post_op
//   nonce_keys = [quotaKey(day(deadline))], nonce_seq = this day's next sequence
//   fees = exactly (SPONSORED_MAX_FEE, SPONSORED_TIP): the paymaster rejects anything else (review R1/R2)
//
// Time: the deadline is lastSeen + deadline-in (default MIN_LIFETIME + TICK + 120 = 840 s), i.e. CHAIN time, never
// the wall clock: on 2026-11-06 the devnet head was ~3.4 h behind the wall clock before the reset, so a wall-clock
// deadline failed DeadlineTooFar. 840 s survives one lastSeen advance (EF_PAYMASTER_DESIGN.md §2) and stays far
// below MAX_AHEAD.

import {
  concat,
  getAddress,
  hexToBytes,
  isAddress,
  keccak256,
  numberToHex,
  pad,
  toFunctionSelector,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as lib from "@forshtat/hegota-support/tx";
import { toWire } from "@forshtat/hegota-support/rpc";
import { getProfile } from "@forshtat/hegota-support/profiles";

type Hex = `0x${string}`;
type Address = `0x${string}`;

const profile = getProfile("ethrex-eip8141-tracer");

// ---------------------------------------------------------------------------------------------- constants
const CHAIN_ID = 1337;
const EXPIRY_VERIFIER: Address = "0x0000000000000000000000000000000000008141";
const NONCE_MANAGER = profile.predeploys!.NONCE_MANAGER as Address;
const DEFAULT_RPC = "https://altmempool.forshtat.com/rpc"; // miner sidecar; the gateway admitted but never mined
const EXEC_RPC = "https://altmempool.forshtat.com";
const SEL = {
  verify: toFunctionSelector("verifyAndPay()") as Hex,
  consume: toFunctionSelector("consume()") as Hex,
  poke: toFunctionSelector("poke()") as Hex,
  lastSeen: toFunctionSelector("lastSeen()") as Hex,
  tick: toFunctionSelector("TICK()") as Hex,
  minLifetime: toFunctionSelector("MIN_LIFETIME()") as Hex,
  maxFee: toFunctionSelector("SPONSORED_MAX_FEE()") as Hex,
  tip: toFunctionSelector("SPONSORED_TIP()") as Hex,
  maxCost: toFunctionSelector("MAX_COST_PER_TX()") as Hex,
};
const DAY = 86_400n;
const MAX_AHEAD = 3_600n; // WatermarkQuotaPaymaster.MAX_AHEAD
const TICK_DEFAULT = 300n; // WatermarkQuotaPaymaster.TICK
const MIN_LIFETIME_DEFAULT = 420n; // WatermarkQuotaPaymaster.MIN_LIFETIME = TICK + 120
// lastSeen may lag the head by at most TICK + STALE_SLACK before we refuse to send (the relayer missed a poke).
// A tx at the minimum deadline then still has >= 60 s (6 bundles of the 10 s miner) to land (EF_PAYMASTER_DESIGN.md §5).
const STALE_SLACK = 60n;
// Declared limits. Sidecar validationPrefix.ts: sum(limits.execution, frames 0..2) + 2800 (secp256k1) <= 100,000.
const LIMITS = {
  expiry: { execution: 5_000n, state: 0n }, // EIP-8141: the expiry frame must have limits.state == 0
  senderVerify: { execution: 10_000n, state: 0n },
  pay: { execution: 82_000n, state: 0n }, // 54,614 with cold stand-ins + 20k EIP-8250 first-use; 49,490 on the devnet
  consume: { execution: 60_000n, state: 20_000n }, // >= CONSUME_GAS_MIN (50k); state is a buffer, refunded if unused
};
const SECP256K1_SIG_COST = 2_800n;
const MAX_VERIFY_GAS = 100_000n;
// EIP-8141 @4a9ad32c "Gas Accounting" (standard_gas_limit): intrinsic + per-frame + calldata + signature costs.
const FRAME_TX_INTRINSIC_COST = 15_000n;
const FRAME_TX_PER_FRAME_COST = 475n;

// ---------------------------------------------------------------------------------------------- args
const POKE = process.argv[2] === "poke";
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
function addr(name: string, fallback: Address): Address {
  const v = arg(name) ?? fallback;
  if (!isAddress(v)) throw new Error(`--${name}: not an address: ${v}`);
  return getAddress(v) as Address;
}

const SEND = flag("send");
const rpcUrl = arg("rpc") ?? DEFAULT_RPC;
// Dummy defaults so a dry run works with no inputs. The default key is a public, throwaway test key (NOT a real
// key): keccak256("watermark/ef-sender/dummy-sender"). It is never used with --send.
const DUMMY_KEY = keccak256(toHex("watermark/ef-sender/dummy-sender")) as Hex;
const keyEnv = POKE ? "RELAYER_KEY" : "SENDER_KEY";
const key0 = (arg(POKE ? "relayer-key" : "sender-key") ?? process.env[keyEnv] ?? (SEND ? undefined : DUMMY_KEY)) as
  | Hex
  | undefined;
if (!key0) throw new Error(`--send needs ${keyEnv} (env) or --${POKE ? "relayer-key" : "sender-key"}`);
if (SEND && key0 === DUMMY_KEY) throw new Error("refusing to send with the dummy key");
const paymaster = addr("paymaster", "0x1111111111111111111111111111111111111111");

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await res.json()) as { result?: any; error?: { message?: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message ?? JSON.stringify(j.error)}`);
  return j.result;
}
const call = async (data: Hex): Promise<bigint> =>
  BigInt(await rpc(EXEC_RPC, "eth_call", [{ to: paymaster, data }, "latest"]));
const headTimestamp = async (): Promise<bigint> =>
  BigInt((await rpc(EXEC_RPC, "eth_getBlockByNumber", ["latest", false])).timestamp);
const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2);
const wallNow = () => BigInt(Math.floor(Date.now() / 1000));

// ---------------------------------------------------------------------------------------------- poke mode
if (POKE) {
  // Plain EIP-1559 tx to poke(): records block.timestamp in lastSeen. The relayer pays (~26k gas at ~7 wei base fee).
  const relayer = privateKeyToAccount(key0);
  const every = arg("every") ? BigInt(arg("every")!) : 0n;
  const pokeOnce = async () => {
    const base = {
      type: "eip1559" as const,
      chainId: CHAIN_ID,
      to: paymaster,
      data: SEL.poke,
      gas: 60_000n,
      maxFeePerGas: BigInt(arg("max-fee-wei") ?? "1000000000"),
      maxPriorityFeePerGas: BigInt(arg("tip-wei") ?? "1000000"),
    };
    if (!SEND) {
      console.log(json({ mode: "POKE DRY RUN (no network calls)", from: relayer.address, tx: base }));
      console.log("\n--send not given: nothing was sent.");
      return;
    }
    const [head, last, tick] = [await headTimestamp(), await call(SEL.lastSeen), await call(SEL.tick)];
    if ((head / tick) * tick <= last) {
      console.log(`poke: lastSeen ${last} is current for head ${head} (TICK ${tick}); nothing to do`);
      return;
    }
    const nonce = BigInt(await rpc(EXEC_RPC, "eth_getTransactionCount", [relayer.address, "pending"]));
    const raw = await relayer.signTransaction({ ...base, nonce: Number(nonce) });
    const hash = await rpc(EXEC_RPC, "eth_sendRawTransaction", [raw]);
    console.log(`poke: head ${head}, lastSeen ${last} (lag ${head - last} s) -> sent ${hash}`);
  };
  await pokeOnce();
  if (SEND && every > 0n) setInterval(() => pokeOnce().catch((e) => console.error(String(e))), Number(every) * 1000);
} else {
  await buildAndMaybeSend();
}

// ---------------------------------------------------------------------------------------------- frame tx mode
async function buildAndMaybeSend() {
  const senderKey = key0!;
  const target = addr("target", "0x2222222222222222222222222222222222222222");
  const callData = (arg("data") ?? "0xd09de08a") as Hex; // default: increment()
  const userLimits = { execution: BigInt(arg("user-exec") ?? "100000"), state: BigInt(arg("user-state") ?? "100000") };
  let tick = TICK_DEFAULT;
  let maxFeePerGas = BigInt(arg("max-fee-wei") ?? "1000000000"); // DeployQuotaPaymaster default SPONSORED_MAX_FEE
  let maxPriorityFeePerGas = BigInt(arg("tip-wei") ?? "1000000"); // DeployQuotaPaymaster default SPONSORED_TIP
  let maxCostCap = 10n ** 15n; // DeployQuotaPaymaster default MAX_COST_PER_TX
  let minLifetime = MIN_LIFETIME_DEFAULT;

  const account = privateKeyToAccount(senderKey);
  const sender = account.address as Address;

  // Chain time. Dry run: wall clock stands in for both head and lastSeen.
  let head = wallNow();
  let lastSeen = (head / TICK_DEFAULT) * TICK_DEFAULT; // dry run: as if poked in the current TICK
  const notes: string[] = [];
  if (SEND) {
    head = await headTimestamp();
    lastSeen = await call(SEL.lastSeen);
    minLifetime = await call(SEL.minLifetime);
    tick = await call(SEL.tick);
    maxCostCap = await call(SEL.maxCost);
    const pinnedFee = await call(SEL.maxFee);
    const pinnedTip = await call(SEL.tip);
    if (arg("max-fee-wei") && maxFeePerGas !== pinnedFee) throw new Error(`--max-fee-wei must be ${pinnedFee}`);
    if (arg("tip-wei") && maxPriorityFeePerGas !== pinnedTip) throw new Error(`--tip-wei must be ${pinnedTip}`);
    [maxFeePerGas, maxPriorityFeePerGas] = [pinnedFee, pinnedTip];
    if (head > lastSeen + tick + STALE_SLACK) {
      throw new Error(
        `paymaster lastSeen ${lastSeen} is ${head - lastSeen} s behind the head ${head} (max ${tick + STALE_SLACK}): ` +
          `run 'node src/send-quota-tx.ts poke --paymaster ${paymaster} --send' first`,
      );
    }
    const lag = wallNow() - head;
    if (lag > 60n) notes.push(`WARNING: head block is ${lag} s older than the wall clock; the devnet may be stalled`);
  }
  const deadlineIn = BigInt(arg("deadline-in") ?? String(minLifetime + tick + 120n));
  const deadline = lastSeen + deadlineIn;
  const day = deadline / DAY;
  const quotaKey = (BigInt(paymaster) << 96n) | (day & 0xffffffffffffffffn);
  const slot = keccak256(concat([pad(sender, { size: 32 }), numberToHex(quotaKey, { size: 32 })]));

  let seq = BigInt(arg("seq") ?? "0");
  if (SEND) seq = BigInt(await rpc(EXEC_RPC, "eth_getStorageAt", [NONCE_MANAGER, slot, "latest"]));

  const frames = [
    lib.frame(profile, "VERIFY", { target: EXPIRY_VERIFIER, ...LIMITS.expiry, data: numberToHex(deadline, { size: 8 }) }),
    lib.frame(profile, "VERIFY", { scope: "EXECUTION", target: null, ...LIMITS.senderVerify }),
    lib.frame(profile, "VERIFY", { scope: "PAYMENT", target: paymaster, ...LIMITS.pay, data: SEL.verify }),
    lib.frame(profile, "SENDER", { target, ...userLimits, data: callData }),
    lib.frame(profile, "DEFAULT", { target: paymaster, ...LIMITS.consume, data: SEL.consume }),
  ];
  const unsigned = lib.newTx({
    chainId: CHAIN_ID,
    sender,
    nonceSeq: seq,
    nonceKeys: [quotaKey],
    frames,
    signatures: [lib.secp256k1Placeholder(profile, "0x")], // index 0: EOA default code checks EXECUTION against it
    fees: { maxFeePerGas, maxPriorityFeePerGas }, // both explicit: hegota defaults the tip to maxFeePerGas
  });
  const tx = await lib.signTx(profile, unsigned, senderKey);

  // ------------------------------------------------------------------------------------------- self-checks
  const bytesCost = (h: Hex) => hexToBytes(h).reduce((s: bigint, b: number) => s + (b === 0 ? 4n : 16n), 0n);
  const frameDataCost = frames.reduce((s: bigint, f) => s + bytesCost(f.data as Hex), 0n);
  const sigDataCost = tx.signatures.reduce(
    (s: bigint, g) => s + bytesCost((g.signer || "0x") as Hex) + bytesCost(g.msg as Hex) + bytesCost(g.signature as Hex),
    0n,
  );
  const frameLimits = frames.reduce((s: bigint, f) => s + f.limits.execution + f.limits.state, 0n);
  const maxGas = FRAME_TX_INTRINSIC_COST + BigInt(frames.length) * FRAME_TX_PER_FRAME_COST + frameDataCost + sigDataCost +
    SECP256K1_SIG_COST + frameLimits;
  const maxCost = maxGas * maxFeePerGas;
  const verifyGas = LIMITS.expiry.execution + LIMITS.senderVerify.execution + LIMITS.pay.execution + SECP256K1_SIG_COST;
  const raw = lib.encodeTx(profile, tx) as Hex;
  const roundTripOk = lib.encodeTx(profile, lib.decodeTx(profile, raw)) === raw;
  const checks = {
    [`prefix verify gas ${verifyGas} <= MAX_VERIFY_GAS ${MAX_VERIFY_GAS}`]: verifyGas <= MAX_VERIFY_GAS,
    [`deadline ${deadline} >= lastSeen + MIN_LIFETIME (${lastSeen + minLifetime})`]: deadline >= lastSeen + minLifetime,
    [`deadline ${deadline} >= head + 60 (${head + 60n})`]: deadline >= head + 60n,
    [`deadline ${deadline} <= lastSeen + MAX_AHEAD (${lastSeen + MAX_AHEAD})`]: deadline <= lastSeen + MAX_AHEAD,
    [`max_cost ${maxCost} (max_gas ${maxGas}) <= MAX_COST_PER_TX ${maxCostCap}`]: maxCost <= maxCostCap,
    [`fees pinned: max_fee ${maxFeePerGas}, tip ${maxPriorityFeePerGas}`]:
      tx.fees.maxFeePerGas === maxFeePerGas && tx.fees.maxPriorityFeePerGas === maxPriorityFeePerGas,
    "nonce key != 0 and is the only key": quotaKey !== 0n && tx.nonceKeys.length === 1,
    "frame 0 data is 8 bytes": frames[0]!.data.length === 2 + 16,
    "decode(encode(tx)) re-encodes identically": roundTripOk,
  };

  // ------------------------------------------------------------------------------------------- output
  const payload = { jsonrpc: "2.0", id: 1, method: "eth_sendFrameTransaction", params: [toWire(tx)] };
  console.log(json({
    mode: SEND ? "SEND" : "DRY RUN (no network calls; wall clock stands in for head and lastSeen)",
    sender,
    paymaster,
    time: { head, lastSeen, tick, deadline, deadlineIso: new Date(Number(deadline) * 1000).toISOString() },
    quota: { day, nonceKey: numberToHex(quotaKey, { size: 32 }), nonceSeq: seq, nonceManagerSlot: slot },
    fees: tx.fees,
    frames: frames.map((f, i) => ({ i, mode: f.mode, flags: f.flags, target: f.target, limits: f.limits, data: f.data })),
    maxGas,
    maxCostWei: maxCost,
    sigHash: lib.sigHash(profile, tx),
    txHash: lib.txHash(profile, tx),
    checks,
    notes,
  }));
  console.log("\nencoded tx (0x06 || rlp(payload), what eth_sendRawTransaction would take):");
  console.log(raw);
  console.log("\nJSON-RPC payload for the alt mempool sidecar:");
  console.log(json(payload));

  if (Object.values(checks).some((ok) => !ok)) {
    console.error("\nself-check failed");
    process.exit(1);
  }
  if (SEND) {
    const hash = await rpc(rpcUrl, "eth_sendFrameTransaction", [toWire(tx)]);
    console.log(`\nadmitted: ${hash}`);
    console.log(
      `explorer: https://explorer.altmempool.wtf/tx/${String(hash).toLowerCase()}?node=${encodeURIComponent(rpcUrl)}`,
    );
  } else {
    console.log("\n--send not given: nothing was sent.");
  }
}
