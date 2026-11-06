# prover

**Written by Prashant, run by Samanway on the Mac (demo machine).** Spec section O; interfaces F2, F3, F4.
Node + TypeScript on port 8787. **Proving happens in memory:** `@noir-lang/noir_js` computes the witness and
`@aztec-foundation/bb.js` builds the UltraHonk proof (`verifierTarget: "evm"` = keccak + zero-knowledge). Card data,
the witness and `Prover.toml` are never written to disk, so there's no RAM disk to manage.

## Flow (F3)
1. `POST /prove` receives the F2 envelope, then checks:
   - its shape;
   - that the session hasn't expired;
   - that the session signer is allowed;
   - that this session hasn't been used before;
   - that the queue has room.

   Errors at this stage: 400 `BAD_ENVELOPE`, 401 `BAD_SESSION_SIG`, 410 `SESSION_EXPIRED`, 409 `SESSION_USED`, 503 `BUSY`.
2. Decrypt in memory (RSA-OAEP-256 unwraps the AES-256-GCM key; AAD = the session's EIP-712 hash). A ciphertext moved
   to another session fails here (400). Card data carrying another session's UN fails with 422 `UN_MISMATCH`.
3. Returns `202 { jobId }`. In the background:
   - run the ODA chain check and the app's filter (`NOT_IN_POLICY`, `EXPIRES_TOO_SOON`, `BAD_CARD`);
   - build the circuit inputs (CA path, rules path, nullifier);
   - prove;
   - send the proof to the relayer's `POST /stamp`;
   - drop the card data.
4. `GET /prove/:jobId` returns `{ status: queued|running|done|error, txHash?, error? }`. Errors never include card data.

**Rules:**
- Request bodies, card fields and witnesses are never logged.
- One proof runs at a time.
- JS strings can't be zeroed, so wiping is best effort (stated in PRIVACY.md).

## Setup
```sh
# once: keys (the private half goes OUTSIDE the repo; the public half is committed for the app)
node scripts/keygen.ts ~/watermark-secrets/prover_key.pem
# once per circuit change (Windows: inside WSL; macOS: native)
cd ../circuits && nargo compile
```
`.env` (repo root):
```
PROVER_DECRYPT_KEY_PATH=/Users/<you>/watermark-secrets/prover_key.pem
ALLOWED_SESSION_SIGNERS=0x…      # the relayer's session signer; dev: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
RELAYER_URL=http://localhost:8788  # unset = proofs are kept but not stamped (dev)
POLICY_FILES=policies/test.json,policies/live.json
```
```sh
pnpm --filter @watermark/prover start     # prints its LAN URL for the QR
pnpm --filter @watermark/prover test      # 12 API + startup-check tests (no real proving)
node ../tools/zk/src/prove-fixture.ts     # real in-memory proof of the test card, with timing
```

## Measured
In-memory proof of the synthetic test card (witness + prove + verify): **9.4 s** on the Windows laptop (bb.js WASM).
The same circuit takes 3.0 s with the native `bb` CLI on Windows, and 1.4–2.6 s on the MacBook that runs the demo prover
(2.6 s for the first real-card stamp).
