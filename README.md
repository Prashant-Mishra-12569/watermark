# Watermark

**Tap your bank card on your phone once, and your wallet gets a private "real card" stamp that bots can't fake.**
No money is charged, and no card number goes on-chain. *Bots can't hold plastic.*

Built at ETHGlobal Mumbai 2026 by Prashant Mishra and Samanway Baranwal.

> Status: under active development during the hackathon. Anything marked *untested* or *estimated* is labelled that
> way on purpose.

## The problem
A new wallet is free and takes one second to create, so bots create thousands. Gasless apps get their gas budget
drained, airdrops get farmed and faucets get emptied. World ID needs an Orb, and ID-based proofs need Aadhaar or a
passport.

## How it works
1. The website silently creates a wallet and asks our relayer for a **signed session**. No gas is spent.
2. You scan the QR with an Android phone. The **Watermark Tap** app checks the session and shows you the same wallet.
3. You tap your bank card. Over NFC, the chip signs a fresh 4-byte challenge derived from the session (EMV dynamic
   data authentication). No payment is made and nothing is sent to a bank.
4. The phone checks the certificate chain and the app's filter locally, then sends the card data **encrypted** to the
   prover.
5. The prover builds a **zero-knowledge proof** that a genuine network-signed card, which passes this app's rules,
   signed this session's challenge. It also computes a **nullifier** (one card, one stamp per app). Card data is
   wiped after proving.
6. `WatermarkRegistry` verifies the proof on **Whitechain Sepolia**, and any contract can check `isStamped(wallet, appId)`.
7. Stamped wallets make **gasless USDT payments**: the business pays gas through our relayer, with drain protection.
8. On the **EIP-8141 alternative mempool**, a quota paymaster reads the registry during validation and sponsors
   stamped wallets.

## Architecture
See [docs/interfaces.md](docs/interfaces.md) for every interface, and [docs/PLAN.md](docs/PLAN.md) for the build plan.

| Part | Folder | Stack |
|---|---|---|
| Watermark Tap (Android) | `android/` | Kotlin, Jetpack Compose, NFC IsoDep |
| Website | `web/` | Next.js, viem, wagmi, Tailwind |
| ZK circuit | `circuits/` | Noir + Barretenberg (UltraHonk, ZK mode) |
| Prover service | `prover/` | Node/TypeScript, nargo + bb |
| Contracts | `contracts/` | Solidity 0.8.30, Foundry |
| Relayer | `relayer/` | Node/TypeScript, viem |
| SDK / MCP | `sdk/`, `mcp/` | TypeScript, Model Context Protocol |
| Synthetic test card | `tools/testcard/` | TypeScript |
| Filters | `policies/` | JSON + Poseidon2 Merkle roots |

## Setup
_TBD: added as each part lands._ Requirements: Node 24 (`corepack enable` for pnpm), Foundry, Noir + bb (WSL2 on
Windows), and Android Studio with JDK 17. Copy `.env.example` to `.env`.

## Tracks

### Whitechain · Scale: Payments Nobody Notices
- [ ] Contracts deployed and verified on Whitechain Sepolia (1874): _links TBD_
- [ ] USDT payment (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) settled in the main flow: _explorer link TBD_
- [ ] The payer flow has zero visible crypto steps
- **Why on-chain stablecoin settlement:** _TBD_
- **How the business pays gas, where the relayer's WBT comes from, and what stops draining it:** _TBD_
- Feedback: [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md)

### Ethereum Foundation · Frame Transaction Alternative Mempool
- [ ] Admitted transaction on the devnet explorer: _link TBD_
- Design and trade-offs: [docs/EF_ALTMEMPOOL.md](docs/EF_ALTMEMPOOL.md)

## CROPS
- **Censorship resistance:** _TBD_
- **Open source:** MIT licensed. _TBD: can a user build and run it from this repo alone?_
- **Privacy:** _TBD_. See [docs/PRIVACY.md](docs/PRIVACY.md).
- **Security:** _TBD_

## Current limitations
- Our prover sees card data briefly. It's never on-chain, and on-device proving is the fix.
- One card, not one person. A tap has no PIN, so a stolen or borrowed card also passes.
- Only RuPay has been verified on real cards. Visa and Mastercard are *untested*.
- Testnet only. A real launch needs PCI and legal review and a licensed BIN source.

The full list is in [docs/PRIVACY.md](docs/PRIVACY.md).

## Prior work disclosure
Before kickoff, we checked feasibility with a small Android test app ("Card Test"), which read two RuPay cards and
verified their certificate chain. We also wrote the planning spec in [docs/spec/](docs/spec/). **No code from the test
app is in this repository.** All project code was written during the hackathon.

## Prior art
Carte Bleue (ETHGlobal Lisbon 2026), zkEMV (ZK Hack Berlin 2025), GOAT RAMP (ETHGlobal Istanbul).

## Libraries used
_TBD as dependencies are added._

## License
[MIT](LICENSE)
