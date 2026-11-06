# Watermark on the EIP-8141 alternative mempool

**Track:** EF · Best use of the Frame Transaction Alternative Mempool
**Status:** not built yet. This file is filled in as the work lands.

## What we built
A **daily quota paymaster** for stamped wallets. Any wallet holding a valid Watermark stamp gets N sponsored
transactions per day. The paymaster checks the stamp during validation, so bots without a real bank card can't drain it.

## Why the public mempool refuses it
The paymaster's VERIFY frame reads `WatermarkRegistry` storage (is `tx.sender` stamped and not expired? any quota
left?). Public mempool rules only let validation touch the sender's own storage, and they cap verification at
`MAX_VERIFY_GAS = 100,000`. The alternative mempool (ERC-8421) lets a **staked** entity read any storage in a
non-entity contract (STORAGE-032), with a larger verification budget.

## Frame layout
| # | Mode | Target | Flags | Job |
|---|---|---|---|---|
| 0 | VERIFY | `tx.sender` | `0x2` | the user approves execution |
| 1 | VERIFY | WatermarkQuotaPaymaster | `0x1` | checks stamp + quota + tx shape, then `APPROVE(APPROVE_PAYMENT)` |
| 2 | SENDER | user's target | `0x0` | the user's call |
| 3 | DEFAULT | WatermarkQuotaPaymaster | `0x0` | `consume()` increments the daily counter |

## Staking
- `NaiveStakingRegistry` `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f`, via `addStake(86400)` with more than 0.01 ETH.
- The paymaster contract makes the call itself, because a contract can't be staked from an EOA.

## Devnet setup and funding
- **Funding (disclosed):** the devnet faucet was empty on 2026-11-06 (`skandha_explorer_faucet` answered
  "The faucet is empty"). Following the [public devnet guide](https://docs.altmempool.wtf/guides/devnet/), we funded
  our own devnet key `0x967450D5d12dbC6543EbE8f177b2BDBae924e135` once, with 0.5 ETH, using a plain transfer from the
  shared genesis account `0x5544596212F91984C986A919C8026DF0576816f9`, whose key the alt mempool team publishes on
  purpose. Tx: `0xda18eda87fdeae6c83e613a29e0f7d914ddf136390309ece78e7e68818800b1d`. All our own transactions are
  sent from our key. The shared key is not stored in this repo or in any `.env`.
- **Endpoint:** we submit to `https://altmempool.forshtat.com/rpc`. The workshop gateway
  (`altmempoolgateway.forshtat.com/rpc`) admitted our transactions but they were never mined, and it often answered HTTP 502.
- **Workshop run (steps 1, 3, 6, 7, 8), all passed:**

  | Step | Result | Tx |
  |---|---|---|
  | 3 · paymaster-sponsored tx | mined, sender held 0 ETH | `0x5e70e04883d4bd2b014a96ccbb6848b5bd962da62a82f3b9b5b5fb9215ff25af` |
  | 6 · foreign storage read, canonical mempool | rejected: `StorageReadNonSender` | `0x2690ae5ae9f77ed2f05fa71c9d5fba8860a598f605869e479d139f368bdfd944` |
  | 7 · wallet stakes itself (0.012 ETH, 86400 s) | mined | `0x7eeb8dd8267dff7d2c9ff6898853da66e4caeff4c53cf09ed4dc4e64612a8981` |
  | 8 · the same tx, alt mempool, staked | accepted and mined | `0x836622933b065029f0182ad1ad1d4c60fe61f9d625538714c6519cad7c638cf7` |

  These are the workshop's contracts, not ours. They confirm the tooling and the rule our paymaster depends on.

## Attack tests (each must be refused)
| Case | Expected | Result |
|---|---|---|
| Sender not stamped | refused in VERIFY | _TBD_ |
| Stamp expired | refused | _TBD_ |
| Missing `consume()` frame | refused | _TBD_ |
| Quota used up | refused | _TBD_ |

## Results
- Canonical rules (`eth_sendRawTransaction` to ethrex): _TBD: rejection output_
- Alt mempool (`eth_sendFrameTransaction`): _TBD: admitted tx hash_
- Explorer link: _TBD_
- Submitting code: _TBD path_

## Trade-offs
- **The proof is not verified inside VERIFY. This is measured, not assumed.** Our UltraHonk verifier costs **2.57M
  gas** (a full stamp is about 2.9M). The staked verification budget is 1,000,000 gas in the draft rules, so the
  spec's stretch goal (stamp and sponsor in the first frame tx) doesn't fit. The stamp is made once, by a normal
  transaction, and the paymaster's VERIFY only **reads** the registry: stamp, expiry and quota. That read is cheap,
  and it's exactly the access the public mempool forbids and STORAGE-032 allows for staked entities.
- _TBD as the paymaster lands_

## Open questions for the alt mempool team
- Is `[VERIFY sender][VERIFY paymaster][SENDER][DEFAULT]` the right shape for a paymaster that needs post-op state?
- What's the best way to introspect the frames from inside VERIFY (`FRAMEPARAM` / `FRAMEDATALOAD`)?
- What happens to the paymaster's charge if the DEFAULT `consume()` frame reverts?
