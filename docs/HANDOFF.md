# Handoff: Samanway → Prashant (Sat 7 Nov, 00:40 IST)

Temporary working note. We delete it before submission. Prashant's earlier note is kept below.

## 1. Live now
| What | Link |
|---|---|
| Website (new design: Builders home + Genesis Drop) | https://usewatermark.xyz |
| Genesis Drop: claim the NFT | https://usewatermark.xyz/pass |
| Get the Android app (the download turns on when the APK is placed) | https://usewatermark.xyz/app |
| Bot test | https://usewatermark.xyz/attack |
| Docs for people and AI agents (same file) | https://usewatermark.xyz/watermark.txt · https://usewatermark.xyz/llms.txt |
| Relayer API | https://api.usewatermark.xyz |
| Prover (the phone talks to it) | https://prover.usewatermark.xyz |

Hosting: one Cloudflare named tunnel (`watermark`) from Samanway's Mac. `usewatermark.xyz` and `www` → :3000 (web),
`api.` → :8788 (relayer), `prover.` → :8787 (prover). Domain registered at Hostinger, DNS on Cloudflare. **The Mac must
stay on, awake and online during judging.** QR codes now point the phone to the permanent `prover.usewatermark.xyz`
(no more trycloudflare links).

## 2. Deployed on Whitechain Sepolia (1874), all source-verified on Blockscout
| Contract | Address | Note |
|---|---|---|
| Live app (salt `0x…03`) | appId `393344891601835728760966937624776276735512086066329273346256164761263100630` | your stricter list: 4,208 bank-debit ranges, no prepaid. Registered in tx `0xce55c3b6…`. Salt `0x…02` was already taken by our private test app ("demo app 2", old 6,258 list), so your section 0 command would have reverted. |
| WatermarkSponsor (live app) | `0x21b6ae18a412afb84a09263939c5e787d374939a` | 20 sponsored payments per wallet per day |
| WatermarkGenesisPass | `0x12DdF2A4C698A3271F21fEA07559467b6C8AdcB0` | 100 NFTs, stamp-gated, one per wallet, minter = relayer; the relayer also checks one gas-free payment (PaymentRelayed) |
| WatermarkPassRenderer | `0x32D1C048C81Cc60d9c21078B85C2f95132D0Fe72` | draws all 100 stamps on-chain; byte-identical to `contracts/test/fixtures/pass-svg/` |
| Previous live app + first sponsor | see `previousLive` in `deployments/whitechain.json` | first real-card stamp and first payment happened there |

Proof, end to end: real-card stamp `0xd7e01665…`; gas-free USDT from a MetaMask wallet with 0 WBT on the live app
`0xb848b7c8…`; EF admitted frame tx `0xcab8c9e2…`. A full health check (contracts, transactions, servers, settings,
balances, public URLs) passed 72/73; the only miss was `www` DNS still propagating.

## 3. What's new in the product
- **Website, two pages.** Home = the service for companies: hero with a hand-drawn Mumbai skyline, a live "Airdrop
  claims" feed and the stamp NFT; How it works; Add it in one line (Solidity / SDK / MCP); **"Let your AI agent add it"**
  (a copyable prompt for Claude Code / Cursor that reads watermark.txt and adds the gate); Try to farm it (bot test +
  "Is this wallet stamped?"); You decide who counts; See it yourself (receipts); Privacy. Page 2 = the **Genesis Drop**
  (/pass): verify with your card → one free test payment → claim; after a claim a full-screen reveal + "Share on X".
  /verify and /pay are the drop's steps. A **Connect wallet** button in the header (EIP-6963: MetaMask, Rainbow, Rabby,
  Coinbase, or the in-browser wallet).
- **NFT art:** "Watermark Genesis Pass", Mumbai postage stamps, 5 landmarks × 20 (Gateway of India, Rajabai Clock
  Tower, Bandra-Worli Sea Link, CST, Marine Drive), ₹0 face value, "FEE PAID" postmark, a hidden watermark in the paper.
  Fully on-chain. Generator: `contracts/script/pass-art/generator.mjs`.
- **Logo: "One tap"** (a tilted bank card with a hand-drawn W and three tap lines). Favicon, app icons and the share
  image (OG/Twitter, 1200x630) are in the site. The full brand kit (every size, X/Instagram/LinkedIn images) is a folder
  on Samanway's Mac; ask him for it (not in git).
- **Tap app screens redesigned** (Samanway's UI side only): `android/app/src/main/java/com/watermark/tap/ui/**` plus
  new `res/drawable` and `res/values` files. Same entry point `WatermarkApp(state)`, your logic files untouched. One
  idea per screen, a 4-step bar (Check · Tap · Prove · Stamped), and on every screen an honest line about what that step
  uses (chip certificates read → encrypted on the phone → used once by the prover and wiped → nothing stored → nothing
  about the card on-chain; no money, no PIN).
- **X handle** used in the share text: `@usewatermark`.

## 4. What you need to do (in order)
1. **Pull main** after Samanway's PRs are merged. If the prover refuses to start with "compiled circuit does not match":
   it's a false alarm on any machine but yours, because `circuits/target/watermark.json` contains absolute file paths.
   Please make `prover/src/circuit-check.ts` hash only the JSON's `bytecode` field (and record that hash in the
   fixture). Until then `ALLOW_CIRCUIT_MISMATCH=1` starts it.
