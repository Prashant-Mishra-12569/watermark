# relayer

**Owner: Samanway.** Spec section K; interfaces F1, F5, F6, F7. Node + TypeScript + viem, port 8788.

## Run
```sh
cp .env.example .env          # at the repo root; fill SESSION_SIGNER_KEY, PROVER_URL, APP_IDS, REGISTRY_ADDRESS
pnpm --filter @watermark/relayer dev     # node --watch, reads ../.env, listens on 0.0.0.0:8788
pnpm --filter @watermark/relayer test
```
Node 24 runs the TypeScript directly (type stripping), so there is no build step.
`/session` returns 503 `CHAIN_NOT_READY` for a chain until its registry address is set.

| Endpoint | Status |
|---|---|
| `POST /session`, `GET /session/:id` | ✅ signed EIP-712 session + F1 deep link, rate-limited per IP, capped open sessions |
| `GET /status/:wallet` | ✅ reads `isStamped` (+ `quotaLeft` once the sponsor is deployed) |
| `POST /stamp` | ✅ simulate → gas cap → stamp budget → one tx per chain at a time → receipt (see below) |
| `POST /pay`, `GET /policy`, `GET /stats` | not built yet |

## POST /stamp
Called by the prover once a proof verifies. Body: `{ session, sig, proof, publicInputs }` (F0 encoding; `sig` 65 bytes,
`publicInputs` exactly 6 × bytes32 in F4 order; unknown top-level keys are ignored, the session must be exactly F1).

| Answer | When |
|---|---|
| 200 `{ txHash }` | mined and successful |
| 400 `BAD_REQUEST` / 413 | malformed body (or over 128 KB), or `session.wallet` is the zero address |
| 401 `BAD_SIGNATURE` | session not signed by this relayer's session signer, or a signature the registry would refuse (high `s`, `v` not 27/28/0/1) |
| 404 `UNKNOWN_APP` | appId not in `APP_IDS` |
| 422 `STAMP_REJECTED { reason }` | the simulation reverts; `reason` is the registry's error name (`UnMismatch`, `SessionAlreadyUsed`, `InvalidProof`, …) or its selector. Any verifier failure (bad or tampered proof) is `InvalidProof`. No gas spent |
| 422 `GAS_CAP` | estimate above `MAX_GAS_PER_STAMP` (default 3,500,000) |
| 429 `RATE_LIMIT` | over `STAMPS_PER_MINUTE_PER_IP` (default 30) |
| 502 `CHAIN_UNAVAILABLE` / `STAMP_SEND_FAILED` | RPC down before sending / the node refused the tx |
| 502 `STAMP_REVERTED { txHash }` | mined but reverted (gas was spent) |
| 503 `RELAYER_NOT_CONFIGURED` | no `RELAYER_PRIVATE_KEY` (sessions keep working) |
| 503 `CHAIN_NOT_READY` / `BUDGET_CAP` / `BUSY` | no registry / daily stamp budget spent / more than `STAMP_MAX_QUEUE` (20) waiting |
| 504 `STAMP_PENDING { txHash }` | no receipt within 90 s; the tx may still land |

Gas limit = estimate + 20 %, never above `MAX_GAS_PER_STAMP`. The worst case `gas limit × maxFeePerGas` is reserved
from the stamp budget before sending, and the real cost (including the OP Stack L1 fee) is charged after. Budgets live in
memory: a restart resets them.

`POST /session` also refuses the zero wallet (400): the registry would never stamp it.

**Measured** (real UltraHonk proof of the synthetic card, local anvil with chain id 1874 and the Isthmus/Prague fork,
2026-11-06): the stamp tx used **2,847,459 gas** (receipt, including intrinsic and calldata), with a gas limit of
3,416,950 (estimate + 20 %). That is ~0.0142 WBT at 5 gwei, before the OP Stack L1 data fee. A tampered proof,
a tampered nullifier or a truncated proof is refused as 422 `STAMP_REJECTED { reason: "InvalidProof" }`, with the
relayer nonce unchanged. These numbers come from a local e2e script that is not in the repo.

## Settings
Stamps and payments have **separate** gas caps and **separate** daily budgets. A stamp runs the UltraHonk verifier
(~2.9M gas), while a sponsored payment is ~100k, so one shared cap would either block stamps or let a payment burn 3M gas.

| Variable | Default | Used by |
|---|---|---|
| `RELAYER_PRIVATE_KEY` | unset (→ `/stamp` 503) | pays gas for stamps and payments |
| `MAX_GAS_PER_STAMP` | 3,500,000 | `/stamp` per-tx cap (`GAS_CAP`) |
| `STAMP_BUDGET_WEI` | 0.1 WBT | `/stamp` daily budget per chain (`BUDGET_CAP`) |
| `MAX_GAS_PER_PAY` | 300,000 | `/pay` per-tx cap (route not built yet; parsed into `config.pay`) |
| `DAILY_BUDGET_WEI` | 0.1 WBT | `/pay` daily budget per chain (route not built yet; parsed into `config.pay`) |
| `STAMPS_PER_MINUTE_PER_IP` | 30 | `/stamp` rate limit |
| `STAMP_MAX_QUEUE` | 20 | stamps waiting per chain before `BUSY` |
| `STAMP_RECEIPT_TIMEOUT_MS` | 90,000 | wait for the receipt before `STAMP_PENDING` |

