# contracts

Foundry project. **Owner: Samanway.** Prashant supplies `src/generated/Verifier.sol` from the circuit.
Spec sections J and L; ABI in [docs/interfaces.md](../docs/interfaces.md) F5.

| Contract | Chain | Job |
|---|---|---|
| `WatermarkRegistry` | Whitechain 1874 + devnet 1337 | apps, sessions, nullifiers, stamps |
| `Verifier` (generated) | both | checks the ZK proof |
| `WatermarkSponsor` | Whitechain | one per app; gasless USDT via EIP-3009, quota per stamp |
| `WatermarkQuotaPaymaster` | devnet | EIP-8141 paymaster; stakes itself; VERIFY reads the registry |

Toolchain: solc 0.8.30, `evm_version = prague`.

```sh
forge install foundry-rs/forge-std
forge build
forge test
# verify on Whitechain (Blockscout)
forge verify-contract <addr> src/WatermarkRegistry.sol:WatermarkRegistry \
  --rpc-url https://rpc.testnet.whitechain.io \
  --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
```
Write the deployed addresses to `../deployments/*.json` (schema in interfaces F11), and put the measured
verifier gas in the README.
