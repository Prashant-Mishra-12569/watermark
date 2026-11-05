# Plan

Source: [Watermark Build Spec v3](spec/Watermark-Build-Spec-v3.pdf) · Interfaces: [interfaces.md](interfaces.md)
Deadline: **Saturday 7 Nov 2026, 09:00 IST** (no late submissions). Target: submit by 08:00.

## How the work is split

The split follows the line where the two halves touch least.

- **Prashant owns everything that touches card bytes:** chip → phone → test card → circuit → prover.
  Only Prashant has the Android phone and the real cards, and each of these parts must match the card's exact bytes.
- **Samanve owns everything users and the chain see:** website, app screens, contracts, relayer, paymaster.
  His Mac runs Foundry, Node and the alt mempool tooling natively, and he leads UI.

The two halves meet in only two places, both defined in [interfaces.md](interfaces.md):
1. **Prashant → Samanve:** the proof, its public inputs (F4) and `Verifier.sol`.
2. **Samanve → Prashant:** the signed session and QR (F1), and the deployed addresses (F11).

| Area (spec section) | Prashant · Windows + Android + cards | Samanve · Mac + UI |
|---|---|---|
| Android app (G, M) | deep link, session check, NFC/IsoDep, EMV flow, local maths and policy check, encryption, upload | all Compose screens and visuals (Android Studio previews with fake states) |
| `TapUiState.kt` | shared: changes by agreement | shared |
| Synthetic test card (S) | ✅ `tools/testcard` | |
| ZK circuit (I, I2) | ✅ `circuits/` (nargo in WSL2) | measures real proving time on the Mac |
| Prover (O) | ✅ writes `prover/` | runs it on the Mac (demo machine) |
| Verifier | ✅ generates `Verifier.sol` | deploys it |
| Contracts (J) | | ✅ WatermarkRegistry, WatermarkSponsor, deploy and verify on Whitechain |
| Relayer (K) | | ✅ `relayer/`, drain protection, `scripts/bots.ts` |
| Website (N) | | ✅ `web/`: `/`, `/verify`, `/pay`, `/attack`, `/sponsor`, `/dev` |
| EF alt mempool (L) | the second card tap on the devnet | ✅ devnet registry, WatermarkQuotaPaymaster, staking, frame txs, `docs/EF_ALTMEMPOOL.md` |
| Filters (I2) | ✅ `policies/` (test + live, roots) | shows them on `/sponsor` |
| SDK + MCP (P) | ✅ `sdk/` helpers, `mcp/` (late) | |
| Arkiv (Q, optional) | | relayer writes entities; only if everything else works |
| Partner booths | Whitechain: the official test USDT source | alt mempool team: confirm the F9 frame shape |
| Docs and demo | README, `docs/PRIVACY.md`, pitch, live tap | `WHITECHAIN_FEEDBACK.md`, video edit, stage laptop |

The `sdk/src/types.ts` and `sdk/src/chains.ts` files are shared, so both can edit them, keeping in line with interfaces.md.

## Devices

| | Prashant (Windows 10) | Samanve (macOS) |
|---|---|---|
| Node | 24 + `corepack enable` (pnpm) | 24 + `corepack enable` |
| Foundry | native (`forge` 1.7.x) | `foundryup` |
| Noir / bb | inside **WSL2 Ubuntu** (`noirup`, `bbup`) | native |
| Android | Android Studio + JDK 17, phone in USB debugging, `scrcpy` for mirroring | Android Studio for Compose previews only |
| Alt mempool | | `forshtat/mempool-workshop` (Node 20.12+, yarn v1), cloned **outside** this repo |

**On stage:** the Mac runs the website, relayer and prover, and the phone joins the same hotspot. Real card data
passes through the Mac's RAM, so all request logs stay off (`DEMO_MODE=true`).

## Timeline (IST, best case)

| By | Prashant | Samanve | Done when |
|---|---|---|---|
| Fri 04:00 | skeleton pushed; SBI card feasibility check | tools installed; workshop steps 1, 3, 7, 8 | repo live; first devnet tx accepted |
| Fri 08:00 | Android app shell + deep link + session check; synthetic test card; Noir spike (RSA e=3 + SHA-1) | relayer `/session`; `/verify` page with QR | **the laptop QR opens the app on the phone** |
| Fri 13:00 | circuit passes on the test card; prover wraps it | Registry + Sponsor on Whitechain; first gasless USDT transfer | **the test card's proof verifies on the Mac** (time logged) |
| Fri 18:00 | card reader + encryption → prover; real SBI tap | `/stamp`, `/pay`, app screens | **real tap → stamp → USDT paid** |
| Fri 23:00 | policies; second tap on the devnet; SDK | paymaster + frame txs; `/attack`, `/sponsor` | **the alt mempool admits the tx** |
| Sat 03:00 | MCP (2 tools); README; PRIVACY | polish; WHITECHAIN_FEEDBACK; EF doc | feature freeze |
| Sat 06:00 | rehearse; record the tap | edit video | three clean demo runs |
| Sat 08:00 | submit | check every link | submission confirmed |

Sleep 4 hours each, at staggered times (e.g. Prashant 13:00–17:00, Samanve 18:00–22:00). Check in for 10 minutes at each row.

**Cut order if behind:**
1. Arkiv.
2. The MCP, down to `watermark_check_wallet` + `watermark_draft_policy`.
3. If the circuit isn't working by Fri 18:00, switch to attester mode (spec V) and say so openly.

**Top risks:**
1. Circuit proving time is unmeasured.
2. The SBI card hasn't been tested yet.
3. We don't have a source for official test USDT.
4. The frame tx shape isn't confirmed by the alt mempool team.

## Git workflow

- Branches are `prashant/<topic>` and `samanve/<topic>`, merged into `main` by small PRs several times a day.
- Before each task, run `git switch main` and then `git pull --ff-only`. Merge, never rebase shared work.
- Commit every 30–60 minutes and push before every break. ETHGlobal requires steady history, and one large
  commit can lead to disqualification.
- Check before every push: `git status`, `git diff --staged`, and a search for card-number-like digit runs.

## Corrections to spec v3 (checked against the live partner docs, 2026-11-06)

1. **Frame tx shape (L):** the spec's 3 frames don't form a valid validation prefix. Use
   `[VERIFY sender 0x2][VERIFY paymaster 0x1][SENDER][DEFAULT consume()]` (interfaces F9).
2. **Paymaster staking (L):** a contract can't be staked from an EOA. The paymaster calls `addStake(86400)` itself,
   and is funded through its CREATE value.
3. **Payment ↔ app binding (F7):** the EIP-3009 signature doesn't cover `appId`, so WatermarkSponsor is deployed
   once per app with `appId` immutable.
4. **Encoding and packing (F0, F4):** defined explicitly, so the circuit, prover, test card and contract agree.
5. **Prover rejections (F3):** status codes added, and the allowed session signer is read from the registry.
6. **viem:** use `defineChain(1874)`. viem's `whitechainTestnet` is chain 2625.
7. **Toolchain:** solc 0.8.30, `evm_version = prague` (the highest target Whitechain supports). Use Node 24, since
   Node 20 is end-of-life and Arkiv needs 22.10 or later.
8. **USDT:** Whitechain's token list shows a different USDT (`0xaa79…8f46`). We use the prize-page address
   `0xcedf…55a7` and confirm with Whitechain.
9. **Staked verify budget:** plan for 1,000,000 gas (the docs disagree: 1M vs 2.5M).
