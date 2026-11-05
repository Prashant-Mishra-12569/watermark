// Watermark circuit (spec sections H, I, I2; interfaces F4).
//
// Public inputs, in this fixed order:
//   0 ca_root, 1 rules_root, 2 app_id, 3 un, 4 nullifier, 5 valid_until_month
//
// Constraints to implement, in order:
//   1. CA key: Poseidon2(network_id, hash(n_CA)) is a leaf under ca_root (depth 6)
//   2. EMV chain, spec H steps 1-4: three RSA e=3 recoveries, header/trailer bytes, SHA-1 checks
//   3. issuerId digits are a prefix of the PAN
//   4. freshness: termData[0..4] == un
//   5. filter: Poseidon2(network_id, prefix_length, prefix) is a leaf under rules_root (depth 12)
//   6. validity: card and bank certificate expiry months >= valid_until_month
//   7. nullifier == Poseidon2(pack(n_C) ++ app_id)
//   8. output nothing else: no PAN, BIN, expiry, network, certificates or keys
fn main(
    ca_root: pub Field,
    rules_root: pub Field,
    app_id: pub Field,
    un: pub Field,
    nullifier: pub Field,
    valid_until_month: pub Field,
) {
    // Placeholder so the skeleton compiles; replaced by the constraints above.
    let _ = (ca_root, rules_root, app_id, un, nullifier, valid_until_month);
}
