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
_TBD_

## Open questions for the alt mempool team
- Is `[VERIFY sender][VERIFY paymaster][SENDER][DEFAULT]` the right shape for a paymaster that needs post-op state?
- What's the best way to introspect the frames from inside VERIFY (`FRAMEPARAM` / `FRAMEDATALOAD`)?
- What happens to the paymaster's charge if the DEFAULT `consume()` frame reverts?
