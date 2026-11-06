# Whitechain feedback

Honest notes from building Watermark on Whitechain Sepolia at ETHGlobal Mumbai.
This is updated as we go; entries marked *to confirm* are observations we haven't verified yet.

## What worked
- **EIP-3009 on the prize USDT.** `transferWithAuthorization` (the `bytes signature` variant) worked the first time
  once we had the EIP-712 domain. It gives a gas-free payment flow with no approve step: the payer signs, our relayer
  sends it through our `WatermarkSponsor` contract, and the payer never holds WBT
  ([tx `0xb848b7c8…`](https://explorer.testnet.whitechain.io/tx/0xb848b7c8c589335d17ab1570f0cb1765325a1d065e58a2f9447e9d333e376879):
  the payer had 0 WBT and nonce 0; the relayer paid about 0.0006 WBT of gas).
- **Big contracts and heavy transactions.** The 18.5 KB UltraHonk verifier (plus two linked libraries) deployed with
  solc 0.8.30 and `evm_version = prague`, and a real-card stamp of about 2.9M gas went through
  ([tx `0xd7e01665…`](https://explorer.testnet.whitechain.io/tx/0xd7e0166584dbb3b404d2b81308b5b69c94fa52b4d2d0da6a66759a52bb86bc07)).
- **Blockscout verification from Foundry.** `forge verify-contract --verifier blockscout --verifier-url
  https://explorer.testnet.whitechain.io/api/` verified the registry, the router, the verifier with its libraries and
  both sponsors, with no API key.
- **viem with `defineChain(1874)`** for every read, signature and transaction.

## Where we got stuck
- **The USDT EIP-712 domain.** The prize USDT is an EIP-1967 proxy over `TetherTokenV2`, and `version()` reverts, so
  the usual way to read the domain fails. We found it by matching `DOMAIN_SEPARATOR()`: name `"Tether USD"`, version
  `"1"`, chainId 1874, verifyingContract = the proxy. One line in the docs would save every team that hour.
- **Explorer verification outage.** For a few hours on 6 Nov, Blockscout answered "Contract verification is
  temporarily unavailable", so our first sponsor stayed unverified; the same command passed later that evening.
- **`eth_getLogs` from block 0.** The Ankr RPC refuses it, so our SDK reads event history from our deploy block
  (12,335,610) in 2,000-block chunks.

## What the docs were missing
- viem exports `whitechainTestnet` as chain **2625**, while Whitechain Sepolia is **1874**. It's easy to pick the wrong
  one. We define the chain ourselves with `defineChain`. *(observed 2026-11-06)*
- The docs' token list shows "Tether USD" at `0xaa7962d073935D387e8d442DA1D7149C81388f46` (`USDT.e`), while the
  prize uses `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. The booth flyer cleared it up ("the only one that counts",
  permit + EIP-3009, swap on YetiTrade), but the docs site doesn't say this. Putting the flyer's USDT box on the
  docs' token page would save every team the same search.
- The RPC and explorer URLs appear with and without a trailing slash on different pages.
- The faucet docs say 0.5 WBT per 24 h, while the flyer says 2 WBT a day. Which is current?
