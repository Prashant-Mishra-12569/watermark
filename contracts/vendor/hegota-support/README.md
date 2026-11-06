# Vendored: @forshtat/hegota-support 0.0.1 (MIT)

Source: the npm package [`@forshtat/hegota-support@0.0.1`](https://www.npmjs.com/package/@forshtat/hegota-support)
(repository https://github.com/forshtat/hegota-support), the version the alt mempool workshop installs. Third-party
code, not written by us. License: MIT, see `LICENSE` (copied unchanged).

Why vendored: `contracts/lib/` is gitignored and CI installs only forge-std, so the paymaster needs these files in the
repo to build. Imports keep the package path through the remapping in `contracts/foundry.toml`:
`@forshtat/hegota-support/=vendor/hegota-support/`.

Files (all of `contracts/` in the package): `HegotaSupport.sol`, `Params.sol`, `Devnet.sol`, `Opcode.sol`,
`internal/HelperCalls.sol`, `generated/HelperCode.sol`.

Only change: `pragma solidity 0.8.28;` became `pragma solidity ^0.8.28;` in every file, so the library compiles with
our solc 0.8.30 / Prague toolchain. No code was modified.
