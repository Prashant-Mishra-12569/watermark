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
forge install foundry-rs/forge-std@v1.17.0 --no-git   # once; lib/ is gitignored (CI runs the same line)
forge build --sizes
forge test -vv                  # everything, including the real-proof stamp and the Whitechain fork tests
SKIP_FORK=true forge test       # offline, as CI runs it (no fork tests)
forge test --gas-report
```

The fork tests (`*.fork.t.sol`) fork Whitechain Sepolia read-only through `$WHITECHAIN_RPC` or the public RPC. Nothing
is broadcast.

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
repo root, so every command below exports it **inside a subshell** `( ... )`, so the keys in it don't stay in your
terminal. Each `forge script` without `--broadcast` is a dry run: it simulates against the live chain and sends
nothing.

**1. Registry.** `Deploy.s.sol` deploys the verifier libraries (`ZKTranscriptLib`, `RelationsLib`), `HonkVerifier`
and `WatermarkRegistry`. It then calls `setCaRoot` (from `policies/ca-keys.json`) and
`registerApp(APP_SALT, rulesRoot of policies/$POLICY, SESSION_SIGNER_ADDRESS)`, and checks the result.
`--verify` verifies every contract on Blockscout.

```sh
cd contracts
( set -a; . ../.env; set +a; forge script script/Deploy.s.sol --rpc-url whitechain --account deployer )   # dry run
( set -a; . ../.env; set +a; forge script script/Deploy.s.sol --rpc-url whitechain --account deployer --broadcast \
    --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ )
node script/deployment-json.ts 1874          # writes ../deployments/whitechain.json (F11)
```

| Variable (empty = unset) | Default |
|---|---|
| `SESSION_SIGNER_ADDRESS` | from `SESSION_SIGNER_KEY`; when both are set they must match |
| `APP_SALT` | `0x00…00` (a new salt gives a new appId) |
| `POLICY` | `test.json` (the file in `../policies` that supplies the rules root) |
| `CA_ROOT` | `.caRoot` of `../policies/ca-keys.json` |
| `RULES_ROOT` | `.rulesRoot` of `../policies/$POLICY` |

The script refuses, before sending anything:
- a session signer that doesn't match `SESSION_SIGNER_KEY`;
- one of the 10 public anvil/hardhat accounts on 1874 or 1337 (for example the dev signer `0xf39F…2266`);
- the deployer itself as the session signer.

An app's session signer can never change. A wrong one means a new `APP_SALT` and a new appId; the registry stays.

**2. Sponsor.** First copy the new registry address into `REGISTRY_ADDRESS` in `.env`. `DeploySponsor.s.sol` takes
the registry and appId from `deployments/whitechain.json`, and refuses a `REGISTRY_ADDRESS` that differs from it. The
relayer comes from `RELAYER_ADDRESS` (checked against `RELAYER_PRIVATE_KEY`, or derived from it), and the quota from
`QUOTA_PER_DAY` or `policies/$POLICY`.

```sh
( set -a; . ../.env; set +a; forge script script/DeploySponsor.s.sol --rpc-url whitechain --account deployer )
( set -a; . ../.env; set +a; forge script script/DeploySponsor.s.sol --rpc-url whitechain --account deployer \
    --broadcast --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ )
```

Put the printed address in `deployments/whitechain.json` (`"sponsor"`, `"txHashes.sponsor"`) and `SPONSOR_ADDRESS`
in `.env`.

**3. After the deploy.** The real appId is `keccak256(deployer, salt) >> 8`, not the dev `12345`, so:

1. In `.env`, set `REGISTRY_ADDRESS`, `VERIFIER_ADDRESS`, `SPONSOR_ADDRESS`, `APP_IDS=<appId>` and
   `NEXT_PUBLIC_APP_ID=<appId>`, using the decimal appId from `deployments/whitechain.json`.
2. Set `ALLOWED_SESSION_SIGNERS` (prover) to `SESSION_SIGNER_ADDRESS`.
3. Set `"appId"` in `policies/test.json` and commit it (F8). The prover answers `unknown app` for any other appId.
   `node tools/zk/src/roots.ts --check` still passes, because the appId is not part of the rules root.
4. Tell Prashant the appId and `SESSION_SIGNER_ADDRESS` for the Android build (F1).
5. Restart the relayer, the prover and the web server. At startup the relayer warns if `apps(appId).sessionSigner` on
   chain is not its own signer.
6. Commit `deployments/whitechain.json` and put the explorer links in the top-level README.

**Ownership** (optional). To hand the owner role (`setCaRoot`) to another account:

```sh
( set -a; . ../.env; set +a; cast send $REGISTRY_ADDRESS "transferOwnership(address)" <newOwner> \
    --account deployer --rpc-url whitechain )
( set -a; . ../.env; set +a; cast send $REGISTRY_ADDRESS "acceptOwnership()" --account <newOwner keystore> \
    --rpc-url whitechain )
```

**Manual verification** (fallback, if `--verify` failed). The library addresses are in
`deployments/whitechain.json` (`"libraries"`):

```sh
( set -a; . ../.env; set +a
  V="--rpc-url whitechain --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/"
  forge verify-contract <ZKTranscriptLib> src/generated/Verifier.sol:ZKTranscriptLib $V
  forge verify-contract <RelationsLib> src/generated/Verifier.sol:RelationsLib $V
  forge verify-contract <verifier> src/generated/Verifier.sol:HonkVerifier $V \
    --libraries src/generated/Verifier.sol:ZKTranscriptLib:<ZKTranscriptLib> \
    --libraries src/generated/Verifier.sol:RelationsLib:<RelationsLib>
  forge verify-contract <registry> src/WatermarkRegistry.sol:WatermarkRegistry $V \
    --constructor-args $(cast abi-encode "constructor(address)" <verifier>)
  forge verify-contract <sponsor> src/WatermarkSponsor.sol:WatermarkSponsor $V \
    --constructor-args $(cast abi-encode "constructor(address,uint256,address,address,uint32)" \
      <registry> <appId> 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 <relayer> 20) )
```

The devnet takes the same steps with `--rpc-url devnet` and `node script/deployment-json.ts 1337`. It has no sponsor,
and Blockscout verification isn't available there.

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
- **The sponsor's quota counts successful payments only.** A reverted relay rolls its quota back, so a hostile
  ERC-1271 wallet that signs "valid" only inside `eth_call` can make a relayer pay for any number of failed relays
  (`WatermarkSponsorFailedRelayTest`). The relayer's `POST /pay` must simulate with its real fee fields and refuse a
  wallet after one or two reverted relays per day (relayer/README.md).
