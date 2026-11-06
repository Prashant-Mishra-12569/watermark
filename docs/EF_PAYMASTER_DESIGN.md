# WatermarkQuotaPaymaster: design for the standard alt mempool (chain 1337)

The full design behind `docs/EF_ALTMEMPOOL.md` (the short submission doc). Section numbers are cited from code
comments.

## Status (2026-11-06)

- Deployed, funded and staked on the devnet after its reset; one sponsored 5-frame tx was admitted by the alt mempool
  sidecar and mined (block 3699, all 5 frames succeeded, payer = the paymaster, user balance 0).
  Addresses and hashes: `deployments/devnet.json`; links: `docs/EF_ALTMEMPOOL.md` (Results).
- Everything else here (attacks, gas margins, opcode and storage audits) is **tested in Foundry only** with stand-in
  frame helpers, unless a line says otherwise.
- Items marked UNTESTED have not run on the devnet.

## Where things are

| What | Path |
|---|---|
| Contract | `contracts/src/WatermarkQuotaPaymaster.sol` (+ `src/interfaces/IStampExpiry.sol`, `IStakingRegistry.sol`) |
| Demo target | `contracts/src/demo/DemoCounter.sol` |
| Tests | `contracts/test/WatermarkQuotaPaymaster.t.sol` (builder tests) and `contracts/test/review/` (reviewer tests). Both run against the repo's real `WatermarkRegistry`, stamped with `vm.store` at its `stampExpiry` slot. |
| Frame-helper stand-ins | `contracts/test/mocks/HegotaMocks.sol`, `NaiveStakingRegistryStandIn.sol` |
| Scripts | `contracts/script/{DeployQuotaPaymaster,StampFromFixture}.s.sol` |
| Sender, heartbeat, runbook | `tools/ef-sender/` |
| Frame opcodes for Solidity | `contracts/vendor/hegota-support/` (MIT, vendored) |

Sources (fetched 2026-11-06, not committed; "L" = line in that version):
- EIP-8141@4a9ad32c, EIP-8250@81b976ac, EIP-8272@d8636a33.
- ERC-7562 PR#6 @74a868cd, ERC-8421 @493ba8ac (ethereum/ERCs PR #2028).
- Sidecar forshtat/mempool-workshop-sidecar@2e22ff0 (paths below are relative to `packages/executor/src/`).
- ethrex forshtat/ethrex@9aa3645d (the devnet build).
- The alt mempool workshop repo (`mempool-workshop`).

---

## 0. The problem and the answer in one paragraph

The paymaster's VERIFY frame must answer two time-dependent questions: is the stamp still valid, and how many
sponsored txs has this wallet had today. It may not execute TIMESTAMP or NUMBER: these are banned in every
validation-prefix frame for every entity, staked or not (EIP-8141 L819-849; PR#6 OP-011; sidecar `bannedOpCodes`
validators/frameTx.ts L68-87, summed over nested calls). It also cannot write a counter, because VERIFY runs as a
STATICCALL (EIP-8141 L380-384). So:

- **Upper time bound from the protocol.** A leading `expiry_verify` frame with deadline `E` means any included tx has
  `t <= E` (EIP-8141 L287-349). Nodes drop the tx once `E` passes (ERC-8421 PREFIX-080, L164).
- **Lower time bound from our own storage.** `lastSeen` is written only by execution frames (`consume()` and the
  public `poke()`), as `block.timestamp` rounded down to a 5-minute TICK. It only grows, so `lastSeen <= t`.
  VERIFY requires `lastSeen + MIN_LIFETIME <= E <= lastSeen + MAX_AHEAD`, that is `[+7 min, +1 h]`.
- **The counter belongs to the protocol.** The tx must use exactly one EIP-8250 nonce key, `K(day(E))`, with
  `nonce_seq < quotaPerDay`. The protocol checks `nonce_seq` before any frame runs. It advances it inside our own
  `APPROVE(PAYMENT)`, and no later revert can undo that (EIP-8250 L139-176). The paymaster writes nothing during
  validation.
