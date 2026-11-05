# relayer

**Owner: Samanve.** Spec section K; interfaces F1, F5, F6, F7. Node + TypeScript + viem, port 8788.

## Endpoints (F6)
`POST /session` · `GET /session/:id` · `POST /stamp` · `POST /pay` · `GET /status/:wallet` · `GET /policy/:appId` · `GET /stats/:appId`

## Drain protection (spec K)
| Layer | Rule |
|---|---|
| 0 · No gas before proof | sessions are signed off-chain; `/session` is rate-limited per IP and queue-limited |
| 1 · Stamp gate | a stamp tx is sent only after the proof verifies and the call simulates |
| 2 · Payment gate | no stamp for this app → refused before any gas (checked off-chain, then on-chain) |
| 3 · Daily quota | N sponsored txs per stamp per day (20 in the demo), counted in WatermarkSponsor |
| 4 · Per-tx gas cap | simulate first, refuse above `MAX_GAS_PER_TX` |
| 5 · Budget cap | daily WBT budget + a separate stamp budget; pauses when hit |
| 6 · One card, one wallet | nullifiers stop a card from stamping a second wallet in the same app |

**Rules:**
- Two keys from `.env`: the relayer key and the session signer key. Neither is ever committed.
- Transactions are serialised to avoid nonce clashes.
- Refusals are logged with only the reason and a truncated wallet. Bodies are never logged.

## Where the WBT comes from
- **Testnet:** https://faucet.testnet.whitechain.io gives 0.5 WBT per rolling 24 h and needs a GitHub account at least
  30 days old.
- **Production:** the business tops up the relayer wallet, and the dashboard shows "budget left today".

## Bot demo (`scripts/bots.ts`)
1,000 wallets → `/pay`.
- **Protection off:** 25 real sponsored sends, plus 975 labelled **estimated** from the measured gas.
- **Protection on:** 1,000 real refusals, budget unchanged.
