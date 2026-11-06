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
| `POST /pay` | ✅ gasless USDT payment through WatermarkSponsor; the relayer pays the gas (see below) |
| `POST /fund`, `GET /balance/:wallet` | ✅ demo funding by the business; USDT balance + sponsored payments left today |
| `POST /pass`, `GET /pass/:wallet`, `GET /pass` | ✅ live (https://api.usewatermark.xyz/pass; pass `0x12DdF2A4C698A3271F21fEA07559467b6C8AdcB0`): Watermark Genesis Pass, a gas-free mint for a stamped wallet that paid once through the sponsor (see below). Answers 503 `PASS_NOT_CONFIGURED` when `GENESIS_PASS_ADDRESS` is unset |
| `GET /policy`, `GET /stats` | not built yet |

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

## POST /pay
A gasless USDT payment (interfaces F6, F7, Plan A). The browser signs an EIP-3009 `TransferWithAuthorization`; the
relayer calls `WatermarkSponsor.relayPayment(intent, signature)` and pays the gas. **The payer never pays gas.**

Body: `{ intent: { from, to, value, validAfter, validBefore, nonce }, signature }`. F0 encoding: `value` is in USDT base
units (6 decimals, so `"1500000"` is 1.5 USDT), the time fields are decimal strings, `nonce` is a random bytes32 and
`signature` is 65 bytes (`v` 27/28, low `s`). The typed data is in `src/usdt.ts`, an exact copy of `web/src/lib/usdt.ts`
(domain `{ name "Tether USD", version "1", chainId 1874, verifyingContract USDT }`; a test pins the token's
`DOMAIN_SEPARATOR` `0xcdcf…2a25` and another checks the two files agree).

Flow: body check → rate limit per IP → signature recovered off-chain (must be `from`) → reverted-relay limit →
`isStamped(from, sponsor.appId)` on the sponsor's registry → `sponsor.quotaLeft(from)` → **then, in the relayer's
per-chain send queue shared with `/stamp`** (one key, one nonce sequence): reverted-relay limit again → fees → estimate
→ `MAX_GAS_PER_PAY` → simulate as the relayer with the exact gas limit and fee fields it will be sent with →
`DAILY_BUDGET_WEI` → send → receipt.

Every refusal is `{ reason, error }` (the same code twice: `reason` per F6, `error` for the existing web client), plus
`detail` (the decoded revert), `message` or `txHash` when there is one.

| Answer | When |
|---|---|
| 200 `{ txHash, from }` | mined and successful; `from` is the relayer address that paid the gas |
| 400 `BAD_REQUEST` / 413 | malformed intent: not exactly the six fields, `to` = `from` or zero, `value` 0 or above `PAY_MAX_USDT`, `validAfter` in the future, `validBefore` passed or more than 1 h away; or a simulated `AuthorizationExpired` / `TetherToken: auth expired` (and `…NotYetValid` / `auth early`) |
| 401 `BAD_SIGNATURE` | not signed by `from` for this token and chain, high `s`, `v` not 27/28; or a simulated `TetherToken: invalid signature` / `ECRecover: …`. EOA wallets only (see SPONSOR-1 below) |
| 403 `NOT_STAMPED` | `from` has no live stamp in the sponsor's app (read first; the simulation's `NotStamped` maps here too) |
| 409 `NONCE_USED` | `TetherToken: auth invalid`: this authorization was already used (a replay) |
| 422 `INSUFFICIENT_USDT` | `ERC20: transfer amount exceeds balance` |
| 422 `GAS_CAP` | estimate above `MAX_GAS_PER_PAY` (default 300,000) |
| 422 `PAY_REJECTED { detail }` | any other revert, e.g. `NotRelayer` (the sponsor was deployed for another relayer key) or a blocked address |
| 429 `QUOTA_USED` | no sponsored payments left today (`sponsor.quotaLeft`, or `QuotaUsed` in the simulation), or `detail: "REVERTED_RELAYS"` after `PAY_MAX_REVERTS_PER_WALLET` mined reverts today |
| 429 `RATE_LIMIT` | over `PAYS_PER_MINUTE_PER_IP` (default 10) |
| 502 `CHAIN_UNAVAILABLE` / `PAY_SEND_FAILED` | RPC down before sending / the node refused the tx |
| 502 `PAY_REVERTED { txHash }` | mined but reverted (gas was spent; counts toward the reverted-relay limit) |
| 503 `SPONSOR_NOT_CONFIGURED` / `RELAYER_NOT_CONFIGURED` / `PAUSED` | no `SPONSOR_ADDRESS` / no `RELAYER_PRIVATE_KEY` / `PAY_PAUSED=true` |
| 503 `BUDGET_CAP` / `BUSY` | daily payment budget spent / more than `STAMP_MAX_QUEUE` txs waiting on the shared queue |
| 504 `PAY_PENDING { txHash }` | no receipt within 90 s; the tx may still land |

