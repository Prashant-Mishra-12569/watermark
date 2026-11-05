/** pack(), leaves, fixed-depth Merkle trees and the nullifier, matching circuits/src/zk.nr (interfaces F4, F8). */
import { fromBytes, poseidon2 } from "./hash.ts";

export const CA_TREE_DEPTH = 6;
export const RULES_TREE_DEPTH = 12;
export const NETWORK_ID = { RUPAY: 1, VISA: 2, MASTERCARD: 3 } as const;

/** pack(x) = [len(x), 31-byte big-endian chunks of x left-padded to a multiple of 31]. */
export function pack(x: Uint8Array): bigint[] {
  const chunks = Math.ceil(x.length / 31);
  const padded = new Uint8Array(chunks * 31);
  padded.set(x, padded.length - x.length);
  const out = [BigInt(x.length)];
  for (let k = 0; k < chunks; k++) out.push(fromBytes(padded.subarray(k * 31, k * 31 + 31)));
  return out;
}

export function caLeaf(networkId: number, caModulus: Uint8Array): bigint {
  return poseidon2([BigInt(networkId), poseidon2(pack(caModulus))]);
}

export function ruleLeaf(networkId: number, prefixLength: 6 | 8, prefix: string): bigint {
  if (!/^\d+$/.test(prefix) || prefix.length !== prefixLength) throw new Error("prefix must have prefixLength digits");
  return poseidon2([BigInt(networkId), BigInt(prefixLength), BigInt(prefix)]);
}

export function nullifier(iccModulus: Uint8Array, appId: bigint): bigint {
  return poseidon2([...pack(iccModulus), appId]);
}

export interface MerklePath {
  index: number;
  siblings: bigint[];
}

/** A fixed-depth tree whose unused leaves are 0. Node = Poseidon2(left, right). */
export class MerkleTree {
  readonly depth: number;
  readonly leaves: bigint[];
  readonly root: bigint;
  private readonly levels: bigint[][];
  private readonly zeros: bigint[];

  constructor(depth: number, leaves: bigint[]) {
    if (leaves.length > 2 ** depth) throw new Error("too many leaves");
    this.depth = depth;
    this.leaves = leaves.slice();
    const zeros = [0n];
    for (let i = 1; i <= depth; i++) zeros.push(poseidon2([zeros[i - 1]!, zeros[i - 1]!]));
    this.zeros = zeros;
    this.levels = [this.leaves];
    for (let lvl = 0; lvl < depth; lvl++) {
      const cur = this.levels[lvl]!;
      const next: bigint[] = [];
      for (let i = 0; i < Math.ceil(cur.length / 2); i++) {
        next.push(poseidon2([cur[2 * i] ?? zeros[lvl]!, cur[2 * i + 1] ?? zeros[lvl]!]));
      }
      this.levels.push(next);
    }
    this.root = this.levels[depth]?.[0] ?? zeros[depth]!;
  }

  path(index: number): MerklePath {
    if (index < 0 || index >= this.leaves.length) throw new Error("leaf index out of range");
    const siblings: bigint[] = [];
    let i = index;
    for (let lvl = 0; lvl < this.depth; lvl++) {
      siblings.push(this.levels[lvl]![i ^ 1] ?? this.zeros[lvl]!);
      i >>= 1;
    }
    return { index, siblings };
  }

  static verify(leaf: bigint, path: MerklePath, root: bigint): boolean {
    let node = leaf;
    let i = path.index;
    for (const sib of path.siblings) {
      node = i & 1 ? poseidon2([sib, node]) : poseidon2([node, sib]);
      i >>= 1;
    }
    return node === root;
  }
}
