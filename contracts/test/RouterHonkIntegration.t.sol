// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {HonkVerifier, Errors} from "../src/generated/Verifier.sol";
import {VerifierRouter} from "../src/VerifierRouter.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
// Read-only snapshot of the registry under finalization (.recovered/final/contracts/src), used to prove the
// registry needs no change: it is deployed with the router as its verifier.
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";
import {IVerifier as RegIVerifier} from "../src/interfaces/IVerifier.sol";

/// @notice The REAL bb-generated HonkVerifier (forge links ZKTranscriptLib) registered as profile 0, and the real
/// synthetic-card proof (test/fixtures/synthetic-stamp.json: made-up keys, safe to commit) sent through the router.
contract RouterHonkIntegrationTest is Test {
    string internal constant FIXTURE = "test/fixtures/synthetic-stamp.json";
    address constant APP_OWNER = address(0xA11CE);
    bytes32 constant NONCE = 0x1111111111111111111111111111111111111111111111111111111111111111;
    uint32 constant VALID_UNTIL = 325;
    uint256 constant NOW = 1_793_968_496; // 2026-11-06T12:34:56Z, month 322
    uint64 constant END_OF_FEB_2027 = 1_803_859_199;

    HonkVerifier honk;
    VerifierRouter router;
    bytes proof;
    bytes32[] pis;
    bool haveFixture;

    function setUp() public {
        vm.warp(NOW);
        honk = new HonkVerifier();
        router = new VerifierRouter();
        router.setVerifier(0, IVerifier(address(honk)));
        haveFixture = vm.exists(FIXTURE);
        if (haveFixture) {
            string memory json = vm.readFile(FIXTURE);
            proof = vm.parseJsonBytes(json, ".proof");
            pis = vm.parseJsonBytes32Array(json, ".publicInputs");
        }
    }

    function _copy(bytes32[] memory a) internal pure returns (bytes32[] memory b) {
        b = new bytes32[](a.length);
        for (uint256 i; i < a.length; ++i) {
            b[i] = a[i];
        }
    }

    function test_profile0_isTheRealHonkVerifier() public view {
        (uint8[] memory ids, address[] memory addrs) = router.profiles();
        assertEq(ids.length, 1);
        assertEq(ids[0], 0);
        assertEq(addrs[0], address(honk));
    }

    /// @dev Without the fixture, at least show the real verifier's own error comes back through the router.
    function test_garbageThroughRouter_bubblesHonkError() public {
        vm.expectRevert();
        router.verify(hex"0000", new bytes32[](6));
        try router.verify(hex"0000", new bytes32[](6)) returns (bool) {
            revert("accepted garbage");
        } catch (bytes memory err) {
            assertEq(bytes4(err), Errors.ProofLengthWrongWithLogN.selector, "honk's own error, unchanged");
        }
    }

    function test_realProof_viaRouter_true() public {
        vm.skip(!haveFixture);
        assertEq(proof.length, 9536);
        assertTrue(honk.verify(proof, pis), "direct");
        assertTrue(router.verify(abi.encodePacked(uint8(0), proof), pis), "via router, profile 0");
    }

    function test_realProof_wrongProfile_unknownProfile() public {
        vm.skip(!haveFixture);
        bytes memory p = abi.encodePacked(uint8(1), proof);
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.UnknownProfile.selector, uint8(1)));
        router.verify(p, pis);
    }

    function test_realProof_flippedByte_reverts() public {
        vm.skip(!haveFixture);
        bytes memory p = abi.encodePacked(uint8(0), proof);
        // A byte in the middle of the proof body (inside the sumcheck/opening data), not the profile byte.
        p[1 + 4000] = bytes1(uint8(p[1 + 4000]) ^ 0x01);
        vm.expectRevert();
        router.verify(p, pis);
    }

    function test_realProof_flippedPublicInput_reverts() public {
        vm.skip(!haveFixture);
        bytes memory p = abi.encodePacked(uint8(0), proof);
        bytes32[] memory pi = _copy(pis);
        pi[4] = bytes32(uint256(pi[4]) ^ 1); // nullifier
        vm.expectRevert();
        router.verify(p, pi);
    }

    /// @dev A prover that forgets the prefix: the bb proof starts with a zero byte (big-endian field element), so the
    /// router reads profile 0 and hands Honk a proof one byte short. It fails loudly, never silently passes.
    function test_realProof_withoutPrefix_failsLoudly() public {
        vm.skip(!haveFixture);
        assertEq(uint8(proof[0]), 0, "bb proofs start with a 0x00 byte");
        try router.verify(proof, pis) returns (bool) {
            revert("unprefixed proof accepted");
        } catch (bytes memory err) {
            assertEq(bytes4(err), Errors.ProofLengthWrongWithLogN.selector);
        }
    }

    function test_gas_routingOverhead_realProof() public {
        vm.skip(!haveFixture);
        bytes memory p = proof;
        bytes memory pp = abi.encodePacked(uint8(0), proof);
        bytes32[] memory pi = _copy(pis);
        // Fresh instances on both sides so cold/warm account access matches.
        HonkVerifier direct = new HonkVerifier();
        VerifierRouter r = new VerifierRouter();
        r.setVerifier(0, IVerifier(address(new HonkVerifier())));

        uint256 g0 = gasleft();
        assertTrue(direct.verify(p, pi));
        uint256 gDirect = g0 - gasleft();
        g0 = gasleft();
        assertTrue(r.verify(pp, pi));
        uint256 gRouted = g0 - gasleft();
        console2.log("honk.verify direct      (gasleft delta)", gDirect);
        console2.log("router.verify -> honk   (gasleft delta)", gRouted);
        console2.log("routing overhead                       ", gRouted - gDirect);
        assertLt(gRouted - gDirect, 20_000);
    }

    // ------------------------------------------------------------------ the unchanged registry, with the router

    WatermarkRegistry reg;
    uint256 appId;
    uint256 constant SIGNER_PK = 0x5E55105; // test key only

    function _deployRegistry() internal {
        string memory json = vm.readFile(FIXTURE);
        reg = new WatermarkRegistry(RegIVerifier(address(router)));
        reg.setCaRoot(vm.parseJsonBytes32(json, ".caRoot"));
        vm.prank(APP_OWNER);
        appId = reg.registerApp(bytes32(0), vm.parseJsonBytes32(json, ".rulesRoot"), vm.addr(SIGNER_PK));
    }

    function _session(address wallet) internal view returns (IWatermarkRegistry.Session memory s, bytes memory sig) {
        s = IWatermarkRegistry.Session({
            wallet: wallet,
            appId: appId,
            nonce: NONCE,
            expiresAt: uint64(block.timestamp + 600),
            validUntilMonth: VALID_UNTIL,
            chainId: block.chainid,
            registry: address(reg)
        });
        (uint8 v, bytes32 r_, bytes32 ss) = vm.sign(SIGNER_PK, reg.hashSession(s));
        sig = abi.encodePacked(r_, ss, v);
    }

    function test_registryWithRouter_mapsRouterErrorsToInvalidProof() public {
        vm.skip(!haveFixture);
        _deployRegistry();
        (IWatermarkRegistry.Session memory s, bytes memory sig) = _session(makeAddr("user wallet"));
        bytes32[] memory pi = _copy(pis);
        // Unknown profile and an unprefixed proof: the registry's try/catch turns both into InvalidProof().
        bytes memory wrong = abi.encodePacked(uint8(1), proof);
        vm.expectRevert(WatermarkRegistry.InvalidProof.selector);
        reg.stamp(s, sig, wrong, pi);
        bytes memory unprefixed = proof;
        vm.expectRevert(WatermarkRegistry.InvalidProof.selector);
        reg.stamp(s, sig, unprefixed, pi);
        bytes memory empty = "";
        vm.expectRevert(WatermarkRegistry.InvalidProof.selector);
        reg.stamp(s, sig, empty, pi);
    }

    /// @dev Same stamp, registry wired straight to HonkVerifier (today's deploy), for an apples-to-apples delta.
    function test_gas_stamp_directVsRouter() public {
        vm.skip(!haveFixture);
        bytes32[] memory pi = _copy(pis);

        // Direct: registry(honk), raw proof.
        router = VerifierRouter(address(0));
        string memory json = vm.readFile(FIXTURE);
        reg = new WatermarkRegistry(RegIVerifier(address(new HonkVerifier())));
        reg.setCaRoot(vm.parseJsonBytes32(json, ".caRoot"));
        vm.prank(APP_OWNER);
        appId = reg.registerApp(bytes32(0), vm.parseJsonBytes32(json, ".rulesRoot"), vm.addr(SIGNER_PK));
        (IWatermarkRegistry.Session memory s, bytes memory sig) = _session(makeAddr("w1"));
        bytes memory p = proof;
        uint256 g0 = gasleft();
        reg.stamp(s, sig, p, pi);
        uint256 gDirect = g0 - gasleft();

        // Routed: registry(router -> fresh honk), prefixed proof.
        router = new VerifierRouter();
        router.setVerifier(0, IVerifier(address(new HonkVerifier())));
        _deployRegistry();
        (s, sig) = _session(makeAddr("w2"));
        bytes memory pp = abi.encodePacked(uint8(0), proof);
        g0 = gasleft();
        reg.stamp(s, sig, pp, pi);
        uint256 gRouted = g0 - gasleft();

        console2.log("stamp, registry(honk)          ", gDirect);
        console2.log("stamp, registry(router->honk)  ", gRouted);
        console2.log("stamp overhead of the router   ", gRouted - gDirect);
        assertLt(gRouted - gDirect, 20_000);
    }

    function test_registryWithRouter_stampsRealProof() public {
        vm.skip(!haveFixture);
        _deployRegistry();
        address wallet = makeAddr("user wallet");
        (IWatermarkRegistry.Session memory s, bytes memory sig) = _session(wallet);
        bytes32[] memory pi = _copy(pis);
        bytes memory pp = abi.encodePacked(uint8(0), proof);
        uint256 g0 = gasleft();
        reg.stamp(s, sig, pp, pi);
        uint256 stampGas = g0 - gasleft();
        (bool ok, uint64 exp) = reg.isStamped(wallet, appId);
        assertTrue(ok);
        assertEq(exp, END_OF_FEB_2027);
        console2.log("registry.stamp via router (gasleft delta, upper bound)", stampGas);
        assertLt(stampGas, 3_000_000, "inside the relayer's 3.5M cap");
    }
}
