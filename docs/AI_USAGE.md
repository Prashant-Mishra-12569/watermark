# AI usage

ETHGlobal allows AI tools and asks teams to say where and how they used them. This is our account.

## How we worked

We both used Claude Code (by Anthropic) as a pair programmer.

We decided what to build, how it fits together, which prizes to go for and who does what. We ran every test with a
real card and every transaction on the chain ourselves.

The AI wrote most of the code and docs. It worked from our prompts and from our build spec in [docs/spec/](spec/).
Every prompt we gave it is in [docs/prompts/](prompts/).

We read and checked every change. Some commits were made by the AI when we asked, after we reviewed them, under our
own names. We pushed and merged every change ourselves. No commit names an AI as its author.

## How we checked the AI's work

Every parser and every crypto function has tests.

The phone app, the SDK, the prover and the circuit share the same test values, so they must agree on every byte. This
covers the EIP712 session hash, the card challenge, the Poseidon2 roots and nullifier, and the encrypted envelope.

The real checks were done by us. We tapped a real SBI RuPay card on the phone, the proof was made on the Mac, and the
stamp landed on Whitechain in transaction 0xd7e01665. The alt mempool transaction 0xcab8c9e2 was sent and checked by
Samanway.

## Prashant: card logic on the phone, ZK, prover, SDK, MCP

Prompts: [docs/prompts/prashant.md](prompts/prashant.md)

| Area | Files | What the AI did | What I did |
|---|---|---|---|
| Repo setup and docs | root configs, `docs/interfaces.md`, `docs/PLAN.md`, `docs/PRIVACY.md`, READMEs | Wrote them from the spec, and fixed what didn't match the partners' live docs | Chose the split, the tools and the rules. Reviewed it all |
| Test card | `tools/testcard/` | Wrote the fake card, the certificate checks and 16 tests | Gave it the real card's shape (key sizes, AIP, AFL) from my own card tests |
| ZK circuit | `circuits/` | Wrote the Noir circuit, SHA1 and helpers | Picked the Noir and bb versions, ran the proofs and the failure cases |
| ZK tools | `tools/zk/` | Wrote the Poseidon2 tree, the input builder, in memory proving and the filter builder | Checked the values against the circuit. Asked to drop prepaid card ranges from the live filter, because anyone can buy those over the counter |
| Prover | `prover/` | Wrote the API, the decryption, the startup check and tests | Ran it against my real card |
| Phone app, card side | `android/app/src/main/java/com/watermark/tap/{session,emv,crypto,net,policy}/`, `MainActivity.kt` | Wrote the NFC card reader, the session check, the encryption and the upload | Tested everything on my phone with my SBI card. Installed and debugged it on the device |
| SDK and MCP | `sdk/`, `mcp/`, `docs/INTEGRATE.md` | Wrote them, including the tools for wallets and companies (stamp checks, app audit, stamp history, app registration) | Asked for the company features, and reviewed them. Ran the live check against the Registry |
| Generated code | `contracts/src/generated/Verifier.sol` | Nothing. The `bb write_solidity_verifier` command made it | Generated it and checked its size |

## Samanway: website, relayer, contracts, alt mempool

Prompts: [docs/prompts/](prompts/) (Samanway's file)

| Area | Files | What the AI did | What Samanway did |
|---|---|---|---|
| _to fill in_ | | | |
