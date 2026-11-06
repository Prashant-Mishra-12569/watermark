// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {WatermarkGenesisPass} from "../src/WatermarkGenesisPass.sol";
import {WatermarkPassRenderer} from "../src/WatermarkPassRenderer.sol";
import {MockRegistry} from "./mocks/MockRegistry.sol";
import {PassTestBase} from "./utils/PassTestBase.sol";

/// @notice The on-chain artwork against the generator (script/pass-art/generator.mjs). test/fixtures/pass-svg/<id>.svg
/// is the generator's output; regenerate with `node script/pass-art/generator.mjs` (and `--sol` for the constants).
contract WatermarkPassRendererTest is PassTestBase {
    /// @dev EIP-170: the largest runtime code a contract may have.
    uint256 internal constant MAX_RUNTIME_SIZE = 24_576;

    WatermarkPassRenderer internal renderer;

    function setUp() public {
        renderer = new WatermarkPassRenderer();
    }

    function test_svg_everyTokenMatchesTheGenerator() public view {
        for (uint256 id = 1; id <= 100; id++) {
            assertEq(renderer.svg(id), _fixture(id), string.concat("svg(", vm.toString(id), ")"));
        }
    }

    /// @dev CI runs only forge for contracts. The generator writes its own SHA-256 next to the fixtures, so an edit to
    /// generator.mjs without `node script/pass-art/generator.mjs` fails here, and one without `--sol` fails above.
    function test_fixturesComeFromTheCurrentGenerator() public view {
        bytes memory generator = vm.readFileBinary(string.concat(vm.projectRoot(), "/script/pass-art/generator.mjs"));
        string memory recorded =
            vm.trim(vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/pass-svg/generator.sha256")));
        assertEq(
            vm.parseBytes32(recorded),
            sha256(generator),
            "generator.mjs changed: run node script/pass-art/generator.mjs, then --sol"
        );
    }

    function test_svg_outOfRangeReverts() public {
        uint256[4] memory bad = [uint256(0), 101, 1000, type(uint256).max];
        for (uint256 i; i < bad.length; i++) {
            vm.expectRevert(abi.encodeWithSelector(WatermarkPassRenderer.TokenOutOfRange.selector, bad[i]));
            renderer.svg(bad[i]);
            vm.expectRevert(abi.encodeWithSelector(WatermarkPassRenderer.TokenOutOfRange.selector, bad[i]));
            renderer.landmark(bad[i]);
        }
    }

    function testFuzz_svg_outOfRangeReverts(uint256 id) public {
        vm.assume(id == 0 || id > 100);
        vm.expectRevert(abi.encodeWithSelector(WatermarkPassRenderer.TokenOutOfRange.selector, id));
        renderer.svg(id);
    }

    function test_landmark_twentyPassesPerPlate() public view {
        for (uint256 id = 1; id <= 100; id++) {
            assertEq(renderer.landmark(id), _landmark(id));
        }
        assertEq(renderer.landmark(20), "Gateway of India");
        assertEq(renderer.landmark(21), "Rajabai Clock Tower");
        assertEq(renderer.landmark(41), "Bandra-Worli Sea Link");
        assertEq(renderer.landmark(61), "Chhatrapati Shivaji Terminus");
        assertEq(renderer.landmark(100), "Marine Drive");
    }

    /// @dev One token per plate (the plates are the only large part that differs) plus the last one.
    function test_svg_selfContained() public view {
        uint256[6] memory ids = [uint256(1), 21, 41, 61, 81, 100];
        for (uint256 i; i < ids.length; i++) {
            bytes memory svg = bytes(renderer.svg(ids[i]));
            _assertSelfContained(svg);
            assertTrue(_contains(svg, bytes(string.concat(">", _edition(ids[i]), "</text>"))), "edition number");
            assertTrue(_contains(svg, ">/ 100</text>"), "/ 100");
            assertTrue(_contains(svg, ">FEE PAID</text>"), "postmark");
            assertFalse(_contains(svg, "person"), "one card, not one person");
        }
    }

    /// @dev Both contracts deploy under EIP-170 (forge build --sizes reports the same numbers).
    function test_runtimeSizesUnderTheLimit() public {
        WatermarkGenesisPass pass =
            new WatermarkGenesisPass(address(new MockRegistry()), 1, makeAddr("minter"), address(renderer));
        emit log_named_uint("WatermarkPassRenderer runtime bytes", address(renderer).code.length);
        emit log_named_uint("WatermarkGenesisPass runtime bytes", address(pass).code.length);
        assertLe(address(renderer).code.length, MAX_RUNTIME_SIZE);
        assertLe(address(pass).code.length, MAX_RUNTIME_SIZE);
    }

    function test_gas_svg() public {
        uint256 maxGas;
        for (uint256 id = 1; id <= 100; id++) {
            uint256 g = gasleft();
            renderer.svg(id);
            uint256 used = g - gasleft();
            if (used > maxGas) maxGas = used;
        }
        emit log_named_uint("renderer.svg gas, max over 100 tokens", maxGas);
        assertLt(maxGas, 300_000);
    }
}
