// Watermark circuit (spec sections H, I, I2; interfaces F4).
//
// Public inputs, in this fixed order:
//   0 ca_root, 1 rules_root, 2 app_id, 3 un, 4 nullifier, 5 valid_until_month
//
// All 8 constraints of spec section I, for the RuPay size profile
// (CA 1984-bit -> bank 1408-bit -> card 768-bit, all e = 3, 183 bytes of static data).
// Nothing about the card (PAN, BIN, expiry, keys, certificates) is ever output.
mod sha1;
mod emv;
mod zk;

use emv::{bcd_month, check_issuer_prefix, pan_prefix, recover_e3, sub_bytes};
use sha1::sha1;

global CA_TREE_DEPTH: u32 = 6;
global RULES_TREE_DEPTH: u32 = 13;

// RuPay size profile (all three of our real cards).
global CA_BYTES: u32 = 248;
global ISSUER_BYTES: u32 = 176;
global ICC_BYTES: u32 = 96;
global STATIC_BYTES: u32 = 183;

fn main(
    ca_root: pub Field,
    rules_root: pub Field,
    app_id: pub Field,
    un: pub Field,
    nullifier: pub Field,
    valid_until_month: pub Field,
    // Private: the network CA key and the card's ODA objects (interfaces F2)
    n_ca: [u8; CA_BYTES],
    ca_redc: [u128; 17],
    issuer_cert: [u8; CA_BYTES],
    issuer_redc: [u128; 12],
    icc_cert: [u8; ISSUER_BYTES],
    static_data: [u8; STATIC_BYTES],
    icc_redc: [u128; 7],
    sdad: [u8; ICC_BYTES],
    // Private: which allowed CA key and which filter leaf this card uses
    network_id: Field,
    ca_index: Field,
    ca_siblings: [Field; CA_TREE_DEPTH],
    prefix_length: u32,
    rule_index: Field,
    rule_siblings: [Field; RULES_TREE_DEPTH],
) {
    // Constraint 1 · the network CA key is in the allowed set. Its leaf carries the network ID,
    // so the filter below is bound to the network that actually signed the card.
    let ca_leaf = zk::ca_leaf::<CA_BYTES, 9>(network_id, n_ca);
    assert(zk::merkle_root(ca_leaf, ca_index, ca_siblings) == ca_root, "CA key is not allowed");

    // Step 1 · bank certificate, opened with the network key
    let m: [u8; CA_BYTES] = recover_e3::<17, 1984>(n_ca, ca_redc, issuer_cert);
    assert(m[0] == 0x6A, "issuer: header");
    assert(m[1] == 0x02, "issuer: format");
    assert(m[CA_BYTES - 1] == 0xBC, "issuer: trailer");
    assert((m[11] == 0x01) & (m[12] == 0x01), "issuer: algorithms");
    assert(m[13] == ISSUER_BYTES as u8, "issuer: key length");
    assert(m[14] == 0x01, "issuer: exponent length");
    // Hash input: m[1..L-22] || remainder (none in this profile) || exponent 03
    let mut h1: [u8; CA_BYTES - 21] = [0; CA_BYTES - 21];
    for i in 0..CA_BYTES - 22 {
        h1[i] = m[i + 1];
    }
    h1[CA_BYTES - 22] = 0x03;
    assert(sha1(h1) == sub_bytes::<CA_BYTES, 20>(m, CA_BYTES - 21), "issuer: hash");
    let n_issuer: [u8; ISSUER_BYTES] = sub_bytes(m, 15);
    // The rest of the key field is padding (no remainder for these sizes)
    for i in 15 + ISSUER_BYTES..CA_BYTES - 21 {
        assert(m[i] == 0xBB, "issuer: padding");
    }
    let issuer_id: [u8; 4] = sub_bytes(m, 2);
    let issuer_exp_month = bcd_month(m[6], m[7]);

    // Step 2 · card certificate, opened with the bank key
    let c: [u8; ISSUER_BYTES] = recover_e3::<12, 1408>(n_issuer, issuer_redc, icc_cert);
    assert(c[0] == 0x6A, "icc: header");
    assert(c[1] == 0x04, "icc: format");
    assert(c[ISSUER_BYTES - 1] == 0xBC, "icc: trailer");
    assert((c[17] == 0x01) & (c[18] == 0x01), "icc: algorithms");
    assert(c[19] == ICC_BYTES as u8, "icc: key length");
    assert(c[20] == 0x01, "icc: exponent length");
    // Hash input: c[1..L-22] || remainder (none) || exponent 03 || static data
    let mut h2: [u8; ISSUER_BYTES - 21 + STATIC_BYTES] = [0; ISSUER_BYTES - 21 + STATIC_BYTES];
    for i in 0..ISSUER_BYTES - 22 {
        h2[i] = c[i + 1];
    }
    h2[ISSUER_BYTES - 22] = 0x03;
    for i in 0..STATIC_BYTES {
        h2[ISSUER_BYTES - 21 + i] = static_data[i];
    }
    assert(sha1(h2) == sub_bytes::<ISSUER_BYTES, 20>(c, ISSUER_BYTES - 21), "icc: hash");
    let pan: [u8; 10] = sub_bytes(c, 2);
    let icc_exp_month = bcd_month(c[12], c[13]);
    let n_icc: [u8; ICC_BYTES] = sub_bytes(c, 21);
    for i in 21 + ICC_BYTES..ISSUER_BYTES - 21 {
        assert(c[i] == 0xBB, "icc: padding");
    }

    // Constraint 3 · the bank certificate's issuer ID is a prefix of the PAN
    check_issuer_prefix(issuer_id, pan);

    // Step 3 · the card's signature, opened with the card key
    let s: [u8; ICC_BYTES] = recover_e3::<7, 768>(n_icc, icc_redc, sdad);
    assert(s[0] == 0x6A, "sdad: header");
    assert((s[1] == 0x05) | (s[1] == 0x95), "sdad: format");
    assert(s[ICC_BYTES - 1] == 0xBC, "sdad: trailer");

    // Step 4 / constraint 4 · freshness: the signature covers this session's UN (termData = UN for RuPay)
    let un_bytes: [u8; 4] = un.to_be_bytes();
    let mut h3: [u8; ICC_BYTES - 22 + 4] = [0; ICC_BYTES - 22 + 4];
    for i in 0..ICC_BYTES - 22 {
        h3[i] = s[i + 1];
    }
    for i in 0..4 {
        h3[ICC_BYTES - 22 + i] = un_bytes[i];
    }
    assert(sha1(h3) == sub_bytes::<ICC_BYTES, 20>(s, ICC_BYTES - 21), "sdad: hash (stale or replayed)");

    // Constraint 5 · the PAN prefix (from the signed card certificate, never an unsigned tag) passes the filter
    assert((prefix_length == 6) | (prefix_length == 8), "prefix length must be 6 or 8");
    let rule_leaf = zk::rule_leaf(network_id, prefix_length, pan_prefix(pan, prefix_length));
    assert(zk::merkle_root(rule_leaf, rule_index, rule_siblings) == rules_root, "card is not allowed by this app's filter");

    // Constraint 7 · nullifier = Poseidon2(pack(n_C) || appId): from the card KEY, never the card number
    let packed: [Field; 5] = zk::pack(n_icc);
    let mut nullifier_input: [Field; 6] = [0; 6];
    for i in 0..5 {
        nullifier_input[i] = packed[i];
    }
    nullifier_input[5] = app_id;
    assert(zk::hash(nullifier_input) == nullifier, "nullifier mismatch");

    // Constraint 6 · both certificates are valid through valid_until_month
    valid_until_month.assert_max_bit_size::<32>();
    let v = valid_until_month as u32;
    assert(issuer_exp_month >= v, "issuer certificate expires too soon");
    assert(icc_exp_month >= v, "card certificate expires too soon");
}
