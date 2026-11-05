# Watermark interfaces

**Version 1.0 · 2026-11-06.** This file is the contract between every part of Watermark.
Code against it, not against each other's code. Changes need agreement from both
Prashant and Samanway: bump the version and add a line to the changelog at the bottom.

```
Website ──POST /session──▶ Relayer ──signed session (no gas)──▶ Website
Website ──QR / deep link watermark://verify?...──▶ Tap app
Tap app: check signature · show wallet · derive UN
Tap app ──SELECT · GPO (UN in 9F37) · READ RECORDs──▶ Card ──certs + fresh signature──▶ Tap app
Tap app: local maths + filter check, encrypt
Tap app ──POST /prove (encrypted envelope)──▶ Prover: decrypt · prove in RAM · verify · wipe
Prover ──POST /stamp (session, proof, public inputs)──▶ Relayer: simulate, then stamp(...)
Registry: verify session sig · UN · month · nullifier · rules · proof
Website ──GET /status──▶ Relayer ──isStamped(wallet, appId)──▶ "Verified ✓"
```
No gas is spent before the `stamp` step.

---

## F0 · Encoding rules (apply everywhere)

| Kind | JSON encoding |
|---|---|
| `uint256` / `uint64` values (`appId`, `chainId`, `expiresAt`, amounts) | decimal **string** (`"1874"`) |
| `uint32` / small ints (`validUntilMonth`, `networkId`, `prefixLength`) | JSON number |
| Bytes of any length (`nonce`, `sig`, `ek`, `iv`, `ct`, card fields) | `0x`-prefixed **lowercase hex** |
| Addresses | `0x` hex, EIP-55 checksum on output, case-insensitive on input |
| Card-data hex fields inside the encrypted F2 payload | hex **without** `0x` (EMV convention) |

---

## F1 · Session and QR

Signed off-chain by the app's `sessionSigner`. Signing costs no gas.

```ts
Session = {
  wallet: address,          // the wallet that receives the stamp
  appId: uint256,           // 248-bit, see F5
  nonce: bytes32,           // random, chosen by the relayer
  expiresAt: uint64,        // unix seconds, now + 600
  validUntilMonth: uint32,  // current month index + 3
  chainId: uint256,         // 1874 (Whitechain) or 1337 (devnet)
  registry: address         // WatermarkRegistry on that chain
}
```

- **EIP-712 domain:** `{ name: "Watermark", version: "1", chainId, verifyingContract: registry }`
- **Type string:** `Session(address wallet,uint256 appId,bytes32 nonce,uint64 expiresAt,uint32 validUntilMonth,uint256 chainId,address registry)`
- **UN (card challenge, tag 9F37):** `UN = sha256(nonce as 32 raw bytes)[0..4]`, 4 bytes.
- **Month index:** `month = (YYYY - 2000) * 12 + (MM - 1)`, using UTC. Example: Nov 2026 = 26*12 + 10 = 322.
- **QR / deep link:**
  ```
  watermark://verify?w=<wallet>&app=<appId>&n=<nonce>&e=<expiresAt>&v=<month>&c=<chainId>&r=<registry>&sig=<sig>&p=<proverUrl>
  ```
  If the QR is too dense to scan from 30 cm, use the fallback `watermark://verify?id=<sessionId>&p=<relayerUrl>`.
  The app then fetches the same signed session from `GET /session/:id`.
- **App checks before showing consent:** recover the EIP-712 signer and compare it with the signer address built
  into the app for that `appId`. Check `expiresAt > now` and that `c` is 1874 or 1337. On any failure, stop.

---

## F2 · Card data (app → prover, encrypted, never stored)

Plain payload, which exists only in memory:
```json
{
  "aid": "A0000005241010",
  "un": "<8 hex>",
  "caIndex": "05",
  "issuerCert": "<hex tag 90>",  "issuerRem": "<hex tag 92 or empty>", "issuerExp": "03",
  "iccCert": "<hex tag 9F46>",   "iccRem": "<hex tag 9F48 or empty>",  "iccExp": "03",
  "staticData": "<hex: ODA records per AFL + AIP if 9F4A=82>",
  "sdad": "<hex tag 9F4B>",
  "sigPath": "GPO_FDDA | GENAC_CDA | INTERNAL_AUTH",
  "termData": "<hex, starts with UN; extra fields for Visa fDDA; just UN for RuPay>"
}
```

