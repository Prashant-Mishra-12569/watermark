# Watermark on the EIP-8141 alternative mempool

**Track:** EF · Best use of the Frame Transaction Alternative Mempool
**Status (2026-11-06):** built, deployed on the alt mempool devnet (chain 1337), and one sponsored frame tx was
**admitted and mined**. Attack cases are tested in Foundry only; none has been sent on-chain yet.
Full design with rule citations: [`EF_PAYMASTER_DESIGN.md`](EF_PAYMASTER_DESIGN.md). Runbook: [`tools/ef-sender/README.md`](../tools/ef-sender/README.md).

## What we built

`WatermarkQuotaPaymaster` (`contracts/src/WatermarkQuotaPaymaster.sol`) pays for up to **20 frame transactions per
UTC day** for every wallet that holds a valid Watermark stamp, the on-chain record that the wallet's owner tapped a
real bank card (zero-knowledge, no card data on-chain). Bots without a card get nothing, and a stamped wallet gets a
fixed daily allowance, so nobody can drain the paymaster.

The sender tool (`tools/ef-sender/src/send-quota-tx.ts`) builds, self-checks, signs and submits the tx to the
alt mempool sidecar with `eth_sendFrameTransaction`, and runs the paymaster's clock heartbeat (`poke`).

## Why only the alt mempool admits it

The paymaster's VERIFY frame has to answer "is this wallet stamped, still valid, and under today's quota?":

- **It reads storage that is not the sender's.** It reads the registry slot `stampExpiry[wallet][appId]` (not
  associated with the wallet, because the final key is `appId`) and its own `lastSeen` slot. The canonical EIP-8141
  mempool only allows SLOAD on `tx.sender` and one pending tx per paymaster. ERC-8421 lets a **staked** entity read its
  own storage (STORAGE-031) and, read-only, any non-entity contract (STORAGE-032). So the paymaster is staked.
- **TIMESTAMP and NUMBER are banned in VERIFY for everyone.** We get time from the protocol instead:
  - frame 0 is an `expiry_verify` frame (target `0x…8141`, data = deadline `E`), so an included tx has `t <= E`;
  - `lastSeen` is set in the constructor and then written only in execution frames (`consume()`, public `poke()`),
    and only grows, so `t >= lastSeen`;
  - VERIFY requires `lastSeen + 7 min <= E <= lastSeen + 1 h` and `stampExpiry >= E`.
- **VERIFY can't write a counter.** The daily quota is an **EIP-8250 keyed nonce**: the tx must use exactly one key,
  `quotaKey(E / 86400)` (paymaster address in the top bits, day in the low 64), with `nonce_seq < 20`. The protocol
  bumps it inside our `APPROVE(PAYMENT)`, and no later frame revert can undo that.
- **Fees are pinned exactly** (`max_fee = 1 gwei`, `tip = 1e6 wei`), so a sender can't turn our `max_cost` into a tip,
  and a pending tx can never be fee-bumped (replaced).

## Frame shape (5 frames)

| # | Mode | Target | Flags | Data | Limits [exec, state] | Job |
|---|---|---|---|---|---|---|
| 0 | VERIFY | `0x…8141` (expiry verifier) | `0x0` | `uint64be(E)` | [5,000, 0] | protocol upper time bound |
| 1 | VERIFY | `null` (= sender, EOA default code) | `0x2` | – | [10,000, 0] | the user approves execution |
| 2 | VERIFY | WatermarkQuotaPaymaster | `0x1` | `verifyAndPay()` | [82,000, 0] | stamp + quota + shape + fees, then `APPROVE(PAYMENT)` |
| 3 | SENDER | user's target | `0x0` | user calldata | [100,000, 100,000] | the user's call |
| 4 | DEFAULT | WatermarkQuotaPaymaster | `0x0` | `consume()` | [60,000, 20,000] | refresh `lastSeen` + `Sponsored` event (bookkeeping only) |

`verifyAndPay()` pins the whole shape: 5 frames, frame 0 is the expiry frame, frame 3 is SENDER with no batch flag,
frame 4 is our `consume()` with at least 50,000 gas. It uses no banned opcode, writes nothing, and reads exactly two
slots (Foundry opcode and storage audits against the real registry bytecode).

## Staking

`NaiveStakingRegistry` `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f`. The registry keys on `msg.sender`, so the
paymaster stakes itself: owner-only `stake(86400)` with 0.012 ETH forwards to `addStake`. `getDepositInfo` returns
`(0.012 ETH, 86400, 0)` on the devnet. `unlockStake()` should end sponsorship at once, because the sidecar then
treats the paymaster as unstaked (not tried on the devnet).

## Failure semantics

From the EIP-8141 rules and Foundry tests with stand-in frame helpers. On the devnet only the case where every frame
succeeds has run.

