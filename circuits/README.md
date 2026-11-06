# circuits

**Owner: Prashant.** Noir circuit for spec sections H, I and I2. Public inputs are in the fixed F4 order.

## Toolchain (pinned)
| Tool | Version | Install |
|---|---|---|
| nargo | **1.0.0** | `noirup -v 1.0.0` |
| bb (Barretenberg) | **6.0.0** | `bbup -v 6.0.0` (bbup can't auto-map Noir 1.0.0 yet) |
| noir-bignum | v0.11.0 | Nargo.toml |

On Windows these run inside WSL2 Ubuntu. On macOS they run natively.

## What the circuit proves
All 8 constraints of spec section I, for the RuPay size profile (CA 1984-bit → bank 1408-bit → card 768-bit, all
e = 3, 183 bytes of static data). This profile matches all three of our real cards.

1. **CA key allowed:** `Poseidon2(networkId, hash(pack(n_CA)))` is a leaf under `ca_root` (depth 6). The network ID
   comes from that leaf, so the filter below is bound to the network that really signed the card.
2. **EMV chain (spec H):**
   - The bank certificate opens with the CA key (`6A 02 … BC`, algorithms, key length, padding, SHA-1).
   - The card certificate opens with the bank key (`6A 04 … BC`, SHA-1 over the certificate + exponent + static data).
   - The card signature opens with the card key (`6A 05|95 … BC`).
3. **Issuer check:** the bank certificate's issuer ID is a prefix of the PAN.
4. **Freshness:** the signature's SHA-1 covers this session's `un`, so replays fail.
5. **Filter:** `Poseidon2(networkId, prefixLength, prefix)` is a leaf under `rules_root` (depth 13, up to 8,192 prefixes). The prefix is the
   first 6 or 8 PAN digits, taken from the **signed** card certificate.
6. **Validity:** both certificates are valid through `valid_until_month`.
7. **Nullifier:** `Poseidon2(pack(n_C) ‖ appId)`, from the card **key** and never the card number.
8. Nothing about the card is output. The only public values are the six F4 inputs.

`pack(x)` = `[len, 31-byte big-endian chunks]` (interfaces F4). Poseidon2 comes from `noir-lang/poseidon` v0.4.0.

## Measured (synthetic test card, Windows laptop, WSL2, 8 threads, 2026-11-06)
| Metric | Value |
|---|---|
| ACIR opcodes / circuit size | 84,476 / **206,623 gates** (UltraHonk), rules tree depth 13 |
| `bb prove -t evm` (ZK, keccak) + vk + verify | **3.0 s**, 326 MB peak |
| Proof size / public inputs | 9,536 bytes / 6 × 32 bytes |
| Solidity verifier (`bb write_solidity_verifier -t evm`) | HonkVerifier runtime **18,451 bytes** (< 24,576 limit) + ZKTranscriptLib 6,089 bytes (spike build) |

**Negative checks (all refused):**
| Case | Error |
|---|---|
| Same signature, other UN | `sdad: hash (stale or replayed)` |
| Valid past the card's expiry | `card certificate expires too soon` |
| Same card, another app's nullifier | `nullifier mismatch` |
| PAN prefix not in the filter | `card is not allowed by this app's filter` |
| Network ID that doesn't match the CA leaf | `CA key is not allowed` |

## Run
```sh
# from the repo root (Windows: inside WSL)
node tools/testcard/src/prover-toml.ts > circuits/Prover.toml   # synthetic card only; Prover.toml is gitignored
cd circuits
nargo test                      # SHA-1 vectors, BCD, issuer prefix
nargo execute                   # witness for the test card
bb prove -b target/watermark.json -w target/watermark.gz -o target/out -t evm --write_vk --verify
bb write_solidity_verifier -k target/out/vk -o ../contracts/src/generated/Verifier.sol -t evm
```
`-t evm` means keccak transcript **and zero-knowledge** (spec I: a non-ZK proof could expose private inputs). The
verifier must be generated with the same target.

Never put a real card's `Prover.toml` or witness in the repo.