Envelope on the wire:
```json
{
  "v": 1,
  "session": { "...F1 Session, F0 encoding..." },
  "sig": "0x<65-byte session signature>",
  "ek": "0x<AES-256 key wrapped with RSA-OAEP, SHA-256, MGF1-SHA-256>",
  "iv": "0x<12 bytes>",
  "ct": "0x<AES-256-GCM ciphertext || 16-byte tag>"
}
```
- **AAD** = the 32-byte EIP-712 hash of `session`, so a ciphertext can't be moved to another session.
- **Prover key:** RSA-3072. The public half is `prover/keys/prover_pub.pem`, built into the app.
  The private half never enters git. Rotate it after the event.

---

## F3 · Prover API (port 8787)

```
POST /prove        body: F2 envelope
  → 202 { "jobId": "<uuid>" }
  → 400 BAD_ENVELOPE      malformed JSON / fields
  → 401 BAD_SESSION_SIG   signer is not apps[appId].sessionSigner on that chain's registry
  → 410 SESSION_EXPIRED
  → 409 SESSION_USED      a job already exists for this session
  → 422 UN_MISMATCH       payload un != UN(session.nonce)
  → 503 BUSY              queue full
GET  /prove/:jobId
  → 200 { "status": "queued|running|done|error",
          "txHash"?: "0x…",
          "error"?: "NOT_IN_POLICY | EXPIRES_TOO_SOON | BAD_CARD | DECRYPT_FAILED | STAMP_REJECTED" }
```
- The prover reads the allowed `sessionSigner` from the registry on-chain (`apps(appId)`) and caches it. There is no
  hardcoded list.
- When a job is done, the prover calls the relayer: `POST /stamp`.
- Errors never include card data. Request bodies are never logged.
- `PROVER_MODE=zk | attester`. Attester is the fallback from spec V: the full maths runs in the prover and its result is
  signed. It's off by default and disclosed if ever used.

---

## F4 · Public inputs (fixed order: circuit, verifier, contract and prover must match)

| # | Name | Meaning |
|---|---|---|
| 0 | `caRoot` | Merkle root (depth 6) of allowed network CA keys. The contract stores the current root |
| 1 | `rulesRoot` | Merkle root (depth 12) of this app's filter (F8 / spec I2) |
| 2 | `appId` | 248-bit number, fits the BN254 field |
| 3 | `un` | the 4 UN bytes read as a big-endian integer |
| 4 | `nullifier` | `Poseidon2(pack(n_C) ‖ appId)` |
| 5 | `validUntilMonth` | the card and bank certificates are valid through this month |

- Every input is one `bytes32` big-endian field element. The contract converts with `uint256(publicInputs[i])`.
  **Never compare a raw `bytes4` with a `bytes32`.**
- **Packing big moduli into field elements:** `pack(x)` left-pads the big-endian bytes of `x` to a multiple of 31,
  splits them into 31-byte chunks (each < 2^248), and prefixes the byte length:
  `pack(x) = [len(x), chunk_0, …, chunk_k]`.
  - `n_CA` (1984-bit, 248 bytes = 8 × 31) → 1 + 8 field elements.
  - `n_C` (768-bit, 96 bytes) → 1 + 4 field elements.
  - `hash(n) = Poseidon2(pack(n))`.
  - CA leaf = `Poseidon2(networkId, hash(n_CA))`.
  - Nullifier = `Poseidon2(pack(n_C) ‖ appId)`, using the card **key**, never the card number.
- The circuit, `tools/testcard` and the prover must use one shared Poseidon2 implementation and parameters. Pin it in
  `circuits/Nargo.toml`.
- Proofs must be made in **zero-knowledge mode**, with the verifier generated in the same mode
  (`--oracle_hash keccak`). Record the pinned `nargo` and `bb` versions in the README.

---

## F5 · Contract ABI

Target: solc `0.8.30`, `evm_version = prague`. The same bytecode is deployed on Whitechain (1874) and the devnet (1337).

