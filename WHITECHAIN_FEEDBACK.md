# Whitechain feedback

Honest notes from building Watermark on Whitechain Sepolia at ETHGlobal Mumbai.
This is updated as we go; entries marked *to confirm* are observations we haven't verified yet.

## What worked
- _TBD_

## Where we got stuck
- _TBD_

## What the docs were missing
- viem exports `whitechainTestnet` as chain **2625**, while Whitechain Sepolia is **1874**. It's easy to pick the wrong
  one. We define the chain ourselves with `defineChain`. *(observed 2026-11-06)*
- The official token list shows "Tether USD" at `0xaa7962d073935D387e8d442DA1D7149C81388f46` (the contract reports
  `USDT.e`), while the prize page requires `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. Which one should apps
  use, and how does a new wallet get it? *(to confirm)*
- There's no documentation on whether the test USDT supports EIP-3009 `transferWithAuthorization` or EIP-2612 `permit`,
  which gasless flows depend on. *(to confirm)*
- The RPC and explorer URLs appear with and without a trailing slash on different pages.
- The faucet needs a GitHub account at least 30 days old and gives 0.5 WBT per 24 h. That's fine for testing, but a
  relayer demo needs more. Who do we ask for a top-up?
