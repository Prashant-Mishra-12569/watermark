# prover

**Written by Prashant, run by Samanve on the Mac.** Spec section O; interfaces F2, F3, F4.
Node + TypeScript on port 8787, calling `nargo execute` and `bb prove` / `bb verify`.

## Flow
1. `POST /prove` checks the envelope, the session signature (signer read from the registry), expiry, UN, and one job
   per session.
2. Decrypt in memory (RSA-OAEP-256 + AES-256-GCM, AAD = the session's EIP-712 hash).
3. Write `Prover.toml` and the witness to a **RAM disk** only, prove, verify locally, then delete and zero the buffers
   (best effort).
4. `POST /stamp` to the relayer.
5. Print the proving time, which goes in the README and the demo.

**Rules:**
- Never log request bodies, card fields or witnesses.
- Zero-knowledge mode only, with one pinned `bb` version.
- The decrypt key lives outside the repo. Only `keys/prover_pub.pem` (the public half) is committed.
- `PROVER_MODE=attester` is the disclosed fallback from spec V.

RAM disk on macOS: `diskutil erasevolume HFS+ wmram $(hdiutil attach -nomount ram://1048576)`.
