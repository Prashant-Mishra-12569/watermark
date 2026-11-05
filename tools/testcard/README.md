# testcard

**Owner: Prashant.** Spec section S. A **synthetic** EMV card, so no real card data ever enters the repo.
It also holds the reference verifier for spec section H. The circuit, the phone and the prover run the same checks.

## What it makes
- RSA keys with exponent 3 at the RuPay sizes from our real cards: CA 1984-bit → bank 1408-bit → card 768-bit.
- A bank certificate (tag 90, `6A 02 … BC`) and a card certificate (tag 9F46, `6A 04 … BC`), with SHA-1 hashes and
  no remainders.
- Static data: one ODA record + AIP, 183 bytes.
- On each `tap(un)`: a fresh format-05 signature (tag 9F4B) over the UN, with 25 bytes of dynamic data.
- A fake BIN (`990001`, which no network uses) and a Luhn-valid synthetic PAN built from parts.

## Use
```sh
pnpm --filter @watermark/testcard test       # 16 tests: real tap, replay, tamper, exponent, wrong CA, PAN mismatch, expiry
pnpm --filter @watermark/testcard generate   # rewrites fixtures/rupay-768.json
```
```ts
import { createTestCard, verifyOda } from "@watermark/testcard";
const card = createTestCard();
const tap = card.tap("1a2b3c4d");                      // F2 card data
verifyOda({ ...tap, caModulus: card.caModulus });     // throws OdaError(code) on any failure
```

## Fixture
`fixtures/rupay-768.json` holds one tap with the session nonce `0x11…11` (UN `02d449a3`), plus the test CA modulus and
the expected outputs. The circuit and prover tests use it. Regenerating it creates new keys, so commit the new file.