Empty values mean the default. **Renamed:** `MAX_GAS_PER_TX` is now `MAX_GAS_PER_PAY`, and the pre-release `STAMP_MAX_GAS`
is now `MAX_GAS_PER_STAMP`. An old name still works when the new one is unset, and the relayer prints a `config:` warning
at startup. `MAX_GAS_PER_TX` only ever sets the payment cap, never the stamp cap.

**Month skew (MONTH-1):** `validUntilMonth` is the relayer's wall-clock month + 3, while the registry checks it against
`block.timestamp`, in the window [m + 1, m + 3]. Skew only matters in the minutes around 00:00 UTC on the 1st. A
session made just before midnight and stamped just after still passes (it is now m + 2). The one failing case is a
relayer clock that is **ahead** of the chain across the rollover: the relayer already says m + 4 while the chain is still
in m. The simulation then refuses `ValidUntilMonthOutOfRange` (no gas spent) and the user taps again a minute later.
With NTP this is a seconds-wide window once a month, so no change was made.

**Startup check:** once it is listening, the relayer reads `apps(appId).sessionSigner` for every `APP_IDS` entry on
every chain that has a registry. It prints a `WARNING:` line if that signer is not the address of
`SESSION_SIGNER_KEY`, if the app is not registered, or if the read fails. Every stamp for such an app would fail with
`WrongSessionSigner`. It also warns when the session signer is one of the public anvil accounts. These are warnings
only: the relayer still starts (src/preflight.ts).

## Endpoints (F6)
`POST /session` · `GET /session/:id` · `POST /stamp` · `POST /pay` · `GET /status/:wallet` · `GET /policy/:appId` · `GET /stats/:appId`

## Drain protection (spec K)
| Layer | Rule |
|---|---|
| 0 · No gas before proof | sessions are signed off-chain; `/session` is rate-limited per IP and queue-limited |
| 1 · Stamp gate | a stamp tx is sent only after the proof verifies and the call simulates |
| 2 · Payment gate | no stamp for this app → refused before any gas (checked off-chain, then on-chain) |
| 3 · Daily quota | N sponsored txs per stamp per day (20 in the demo), counted in WatermarkSponsor. Successful payments only: see below |
| 4 · Per-tx gas cap | simulate first, refuse above `MAX_GAS_PER_STAMP` (stamps) or `MAX_GAS_PER_PAY` (payments) |
| 5 · Budget cap | daily payment budget (`DAILY_BUDGET_WEI`) + a separate stamp budget (`STAMP_BUDGET_WEI`); pauses when hit |
| 6 · One card, one wallet | nullifiers stop a card from stamping a second wallet in the same app |

**`POST /pay` must also limit reverted relays (not built yet; review finding SPONSOR-1).** WatermarkSponsor rolls the
quota back when USDT reverts, so layer 3 counts only payments that went through. A stamped ERC-1271 wallet can sign
"valid" inside `eth_call` (for example only when `tx.gasprice == 0`) and "invalid" in the mined transaction. Each such
relay then costs the relayer gas and uses no quota, and one wallet could use up the whole `DAILY_BUDGET_WEI` alone
(contracts `WatermarkSponsorFailedRelayTest`, also against the real USDT on a fork). `/pay` must therefore:
1. simulate and estimate with the same fee fields it will send (`maxFeePerGas` / `maxPriorityFeePerGas`), so
   `tx.gasprice` is not 0 in the simulation;
2. count on-chain-reverted relays per wallet per UTC day and refuse that wallet (`QUOTA_USED`) after 1–2 of them.
   Point 1 alone is not enough, because a wallet can also key on the block number or the time.

**Rules:**
- Two keys from `.env`: the relayer key and the session signer key. Neither is ever committed.
- Transactions are serialised to avoid nonce clashes.
- Refusals are logged with only the reason and a truncated wallet. Bodies are never logged.

## Where the WBT comes from
- **Testnet:** https://faucet.testnet.whitechain.io gives 2 WBT a day (per Whitechain's flyer) and needs a GitHub
  account older than 30 days. Swap some WBT for USDT on YetiTrade to fund the business wallet.
- **Production:** the business tops up the relayer wallet, and the dashboard shows "budget left today".

## Bot demo (`scripts/bots.ts`)
1,000 wallets → `/pay`.
- **Protection off:** 25 real sponsored sends, plus 975 labelled **estimated** from the measured gas.
- **Protection on:** 1,000 real refusals, budget unchanged.