| Event | Result |
|---|---|
| Frame 0, 1 or 2 reverts (not stamped, expired, quota used, wrong shape or fees) | tx invalid, **nobody pays** |
| Frame 3 (user call) reverts | we pay gas used; the quota slot stays used; `consume()` still runs |
| Frame 4 reverts | only `lastSeen` and the event are lost; we still pay |
| Nobody refreshes `lastSeen` for 1 h | every sponsored tx fails closed until a `poke()` |

## Verify-gas budget

The deployed sidecar caps frames 0-2 at a **flat 100,000** (declared execution limits + 2,800 per secp256k1
signature), whatever the stake. Ours: 5,000 + 10,000 + 82,000 + 2,800 = **99,800**. Foundry estimate for the pay
frame: 54,614 with cold stand-ins + 20,000 first-use keyed-nonce charge = 74,614. **On the devnet it used 49,490**
(one sample, the wallet's first sponsored tx of that day).

**Why the proof isn't verified inside VERIFY:** our UltraHonk verifier costs about 2.57M gas, far above any
verification budget. The stamp is made once, by a normal tx, and VERIFY only reads it.

## Results (devnet 1337, 2026-11-06, after the devnet reset)

Read any hash with `cast receipt <hash> --rpc-url https://altmempool.forshtat.com`. All values are also in
`deployments/devnet.json`.

| Step | Address / result | Tx (block) |
|---|---|---|
| WatermarkRegistry (same source as on Whitechain) | `0x183826030BB08bbdD4f4A8f4a7135C6a8E3De42C` | `0x0b4484bd66cbd1496189ca69f9eb54f10c6f72af5101623e227ac9a70c46ac4a` (3349) |
| VerifierRouter / HonkVerifier (profile 0) | `0xFF16a750159c7d7548A90015bB766Ec994F41603` / `0x3b8647C9cE10d023145fb9ED479e6DBd5CeF6778` | `0xd00b7aab1a866eb4166287971d42d9ec14e7a487eb2e58c3b4ce8f423a1cd86a` / `0x540bfe206bc725b3b610291fd213c401ed0e68b08223926c5fdecfeb1f9f9266` |
| Stamp: real proof of the **synthetic** test card | wallet `0xE37EEB29EF7aaDA2048b6Fbe5a6A60A5C4B9A701`, `stampExpiry` 1803859199 | `0xaf4673d4ff71cf2b43f2ece2f56448af44faf7b66604abceaa4836053c853ff3` (3361) |
| WatermarkQuotaPaymaster, funded 0.05 ETH | `0x62183B1d118dae2F9C7dc8b42c7b71Cd27b67097` | `0x9dbbc1e2113364ec4b531f5f3da43e69a3d5bbd305e678dcfa6f83cdd9b31e69` (3687) |
| Stake 0.012 ETH, 86400 s | `getDepositInfo` confirmed | `0xcbe6785dcf4c9f3194dca236693c3f54e1bc22836f4210c942270ff1260a94dd` (3688) |
| DemoCounter (demo target) | `0xfd09d9c46a2732A8c9B799f9a7ff7472Defa601B` | `0x304e46c5fcb5a7273605412d3abb680c354e9911b04a0b7ea4684af72908257e` (3691) |
| **Sponsored frame tx, admitted by the sidecar and mined** | 5 frames, all status 1; `payer` = the paymaster; `count(wallet)` = 1; wallet balance 0; `Sponsored(wallet, day 20763, seq 0)`; 191,864 gas × 1,000,007 wei ≈ 1.9e11 wei paid by the paymaster | `0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93` (3699) |

Read-only checks after the run: the paymaster's balance is now 0.05 ETH minus exactly 191,864 × 1,000,007 wei; the
wallet's balance and plain nonce are both 0; `count(wallet)` = 1. The devnet node does not serve historical state, so
balances can only be read at the latest block.

Explorer: <https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc>

Submitting code: `tools/ef-sender/src/send-quota-tx.ts` (`--send`), to `https://altmempool.forshtat.com/rpc`.
The committed sources match the deployed code: the runtime bytecode of both contracts is identical once the CBOR
metadata hash (which covers comments and file paths) and, for the paymaster, its constructor immutables are masked.
Not run on-chain: sending the same tx to the canonical mempool (`eth_sendRawTransaction`); we expect a
`StorageReadNonSender` rejection, as in the workshop's step 6 below.

## Attack tests

| Case | Expected | Result |
|---|---|---|
| Sender not stamped (a bot wallet) | `NotStamped` in VERIFY, nobody pays | Foundry only (`test_unstampedSender`); on-chain **planned** |
| Stamp expires before the deadline / stamp for another app | `NotStamped` | Foundry only |
| Quota used up (`seq >= 20`), wrong or extra nonce key | `QuotaExhausted` / `WrongNonceKey` / `BadNonceKeyCount` | Foundry only; on-chain **planned** |
| Claim tomorrow's quota with a far deadline | `DeadlineTooFar` | Foundry only |
| Missing, starved or swapped `consume()` frame; batch flag on the user frame | `BadFrameCount` / `BadConsumeFrame` / `BadUserFrame` | Foundry only |
| Tip the builder with our money / fee bumps | `WrongFees` | Foundry only (review tests) |
| `consume()` called outside our tx | `NotEntryPoint` / `NotSponsoredByUs` | Foundry only |
| Self-poke to cancel pending txs (reputation grief) | bounded to 1 per 5-min tick per wallet | Foundry only |

Foundry: `cd contracts && forge test --match-path 'test/*Quota*'` and `--match-path 'test/review/*'` (opcode
tracer tests need `-vvv`). Frame opcodes are stand-ins there (the test EVM has none).

## Trade-offs

- **Heartbeat.** `lastSeen` must stay fresh: traffic does it for free, otherwise a relayer `poke()` (~26k gas). It
  fails closed.
- **Lifetime window.** Deadlines must be 7-60 min after `lastSeen`; an unmined tx lingers until its deadline before
  the user can re-sign.
- **Day boundary.** Up to 2×20 txs in the last hour before UTC midnight.
- **Serial per wallet.** One pending tx per (sender, key).
- **Fixed fees.** If the base fee rises above 1 gwei, sponsorship stops until a redeploy. Users can't speed up a tx.
- **Reputation.** Self-poke and user-frame reverts give `seen` without `included`; bounded, not removed (design §5).
- **Devnet-specific numbering** (TXPARAM ids, helper addresses): fails closed on change; redeploy after a reset.
- **Proof not in VERIFY** (2.57M gas): stamping is a separate, normal tx.

## Devnet setup and funding

- **Funding (disclosed):**
  - Before the reset: the faucet was empty on 2026-11-06 (`skandha_explorer_faucet` answered "The faucet is empty").
    Following the [public devnet guide](https://docs.altmempool.wtf/guides/devnet/), we funded our own devnet key
    `0x967450D5d12dbC6543EbE8f177b2BDBae924e135` once, with 0.5 ETH, using a plain transfer from the shared genesis
    account `0x5544596212F91984C986A919C8026DF0576816f9`, whose key the alt mempool team publishes on purpose. Tx:
    `0xda18eda87fdeae6c83e613a29e0f7d914ddf136390309ece78e7e68818800b1d` (gone since the reset).
  - After the reset: the devnet faucet funded the same key with 1 ETH (faucet tx hash not recorded).
  - All our own transactions are sent from our key. The shared key is not stored in this repo or in any `.env`.
- **Endpoint:** we submit to `https://altmempool.forshtat.com/rpc`. The workshop gateway
  (`altmempoolgateway.forshtat.com/rpc`) admitted our transactions but they were never mined, and it often answered
  HTTP 502.
- **Deploy gas:** this devnet charges state gas for contract code, which forge's estimate leaves out; deploys needed
  `--gas-estimate-multiplier` 1000 (registry stack) and 2000 (paymaster, which also creates 7 helper contracts).
- **Workshop run (steps 1, 3, 6, 7, 8), all passed, before the devnet reset** (these txs are no longer on the chain):

  | Step | Result | Tx |
  |---|---|---|
  | 3 · paymaster-sponsored tx | mined, sender held 0 ETH | `0x5e70e04883d4bd2b014a96ccbb6848b5bd962da62a82f3b9b5b5fb9215ff25af` |
  | 6 · foreign storage read, canonical mempool | rejected: `StorageReadNonSender` | `0x2690ae5ae9f77ed2f05fa71c9d5fba8860a598f605869e479d139f368bdfd944` |
  | 7 · wallet stakes itself (0.012 ETH, 86400 s) | mined | `0x7eeb8dd8267dff7d2c9ff6898853da66e4caeff4c53cf09ed4dc4e64612a8981` |
  | 8 · the same tx, alt mempool, staked | accepted and mined | `0x836622933b065029f0182ad1ad1d4c60fe61f9d625538714c6519cad7c638cf7` |

  These are the workshop's contracts, not ours. They confirm the tooling and the rule our paymaster depends on.

## Open questions for the alt mempool team

1. Is the **flat 100k prefix cap** (not a staked per-entity budget) final for the event?
2. Is `[expiry_verify, only_verify, pay, SENDER, DEFAULT]`, with the pay frame reading frame 0's deadline, the
   intended way to know "valid at inclusion"? Is our own monotonic `lastSeen` an acceptable lower time bound, or do you
   prefer EIP-8272 recent roots (is `0xB6` allowed in VERIFY)?
3. Is a paymaster-imposed keyed nonce (`nonce_keys = [K(day)]`, `seq < N`) an endorsed per-period quota? Is the 20k
   first-use charge billed inside the pay frame's limit?
4. Reputation: replacements bump `seen` (ERC-8421 REPUTATION-040 says they shouldn't), the payer is charged for expiry
   and sender failures, and there is no decay while active. Could admission require a deadline margin
   (e.g. `E >= head + 2 slots`)? That would remove our self-poke grief vector.
5. Which `minUnstakeDelay` does the live node use? We stake 86400 s anyway.
6. Will chain 1337 keep the ethrex 9aa3645d numbering (TXPARAM 0x0C-0x12) until the deadline, and how often will it
   reset?
