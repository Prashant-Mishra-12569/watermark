# AI usage

ETHGlobal allows AI tools and asks teams to say where and how they used them. This is our account.

## How we worked

We both used Claude Code (by Anthropic) as a pair programmer. Samanway spoke most prompts and turned them into text
with Wispr Flow (voice dictation).

We decided what to build, how it fits together, which prizes to go for and who does what. We ran every test with a
real card and every transaction on the chain ourselves.

The AI wrote most of the code and docs. It worked from our prompts and from our build spec in [docs/spec/](spec/).
Every prompt we gave it is in [docs/prompts/](prompts/), one file per person.

We read and checked every change. Some commits were made by the AI when we asked, after we reviewed them, under our
own names. We pushed and merged every change ourselves. No commit names an AI as its author.

## How we checked the AI's work

Every parser and every crypto function has tests.

The phone app, the SDK, the prover and the circuit share the same test values, so they must agree on every byte. This
covers the EIP712 session hash, the card challenge, the Poseidon2 roots and nullifier, and the encrypted envelope.

The real checks were done by us. We tapped a real SBI RuPay card on the phone, the proof was made on the Mac, and the
stamp landed on Whitechain in transaction 0xd7e01665. The AI sent the alt mempool transaction 0xcab8c9e2 from
Samanway's Mac, in a session Samanway ran, and Samanway checked it on the devnet explorer.

## Prashant: card logic on the phone, ZK, prover, SDK, MCP

Prompts: [docs/prompts/prashant.md](prompts/prashant.md)

| Area | Files | What the AI did | What I did |
|---|---|---|---|
| Repo setup and docs | root configs, `docs/interfaces.md`, `docs/PLAN.md`, `docs/PRIVACY.md`, `README.md` and the part READMEs | Wrote them from the spec, and fixed what didn't match the partners' live docs | Chose the split, the tools and the rules. Reviewed it all |
| Test card | `tools/testcard/` | Wrote the fake card, the certificate checks and 16 tests | Gave it the real card's shape (key sizes, AIP, AFL) from my own card tests |
| ZK circuit | `circuits/` | Wrote the Noir circuit, SHA1 and helpers | Picked the Noir and bb versions, ran the proofs and the failure cases |
| ZK tools | `tools/zk/` | Wrote the Poseidon2 tree, the input builder, in memory proving and the filter builder | Checked the values against the circuit. Asked to drop prepaid card ranges from the live filter, because anyone can buy those over the counter |
| Prover | `prover/` | Wrote the API, the decryption, the startup check and tests | Ran it against my real card |
| Phone app, card side | `android/app/src/main/java/com/watermark/tap/{session,emv,crypto,net,policy}/`, `MainActivity.kt` | Wrote the NFC card reader, the session check, the encryption and the upload | Tested everything on my phone with my SBI card. Installed and debugged it on the device |
| Phone app screens | `android/app/src/main/java/com/watermark/tap/ui/`, `res/font/`, launcher icon | Rewrote Samanway's first screens into the current design: home, wallet check, one journey screen, the stamp moment, problem screens, the privacy sheet | Set the direction: made for consumers, minimal, matching the website |
| SDK and MCP | `sdk/`, `mcp/`, `docs/INTEGRATE.md` | Wrote them, including the tools for wallets and companies (stamp checks, app audit, stamp history, app registration) | Asked for the company features, and reviewed them. Ran the live check against the Registry |
| Generated code | `contracts/src/generated/Verifier.sol` | Nothing. The `bb write_solidity_verifier` command made it | Generated it and checked its size |

## Samanway: website, relayer, contracts, alt mempool

Prompts: [session 1](prompts/samanway-01-workshop-and-relayer.md) (alt mempool workshop and relayer) and
[session 2](prompts/samanway-02-website-and-launch.md) (website, contracts and launch). The website planning files the
AI worked from are in [docs/planning/website/](planning/website/).

| Area | Files | What the AI did | What Samanway did |
|---|---|---|---|
| Website | `web/` (`/`, `/pass`, `/verify`, `/pay`, `/attack`, `/app`, `/docs`, `/credits`, `web/src/app/_site`, `_art`, `_builders`, `_wallet`, `web/src/lib`) | Wrote the pages, connect wallet, the claim reveal, the Mumbai line art, the wording and the tests, from the planning files | Set the direction (a service for any app, two main pages, Mumbai, plain human English), reviewed every screen on the Mac and a phone, bought the domain and set up the DNS |
| Relayer | `relayer/src/` (`stamp`, `pay`, `pass`, `usdt`, `limits`, `preflight`) | Wrote `POST /stamp`, gas-free `/pay`, `/fund`, `/balance` and the Genesis Pass endpoints, with gas caps and tests | Ran it on the Mac and funded the relayer and business wallets |
| Contracts | `contracts/src/WatermarkRegistry.sol`, `VerifierRouter.sol`, `WatermarkSponsor.sol`, `WatermarkGenesisPass.sol`, `WatermarkPassRenderer.sol`, `contracts/script/`, `contracts/test/` | Wrote the contracts, the on-chain stamp art, the deploy scripts and tests, including a real-proof stamp and USDT fork tests | Ran every Whitechain deploy with Samanway's own keystore, registered the apps and chose the stamp design |
| Alt mempool | `contracts/src/WatermarkQuotaPaymaster.sol`, `contracts/script/DeployQuotaPaymaster.s.sol`, `tools/ef-sender/`, `docs/EF_ALTMEMPOOL.md`, `docs/EF_PAYMASTER_DESIGN.md` | Researched the frame transaction EIPs and the node's rules, wrote the paymaster and the sender, deployed on the devnet and sent the admitted transaction | Asked for it, stayed up for the devnet run and checked the result |
| Tap app screens (first version) | `android/app/src/main/java/com/watermark/tap/ui/`, `android/app/src/main/res/` | Wrote the first Compose theme, components and step-by-step screens, which Prashant's session later redesigned | Set the brief (one step per screen, saying what is and isn't read). Prashant builds and tests the app |
| Brand | `web/public/brand/`, `web/src/app/icon.svg`, `favicon.ico`, `apple-icon.png`, `opengraph-image.png`, `twitter-image.png` | Drew the logo options, the NFT stamp art and the share images | Picked the "One tap" logo and the stamp design |
| Docs | `docs/interfaces.md` (frame transaction fix), README updates, `WHITECHAIN_FEEDBACK.md`, `web/public/watermark.txt`, `llms.txt`, a temporary handoff note (deleted before submission) | Drafted them | Reviewed them |
