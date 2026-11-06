# Handoff: Prashant → Samanway (Fri 6 Nov, 18:10 IST)

Temporary working note. We delete it before submission.

## 1. Done on my side (branch `prashant/real-signer`, PR to `main`)

| Area | What changed |
|---|---|
| Phone | Trusts the relayer's real session signer `0x9A06…FdBB` (debug also trusts the dev signer; the demo build trusts only the real one). |
| Phone | The network error now fits the URL. A LAN IP gets "same Wi-Fi or hotspot"; a tunnel (trycloudflare) gets "check the internet connection". |
| Prover | **Refuses to start if `circuits/target/watermark.json` doesn't match the deployed verifier.** It compares the sha256 with `circuitSha256` in `contracts/test/fixtures/synthetic-stamp.json`. Fix: `cd circuits && nargo compile`. Override: `ALLOW_CIRCUIT_MISMATCH=1`. |
| SDK | `appInfo`, `auditApp` (on-chain rulesRoot vs. published policy), `stampHistory` (reads from deploy block 12335610 in 2,000-block chunks, because Ankr refuses `eth_getLogs` from 0), `prepareRegisterApp` (unsigned tx), `supportedCards`, a fixed `verifyLink` (now `?app=&chain=`, matching `/verify`). |
| SDK | `sdk/scripts/live-smoke.ts`: checks both apps, their roots and the first stamp against the live Registry. All checks pass. |
| MCP | 12 tools. The new ones are `app_info`, `stamp_history`, `prepare_register_app`, `create_verify_link`, `list_apps` and `supported_cards`. Visa/Mastercard are reported as **planned, not live**. |
| Policies | `test.json` / `live.json` carry the appIds registered on-chain. `roots.ts --check` passes. |
| Docs | `docs/INTEGRATE.md`, for wallets, dapps and agents: gate on a stamp, audit, history, register an app. |
| Merge | Your PR #16 (router, deploy, prover profile byte) is merged into my branch. No conflicts. |

Tests after the merge: 152 TypeScript (sdk 25, mcp 11, testcard 16, web 42, relayer 41, zk 5, prover 12) + 28 Android, all passing.

**After this PR is merged:** pull, run `cd circuits && nargo compile` if the prover refuses to start, and rebuild the phone APK so it gets the new error text.

## 2. What I'm doing next

1. README: the real stamp tx as the headline proof (`0xd7e01665…`, block 12368812), plus the "what works today" table.
2. Must-refuse tests on the phone, each with a screenshot:
   - the same card with a new wallet (expected: the Registry reverts with `NullifierBoundToOtherWallet`)
   - a renewal with the same card and same wallet (expected: extends, never shortens)
   - an expired QR
   - a card outside the filter (refused on the phone, before anything is sent)
3. The second card tap on the **devnet** for the EF track, once your paymaster and the devnet registry are up.
4. The AI-use disclosure (`docs/AI_USAGE.md`, prompt logs), privacy doc check, pitch, and recording the live tap.
5. Submission at 08:00.

## 3. What I need from you

- The **Sponsor address** in `deployments/whitechain.json` (currently `"sponsor": null`). The SDK, MCP and README link to it.
- The **devnet deployment file** and the paymaster address, so I can do the EF tap.
- A decision on **stamp length per app** (section 5): stay fixed at 3 months, or let each app choose 1–3.

## 4. What's left on your side (from `docs/PLAN.md`)

**Whitechain prize. These are qualification rules, so they come first:**
- [ ] Deploy `WatermarkSponsor` and verify it on the explorer.
- [ ] `/pay`: a gasless USDT payment (`0xcedf…55a7`, permit or EIP-3009) in the main flow. **The payer pays no gas.**
- [ ] The USDT payment's explorer link in the README.
- [ ] `WHITECHAIN_FEEDBACK.md`: "What worked" and "Where we got stuck" are still `_TBD_`.
- [ ] A 2–4 min video showing user, business and relayer (real voice, ≥720p, not sped up, not recorded on a phone).

**EF alt-mempool prize. Nothing for it is on `main` yet, so it's the biggest risk:**
- [ ] The devnet registry, `WatermarkQuotaPaymaster` (it stakes itself), and the 4-frame F9 tx.
- [ ] **One admitted tx link** on explorer.altmempool.wtf, or the code that submits one. `docs/EF_ALTMEMPOOL.md` already explains the design and the gas trade-off.

**Website and polish:**
- [ ] `/attack`, `/sponsor` (shows the filters), `/dev`. Only `/` and `/verify` exist on `main` today.
- [ ] Phone Compose screens polish.
- [ ] Fix the failing Sponsor test `test_quotaRollback_tokenRevertAfterEarlierPayments` (`vm.recordLogs` window).
- [ ] Arkiv: only if everything above is done.

If time runs short, my suggested order: **Sponsor deploy → /pay with a real USDT tx → README link → EF admitted tx → video → the rest.**

## 5. How stamp expiry works (and what a company can control)

- The **app's session signer (our relayer) picks `validUntilMonth`** when it signs the session. The stamp expires at the last second (UTC) of that month.
- **The contract only allows 1 to 3 months ahead** (`[current + 1, current + 3]`). A longer limit would need a Registry redeploy.
- **The circuit requires both card certificates to be valid through that month**, so a stamp never outlives the card.
- **Renewal:** the same card and the same wallet tap again, and the expiry only moves forward. The same card with another wallet is refused, because the nullifier is bound to the first wallet.
- **Today the relayer always uses +3** (`STAMP_MONTHS` in `sdk/src/session.ts`). A per-app setting (1, 2 or 3) in the relayer config is a small change in `relayer/src/app.ts`, and needs no contract change.
- A company that wants a shorter window (e.g. "a tap within the last 7 days") can enforce it **on its own side**: it reads the stamp's block time with `stampHistory`.
- **No revoke:** a stamp can't be cancelled or shortened before it expires. That's a known limitation; I'll add it to the README limitations.