2. **Build the APK with the new screens (you build it; Samanway doesn't).** The UI is in
   `android/app/src/main/java/com/watermark/tap/ui/**` (theme/, components/, screens/, `WatermarkAppPreviews.kt`) plus
   `res/drawable/wm_logo.xml`, `res/drawable/wm_skyline.xml`, `res/values/colors.xml`, `res/values/themes.xml` and
   `res/values-v27/themes.xml`. Your logic files are untouched and `WatermarkApp(state)` keeps its signature. It was
   compile-checked on a Mac toolchain (`:app:compileDebugKotlin` and `:app:assembleDebug` succeeded) but **never run
   on a phone**.
   - Build the **`demo`** variant for users (`./gradlew :app:assembleDemo`): it trusts only the real session signer
     (`0x9A06…FdBB`). Don't hand out the plain debug build: it also trusts the public dev signer.
   - Look at all screens without a card: open `ui/WatermarkAppPreviews.kt` in Split view (18 previews).
   - Then one full real tap against the **live** site (https://usewatermark.xyz/verify → QR → tap) and check the order:
     Consent → Reading → Checking → Sending → Proving → Stamped; "View on explorer" opens the browser; with NFC off,
     "Open NFC settings" works; on Android 15 the status-bar icons are dark on white; with "Remove animations" on,
     the stamp seal appears without moving.
   - Notes from the redesign: Consent has no button (reader mode is always on, so the tap itself starts reading);
     `WaitingForCard` and `VerifiedOnPhone` are designed but MainActivity never sets them today; `ProvedNotStamped`
     says honestly that no relayer put the proof on-chain; there's no RefusalReason for "same card, other wallet"
     (unknown prover codes map to BAD_CARD); targetSdk 35 forces edge-to-edge, hence the new white-window themes and
     `safeDrawingPadding()`.
3. **Send the APK to Samanway directly** (WhatsApp/Drive). `*.apk` is gitignored. He places it at
   `web/public/download/watermark-tap.apk`, and /app shows the download button and QR by itself.
4. **Must-refuse screenshots** with the new screens: same card + new wallet, expired QR, card outside the list.
5. **AI usage:** Samanway sends his part and `docs/prompts/samanway.md`; you merge them into `docs/AI_USAGE.md`.
6. **README:** add the live links (site, drop, app, watermark.txt) and the Genesis Pass + renderer addresses; the
   payment tx `0xb848…` is already there.
7. **Video** (2–4 min, real voice, ≥720p): Samanway drafts the script around the live site.
8. **Delete this file** before submitting (target 08:00).

## 5. Honest limits to keep saying
The app is sideloaded (not on the Play Store yet). RuPay cards from India only; Visa/Mastercard planned. Testnets only.
Everything is hosted on one Mac through a tunnel. The prover sees the card data in memory while proving, then wipes it;
the site, app and docs say exactly that.

---

# Earlier note: Prashant → Samanway (Fri 6 Nov, updated 18:40 IST)

Temporary working note. We delete it before submission.

## 0. ~~Urgent: register the stricter live app~~ Done at salt 0x…03 (see section 2 above)

The old live filter let in **732 prepaid card ranges** (gift, metro, payroll cards that anyone can buy over the counter
with little KYC) plus 1,318 ranges with no category. One person could buy a pile of those and make many stamps. The new
filter keeps only the 4,208 ranges the dataset marks as bank debit products (CLASSIC, PLATINUM, PMJDY, RUPAY SELECT,
STANDARD). The SBI card is still in.

Rules are fixed per appId, so this is a new app under salt `0x…02`. I already checked the appId on the chain:
`computeAppId(deployer, 0x…02)` = `308663211604720878328034572238289142859725369530145873843287544799704764909`, not
registered yet.

```sh
cast send 0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6 "registerApp(bytes32,bytes32,address)"   0x0000000000000000000000000000000000000000000000000000000000000002   0x0061cb51b3abde45582be5a854b6d75903e09472bce31b019339db95505bea59   0x9A0606E26646643604b5A334a261527065AaFdBB   --rpc-url https://rpc.testnet.whitechain.io --account <your deployer keystore>
```

Then: set `liveAppId` and `liveRulesRoot` in `deployments/whitechain.json`, add the new appId to `APP_IDS` (relayer)
and `NEXT_PUBLIC_APP_ID` (web), and restart the prover so it serves the new `policies/live.json`. The phone fetches the
filter from the prover, so no new APK is needed. Our first stamp stays valid under the old app.

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