- **Stamp check without TIMESTAMP.** `registry.stampExpiry(sender, appId) >= E`, using the committed registry's
  public getter: one SLOAD. Then `t <= E <= expiry`.
- **Fees pinned exactly.** `max_fee_per_gas == SPONSORED_MAX_FEE` and `max_priority_fee_per_gas == SPONSORED_TIP`.
  The sender cannot turn our `max_cost` into a tip, and a pending tx can never be replaced, so replacements cannot
  feed `seen` (§5).

---

## 1. Frame shape (F9 corrected: 5 frames, not 4)

| # | Mode | Target | Flags | Data | Limits [exec, state] | Role (sidecar `classifyFrame`) |
|---|---|---|---|---|---|---|
| 0 | VERIFY (1) | `0x…8141` EXPIRY_VERIFIER | `0x0` | `uint64be(E)` (8 bytes) | [5,000, 0] | `expiry_verify`, attributed to no entity |
| 1 | VERIFY (1) | `null` (= tx.sender) | `0x2` EXECUTION | empty | [10,000, 0] | `only_verify`: EOA default code checks `signatures[0]` |
| 2 | VERIFY (1) | WatermarkQuotaPaymaster | `0x1` PAYMENT | `verifyAndPay()` = `0xef130ba6` | [82,000, 0] | `pay` |
| 3 | SENDER (2) | user's target (demo: `DemoCounter.increment()`) | `0x0` | user calldata | [100,000, 100,000] (user's choice) | `user_op` |
| 4 | DEFAULT (0) | WatermarkQuotaPaymaster | `0x0` | `consume()` = `0x1dedc6f7` | [60,000, 20,000] | `post_op` |

Envelope:
- `nonce_keys = [quotaKey(E / 86400)]`, and `nonce_seq` = the next sequence of that key (0..N-1).
- `fees = {max_fee_per_gas: SPONSORED_MAX_FEE (1 gwei), max_priority_fee_per_gas: SPONSORED_TIP (1e6 wei)}`.
- `signatures = [SECP256K1, signer "0x", msg "0x"]`, `recent_root_references = []`.

