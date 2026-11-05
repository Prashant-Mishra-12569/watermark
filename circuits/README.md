# circuits

**Owner: Prashant.** Noir circuit for spec sections H, I and I2. Public inputs are in the fixed F4 order.

## Toolchain (pinned)
| Tool | Version | Install |
|---|---|---|
| nargo | **1.0.0** | `noirup -v 1.0.0` |
| bb (Barretenberg) | **6.0.0** | `bbup -v 6.0.0` (bbup can't auto-map Noir 1.0.0 yet) |
| noir-bignum | v0.11.0 | Nargo.toml |

On Windows these run inside WSL2 Ubuntu. On macOS they run natively.

## What the circuit proves so far
For the RuPay size profile (CA 1984-bit → bank 1408-bit → card 768-bit, all e = 3, 183 bytes of static data), which
matches all three of our real cards:

- **Step 1:** the bank certificate opens with the network key (header `6A 02`, trailer `BC`, algorithm bytes, key length, padding, SHA-1).
- **Step 2:** the card certificate opens with the bank key (`6A 04 … BC`, SHA-1 over the certificate + exponent + static data).
- **Issuer check:** the bank certificate's issuer ID is a prefix of the PAN.
- **Step 3:** the card signature opens with the card key (`6A 05|95 … BC`).
- **Freshness:** the signature's SHA-1 covers this session's `un` (a public input), so replays fail.
- **Validity:** both certificates are valid through `valid_until_month` (a public input).

**Still to add:**
- CA key membership under `ca_root` (constraint 1)
- the filter leaf under `rules_root` (constraint 5)
- the nullifier (constraint 7)

## Measured (synthetic test card, Windows laptop, WSL2, 8 threads, 2026-11-06)
| Metric | Value |
|---|---|
| ACIR opcodes / circuit size | 84,302 / **203,123 gates** (UltraHonk) |
| `nargo execute` (witness) | 3.5 s |
| `bb prove -t evm` (ZK, keccak) + vk + verify | **4.4 s**, 352 MB peak |
| Proof size | 9,536 bytes |
| Solidity verifier (`bb write_solidity_verifier -t evm`) | HonkVerifier runtime **18,451 bytes** (< 24,576 limit) + ZKTranscriptLib 6,089 bytes |

**Negative checks:**
- The same signature with another UN fails with `sdad: hash (stale or replayed)`.
- A `valid_until_month` past the card's expiry fails with `card certificate expires too soon`.

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
