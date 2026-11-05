// EMV helpers: RSA with exponent 3, byte slicing, BCD dates and the issuer prefix check.
use bignum::internal::from_be_bytes_unsafe;
use bignum::params::BigNumParams;
use bignum::RuntimeBigNum;

/// Opens an EMV RSA block with public exponent 3: returns sig^3 mod n as big-endian bytes.
/// `n` is range-checked and must have its top bit set (BigNumParams::new). `redc` only speeds up
/// witness generation: a wrong value can make proving fail, never make a false statement pass.
/// `to_be_bytes` enforces a canonical result (< n), so the recovered block is unique.
pub fn recover_e3<let N: u32, let MOD_BITS: u32>(
    n: [u8; (MOD_BITS + 7) / 8],
    redc: [u128; N],
    sig: [u8; (MOD_BITS + 7) / 8],
) -> [u8; (MOD_BITS + 7) / 8] {
    let modulus: [u128; N] = from_be_bytes_unsafe::<N, MOD_BITS>(&n);
    let params: BigNumParams<N, MOD_BITS> = BigNumParams::new(false, modulus, redc);
    let s: RuntimeBigNum<N, MOD_BITS> = RuntimeBigNum::from_be_bytes(params, sig);
    let m = (s * s) * s;
    m.to_be_bytes()
}

/// M bytes of `a` starting at a compile-time offset.
pub fn sub_bytes<let N: u32, let M: u32>(a: [u8; N], start: u32) -> [u8; M] {
    let mut out: [u8; M] = [0; M];
    for i in 0..M {
        out[i] = a[start + i];
    }
    out
}

fn bcd(b: u8) -> u32 {
    let hi = b >> 4;
    let lo = b & 0x0F;
    assert((hi < 10) & (lo < 10), "bad BCD digit");
    (hi as u32) * 10 + (lo as u32)
}

/// EMV MMYY expiry (BCD) -> month index (YY * 12 + MM - 1, years 20YY), the same scale as F1.
pub fn bcd_month(mm: u8, yy: u8) -> u32 {
    let month = bcd(mm);
    assert((month >= 1) & (month <= 12), "bad month");
    bcd(yy) * 12 + month - 1
}

fn nibble<let N: u32>(a: [u8; N], i: u32) -> u8 {
    let b = a[i / 2];
    if i % 2 == 0 {
        b >> 4
    } else {
        b & 0x0F
    }
}

/// The first 6 or 8 PAN digits as a decimal number (the BIN / IIN used by the filter).
pub fn pan_prefix(pan: [u8; 10], prefix_length: u32) -> Field {
    let mut p6: Field = 0;
    let mut p8: Field = 0;
    for i in 0..8 {
        let d = nibble(pan, i);
        assert(d < 10, "PAN digit");
        if i < 6 {
            p6 = p6 * 10 + d as Field;
        }
        p8 = p8 * 10 + d as Field;
    }
    if prefix_length == 6 { p6 } else { p8 }
}

/// The issuer ID (3 to 8 digits, padded with F) must be a prefix of the PAN.
pub fn check_issuer_prefix(issuer_id: [u8; 4], pan: [u8; 10]) {
    let mut ended = false;
    for i in 0..8 {
        let d = nibble(issuer_id, i);
        if d == 0x0F {
            assert(i >= 3, "issuer ID shorter than 3 digits");
            ended = true;
        } else {
            assert(!ended, "issuer ID padding");
            assert(d < 10, "issuer ID digit");
            assert(d == nibble(pan, i), "issuer ID is not a prefix of the PAN");
        }
    }
}

#[test]
fn test_bcd_month() {
    assert(bcd_month(0x11, 0x26) == 322); // Nov 2026
    assert(bcd_month(0x01, 0x27) == 324); // Jan 2027
}

#[test]
fn test_pan_prefix() {
    let pan = [0x99, 0x00, 0x01, 0x00, 0x00, 0x12, 0x34, 0x55, 0xFF, 0xFF];
    assert(pan_prefix(pan, 6) == 990001);
    assert(pan_prefix(pan, 8) == 99000100);
}

#[test]
fn test_issuer_prefix() {
    check_issuer_prefix([0x99, 0x00, 0x01, 0xFF], [0x99, 0x00, 0x01, 0x00, 0x00, 0x12, 0x34, 0x55, 0xFF, 0xFF]);
}

#[test(should_fail_with = "issuer ID is not a prefix of the PAN")]
fn test_issuer_prefix_mismatch() {
    check_issuer_prefix([0x99, 0x00, 0x02, 0xFF], [0x99, 0x00, 0x01, 0x00, 0x00, 0x12, 0x34, 0x55, 0xFF, 0xFF]);
}