**Known trade-off (F7):** a signed authorization is a bearer instrument. Anyone who sees it can submit it to USDT
directly; that only moves the payer's own USDT to the recipient they signed for, and skips the quota.

## POST /fund and GET /balance
- `POST /fund { wallet }` → `{ txHash, from }` (`from` = the business). Demo funding by the **business**: a plain USDT transfer of `DEMO_FUND_USDT`
  (default 2) from `BUSINESS_PRIVATE_KEY`, which pays its own gas (not sponsored, not in the relayer budget). Only for a
  wallet stamped in the sponsor's app, and once per wallet per relayer run (in memory). Refusals: 400 `BAD_REQUEST`,
  403 `NOT_STAMPED`, 409 `ALREADY_FUNDED`, 429 `RATE_LIMIT`, 503 `FUND_NOT_CONFIGURED` (no key) /
  `SPONSOR_NOT_CONFIGURED` / `FUND_EMPTY` (the business has too little USDT) / `BUSY`, 502 `CHAIN_UNAVAILABLE` /
  `FUND_SEND_FAILED` / `FUND_REVERTED`, 504 `FUND_PENDING { txHash }`. A failed or reverted send can be retried.
- `GET /balance/:wallet` → `{ usdt: "1.5", quotaLeft: 19 }`. `usdt` is a decimal string in whole USDT. `quotaLeft` is 0
  when the wallet isn't stamped in the sponsor's app, has hit the reverted-relay limit, or no sponsor is configured yet
  (the balance still works then). 502 `CHAIN_UNAVAILABLE` when the RPC is down.

