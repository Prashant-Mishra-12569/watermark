// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {WatermarkGenesisPass} from "../../src/WatermarkGenesisPass.sol";

/// @notice Shared checks for the Genesis Pass tests: base64 decoders (test-only) and a tokenURI checker that decodes
/// the metadata, parses it as JSON and compares the embedded SVG with the generator's fixture.
abstract contract PassTestBase is Test {
    function _b64Value(bytes1 c) internal pure returns (uint256) {
        uint8 x = uint8(c);
        if (x >= 65 && x <= 90) return x - 65; // A-Z
        if (x >= 97 && x <= 122) return x - 71; // a-z
        if (x >= 48 && x <= 57) return x + 4; // 0-9
        if (x == 43) return 62; // +
        if (x == 47) return 63; // /
        revert("base64: bad character");
    }

    function _b64Decode(bytes memory s) internal pure returns (bytes memory out) {
        require(s.length % 4 == 0, "base64: length");
        if (s.length == 0) return "";
        uint256 pad = s[s.length - 1] == "=" ? (s[s.length - 2] == "=" ? 2 : 1) : 0;
        out = new bytes((s.length / 4) * 3 - pad);
        uint256 j;
        for (uint256 i; i < s.length; i += 4) {
            uint256 n = (_b64Value(s[i]) << 18) | (_b64Value(s[i + 1]) << 12);
            if (s[i + 2] != "=") n |= _b64Value(s[i + 2]) << 6;
            if (s[i + 3] != "=") n |= _b64Value(s[i + 3]);
            out[j++] = bytes1(uint8(n >> 16));
            if (j < out.length) out[j++] = bytes1(uint8(n >> 8));
            if (j < out.length) out[j++] = bytes1(uint8(n));
        }
    }

    function _startsWith(bytes memory s, bytes memory prefix) internal pure returns (bool) {
        if (s.length < prefix.length) return false;
        for (uint256 i; i < prefix.length; i++) {
            if (s[i] != prefix[i]) return false;
        }
        return true;
    }

    /// @dev Substring search through the cheatcode (the payloads are ASCII and up to ~17 KB).
    function _contains(bytes memory s, bytes memory needle) internal pure returns (bool) {
        return vm.contains(string(s), string(needle));
    }

    function _count(bytes memory s, bytes memory needle) internal pure returns (uint256) {
        return vm.split(string(s), string(needle)).length - 1;
    }

    /// @dev Decodes s[from:] a word at a time, for the large tokenURI payloads (_b64Decode above stays the plain
    /// oracle for the encoder's fuzz test). The result is re-encoded with vm.toBase64 and must give back the input, so
    /// a bad character or a non-canonical encoding fails here.
    function _b64DecodeFrom(bytes memory s, uint256 from) internal pure returns (bytes memory out) {
        uint256 n = s.length - from;
        require(n % 4 == 0 && n != 0, "base64: length");
        uint256 pad = s[s.length - 1] == "=" ? (s[s.length - 2] == "=" ? 2 : 1) : 0;
        bytes memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory lut = new bytes(256);
        for (uint256 i; i < 64; i++) {
            // forge-lint: disable-next-line(unsafe-typecast) i < 64
            lut[uint8(alphabet[i])] = bytes1(uint8(i));
        }
        out = new bytes((n / 4) * 3 + 32); // each step stores a whole word; the slack takes the last one
        assembly ("memory-safe") {
            let src := add(add(s, 32), from)
            let end := add(src, n)
            let dst := add(out, 32)
            let t := add(lut, 32)
            for {} lt(src, end) {
                src := add(src, 4)
                dst := add(dst, 3)
            } {
                let w := mload(src)
                let v := shl(18, byte(0, mload(add(t, byte(0, w)))))
                v := or(v, shl(12, byte(0, mload(add(t, byte(1, w))))))
                v := or(v, shl(6, byte(0, mload(add(t, byte(2, w))))))
                v := or(v, byte(0, mload(add(t, byte(3, w)))))
                mstore(dst, shl(232, v))
            }
            mstore(out, sub(mul(div(n, 4), 3), pad))
        }
        bytes32 inputHash;
        assembly ("memory-safe") {
            inputHash := keccak256(add(add(s, 32), from), n)
        }
        assertEq(keccak256(bytes(vm.toBase64(out))), inputHash, "base64 round trip");
    }

    /// @dev The number as the artwork prints it: three digits ("#007", "#042", "#100").
    function _edition(uint256 tokenId) internal pure returns (string memory) {
        string memory n = vm.toString(tokenId);
        if (tokenId < 10) return string.concat("00", n);
        if (tokenId < 100) return string.concat("0", n);
        return n;
    }

    /// @dev The generator's output for `tokenId`: test/fixtures/pass-svg/<id>.svg (script/pass-art/generator.mjs).
    function _fixture(uint256 tokenId) internal view returns (string memory) {
        return vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/pass-svg/", vm.toString(tokenId), ".svg"));
    }

    /// @dev The landmark trait: 20 passes per plate.
    function _landmark(uint256 tokenId) internal pure returns (string memory) {
        uint256 plate = (tokenId - 1) / 20;
        if (plate == 0) return "Gateway of India";
        if (plate == 1) return "Rajabai Clock Tower";
        if (plate == 2) return "Bandra-Worli Sea Link";
        if (plate == 3) return "Chhatrapati Shivaji Terminus";
        return "Marine Drive";
    }

    /// @dev The SVG loads nothing: the only URLs are the two XML namespace names, and every href and url() points at
    /// a fragment inside the document.
    function _assertSelfContained(bytes memory svg) internal pure {
        assertTrue(
            _startsWith(svg, '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"')
        );
        assertEq(_count(svg, "http"), 2, "only the namespace names");
        assertEq(_count(svg, 'href="'), _count(svg, 'href="#'), "hrefs are fragments");
        assertEq(_count(svg, "url("), _count(svg, "url(#"), "url() are fragments");
        assertFalse(_contains(svg, "<image"), "no images");
        assertFalse(_contains(svg, "@import"), "no imported styles");
    }

    /// @dev Decodes tokenURI(tokenId), checks that it is JSON with the expected fields, and returns the decoded SVG,
    /// which must be the generator's SVG for that token byte for byte.
    function _checkTokenURI(WatermarkGenesisPass pass, uint256 tokenId) internal view returns (bytes memory svg) {
        bytes memory uri = bytes(pass.tokenURI(tokenId));
        bytes memory jsonPrefix = "data:application/json;base64,";
        assertTrue(_startsWith(uri, jsonPrefix), "tokenURI prefix");
        string memory json = string(_b64DecodeFrom(uri, jsonPrefix.length));

        // vm.parseJson* revert on invalid JSON, so these calls also prove the metadata parses.
        assertEq(vm.parseJsonString(json, ".name"), string.concat("Watermark Genesis Pass #", _edition(tokenId)));
        bytes memory description = bytes(vm.parseJsonString(json, ".description"));
        assertTrue(_startsWith(description, "One of 100."), "one of 100");
        assertTrue(_contains(description, "claimed with one real bank card"), "claimed with one real bank card");
        assertTrue(_contains(description, "free to mint"), "free to mint");
        assertTrue(_contains(description, "Protected by Watermark"), "protected by Watermark");
        assertTrue(_contains(description, "Transferable: the limit applies to claiming, not to holding."), "transfer");

        assertEq(vm.parseJsonString(json, ".attributes[0].trait_type"), "Landmark");
        assertEq(vm.parseJsonString(json, ".attributes[0].value"), _landmark(tokenId));
        assertEq(vm.parseJsonString(json, ".attributes[1].trait_type"), "Edition");
        assertEq(vm.parseJsonString(json, ".attributes[1].display_type"), "number");
        assertEq(vm.parseJsonUint(json, ".attributes[1].value"), tokenId);
        assertEq(vm.parseJsonUint(json, ".attributes[1].max_value"), 100);
        assertEq(vm.parseJsonString(json, ".attributes[2].trait_type"), "Series");
        assertEq(vm.parseJsonString(json, ".attributes[2].value"), "Genesis");
        assertEq(vm.parseJsonString(json, ".attributes[3].trait_type"), "City");
        assertEq(vm.parseJsonString(json, ".attributes[3].value"), "Mumbai");
        assertFalse(vm.keyExistsJson(json, ".attributes[4]"), "four traits");
        assertFalse(_contains(bytes(json), "person"), "metadata: one card, not one person");

        bytes memory image = bytes(vm.parseJsonString(json, ".image"));
        bytes memory svgPrefix = "data:image/svg+xml;base64,";
        assertTrue(_startsWith(image, svgPrefix), "image prefix");
        string memory expected = _fixture(tokenId);
        assertEq(string(image), string.concat(string(svgPrefix), vm.toBase64(expected)), "image is the fixture");
        svg = _b64DecodeFrom(image, svgPrefix.length);
        assertEq(string(svg), expected, "image is the generator's SVG");
        assertEq(keccak256(svg), keccak256(bytes(pass.svg(tokenId))), "svg() matches the embedded image");
    }
}