### WatermarkRegistry
```solidity
struct App     { address owner; bytes32 rulesRoot; address sessionSigner; }
struct Session { address wallet; uint256 appId; bytes32 nonce; uint64 expiresAt;
                 uint32 validUntilMonth; uint256 chainId; address registry; }

function registerApp(bytes32 salt, bytes32 rulesRoot, address sessionSigner) external returns (uint256 appId);
// appId = uint256(keccak256(abi.encode(msg.sender, salt))) >> 8. Rules are immutable: a new filter means a new appId.
function stamp(Session calldata s, bytes calldata sessionSig, bytes calldata proof, bytes32[] calldata publicInputs) external;
function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt);
function apps(uint256 appId) external view returns (address owner, bytes32 rulesRoot, address sessionSigner);
function setCaRoot(bytes32 root) external; // owner only

event AppRegistered(uint256 indexed appId, address indexed owner, bytes32 rulesRoot, address sessionSigner);
event Stamped(address indexed wallet, uint256 indexed appId, bytes32 nullifier, uint64 expiresAt);
```
`stamp` checks, in this order:
1. The app exists.
2. `block.timestamp <= s.expiresAt`, `s.chainId == block.chainid` and `s.registry == address(this)`.
3. The session hash hasn't been used, and the signer is `app.sessionSigner`.
4. The public inputs match: `caRoot`, `rulesRoot` and `appId`.
5. `un == uint32(bytes4(sha256(abi.encodePacked(s.nonce))))`.
6. `pi.validUntilMonth == s.validUntilMonth` and `m+1 <= pi.validUntilMonth <= m+3`.
7. The nullifier is unused, or its owner is `s.wallet` (that case is a renewal).
8. `verifier.verify(proof, publicInputs)` passes.
9. Store everything. Stamp expiry = the end of `validUntilMonth`. **The stamp goes to `s.wallet`, never `msg.sender`.**

### WatermarkSponsor (Whitechain): one per app
```solidity
constructor(address registry, uint256 appId, address usdt, address relayer, uint32 quotaPerDay);
function relayPayment(PaymentIntent calldata intent, bytes calldata userSig) external; // relayer only
function quotaLeft(address wallet) external view returns (uint32);
```
`appId` is immutable, so a payment is tied to an app by the sponsor it goes through. The EIP-3009 signature
doesn't need to cover `appId`. `relayPayment` checks `isStamped(from, appId)` and the daily quota, then calls USDT.

### WatermarkQuotaPaymaster (devnet)
```solidity
constructor(address registry, uint256 appId, uint32 quotaPerDay) payable; // fund it through the CREATE value
function stake(uint32 unstakeDelaySec) external payable; // owner only; calls staking registry addStake(86400) ITSELF
function consume() external;                             // called from the DEFAULT frame (F9)
```

### IVerifier
```solidity
function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
```

---

## F6 · Relayer HTTP (port 8788)

```
POST /session        { wallet, appId, chainId }            → { session, sig, qr, sessionId }   no gas; rate-limited
GET  /session/:id                                          → { session, sig }                  QR fallback
POST /stamp          { session, sig, proof, publicInputs } → { txHash }                        simulates first
POST /pay            { intent, signature }                 → { txHash } | 4xx { reason }
GET  /status/:wallet?app=<appId>&chain=<chainId>           → { stamped, expiresAt, quotaLeft } reads the chain
GET  /policy/:appId                                        → { label, environment, rulesRoot, leaves }  public
GET  /stats/:appId                                         → { budgetLeftWei, refusedByReason }  counts only
```
Refusal reasons: `NOT_STAMPED | QUOTA_USED | BUDGET_CAP | GAS_CAP | RATE_LIMIT | BAD_SIGNATURE | PAUSED`.
Logs hold only the reason and a truncated wallet (`0x12…abcd`). Never log bodies.

---

## F7 · Payment intent (Whitechain USDT)

- **Plan A:** EIP-3009 `transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s)`.
  ```ts
  PaymentIntent = { from, to, value /*6 decimals*/, validAfter, validBefore, nonce /*bytes32*/ }
  ```
  The EIP-712 domain is read from the token (`name()`, `version()` or `DOMAIN_SEPARATOR()`).
- **Plan B:** EIP-2612 `permit`, then `transferFrom` by WatermarkSponsor.
- **Plan C:** a minimal `WatermarkAccount` smart account per user, using `execute(intent, sig)`.
- **Known trade-off:** anyone who sees a signed 3009 authorization can submit it to USDT directly. That only moves the
  user's own USDT to the intended recipient and skips our quota. It doesn't spend our budget.

