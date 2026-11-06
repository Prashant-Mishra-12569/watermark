# Watermark

**Tap your bank card on your phone once, and your wallet gets a private "real card" stamp that bots can't fake.**
No money is charged, and no card number goes on-chain. *Bots can't hold plastic.*

Built at ETHGlobal Mumbai 2026 by Prashant Mishra and Samanway Baranwal.

> Status: under active development during the hackathon. Anything marked *untested* or *estimated* is labelled that
> way on purpose.

## What works today (measured, Fri 6 Nov 2026)
| Step | Status |
|---|---|
| Real **SBI RuPay debit** card → NFC read in our Android app → full certificate chain checked on the phone | ✅ works on a real card |
| Phone → encrypted envelope → prover → **zero-knowledge proof of the whole EMV chain**, BIN filter and nullifier → verified | ✅ works on a real card (dev policy, prover on a laptop) |
| The same circuit compiled on both team laptops, and the proof accepted by the committed Solidity verifier | ✅ |
| **On-chain stamp on Whitechain Sepolia from the real card**: proof verified by `WatermarkRegistry`, gas paid by the relayer, user paid 0 | ✅ [tx `0xd7e01665…`](https://explorer.testnet.whitechain.io/tx/0xd7e0166584dbb3b404d2b81308b5b69c94fa52b4d2d0da6a66759a52bb86bc07), block 12,368,812, 2,855,911 gas |
| **EIP-8141 alt mempool**: a stamped wallet's frame tx sponsored by our staked quota paymaster, admitted and mined (5 frames, user paid 0 wei) | ✅ [tx `0xcab8c9e2…`](https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc) (devnet block 3,699) |
| **Gasless USDT payment** from the stamped wallet through `WatermarkSponsor`: 1 USDT paid, gas paid by the relayer. The payer wallet holds 0 WBT and has never sent a transaction itself | ✅ [tx `0x298d3d17…`](https://explorer.testnet.whitechain.io/tx/0x298d3d178794b988aee4286db9591e6b9a8c1d2ad5008b69fd231460c7477c69), block 12,373,497, 121,571 gas |

| Metric | Value |
|---|---|
| Circuit size | 206,623 gates (UltraHonk), all 8 constraints of spec section I |
| Proving time | **1.4 s** on a MacBook (native `bb`), 3.0 s Windows CLI, 9.4 s Windows in-memory (bb.js WASM) |
| Proof / public inputs | 9,536 bytes / 6 field elements |
| On-chain verification | **2.57M gas** to verify, about 2.9M for a full stamp. Verifier contract 18,578 bytes |
| Tests | 152 TypeScript + 28 Android unit tests + 10 Noir tests. Negative cases: replay, tamper, wrong CA, wrong network, BIN not in filter, reused nullifier, expired card, moved ciphertext |

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
5. The prover decrypts the card data **in memory** and builds a **zero-knowledge proof** that a genuine network-signed
   card, which passes this app's rules, signed this session's challenge. It also computes a **nullifier** from the
   card's key (one card, one stamp per app). Nothing is written to disk, and the card data is dropped after proving.
6. `WatermarkRegistry` verifies the proof on **Whitechain Sepolia**, and any contract can check `isStamped(wallet, appId)`.
7. Stamped wallets make **gasless USDT payments**: the business pays gas through our relayer, with drain protection.
8. On the **EIP-8141 alternative mempool**, a quota paymaster reads the registry during validation and sponsors
   stamped wallets.

## Architecture
See [docs/interfaces.md](docs/interfaces.md) for every interface, and [docs/PLAN.md](docs/PLAN.md) for the build plan.
**Integrating Watermark in your own product** (wallets, dapps, airdrops, AI agents): [docs/INTEGRATE.md](docs/INTEGRATE.md).

| Part | Folder | Stack |
|---|---|---|
| Watermark Tap (Android) | `android/` | Kotlin, Jetpack Compose, NFC IsoDep |
| Website | `web/` | Next.js, viem, wagmi, Tailwind |
| ZK circuit | `circuits/` | Noir 1.0.0 + Barretenberg 6.0.0 (UltraHonk, ZK mode), noir-bignum RSA e=3, our own SHA-1 |
| Prover service | `prover/` | Node/TypeScript, in-memory proving with noir_js + bb.js |
| Contracts | `contracts/` | Solidity 0.8.30, Foundry |
| Relayer | `relayer/` | Node/TypeScript, viem |
| SDK / MCP | `sdk/`, `mcp/` | TypeScript, Model Context Protocol |
| Synthetic test card | `tools/testcard/` | TypeScript |
| Filters | `policies/` | JSON + Poseidon2 Merkle roots |

## Setup
Requirements:
- Node 24 (`corepack enable` for pnpm)
- Foundry
- Noir 1.0.0 (`noirup -v 1.0.0`) and bb 6.0.0 (`bbup -v 6.0.0`); on Windows, inside WSL2
- Android Studio with JDK 17

```sh
pnpm install
cp .env.example .env                       # fill in locally, never commit
pnpm -r test                               # all TypeScript tests
cd circuits && nargo test && nargo compile # circuit tests + build
cd android && ./gradlew testDebugUnitTest assembleDebug
```
Each part has its own README: [circuits](circuits/README.md), [prover](prover/README.md),
[relayer](relayer/README.md), [android](android/README.md), [mcp](mcp/README.md),
[test card](tools/testcard/README.md).

## Tracks

### Whitechain · Scale: Payments Nobody Notices
- [x] Contracts deployed and verified on Whitechain Sepolia (1874): [WatermarkRegistry](https://explorer.testnet.whitechain.io/address/0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6),
  [VerifierRouter](https://explorer.testnet.whitechain.io/address/0xc2E883a53aC54CBc9564882a77ab3723E1373A5C). All addresses: [deployments/whitechain.json](deployments/whitechain.json)
- [x] First real-card stamp: [tx `0xd7e01665…`](https://explorer.testnet.whitechain.io/tx/0xd7e0166584dbb3b404d2b81308b5b69c94fa52b4d2d0da6a66759a52bb86bc07)
- [x] USDT payment (`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`) settled in the main flow: [tx `0x298d3d17…`](https://explorer.testnet.whitechain.io/tx/0x298d3d178794b988aee4286db9591e6b9a8c1d2ad5008b69fd231460c7477c69)
  (1 USDT from the stamped wallet; the relayer `0xf95E…a9Ba` sent the transaction and paid the gas)
- [ ] The payer flow has zero visible crypto steps
- **Why on-chain stablecoin settlement:** the money and the proof that the payer is a real cardholder live in the same
  place. The Sponsor contract checks the stamp and moves the USDT in one transaction, so nobody has to trust our
  server's word that a payment was allowed. It settles in seconds, works the same for anyone in any country, needs no
  merchant account, and anyone can audit every payment on the explorer. A card payment would need a bank, a
  merchant contract and the card number; here the card is used only once, to prove it's real, and is never charged.
- **How the business pays gas, where the relayer's WBT comes from, and what stops draining it:**
  - The relayer wallet pays all gas, so users never hold WBT.
  - On testnet it's funded from the Whitechain faucet (2 WBT a day).
  - A stamp costs about 2.9M gas, which is about 0.0145 WBT at the 5 gwei minimum base fee. So one day of faucet
    funds covers roughly 130 stamps. *(estimate from measured gas)*
  - In production, the business tops the relayer up.
  - Draining is stopped in layers ([relayer/README.md](relayer/README.md)): no gas is spent before a valid proof,
    payments need a stamp, each stamp has a daily quota, and there are per-transaction and daily budget caps.
- Feedback: [WHITECHAIN_FEEDBACK.md](WHITECHAIN_FEEDBACK.md)

### Ethereum Foundation · Frame Transaction Alternative Mempool
- [x] Admitted transaction on the devnet explorer: [tx `0xcab8c9e2…`](https://explorer.altmempool.wtf/tx/0xcab8c9e2171a8048c8f5e12d4bb830c92cba7f458763d2c7ac8f23ab1faa8a93?node=https%3A%2F%2Faltmempool.forshtat.com%2Frpc), mined in block 3,699, all 5 frames
  successful; the paymaster paid and the user's wallet has never held ETH
- Design and trade-offs: [docs/EF_ALTMEMPOOL.md](docs/EF_ALTMEMPOOL.md)

## CROPS
- **Censorship resistance:** stamps are verified on-chain by a public contract. Anyone can submit a valid proof, and
  the stamp always goes to the session's wallet. Our relayer could refuse to sign a session, and an app owner can
  replace it with their own session signer.
- **Open source:** MIT licensed. The circuit, prover, contracts, app and tools all build from this repo. The synthetic
  test card runs the whole pipeline without a real card.
- **Privacy:** no card number, BIN or expiry goes on-chain; only a proof, a nullifier and public roots do. The prover
  sees card data briefly, in memory; on-device proving is the fix. See [docs/PRIVACY.md](docs/PRIVACY.md).
- **Security:** the chip's key never leaves the card, and each tap signs a fresh session challenge, so replays fail.
  Proofs use zero-knowledge mode. Card data travels encrypted (RSA-OAEP + AES-GCM, bound to the session). We trust
  the prover's memory handling and the relayer's session signer.

## Current limitations
- Our prover sees card data briefly. It's never on-chain, and on-device proving is the fix.
- One card, not one person. A tap has no PIN, so a stolen or borrowed card also passes.
- Only RuPay works today. Visa and Mastercard are *planned, not live*: their filters can be written, but no Visa or
  Mastercard card can be proven yet. Each needs its own circuit profile, which plugs into `VerifierRouter` without a redeploy.
- A stamp lasts until the end of a month 1 to 3 months ahead (our relayer uses 3), and never past the card's own
  certificate expiry. Re-tapping the same card with the same wallet renews it. A stamp can't be revoked early.
- Testnet only. A real launch needs PCI and legal review and a licensed BIN source.

The full list is in [docs/PRIVACY.md](docs/PRIVACY.md).

## Prior work disclosure
Before kickoff, we checked feasibility with a small Android test app ("Card Test"), which read two RuPay cards and
verified their certificate chain. We also wrote the planning spec in [docs/spec/](docs/spec/). **No code from the test
app is in this repository.** All project code was written during the hackathon.

## Prior art
Carte Bleue (ETHGlobal Lisbon 2026), zkEMV (ZK Hack Berlin 2025), GOAT RAMP (ETHGlobal Istanbul).

## Libraries used
| Area | Libraries |
|---|---|
| Circuit | [noir-bignum](https://github.com/noir-lang/noir-bignum) v0.11.0 (RSA arithmetic), [noir-lang/poseidon](https://github.com/noir-lang/poseidon) v0.4.0 |
| Proving | [@aztec-foundation/bb.js](https://www.npmjs.com/package/@aztec-foundation/bb.js) 6.0.0, [@noir-lang/noir_js](https://www.npmjs.com/package/@noir-lang/noir_js) 1.0.0 |
| TypeScript services | [viem](https://viem.sh), [Hono](https://hono.dev), [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk), zod |
| Android | AndroidX, Jetpack Compose, [Bouncy Castle](https://www.bouncycastle.org) 1.86 (Keccak, secp256k1) |
| Contracts | [Foundry](https://getfoundry.sh); the verifier is generated by `bb write_solidity_verifier` |

**Public data:** the RuPay network CA public key 05 comes from the public CAPK list in
[mmors-1/nfc10](https://github.com/mmors-1/nfc10). We checked it against its published SHA-1 checksum.
The live filter's 4,208 Indian RuPay bank debit BINs come from
[mostafa19950/bin-list-data](https://github.com/mostafa19950/bin-list-data) (a lite version of BinLookup.io data),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). It's unofficial and possibly outdated, so
every one of those leaves is marked `listed`, not `tested`. We leave out prepaid ranges (gift, transit and payroll
cards, which anyone can buy over the counter) and ranges the dataset gives no category, because we can't tell if they
are prepaid.

## License
[MIT](LICENSE)
