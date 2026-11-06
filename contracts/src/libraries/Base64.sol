// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Standard base64 (RFC 4648, with '=' padding). Encoder only, written for WatermarkGenesisPass.tokenURI, which
/// encodes a ~9 KB SVG and then the ~13 KB JSON around it, so the main loop works on three bytes at a time in assembly.
library Base64 {
    bytes internal constant TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    function encode(bytes memory data) internal pure returns (string memory result) {
        uint256 len = data.length;
        if (len == 0) return "";
        bytes memory table = TABLE;
        // forge-lint: disable-next-line(divide-before-multiply) intended: 4 output chars per started 3-byte group
        result = new string(4 * ((len + 2) / 3));
        assembly ("memory-safe") {
            // mload(add(tablePtr, i)) ends with table[i] in its lowest byte, which is the byte mstore8 writes.
            let tablePtr := add(table, 1)
            let out := add(result, 32)
            // Full 3-byte groups: mload(src) ends with the group's 3 bytes. Only bytes inside `data` are used.
            let tail := mod(len, 3)
            let src := data
            let fullEnd := add(data, sub(len, tail))
            for {} lt(src, fullEnd) {} {
                src := add(src, 3)
                let n := and(mload(src), 0xffffff)
                mstore8(out, mload(add(tablePtr, shr(18, n))))
                mstore8(add(out, 1), mload(add(tablePtr, and(shr(12, n), 63))))
                mstore8(add(out, 2), mload(add(tablePtr, and(shr(6, n), 63))))
                mstore8(add(out, 3), mload(add(tablePtr, and(n, 63))))
                out := add(out, 4)
            }
            // The last 1 or 2 bytes, read one at a time so bytes past the end never leak into the output.
            if tail {
                let w := mload(add(fullEnd, 32))
                let n := shl(16, byte(0, w))
                if eq(tail, 2) { n := or(n, shl(8, byte(1, w))) }
                mstore8(out, mload(add(tablePtr, shr(18, n))))
                mstore8(add(out, 1), mload(add(tablePtr, and(shr(12, n), 63))))
                mstore8(add(out, 2), 0x3d) // '='
                if eq(tail, 2) { mstore8(add(out, 2), mload(add(tablePtr, and(shr(6, n), 63)))) }
                mstore8(add(out, 3), 0x3d)
            }
        }
    }
}
