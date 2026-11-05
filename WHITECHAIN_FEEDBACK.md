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
- The docs' token list shows "Tether USD" at `0xaa7962d073935D387e8d442DA1D7149C81388f46` (`USDT.e`), while the
  prize uses `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. The booth flyer cleared it up ("the only one that counts",
  permit + EIP-3009, swap on YetiTrade), but the docs site doesn't say this. Putting the flyer's USDT box on the
  docs' token page would save every team the same search.
- The RPC and explorer URLs appear with and without a trailing slash on different pages.
- The faucet docs say 0.5 WBT per 24 h, while the flyer says 2 WBT a day. Which is current?
