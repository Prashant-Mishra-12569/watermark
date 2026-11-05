# testcard

**Owner: Prashant.** Spec section S. It generates a **synthetic** EMV card, so no real card data ever enters the repo.

1. Generate RSA keys with exponent 3 at the real RuPay sizes: test CA 1984-bit, test bank 1408-bit, test card 768-bit.
2. Build the bank (`6A 02 … BC`) and card (`6A 04 … BC`) certificates in the exact formats from spec H, with SHA-1
   hashes, static data of one record + AIP (183 bytes), and a fake debit BIN.
3. Sign a format-05 SDAD over a given UN, with 25 bytes of dynamic data.
4. Output the F2 JSON plus the test CA modulus as committed fixtures.

These fixtures drive the circuit, prover and contract tests (replay, tamper, wrong exponent, PAN mismatch, expiry).
