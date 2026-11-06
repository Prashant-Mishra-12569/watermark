# contracts

Foundry project. **Owner: Samanway.** Prashant supplies `src/generated/Verifier.sol` from the circuit.
Spec sections J and L; ABI in [docs/interfaces.md](../docs/interfaces.md) F5.

| Contract | Chain | Job |
|---|---|---|
| `WatermarkRegistry` | Whitechain 1874 + devnet 1337 | apps, sessions, nullifiers, stamps |
| `HonkVerifier` (generated, `src/generated/Verifier.sol`) | both | checks the ZK proof |
| `WatermarkSponsor` | Whitechain | one per app; gasless USDT via EIP-3009, quota per stamp |
| `WatermarkQuotaPaymaster` | devnet | EIP-8141 paymaster; stakes itself; VERIFY reads the registry |

Toolchain: solc 0.8.30, `evm_version = prague`, optimizer 200 runs.

## Build and test

```sh
forge install foundry-rs/forge-std   # once, if lib/forge-std is missing
forge build --sizes
forge test -vv                       # includes the real-proof stamp (test/RealProofStamp.t.sol)
forge test --gas-report
```

## Registry behaviour beyond F5

- **`stamp` refuses `s.wallet == address(0)`** with `ZeroWallet()`, as part of check 2. `address(0)` is also the
  "unused" marker in `nullifierWallet`, so a stamp to it would have left the card unbound.
- **Any verifier failure is `InvalidProof()`.** The bb-generated verifier reverts with its own errors
  (`SumcheckFailed`, `ShpleminiFailed`, `ValueGeFieldOrder`, `ProofLengthWrongWithLogN`, ...) instead of returning
  `false`. `stamp` wraps the call in `try/catch`, so callers see one error. An out-of-gas inside the verifier is
  caught too, so a gas limit that is too low also reads as `InvalidProof()`.
- **Two-step ownership.** The deployer owns `setCaRoot` at first. `transferOwnership(newOwner)` proposes a new owner,
  and `newOwner` calls `acceptOwnership()` to take over. A typo can't lock the CA root, a second proposal replaces
  the first, and `transferOwnership(address(0))` cancels. Events: `OwnershipTransferStarted`, `OwnershipTransferred`
  (the OpenZeppelin `Ownable2Step` names). The new slots come after the F5 storage, so `caRoot` is still slot 0 and
  `apps` slot 1.
- **A renewal never shortens a stamp.** The stored expiry is `max(old, new)`.

## Gas (real proof, measured)

These figures use a real UltraHonk proof of the **synthetic** test card against the committed verifier. The
transaction figures are anvil (prague) receipts from `Deploy.s.sol` plus one real stamp. The `verify()` figure is a
forge `gasleft` delta.

| What | Gas | At 5 gwei |
|---|---|---|
| `HonkVerifier.verify` | ~2.58M (2,577,637; 2,573,968 in the first run) | |
| First stamp, whole transaction (10,244 B calldata) | **2,847,267** | ~0.0142 WBT |
| Renewal stamp, same wallet and card | 2,806,512 | ~0.0140 WBT |
| Refusal (bad session, inputs or proof) | 0: the relayer simulates first and doesn't send | |

Proof: 9,536 bytes. Proving takes about 1.4 to 3 s on a MacBook (bb.js, 3 runs, median about 2.6 s while other jobs
were running).

**The relayer must simulate before it sends.** A proof that fails the final pairing check (`ShpleminiFailed`) makes
the verifier burn all the gas it is given (`test_realProof_badPairing_burnsTheGasLimit`). The relayer's `POST /stamp`
runs `eth_call` first and only sends what passes. Keep `MAX_GAS_PER_STAMP` at 3.5M: the 1/64 of gas the registry
holds back is then still enough to revert cleanly.

## Real-proof fixture

`test/fixtures/synthetic-stamp.json` holds a real proof of the **synthetic** card
(`tools/testcard/fixtures/rupay-768.json`, made-up keys), so it is safe to commit. It has no real card data. It is
bound to:

- appOwner `0x00000000000000000000000000000000000A11cE` with salt 0 (so the appId comes from `registerApp` called by
  that address)
- nonce `0x11..11` (UN `0x02d449a3`) and `validUntilMonth` 325 (Feb 2027)
- a CA root holding the synthetic CA only (`0x198a…c3fe`, not `policies/ca-keys.json`)
- the rules root of `policies/test.json`

Regenerate it after any change to the circuit or verifier. The script takes the source commit, the sha256 of
`circuits/target/watermark.json` (checked) and the nargo version:

```sh
(cd circuits && nargo compile)
node contracts/script/gen-stamp-fixture.ts <commit> $(shasum -a 256 circuits/target/watermark.json | cut -d' ' -f1) 1.0.0
```

`test/RealProofStamp.t.sol` covers the following:
- a successful stamp: `isStamped` is true, the expiry is 2027-02-28T23:59:59Z, and the stamp goes to `s.wallet`
- replay, and the same card used with another wallet
- a tampered proof, which fails as `InvalidProof()`
- a wrong nonce, which fails as `UnMismatch`
- a UN rewritten to match the session, a `nullifier + r` alias, another appId and a month outside the window

## Deploy (Whitechain Sepolia 1874, devnet 1337)

The deployer key is the encrypted Foundry keystore **`deployer`** (`cast wallet import deployer --interactive`). It
never goes into `.env` or onto the command line. forge auto-loads a `.env` only from `contracts/`, and ours is in the
repo root, so export it inside a subshell:

```sh
cd contracts
# dry run: simulates against the live chain, sends nothing
( set -a; . ../.env; set +a; forge script script/Deploy.s.sol --rpc-url whitechain --account deployer )
# real run: asks for the keystore password once
( set -a; . ../.env; set +a; forge script script/Deploy.s.sol --rpc-url whitechain --account deployer --broadcast )
node script/deployment-json.ts 1874          # writes ../deployments/whitechain.json (F11)
```

`Deploy.s.sol` reads these variables. An empty value counts as unset.

| Variable | Default |
|---|---|
| `SESSION_SIGNER_ADDRESS` | **required**: the relayer's session-signer address |
| `APP_SALT` | `0x00…00` (a new salt gives a new appId) |
| `POLICY` | `test.json` (the file in `../policies` that supplies the rules root) |
| `CA_ROOT` | `.caRoot` of `../policies/ca-keys.json` |
| `RULES_ROOT` | `.rulesRoot` of `../policies/$POLICY` |

It deploys the verifier libraries, `HonkVerifier`, then `WatermarkRegistry`, then calls `setCaRoot` and
`registerApp`. After that it checks that the appId, the app, the caRoot and the owner all match. It was tested on a
local anvil, and the registry runtime is 6,854 bytes.

To hand the owner role to another account later:

```sh
cast send $REGISTRY "transferOwnership(address)" <newOwner> --account deployer --rpc-url whitechain
cast send $REGISTRY "acceptOwnership()" --account <newOwner's keystore> --rpc-url whitechain
```

Verify on Blockscout:

```sh
forge verify-contract <addr> src/WatermarkRegistry.sol:WatermarkRegistry \
  --constructor-args $(cast abi-encode "constructor(address)" <verifier>) \
  --rpc-url whitechain --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
```

## Known limits

- **Month skew (MONTH-1).** The relayer derives `validUntilMonth` from its own clock, and the chain checks it
  against `block.timestamp`. The window `[m+1, m+3]` absorbs any skew except at a month boundary. A session signed
  at 23:59:59 UTC on the last day of a month (with `m+3`) and mined after midnight still passes, because it is now
  `m'+2`. The only failure is a session signed for `m+1` and mined in the next month, and the relayer always signs
  `m+3`.
- **A proof is bound to its session only through the 32-bit UN.** The session signature binds the wallet, and the
  registry checks UN = `sha256(nonce)[0..4]`.
- **The registry keys nullifiers by their raw `bytes32`.** The real verifier refuses non-canonical aliases
  (`nullifier + r`).