USDT: `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, "the only one that counts" (Whitechain flyer). 6 decimals, and
supports both permit and EIP-3009, so Plan A is expected to work. Get it by swapping WBT on YetiTrade.

---

## F8 · Policy file (`policies/*.json`)

```json
{
  "label": "SBI RuPay debit",
  "environment": "live | test",
  "appId": "<decimal string, filled after registerApp>",
  "leaves": [
    { "network": "RUPAY", "networkId": 1, "prefixLength": 6, "prefix": "<digits>",
      "bank": "SBI", "type": "debit", "status": "tested | listed" }
  ],
  "rulesRoot": "0x…",
  "quotaPerDay": 20,
  "stampMonths": 3
}
```
- `networkId`: 1 = RuPay, 2 = Visa, 3 = Mastercard.
- Leaf = `Poseidon2(networkId, prefixLength, prefix)`. Tree depth is 12, and empty leaves are 0.
- The phone fetches `GET /policy/:appId`, recomputes the root and refuses locally before sending anything.
- `tested` means a real card passed. `listed` means the prefix comes from a list and is unproven.

---

## F9 · Frame transaction shape (alt mempool, EIP-8141)

Type `0x06`. EIP-8141 recognizes the validation prefix `[only_verify, pay]`, and `APPROVE_PAYMENT` reverts unless the
sender was approved first. So the transaction is:

| # | Mode | Target | Flags | Job |
|---|---|---|---|---|
| 0 | VERIFY (1) | `tx.sender` | `0x2` APPROVE_EXECUTION | the user's account approves the transaction |
| 1 | VERIFY (1) | WatermarkQuotaPaymaster | `0x1` APPROVE_PAYMENT | reads the registry (stamped? not expired? quota left?), checks that frames 2–3 match this shape, then `APPROVE(APPROVE_PAYMENT)` |
| 2 | SENDER (2) | user's target | `0x0` | the user's call |
| 3 | DEFAULT (0) | WatermarkQuotaPaymaster | `0x0` | `consume()` updates the counter (VERIFY is static, so it can't) |

- The paymaster's VERIFY frame reads registry storage, which the public mempool refuses. Staked entities are allowed
  under STORAGE-032.
- The staked verify budget is 1,000,000 gas (draft).
- Submit with `eth_sendFrameTransaction` on the sidecar. Track it with `skandha_frameTransactionStatus` and
  `eth_getFrameTransactionReceipt`.
- Confirm the shape, the method names and reverted-frame behaviour with the alt mempool team.

---

## F10 · Chains and constants

| | Whitechain Sepolia | Alt mempool devnet | Arkiv Rabdi (optional) |
|---|---|---|---|
| Chain ID | 1874 (`0x752`) | 1337 (`0x539`) | 7794095 |
| RPC | https://rpc.ankr.com/whitechain_testnet (backup https://rpc.testnet.whitechain.io) | exec https://altmempool.forshtat.com · gateway https://altmempoolgateway.forshtat.com/rpc (faucet) | https://rpc.rabdi.db-chain.testnet.arkiv.network (access key) |
| Explorer | https://explorer.testnet.whitechain.io (Blockscout) | https://explorer.altmempool.wtf | https://rabdi.explorer.arkiv.network |
| Gas token | WBT | ETH (devnet) | tGLM |
| Notes | define it with `viem` `defineChain`. **Never** use viem's `whitechainTestnet`, which is chain 2625 | staking registry `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f`, min stake > 0.01 ETH, delay 86400 | SDK `@arkiv-network/sdk` |

Whitechain contract verification:
```
forge verify-contract <addr> src/X.sol:X --rpc-url https://rpc.testnet.whitechain.io --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/
```

---

## F11 · Shared artifacts (committed, so nobody has to ask)

| Path | Producer | Consumers |
|---|---|---|
| `deployments/whitechain.json`, `deployments/devnet.json` | Samanway | everyone |
| `contracts/src/generated/Verifier.sol` | Prashant (`bb write_solidity_verifier`) | Samanway deploys it |
| `prover/keys/prover_pub.pem` (public half only) | Prashant | Tap app |
| `policies/test.json`, `policies/live.json` | Prashant | relayer, website, app |
| `sdk/src/types.ts`, `sdk/src/chains.ts` | both | all TypeScript packages |

Deployment file schema:
```json
{ "chainId": 1874, "registry": "0x…", "verifier": "0x…", "sponsor": "0x…", "paymaster": null,
  "usdt": "0x…", "deployedAt": "ISO-8601", "txHashes": { "registry": "0x…" } }
```

---

## Changelog
- **1.0 (2026-11-06):** first version, from build spec v3 section F. Changes from the spec:
  - Added F0 encoding rules and the F3 rejection codes.
  - F4 now defines the packing.
  - WatermarkSponsor is one per app.
  - The paymaster stakes itself.
  - F9 frame shape fixed to 4 frames.
  - F10: whitechainTestnet warning.
