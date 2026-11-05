// Hashing, packing and Merkle helpers (interfaces F4 and F8). Everything uses Poseidon2 from noir-lang/poseidon.
use poseidon::poseidon2::Poseidon2;

/// pack(x) = [len(x), chunk_0, ..., chunk_k]: x is left-padded to a multiple of 31 bytes and split into
/// big-endian 31-byte chunks, so each chunk is < 2^248 and fits the BN254 field (interfaces F4).
pub fn pack<let NB: u32, let M: u32>(x: [u8; NB]) -> [Field; M] {
    let chunks = M - 1;
    assert(chunks * 31 >= NB, "pack: too few chunks");
    assert(chunks * 31 - NB < 31, "pack: too many chunks");
    let pad = chunks * 31 - NB;
    let mut out: [Field; M] = [0; M];
    out[0] = NB as Field;
    for k in 0..chunks {
        let mut acc: Field = 0;
        for t in 0..31 {
            let j = k * 31 + t;
            let b: Field = if j < pad { 0 } else { x[j - pad] as Field };
            acc = acc * 256 + b;
        }
        out[k + 1] = acc;
    }
    out
}

pub fn hash<let N: u32>(inputs: [Field; N]) -> Field {
    Poseidon2::hash(inputs, N)
}

/// Root of a fixed-depth Merkle tree with Poseidon2(left, right) nodes. Bit i of `index` (LSB first)
/// says whether the node is the right child at level i. `index` is range-checked to D bits.
pub fn merkle_root<let D: u32>(leaf: Field, index: Field, siblings: [Field; D]) -> Field {
    let bits: [bool; D] = index.to_le_bits();
    let mut node = leaf;
    for i in 0..D {
        node = if bits[i] {
            hash([siblings[i], node])
        } else {
            hash([node, siblings[i]])
        };
    }
    node
}

/// CA key leaf: Poseidon2(networkId, hash(pack(n_CA))). The network comes from the key that signed the card.
pub fn ca_leaf<let NB: u32, let M: u32>(network_id: Field, n_ca: [u8; NB]) -> Field {
    hash([network_id, hash(pack::<NB, M>(n_ca))])
}

/// Filter leaf: Poseidon2(networkId, prefixLength, prefix) (spec I2, interfaces F8).
pub fn rule_leaf(network_id: Field, prefix_length: u32, prefix: Field) -> Field {
    hash([network_id, prefix_length as Field, prefix])
}

#[test]
fn test_pack_lengths() {
    let x: [u8; 96] = [0xAB; 96];
    let p: [Field; 5] = pack(x);
    assert(p[0] == 96);
    // 96 bytes = 28 bytes of padding + 3 bytes in the first chunk
    assert(p[1] == 0xABABAB);
    let y: [u8; 248] = [1; 248];
    let q: [Field; 9] = pack(y);
    assert(q[0] == 248);
}

#[test]
fn test_merkle_left_and_right() {
    let a = 11;
    let b = 22;
    let root = hash([a, b]);
    assert(merkle_root(a, 0, [b]) == root);
    assert(merkle_root(b, 1, [a]) == root);
}

#[test(should_fail)]
fn test_merkle_index_out_of_range() {
    let _ = merkle_root(1, 2, [3]);
}
