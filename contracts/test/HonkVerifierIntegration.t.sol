// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {HonkVerifier, Errors} from "../src/generated/Verifier.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

/// @notice The registry wired to the real bb-generated HonkVerifier (libraries linked by forge). These tests pin the
/// verifier's shape (proof length, 6 public inputs) and show that garbage proofs are refused through stamp() as
/// InvalidProof(). The real-proof path is in RealProofStamp.t.sol.
contract HonkVerifierIntegrationTest is Test {
    HonkVerifier honk;
    WatermarkRegistry reg;
    uint256 signerPk = 0x5E55;
    uint256 appId;
    bytes32 constant CA_ROOT = 0x1a8637effab965c43a451a33a1df3e295b1839fc237c5de04f704e95ba0d8f10;
    bytes32 constant RULES_ROOT = 0x288520708dd4920995a6a73e6edc1c9a1726b62dfff2340c72873e2fb767fdab;
    uint256 expectedProofLen;

    function setUp() public {
        vm.warp(1_793_968_496); // 2026-11-06, month 322
        honk = new HonkVerifier();
        reg = new WatermarkRegistry(IVerifier(address(honk)));
        reg.setCaRoot(CA_ROOT);
        appId = reg.registerApp(bytes32(0), RULES_ROOT, vm.addr(signerPk));

        // Learn the expected proof length from the verifier's own error.
        try honk.verify(hex"00", new bytes32[](6)) returns (bool) {
            revert("verifier accepted a 1-byte proof");
        } catch (bytes memory err) {
            assertEq(bytes4(err), Errors.ProofLengthWrongWithLogN.selector);
            bytes memory args = new bytes(err.length - 4);
            for (uint256 i = 0; i < args.length; i++) {
                args[i] = err[i + 4];
            }
            (uint256 logN, uint256 actual, uint256 expected) = abi.decode(args, (uint256, uint256, uint256));
            assertEq(logN, 18);
            assertEq(actual, 1);
            expectedProofLen = expected;
        }
    }

    function _session() internal view returns (IWatermarkRegistry.Session memory s, bytes memory sig) {
        s = IWatermarkRegistry.Session({
            wallet: address(0x5A11E7),
            appId: appId,
            nonce: keccak256("n"),
            expiresAt: uint64(block.timestamp + 600),
            validUntilMonth: 325,
            chainId: block.chainid,
            registry: address(reg)
        });
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(signerPk, reg.hashSession(s));
        sig = abi.encodePacked(r, ss, v);
    }

    function _pi(IWatermarkRegistry.Session memory s) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](6);
        p[0] = CA_ROOT;
        p[1] = RULES_ROOT;
        p[2] = bytes32(s.appId);
        p[3] = bytes32(uint256(uint32(bytes4(sha256(abi.encodePacked(s.nonce))))));
        p[4] = bytes32(uint256(7));
        p[5] = bytes32(uint256(325));
    }

    /// @dev Arguments are evaluated before expectRevert, so helper calls (sha256 precompile, vm.sign) in them can't
    /// be mistaken for "the next call".
    function _stampReverts(
        WatermarkRegistry r,
        IWatermarkRegistry.Session memory s,
        bytes memory sig,
        bytes memory proof,
        bytes32[] memory pi,
        bytes memory err
    ) internal {
        vm.expectRevert(err);
        r.stamp(s, sig, proof, pi);
    }

    function test_verifierHasCodeAndLinkedLibraries() public view {
        assertGt(address(honk).code.length, 0);
        assertLe(address(honk).code.length, 24_576, "EIP-170");
        assertGt(expectedProofLen, 0);
        assertEq(expectedProofLen % 32, 0);
    }

    function test_verifierExpectsSixPublicInputs() public {
        bytes memory zeroProof = new bytes(expectedProofLen);
        vm.expectRevert(Errors.PublicInputsLengthWrong.selector);
        honk.verify(zeroProof, new bytes32[](5));
        vm.expectRevert(Errors.PublicInputsLengthWrong.selector);
        honk.verify(zeroProof, new bytes32[](7));
    }

    /// XL-4: the verifier's own ProofLengthWrongWithLogN is caught and reported as the registry's InvalidProof().
    function test_stamp_wrongLengthProofIsInvalidProof() public {
        (IWatermarkRegistry.Session memory s, bytes memory sig) = _session();
        bytes32[] memory pi = _pi(s); // built before expectRevert: its sha256 call must not be "the next call"
        // Control: the verifier itself reverts with its own error.
        vm.expectRevert(abi.encodeWithSelector(Errors.ProofLengthWrongWithLogN.selector, 18, 3, expectedProofLen));
        honk.verify(hex"010203", pi);
        _stampReverts(reg, s, sig, hex"010203", pi, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
    }

    function test_stamp_zeroProofOfRightLengthIsInvalidProof() public {
        (IWatermarkRegistry.Session memory s, bytes memory sig) = _session();
        bytes32[] memory pi = _pi(s);
        bytes memory proof = new bytes(expectedProofLen);
        _stampReverts(reg, s, sig, proof, pi, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        (bool ok,) = reg.isStamped(s.wallet, appId);
        assertFalse(ok);
        assertFalse(reg.sessionUsed(reg.hashSession(s)));
    }

    /// A non-canonical public input (nullifier + r) makes the verifier revert ValueGeFieldOrder; stamp() reports
    /// InvalidProof(), so the same proof can never be replayed under a second bytes32 nullifier key.
    function test_stamp_nullifierAboveFieldIsInvalidProof() public {
        (IWatermarkRegistry.Session memory s, bytes memory sig) = _session();
        bytes32[] memory pi = _pi(s);
        pi[4] = bytes32(uint256(7) + 21888242871839275222246405745257275088548364400416034343698204186575808495617);
        bytes memory proof = new bytes(expectedProofLen);
        vm.expectRevert(Errors.ValueGeFieldOrder.selector);
        honk.verify(proof, pi);
        _stampReverts(reg, s, sig, proof, pi, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
    }
}
