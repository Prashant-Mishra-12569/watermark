// SHA-1 over a message whose length is known at compile time (FIPS 180-4).
// EMV ODA still uses SHA-1. Every hash in our chain has a fixed length for the RuPay size profile
// (227, 338 and 78 bytes), so padding is resolved at compile time and costs nothing.

use std::ops::WrappingAdd;

fn rotl(x: u32, n: u32) -> u32 {
    (x << n) | (x >> (32 - n))
}

fn add(a: u32, b: u32) -> u32 {
    a.wrapping_add(b)
}

// Byte `i` of the padded message: the data, then 0x80, zeros, and the 64-bit big-endian bit length.
fn padded_byte<let L: u32>(msg: [u8; L], i: u32) -> u8 {
    let total = ((L + 8) / 64 + 1) * 64;
    if i < L {
        msg[i]
    } else if i == L {
        0x80
    } else if i >= total - 8 {
        let bit_len: u64 = (L as u64) * 8;
        let shift: u64 = ((total - 1 - i) * 8) as u64;
        ((bit_len >> (shift as u64)) & 0xff) as u8
    } else {
        0
    }
}

pub fn sha1<let L: u32>(msg: [u8; L]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    let blocks = (L + 8) / 64 + 1;
    for b in 0..blocks {
        let mut w: [u32; 80] = [0; 80];
        for t in 0..16 {
            let base = b * 64 + t * 4;
            w[t] = ((padded_byte(msg, base) as u32) << 24)
                | ((padded_byte(msg, base + 1) as u32) << 16)
                | ((padded_byte(msg, base + 2) as u32) << 8)
                | (padded_byte(msg, base + 3) as u32);
        }
        for t in 16..80 {
            w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
        }

        let mut a = h[0];
        let mut bb = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        for t in 0..80 {
            let (f, k) = if t < 20 {
                ((bb & c) | (!bb & d), 0x5A827999)
            } else if t < 40 {
                (bb ^ c ^ d, 0x6ED9EBA1)
            } else if t < 60 {
                ((bb & c) | (bb & d) | (c & d), 0x8F1BBCDC)
            } else {
                (bb ^ c ^ d, 0xCA62C1D6)
            };
            let temp = add(add(add(add(rotl(a, 5), f), e), k), w[t]);
            e = d;
            d = c;
            c = rotl(bb, 30);
            bb = a;
            a = temp;
        }
        h[0] = add(h[0], a);
        h[1] = add(h[1], bb);
        h[2] = add(h[2], c);
        h[3] = add(h[3], d);
        h[4] = add(h[4], e);
    }

    let mut out: [u8; 20] = [0; 20];
    for i in 0..5 {
        out[i * 4] = (h[i] >> 24) as u8;
        out[i * 4 + 1] = (h[i] >> 16) as u8;
        out[i * 4 + 2] = (h[i] >> 8) as u8;
        out[i * 4 + 3] = h[i] as u8;
    }
    out
}

#[test]
fn test_sha1_abc() {
    // FIPS 180 example: SHA1("abc")
    let expected: [u8; 20] = [
        0xa9, 0x99, 0x3e, 0x36, 0x47, 0x06, 0x81, 0x6a, 0xba, 0x3e, 0x25, 0x71, 0x78, 0x50, 0xc2,
        0x6c, 0x9c, 0xd0, 0xd8, 0x9d,
    ];
    assert(sha1([0x61, 0x62, 0x63]) == expected);
}

#[test]
fn test_sha1_two_blocks() {
    // FIPS 180 example: "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq" (56 bytes, 2 blocks)
    let msg = "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq".as_bytes();
    let expected: [u8; 20] = [
        0x84, 0x98, 0x3e, 0x44, 0x1c, 0x3b, 0xd2, 0x6e, 0xba, 0xae, 0x4a, 0xa1, 0xf9, 0x51, 0x29,
        0xe5, 0xe5, 0x46, 0x70, 0xf1,
    ];
    assert(sha1(msg) == expected);
}

#[test]
fn test_sha1_empty() {
    let expected: [u8; 20] = [
        0xda, 0x39, 0xa3, 0xee, 0x5e, 0x6b, 0x4b, 0x0d, 0x32, 0x55, 0xbf, 0xef, 0x95, 0x60, 0x18,
        0x90, 0xaf, 0xd8, 0x07, 0x09,
    ];
    let empty: [u8; 0] = [];
    assert(sha1(empty) == expected);
}