**Measured** (local anvil fork of Whitechain Sepolia at block 12,369,782 with the real USDT, a MockRegistry and a fresh
WatermarkSponsor, 2026-11-06; script not in the repo): `/fund` → 200; `/pay` 1.5 USDT → 200, the shop received exactly
1.5 USDT and the payer's WBT balance did not change; **140,768 gas** for a wallet's first payment to a recipient with no
USDT (the contract's NatSpec estimate is ~141k); replaying the same body → 409 `NONCE_USED` (`TetherToken: auth
invalid`); 5 USDT with 3.5 → 422 `INSUFFICIENT_USDT`; an unstamped wallet → 403 `NOT_STAMPED`; a sponsor deployed for
another relayer → 422 `PAY_REJECTED` (`NotRelayer`). Nothing was sent to a public network.

**Startup check:** with `SPONSOR_ADDRESS` set, the relayer reads the sponsor's `relayer`, `registry`, `usdt` and `appId`
and prints a `WARNING:` line when one doesn't match `RELAYER_PRIVATE_KEY`, `REGISTRY_ADDRESS`, `USDT_ADDRESS` or
`APP_IDS` (warn only).

## POST /pass, GET /pass/:wallet and GET /pass (Watermark Genesis Pass)
Watermark uses its own service: **WatermarkGenesisPass** is a 100-piece ERC-721, one per real bank card, minted
gas-free by this relayer (the pass's `minter`). A wallet unlocks it with two tasks, both checked without any third-party API:
1. **stamped in the current live app** (the app `SPONSOR_ADDRESS` pays for, `liveAppId` in
   `deployments/whitechain.json`): on-chain. The relayer checks `isStamped` first, and `mint` checks it again itself.
2. **one gas-free payment through the current WatermarkSponsor** (`SPONSOR_ADDRESS`): checked **by the relayer only**,
   from that sponsor's `PaymentRelayed(from, …)` events (`eth_getLogs`, read-only). A contract can't read past events
   and the sponsor only keeps today's usage, so the contract trusts its minter for this task. The logs are scanned once
   from `PASS_FROM_BLOCK` (default: the sponsor's deploy block, 12,378,949 for `0x21B6…939a`) in
   `PASS_LOGS_CHUNK_BLOCKS` chunks (Ankr's Whitechain RPC refuses 2,000 blocks; 1,000 works), then only new blocks, at
   most every 4 s, and the scan starts at boot so the first answer is quick. A payment never disappears, so a hit is
   cached for good. Payments through the previous sponsor (`0xAbD7…D7BA`, the first live app) don't count: that app's
   stamps don't unlock this pass either. Measured read-only on Whitechain Sepolia (6 Nov, ~21:30 IST): the first scan
   from 12,378,949 to the head (~2,700 blocks) took 3 `eth_getLogs` calls and 1.5 s.

**One card = one pass:** the registry binds a card to one wallet per app (nullifier), and the pass remembers every wallet
that claimed (`passOf`, kept even after a transfer). A card holder can't get a second pass: their card can't stamp a
second wallet in this app, and their one wallet has already claimed. The limit is per card, not per person: someone with two
different cards can stamp two wallets. Passes are transferable; the scarcity applies to claiming, not to holding.

- `POST /pass { wallet }` → `{ txHash, tokenId, from }` (`from` = the relayer, which paid the gas). Anyone may ask for
  any wallet: the pass always goes to that wallet. Flow: rate limit per IP → one claim per wallet at a time → stamped →
  `passOf(wallet) == 0` → supply left → paid → in the shared per-chain send queue: fees → estimateGas → `GAS_CAP` →
  simulate (exact gas and fees) → `BUDGET_CAP` → send → receipt (token id from the `Transfer` log). Refusals: 400
  `BAD_REQUEST`, 403 `NOT_STAMPED` / `NO_PAYMENT`, 409 `ALREADY_CLAIMED { tokenId }` / `CLAIM_PENDING { txHash? }`,
  410 `SOLD_OUT`, 422 `GAS_CAP` / `PASS_REJECTED { detail }` (e.g. `NotMinter`), 429 `RATE_LIMIT`, 503
  `PASS_NOT_CONFIGURED` / `SPONSOR_NOT_CONFIGURED` / `RELAYER_NOT_CONFIGURED` / `BUDGET_CAP` / `BUSY`, 502
  `CHAIN_UNAVAILABLE` / `PASS_SEND_FAILED` / `PASS_REVERTED { txHash }`, 504 `PASS_PENDING { txHash }`.
- `GET /pass/:wallet` → `{ pass, stamped, stampExpiresAt, paid, claimed, tokenId, remaining, totalSupply, maxSupply,
  image }`. `stamped`, `stampExpiresAt` (unix seconds, 0 = none), the claim and the supply come from one
  `pass.status(wallet)` call, so the page shows exactly the stamp `mint` checks. `paid` is `null` when the logs can't be
  read right now; `image` is the token's on-chain SVG (`data:image/svg+xml;base64,…`, decoded from `tokenURI`) once
  claimed.
- `GET /pass` → `{ pass, remaining, totalSupply, maxSupply }`, for the landing page's counter (no wallet). It reads
  `totalSupply()` and `MAX_SUPPLY()` (read once; it's a constant) and caches the answer for 5 s; a mint clears the
  cache. Errors: 503 `PASS_NOT_CONFIGURED`, 502 `CHAIN_UNAVAILABLE`, 429 `RATE_LIMIT`.
- Both GETs share one limit: 60 reads per IP per minute.

**Startup check:** with `GENESIS_PASS_ADDRESS` set, the relayer reads the pass's `minter`, `registry` and `appId` and
warns when the minter isn't `RELAYER_PRIVATE_KEY`, the registry isn't `REGISTRY_ADDRESS`, or the app isn't the sponsor's.

## Settings
Stamps and payments have **separate** gas caps and **separate** daily budgets. A stamp runs the UltraHonk verifier
(~2.9M gas), while a sponsored payment is ~100k, so one shared cap would either block stamps or let a payment burn 3M gas.

| Variable | Default | Used by |
|---|---|---|
| `RELAYER_PRIVATE_KEY` | unset (→ `/stamp`, `/pay` 503) | pays gas for stamps and payments |
| `SPONSOR_ADDRESS` | unset (→ `/pay` 503 `SPONSOR_NOT_CONFIGURED`) | WatermarkSponsor of the live app |
| `BUSINESS_PRIVATE_KEY` | unset (→ `/fund` 503 `FUND_NOT_CONFIGURED`) | sends demo USDT, pays its own gas |
| `USDT_ADDRESS` | `0xcedf…55a7` | the token `/pay`, `/fund` and `/balance` use |
| `MAX_GAS_PER_STAMP` | 3,500,000 | `/stamp` per-tx cap (`GAS_CAP`) |
| `STAMP_BUDGET_WEI` | 0.1 WBT | `/stamp` daily budget per chain (`BUDGET_CAP`) |
| `MAX_GAS_PER_PAY` | 300,000 | `/pay` per-tx cap (`GAS_CAP`); also the simulation's gas |
| `DAILY_BUDGET_WEI` | 0.1 WBT | `/pay` daily budget per chain (`BUDGET_CAP`), separate from the stamp budget |
| `PAY_MAX_USDT` | 5 | largest payment, in USDT |
| `DEMO_FUND_USDT` | 2 | what `/fund` sends, in USDT |
| `PAYS_PER_MINUTE_PER_IP` | 10 | `/pay` rate limit (and, separately counted, `/fund`) |
| `PAY_MAX_REVERTS_PER_WALLET` | 2 | mined reverts per wallet per UTC day before `QUOTA_USED` |
| `PAY_PAUSED` | false | `true` refuses every payment `PAUSED` |
| `GENESIS_PASS_ADDRESS` | unset (→ `/pass` 503 `PASS_NOT_CONFIGURED`) | WatermarkGenesisPass (minter = the relayer) |
| `PASS_FROM_BLOCK` | the sponsor's deploy block (12,378,949 for the current sponsor; warns if set later) | first block scanned for `PaymentRelayed` |
| `PASS_LOOKBACK_BLOCKS` | 50,000 | how far back to scan for another sponsor with no `PASS_FROM_BLOCK` |
| `PASS_LOGS_CHUNK_BLOCKS` | 1,000 | blocks per `eth_getLogs` call |
| `MAX_GAS_PER_PASS` | 500,000 | `/pass` per-tx cap (`GAS_CAP`) |
| `PASS_BUDGET_WEI` | 0.1 WBT (100 mints at ~120.6k gas and ~5 gwei ≈ 0.07 WBT) | `/pass` daily budget, separate from stamps and payments |
| `PASSES_PER_MINUTE_PER_IP` | 5 | `/pass` rate limit |
| `STAMPS_PER_MINUTE_PER_IP` | 30 | `/stamp` rate limit |
| `STAMP_MAX_QUEUE` | 20 | txs (stamps and payments) waiting per chain before `BUSY` |
| `STAMP_RECEIPT_TIMEOUT_MS` | 90,000 | wait for the receipt before `STAMP_PENDING` / `PAY_PENDING` / `FUND_PENDING` |

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
· plus the demo routes `POST /fund` and `GET /balance/:wallet`, and the Genesis Pass routes `POST /pass`, `GET /pass/:wallet` and `GET /pass`

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

**`POST /pay` limits reverted relays (review finding SPONSOR-1; built).** WatermarkSponsor rolls the
quota back when USDT reverts, so layer 3 counts only payments that went through. A stamped ERC-1271 wallet can sign
"valid" inside `eth_call` (for example only when `tx.gasprice == 0`) and "invalid" in the mined transaction. Each such
relay then costs the relayer gas and uses no quota, and one wallet could use up the whole `DAILY_BUDGET_WEI` alone
(contracts `WatermarkSponsorFailedRelayTest`, also against the real USDT on a fork). `/pay` must therefore:
1. simulate and estimate with the same fee fields it will send (`maxFeePerGas` / `maxPriorityFeePerGas`), so
   `tx.gasprice` is not 0 in the simulation;
2. count on-chain-reverted relays per wallet per UTC day and refuse that wallet (`QUOTA_USED`) after 1–2 of them.
   Point 1 alone is not enough, because a wallet can also key on the block number or the time.

Both are done: the simulation carries the same gas limit (estimate + 20 %, capped at `MAX_GAS_PER_PAY`) and the same
fee fields the tx is sent with, so `gasleft()` and `tx.gasprice` match the mined tx (review PAY-DRAIN-2), and
`PAY_MAX_REVERTS_PER_WALLET` (default 2) counts mined reverts per wallet per UTC day (in memory). The limit is checked
both before queueing and again inside the serial send queue, so a burst of parallel requests from one wallet stops
after the limit too (review PAY-DRAIN-1; `src/review-pay.test.ts`). On top of that the
relayer recovers the EIP-3009 signer itself and requires it to be `from`, so ERC-1271 contract wallets are not
relayed at all in the demo (an EIP-7702 delegated EOA still could be, which is why the counter stays).

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