Why this shape is admitted:
- `[only_verify, pay]` is a recognised prefix. An `expiry_verify` may come first and is skipped for shape matching
  (EIP-8141 L729-792; PR#6 FRA-010..030; sidecar validationPrefix.ts L183-185).
- `APPROVE(PAYMENT)` reverts unless the sender already approved execution, so the sender's frame comes first
  (EIP-8141 L554).
- There is no ATOMIC flag in the prefix and no VERIFY after it (validationPrefix.ts L255-276). Frames 3-4 come after
  the prefix and are not subject to mempool rules (EIP-8141 L695-697).
- Frame 0: `limits.state == 0`, flags 0, value 0, 8 data bytes (EIP-8141 L292-296).
- The pay frame calls a named function rather than a fallback. That is why `receive()` can take top-ups and stake
  refunds (unlike the workshop's SponsorPaymaster, whose fallback runs APPROVE on a plain transfer and halts;
  workshop AGENTS.md L69-70).

What VERIFY pins (`verifyAndPay` in `contracts/src/WatermarkQuotaPaymaster.sol`):
- 5 frames, current index 2.
- Frame 0: target 0x8141, mode VERIFY, data length 8.
- Frame 3: SENDER, flags 0.
- Frame 4: target this, DEFAULT, flags 0, data = the 4-byte `consume()` selector,
  `limits.execution >= CONSUME_GAS_MIN (50,000)`.
- Fees exactly `(SPONSORED_MAX_FEE, SPONSORED_TIP)`; `max_cost <= MAX_COST_PER_TX`.
- `lastSeen + MIN_LIFETIME <= E <= lastSeen + MAX_AHEAD`.
- One nonce key, equal to `quotaKey(E / 86400)`, with `seq < QUOTA_PER_DAY`.
- `stampExpiry(sender, APP_ID) >= E`.
- Then `APPROVE(PAYMENT)`, last.
- Frame 1 needs no check: if it did not approve execution, our APPROVE reverts.

---

## 2. Time without banned opcodes

| Bound | Source | Why it holds |
|---|---|---|
| `t <= E` | frame 0: `FRAMEPARAM(0, target) == 0x8141`, mode VERIFY, data length 8, `E = FRAMEDATALOAD(0, 0) >> 192` | The canonical code reverts unless `block.timestamp <= E`, and a reverting VERIFY invalidates the tx (EIP-8141 L287-349, L382-384). The devnet has the canonical code at 0x8141 (eth_getCode). |
| `t >= lastSeen` | paymaster slot 0 | Only `_touch()` writes it (`consume()` in frame 4, `poke()`), in execution frames where TIMESTAMP is allowed, as `max(lastSeen, floor(block.timestamp / TICK) * TICK)`. |
| `E <= lastSeen + MAX_AHEAD` (1 h) | VERIFY | so `E - t <= 1 h`: a tx can claim only today's day key, or tomorrow's in the last hour before UTC midnight (`test_futureDayQuotaCannotBeClaimed`). |
| `E >= lastSeen + MIN_LIFETIME` (TICK + 2 min = 7 min) | VERIFY | While the relayer keeps `lastSeen` current (at most `TICK + 60 s` behind the head), an admitted tx has at least about 60 s left, so it is mined rather than cancelled when it expires (§5 R2a). |

**Why TICK (5 min).** Any lower bound on `E` that is tied to a growing `lastSeen` can be broken for a pending tx by
advancing `lastSeen`, and `poke()` is public. A tx at the minimum deadline then fails revalidation, or the VERIFY at
inclusion, with `DeadlineTooSoon`. The sidecar cancels it, which is a `seen` with no `included` (§5 R2a'). With
per-block `lastSeen`, an attacker could do this every block. With whole TICKs, `lastSeen` advances at most once per
TICK however often anyone pokes (`test_lastSeenAdvancesAtMostOncePerTick`), so this grief is capped at one per TICK per
(wallet, key) (`test_selfPokeCancelsAtMostOncePerTick`: 12 per hour).

The sender's default deadline is `lastSeen + MIN_LIFETIME + TICK + 120 s = lastSeen + 840 s`, which survives one
advance (`test_minimumDeadlineSurvivesPokesWithinTheTick`).

**Liveness: it fails closed.** If nobody refreshes `lastSeen`, `E <= lastSeen + 1 h` eventually fails and so does
every sponsored tx; nothing is paid.
- The relayer runs `send-quota-tx.ts poke --send --every 60`. It sends a plain `poke()` (about 26k gas, paid by the
  relayer) only when a TICK boundary has passed without a refresh.
- Sponsored traffic refreshes `lastSeen` for free through `consume()`.
- The sender refuses to send when `head - lastSeen > TICK + 60 s`.

**Chain time, not wall-clock time.** The sender computes `E` from `lastSeen`, so from chain time. On 2026-11-06 the
devnet head was about 3.4 h behind the wall clock, and any wall-clock deadline would have failed `DeadlineTooFar`.

### Alternative considered: EIP-8272 recent roots (documented, not built)

A declared reference `(source, S, root)` proves `S < current_slot <= S + 8191` (EIP-8272 L202-227), which would be a
trustless lower bound. We did not use it, for four reasons:
- The devnet opcode is `0xB6` and the count TXPARAM is `0x11` (ethrex opcodes.rs L182-190, frame_tx.rs L343-352), and
  there is no HegotaSupport helper for it.
- Nobody has read a root in VERIFY on the devnet yet.
- A root write costs about 127k gas against about 26k for `poke()`.
- It needs a slot-to-time constant (`T(S) = 1791464620 + 6·S`), which a devnet reset would change.

It would not remove the R2a' trade-off either: a later root makes an older reference just as stale. Swapping it in
would be a local change (replace the `lastSeen` read).

---

## 3. The daily quota and why it cannot be bypassed

`quotaKey(day) = uint160(paymaster) << 96 | uint64(day)`: never zero, and domain-separated per paymaster. VERIFY
requires:
- `TXPARAM(0x0E) == 1`: exactly one key, so key 0 covers the whole key set (EIP-8250 L224-233).
- `TXPARAM(0x10) == quotaKey(E / 86400)`.
- `nonce_seq < QUOTA_PER_DAY`.

At our `APPROVE(PAYMENT)`, NONCE_MANAGER (`0x…8250`) writes `seq + 1` (ethrex vm.rs L1961-1997), and that write
"MUST NOT be reverted by a later frame revert" (EIP-8250 L174).

| Attack | Result |
|---|---|
| Replay or reuse a seq | invalid before any frame runs; nobody pays |
| seq >= N, another key, two keys, legacy key 0 | `QuotaExhausted` / `WrongNonceKey` / `BadNonceKeyCount` |
| Claim a future day | `DeadlineTooFar` |
| Make the user call revert to keep the quota | the quota is consumed at APPROVE, before frame 3 runs |
| Many wallets | each needs its own stamp; one card nullifier binds to one wallet per app (registry check 7) |
| Tip the block builder with our money (R1) | `WrongFees`: fees are pinned. Worst case per tx is `max_gas × (base + 1e6 wei)`, about 1e-6 ETH |
| Starve or skip `consume()` | target, mode, flags, selector and gas floor are pinned; frame count is exactly 5 |
| Burn someone else's quota | impossible: only the sender's signature can use `(sender, key)` |

Bound: at most N sponsored txs per wallet per day key, and at most N·(D+1) over D days.
- "Quota left" = `N - NONCE_MANAGER[nonceSlot(wallet, day)]`, read with `eth_getStorageAt`.
- NONCE_MANAGER's code reverts on calls, so no on-chain view of it is possible.

---

## 4. `consume()`: what it is for and how it authenticates

`consume()` is bookkeeping only. It refreshes `lastSeen` and emits `Sponsored(wallet, day, seq, sigHash)`. It never
decides payment. Authentication:
- `msg.sender == 0x…aa`: only top-level DEFAULT or VERIFY frames have that caller (EIP-8141 L369-375).
- TXPARAM halts outside a frame tx (`test_consumeOutsideFrameTx`, with the real helpers).
- `TXPARAM(0x0A) == 4` and `TXPARAM(0x09) == 5`.
- Frame 2 is our VERIFY: target == this, mode VERIFY, scope 1, status 1, `verifyAndPay()` selector. That last check
  rules out a VERIFY frame that only called a view (`test_consumeWhenOurVerifyFrameCalledAView`).
- We do not use TXPARAM `0x12` (resolved payer, an ethrex knob).

`poke()` needs no authentication: it can only write the true time, and only once per TICK.

---

## 5. Failure semantics, who pays, and reputation (corrected after review)

| Event | Effect |
|---|---|
| Frame 0, 1 or 2 reverts | the tx is invalid; **nobody pays** (EIP-8141 L382-384, L392) |
| Frame 3 (user call) reverts | only frame 3's state is discarded. We pay the gas used at `base + SPONSORED_TIP` per gas; the unused `max_cost` is refunded (EIP-8141 L479-490). The quota slot stays consumed. `consume()` still runs. |
| Frame 4 reverts | only `lastSeen` and the event are lost. We still pay. |
| Free SENDER call? | No. Payment requires all of VERIFY to pass, and that consumes one of the N slots. |
| Batch tricks | frame 3 must have flags 0; APPROVE(PAYMENT) is rejected inside a batch (ethrex `ApproveRejection::InAtomicBatch`) |

The earlier claim here, "no cancels can land on our reputation", was **wrong** (review R2).

How the sidecar counts reputation:
- It bumps the payer's `seen` on every admission **and on every replacement** (services/MempoolService/service.ts
  L305-312, outside the add/replace branches). That contradicts ERC-8421 REPUTATION-040 (L259).
- It bumps `included` only for a successful receipt (`OnChain`, service.ts L186-189). A receipt fails if any frame
  fails (ethrex vm.rs L3449-3470).
- The status is BANNED when `floor(seen/10) > included + 50`, THROTTLED at `+10` (entities/ReputationEntry.ts L53-58;
  config.ts L601-603). A banned payer is refused for every tx (services/ReputationService.ts L164-169).
- Decay applies only per whole idle hour, and every update resets the clock (ReputationEntry.ts L36-51, L85-88). So
  counts never decay while there is activity at least once an hour.

| Grief vector (all zero-cost to a stamped wallet before the fix) | Status now |
|---|---|
| **R2a.** Deadline that expires right after admission (admission simulates at the head header's timestamp; PREFIX-080 only drops already-expired txs) | **Closed while `lastSeen` is fresh** by `E >= lastSeen + MIN_LIFETIME`. Reopens if the relayer stops poking for more than about 5 min with no traffic, so the sender and the relayer guard against that. |
| **R2a'.** Self-poke after admission so a minimum-deadline tx fails revalidation (found while fixing R2a) | **Bounded** to 1 per TICK per (wallet, key), 12 per hour, by TICK quantization. |
| **R2b.** Same-slot replacements (each one a `seen`; the 110% rule rounds to zero at max fee <= 9 wei) | **Closed.** Exact fees mean no replacement can raise `max_fee_per_gas` by 10%, and `SPONSORED_MAX_FEE >= 10` is enforced in the constructor. Only the sidecar's 300 s TTL replacement remains, which a valid, includable tx never reaches. |
| **R2c.** User frame reverts (`seen` without `included`) | Bounded by N per wallet per day, and each one spends quota. |

Residual risk:
- One stamped wallet with R2a' alone: about 12 `seen` per hour, minus 10 for every `included`. Reaching BANNED from
  zero needs more than 510 net, which is about 40 hours of continuous attack by one wallet, or about 4 hours by 10
  wallets, each backed by its own real card.
- Adding R2c (N = 20 per wallet per day) does not change the order of magnitude.
- This is a sidecar-policy issue. ERC-8421 REPUTATION-040 and REPUTATION-310 would remove most of it; see the asks in
  §13.
- Mitigation if it happens: whitelisting, or a fresh paymaster address.

---

## 6. Storage reads: why only the staked alt mempool admits this

VERIFY reads exactly two slots and writes none. Evidence: `vm.accesses` in
`test_verifyStorageAccessIsOwnSlotPlusOneRegistrySlot`, and the sidecar decision table in
`test_payFrame_storage_sidecarDecisionTable`, run against the real committed registry.

| Slot | Rule that allows it | Canonical EIP-8141 mempool |
|---|---|---|
| paymaster slot 0 (`lastSeen`) | own storage of a **staked** entity: ERC-8421 STORAGE-031 (L207), PR#6 STO-031; sidecar `addr === entityAddr` needs stake (frameTx.ts L772-773) | rejected: SLOAD only on tx.sender (L851) |
| registry `keccak(pad(appId) . keccak(pad(wallet) . 4))` = `stampExpiry[wallet][appId]` | not sender-associated (preimage starts with appId). Allowed read-only for a **staked** entity: STORAGE-032 (L208), STO-033; sidecar frameTx.ts L774-775 then stake check L791-797 | rejected |

There is no BALANCE or SELFBALANCE: the sidecar's solvency rule checks our balance for us (SOLVENCY-010). The canonical
mempool also allows only one pending tx per non-canonical paymaster (EIP-8141 L691, L709).

The short version: **only the staked alt mempool can run a paymaster whose validation depends on its own clock and on
a registry of real-card stamps, with many users pending at once.**

Opcode audit (`-vvv`): 1,563 pay-frame opcodes in the paymaster and the real registry, in both the builder's and the
reviewer's test. None is banned. GAS appears only directly before a *CALL, and no CALL carries value. A negative control shows
the same auditor flags the TIMESTAMP in `isStamped()`.

Staking: `stake(uint32)` is owner-only, needs value and a delay of at least 1 day, and calls `addStake` from the
paymaster itself, because the registry keys on msg.sender. We use 0.012 ETH and 86400 s.
- `unlockStake()` ends sponsorship immediately.
- The balance must cover `max_cost` for every pending sponsored tx: about 4e-4 ETH each at 1 gwei
  (`max_gas` about 398k).

---

## 7. Verify gas budget

The deployed sidecar applies a **flat 100,000 cap** to the sum of the declared `limits.execution` of frames 0-2 plus
2,800 per secp256k1 signature, whatever the stake (validationPrefix.ts L10, L250-293). It does not apply ERC-8421's
per-entity budget (BUDGET-010). PLAN.md correction 9 ("1,000,000 staked") is wrong for the live node.

| Item | Declared | Measured |
|---|---|---|
| frame 0 expiry | 5,000 | canonical code, a few dozen gas; the rest is a buffer for a cold-access charge |
| frame 1 sender (EOA default code) | 10,000 | ethrex charges 0 (frame_tx.rs `execute_default_verify`) |
| frame 2 pay | 82,000 | 54,614 (frozen stand-ins, all accounts cold) + 20,000 EIP-8250 first-use = **74,614**. Reviewer's devnet-pricing model (3,000 frame-entry + 5×400 EIP-8038 cold surcharge): 50,276 with lean helpers, **75,759 worst case**. Margin about 6.2k. |
| signature | 2,800 | – |
| **sum** | **99,800 <= 100,000** | |
| frame 4 consume | 60,000 (floor 50,000) | 41,539 frozen and cold; 22,377 under devnet pricing, warm |

**On the devnet** (tx `0xcab8…8a93`, `frameReceipts.gasUsed`): frame 0 = 3,051, frame 1 = 100, frame 2 (pay,
first sponsored tx of that day) = **49,490** of 82,000 declared, frame 3 = 16,928 (+ 98,000 state gas for the new
counter slot), frame 4 = 5,472. Total 191,864 gas, paid by the paymaster at 1,000,007 wei/gas. One sample only; an
out-of-gas anywhere in the prefix means rejection (frameTx.ts L660-672).

---

## 8. Registry: no change needed

The paymaster calls the committed getter `stampExpiry(address wallet, uint256 appId) returns (uint64)`
(`IStampExpiry`): one SLOAD, no environment opcode. `isStamped()` executes TIMESTAMP and must never run in VERIFY.
The slot `keccak(pad(appId) . keccak(pad(wallet) . 4))` is not associated with the wallet, so only a staked paymaster
may read it (§6). Flipping the key order would allow an unstaked read, but we are staked anyway (we read our own
`lastSeen`), and it would change the registry bytecode on both chains. So the registry is unchanged.

## 9. Contract surface (replaces F5's WatermarkQuotaPaymaster block)

```solidity
constructor(address registry, uint256 appId, uint32 quotaPerDay, uint256 maxCostPerTx, address stakingRegistry,
            uint256 sponsoredMaxFee, uint256 sponsoredTip) payable;   // maxFee >= 10, tip <= maxFee
function verifyAndPay() external;                       // frame 2 (VERIFY, flags 0x1); ends in APPROVE(PAYMENT)
function consume() external;                            // frame 4 (DEFAULT); heartbeat + Sponsored event
function poke() external;                               // anyone; lastSeen = max(lastSeen, floor(now / TICK) * TICK)
function quotaKey(uint256 day) external view returns (uint256);
function nonceSlot(address wallet, uint256 day) external view returns (bytes32); // NONCE_MANAGER slot
function lastSeen() external view returns (uint64);
function stake(uint32 unstakeDelaySec) external payable; // owner; calls stakingRegistry.addStake itself
function unlockStake() external; function withdrawStake(address payable) external; function withdraw(address payable, uint256) external;
receive() external payable;
event Sponsored(address indexed wallet, uint64 indexed day, uint256 seq, bytes32 sigHash);
```

Constants and defaults:
- Constants: `TICK = 300`, `MIN_LIFETIME = 420`, `MAX_AHEAD = 3600`, `MIN_SPONSORED_MAX_FEE = 10`,
  `CONSUME_GAS_MIN = 50_000`, `MIN_UNSTAKE_DELAY = 1 days`, `FRAME_COUNT = 5`.
- Deploy defaults: quota 20, `maxCostPerTx = 1e15` (1M gas at 1 gwei), `sponsoredMaxFee = 1 gwei`,
  `sponsoredTip = 1e6 wei`, funding 0.05 ETH, stake 0.012 ETH for 86400 s.
- The tip equals ethrex `MIN_GAS_TIP`, which is used only by its fee estimators. The payload builder has no tip filter
  (payload.rs L754-755). The sidecar's optional `enforceGasPrice` filter is off by default (config.ts L617). A 1e6 tip
  passes it at the oracle floor.

Toolchain:
- HegotaSupport is vendored under `contracts/vendor/hegota-support/` with its pragma relaxed to `^0.8.28`, and no
  code change (solc 0.8.30, prague).
- forge-std v1.17.0 via `forge install`, as for the rest of `contracts/`.

---

## 10. Trade-offs

1. **Heartbeat dependency.** `lastSeen` must stay within about 5 min of the head (one TICK + 60 s) for sends, and
   within 1 h for anything to pass. Traffic or a cheap relayer `poke()` keeps it fresh. It fails closed.
2. **TICK granularity.** Deadlines must be 7-60 min after `lastSeen`, so a tx that is not mined lingers until `E`
   (default 14 min) before the user can re-sign. A tx at the minimum deadline can be cancelled by the next tick
   advance, which is why the sender adds one TICK of slack.
3. **Day-boundary slack.** Up to 2N in one calendar day (the last hour before UTC midnight), and N·(D+1) over D days.
4. **Serial per wallet.** The sidecar holds one pending tx per (sender, key), so each wallet's sponsored txs go one at
   a time.
5. **First tx of the day costs 20k more gas** (first use of the key), inside the 100k prefix cap.
6. **Five frames.** The post-op frame costs gas, but it gives the heartbeat-by-traffic and the on-chain event. Counting
   does not depend on it.
7. **Fixed fees.** If the devnet base fee rises above `SPONSORED_MAX_FEE` (1 gwei, against 7 wei today), sponsorship
   stops until we redeploy with a higher pin. Users can never speed up a tx.
8. **Reputation residuals** (§5): R2a' and R2c are bounded, not eliminated.
9. **Gas margin** of about 6-7k under the flat 100k cap on stand-ins; the one devnet tx used 49,490 of the pay
   frame's 82,000.
10. **Devnet-specific numbering** (TXPARAM 0x0E/0x10, helper CREATE nonces, 0x8141 code). It fails closed on change;
    redeploy on a devnet reset.
11. **Staking is mandatory.** Both VERIFY reads need it. `unlockStake` stops sponsorship.

---

## 11. Review findings: disposition

| ID | Verdict | What changed |
|---|---|---|
| registry-getter-dependency (major) | **Confirmed.** The committed registry has no `expiryOf`, so every VERIFY would revert. | The paymaster calls the committed `stampExpiry(address,uint256)` getter. No registry change. The deploy script fails early if the getter is missing. The builder and review tests now import the committed registry (`src/WatermarkRegistry.sol`) itself. |
| heartbeat-not-implemented (minor) | **Confirmed.** | `send-quota-tx.ts poke [--send] [--every N]`, which skips when fresh. The sender refuses on a stale `lastSeen`. Runbook step 5. Deadlines now come from chain time (the devnet was 3.4 h behind the wall clock). |
| R1-fee-drain (major) | **Confirmed** (EIP-8141 L479-490; devnet base fee 7 wei; ethrex serves TXPARAM 0x03/0x04, frame_tx.rs L792-793). | Exact fee pin (`WrongFees`). Default `maxCostPerTx` lowered to 1e15. `test_worstCaseBurnWithPinnedFeesIsNegligible`. |
| R2-reputation-grief (major) | **Confirmed** (sidecar service.ts L305-312, L186-189; FrameTxMempoolEntry.ts L175-191; ReputationEntry.ts). | Fee pin closes (b) and (b'). `MIN_LIFETIME` closes (a) while `lastSeen` is fresh. New vector (a') found and bounded by TICK quantization. (c) documented. §2 and §5 corrected. |
| R3-sender-overtips (minor) | **Confirmed** (hegota build.js L37). | The sender passes both fees explicitly and reads the pinned values from the paymaster before `--send`. |

---

## 12. What we need from the registry

- **Nothing new in code.** Keep `mapping(address => mapping(uint256 => uint64)) public stampExpiry` with this
  signature, and keep `_store` monotonic: never lower an expiry, and no revocation, or pending sponsored txs get
  cancelled at our reputation's expense.
- The same bytecode deploys on 1337 with `CA_ROOT` and `RULES_ROOT` taken from the synthetic devnet fixture
  (`contracts/test/fixtures/devnet-stamp.json`), `APP_SALT` = 0 and `REGISTER_LIVE=false`.
- The proof's appId is bound to the app owner, so the devnet fixture is generated with `APP_OWNER` = the devnet
  deployer (`contracts/script/gen-stamp-fixture.ts` takes `APP_OWNER` and `OUT`).

## 13. What we need from the alt mempool team

1. Confirm the **flat 100k prefix cap** (validationPrefix.ts L10, L288), not a staked per-entity budget, and whether it
   changes before 7 Nov 09:00 IST.
2. Is **[expiry_verify, only_verify, pay, SENDER, DEFAULT]**, with the pay frame reading frame 0's deadline, the
   intended way to know "valid at inclusion"? (It was admitted and mined on 1337: tx `0xcab8…8a93`.)
3. Is a **paymaster-imposed keyed nonce** (`nonce_keys = [K(day)]`, `seq < N`) an endorsed per-period quota? Is the 20k
   first-use charge billed inside the pay frame's declared limit, as ethrex's approve-helper charge suggests?
4. **Reputation fairness:**
   - Replacements currently bump `seen` (service.ts L305-312; ERC-8421 REPUTATION-040 says they should not).
   - The payer is charged for expiry and sender failures (REPUTATION-310).
   - Only successful receipts count as `included` (service.ts L186-189), although the code comment says "included
     means has a block".
   - There is no decay while active (ReputationEntry.ts L36-51).

   Could the sidecar require a deadline margin at admission (for example `E >= head + 2 slots`)? That would remove
   R2a and R2a' entirely.
5. Is reading our own monotonic `lastSeen` an acceptable lower time bound in VERIFY, or do you prefer EIP-8272 roots? Is
   RECENTROOTREFLOAD (`0xB6`) allowed in VERIFY?
6. Which `minUnstakeDelay` does the live node use (config default 0 vs ERC-8421's 86400)? We stake 86400 anyway.
7. Confirm that `m[wallet][appId]` is not sender-associated and is readable by a staked payer under STORAGE-032.
8. Does the miner sidecar run with `--explorer.enable`, so that `explorer.altmempool.wtf/tx/<hash>?node=…` shows our
   admission report?
9. Resolved: before the 2026-11-06 reset the head was stuck at block 408262; after the reset it produced blocks and
   our tx was mined. How often will the devnet reset before the deadline?
10. Will chain 1337 keep the ethrex 9aa3645d numbering (TXPARAM 0x0C-0x12, 0xB5/0xB6) until the deadline? Is the
    frame target's cold-access charge billed inside the frame's own limit (it matters for the 5,000 on frame 0)?
11. A zero-gas question: is a 1e6 wei tip (ethrex `MIN_GAS_TIP`) enough for the miner to include frame txs, or is
    `enforceGasPrice` on?

---

## 14. Devnet runbook

`tools/ef-sender/README.md` has the commands that worked on 2026-11-06 (gas multipliers, legacy gas price, the poke
step, the explorer link format).
