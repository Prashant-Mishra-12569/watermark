# Handoff: Prashant → Samanway (Fri 6 Nov, updated 18:40 IST)

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

1. ✅ README: the real-card stamp tx and your admitted EF tx are in the "What works today" table and the track
   checklists (all links checked: HTTP 200, and the EF receipt was read from the devnet RPC). The limitations now cover
   Visa/MC (planned, not live), the stamp length and no revoke. **When you edit the README, build on this version.**
2. Must-refuse tests on the phone, each with a screenshot:
   - the same card with a new wallet (expected: the Registry reverts with `NullifierBoundToOtherWallet`)
   - a renewal with the same card and same wallet (expected: extends, never shortens)
   - an expired QR
   - a card outside the filter (refused on the phone, before anything is sent)
3. ~~The second card tap on the devnet~~: no longer needed, since your admitted tx qualifies us. I'll do a real-card
   devnet tap only if there's spare time.
4. The AI-use disclosure: I already have a draft `docs/AI_USAGE.md` and my prompt log `docs/prompts/prashant.md`.
   **Please don't start a separate AI_USAGE.md.** Send me your part (which files and parts were AI-assisted, plus your
   prompts as `docs/prompts/samanway.md`), and I'll merge them into one file. Also: the privacy doc check, the pitch,
   and recording the live tap.
5. Submission at 08:00.

## 3. What I need from you

- The **Sponsor address** in `deployments/whitechain.json` (currently `"sponsor": null`). The SDK, MCP and README link to it.
- `deployments/devnet.json`, the paymaster code and the sender tool in the repo (your task #1), so the README and SDK
  can link to the devnet Registry `0x1838…E42C` and the paymaster `0x6218…7097`.
- **Update F9 in `docs/interfaces.md`**: the spec says 4 frames, and your admitted tx has 5 (deadline, sender check,
  paymaster pays, user call, quota count). The doc and the code must match, or the judges will notice.
- A decision on **stamp length per app** (section 5): stay fixed at 3 months, or let each app choose 1–3.

## 4. What's left on your side (from `docs/PLAN.md`)

**Whitechain prize. These are qualification rules, so they come first:**
- [ ] Deploy `WatermarkSponsor` and verify it on the explorer.
- [ ] `/pay`: a gasless USDT payment (`0xcedf…55a7`, permit or EIP-3009) in the main flow. **The payer pays no gas.**
- [ ] The USDT payment's explorer link in the README.
- [ ] `WHITECHAIN_FEEDBACK.md`: "What worked" and "Where we got stuck" are still `_TBD_`.
- [ ] A 2–4 min video showing user, business and relayer (real voice, ≥720p, not sped up, not recorded on a phone).

**EF alt-mempool prize:**
- [x] Admitted and mined: [tx `0xcab8c9e2…`](https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc), devnet block 3,699, all 5 frames successful, user paid 0.
- [ ] Commit the paymaster code, the sender tool and `deployments/devnet.json` (your #1). The judges need the code, not just the link.
- [ ] `docs/EF_ALTMEMPOOL.md`: results, the 5-frame shape, and the "attack" rows (an unstamped wallet refused; the public mempool rejecting the same tx). The design and the measured gas trade-off are already in it, so extend them rather than rewrite.

**Website and polish:**
- [ ] `/attack`, `/sponsor` (shows the filters), `/dev`. Only `/` and `/verify` exist on `main` today.
- [ ] Phone Compose screens polish.
- [ ] Fix the failing Sponsor test `test_quotaRollback_tokenRevertAfterEarlierPayments` (`vm.recordLogs` window).
- [ ] Arkiv: only if everything above is done.

If time runs short, my suggested order: **EF code + devnet.json in the repo → Sponsor deploy → /pay with a real USDT tx → README link → video → the rest.**

## 5. How stamp expiry works (and what a company can control)

- The **app's session signer (our relayer) picks `validUntilMonth`** when it signs the session. The stamp expires at the last second (UTC) of that month.
- **The contract only allows 1 to 3 months ahead** (`[current + 1, current + 3]`). A longer limit would need a Registry redeploy.
- **The circuit requires both card certificates to be valid through that month**, so a stamp never outlives the card.
- **Renewal:** the same card and the same wallet tap again, and the expiry only moves forward. The same card with another wallet is refused, because the nullifier is bound to the first wallet.
- **Today the relayer always uses +3** (`STAMP_MONTHS` in `sdk/src/session.ts`). A per-app setting (1, 2 or 3) in the relayer config is a small change in `relayer/src/app.ts`, and needs no contract change.
- A company that wants a shorter window (e.g. "a tap within the last 7 days") can enforce it **on its own side**: it reads the stamp's block time with `stampHistory`.
- **No revoke:** a stamp can't be cancelled or shortened before it expires. That's a known limitation; I'll add it to the README limitations.
