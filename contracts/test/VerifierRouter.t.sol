// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {VerifierRouter} from "../src/VerifierRouter.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {ExactMatchVerifier, ConstVerifier, RevertingVerifier} from "./mocks/MockVerifiers.sol";

/// @notice Unit tests with mock verifiers: routing, unknown/empty proofs, revert bubbling, add-only / disable / freeze rules,
/// events, the profile listing, two-step ownership and the gas the extra hop costs.
contract VerifierRouterTest is Test {
    VerifierRouter router;
    address owner = address(this);
    address stranger = makeAddr("stranger");
    address newOwner = makeAddr("new owner");

    bytes innerProof = hex"0000000000000000000000000000000000000000000000000000000000000001deadbeef";
    bytes32[] pis;

    function setUp() public {
        router = new VerifierRouter();
        pis = new bytes32[](6);
        for (uint256 i; i < 6; ++i) {
            pis[i] = bytes32(uint256(keccak256(abi.encode(i))) >> 8);
        }
    }

    function _p(uint8 id, bytes memory inner) internal pure returns (bytes memory) {
        return abi.encodePacked(id, inner);
    }

    // ------------------------------------------------------------------ routing

    function test_routesToProfile_andForwardsBytesUnchanged() public {
        ExactMatchVerifier v0 = new ExactMatchVerifier(innerProof, pis);
        router.setVerifier(0, v0);
        assertTrue(router.verify(_p(0, innerProof), pis));
    }

    function test_eachProfileHasItsOwnVerifier() public {
        bytes memory other = hex"cafe";
        router.setVerifier(0, new ExactMatchVerifier(innerProof, pis));
        router.setVerifier(17, new ExactMatchVerifier(other, pis));
        assertTrue(router.verify(_p(0, innerProof), pis));
        assertTrue(router.verify(_p(17, other), pis));
        // Crossed: right proof, wrong profile -> that verifier says no.
        assertFalse(router.verify(_p(17, innerProof), pis));
        assertFalse(router.verify(_p(0, other), pis));
    }

    function test_changedPublicInput_isForwarded_andRejectedByVerifier() public {
        router.setVerifier(0, new ExactMatchVerifier(innerProof, pis));
        bytes32[] memory bad = new bytes32[](6);
        for (uint256 i; i < 6; ++i) {
            bad[i] = pis[i];
        }
        bad[4] = bytes32(uint256(bad[4]) ^ 1);
        assertFalse(router.verify(_p(0, innerProof), bad));
    }

    function test_falseFromVerifier_isReturnedAsFalse() public {
        router.setVerifier(3, new ConstVerifier(false));
        assertFalse(router.verify(_p(3, innerProof), pis));
    }

    function test_unknownProfile_reverts() public {
        router.setVerifier(0, new ConstVerifier(true));
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.UnknownProfile.selector, uint8(1)));
        router.verify(_p(1, innerProof), pis);
    }

    function testFuzz_unsetProfile_alwaysReverts(uint8 id, bytes calldata inner) public {
        vm.assume(id != 0);
        router.setVerifier(0, new ConstVerifier(true));
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.UnknownProfile.selector, id));
        router.verify(abi.encodePacked(id, inner), pis);
    }

    function test_emptyProof_reverts() public {
        router.setVerifier(0, new ConstVerifier(true));
        vm.expectRevert(VerifierRouter.EmptyProof.selector);
        router.verify("", pis);
    }

    function test_profileByteOnly_forwardsEmptyProof() public {
        router.setVerifier(0, new ExactMatchVerifier("", pis));
        assertTrue(router.verify(hex"00", pis));
    }

    function test_verifierRevert_bubblesWithItsData() public {
        router.setVerifier(5, new RevertingVerifier());
        vm.expectRevert(abi.encodeWithSelector(RevertingVerifier.SumcheckFailedMock.selector, innerProof.length));
        router.verify(_p(5, innerProof), pis);
    }

    function test_noProfiles_everythingReverts() public {
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.UnknownProfile.selector, uint8(0)));
        router.verify(_p(0, innerProof), pis);
    }

    // ------------------------------------------------------------------ setVerifier (add only)

    function test_setVerifier_emits_andStores() public {
        ConstVerifier v = new ConstVerifier(true);
        vm.expectEmit(address(router));
        emit VerifierRouter.VerifierAdded(0, address(v));
        router.setVerifier(0, v);
        assertEq(address(router.verifiers(0)), address(v));
        assertEq(router.profileMask(), 1);
    }

    function test_setVerifier_cannotOverwrite() public {
        ConstVerifier a = new ConstVerifier(true);
        ConstVerifier b = new ConstVerifier(true);
        router.setVerifier(0, a);
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.ProfileAlreadySet.selector, uint8(0), address(a)));
        router.setVerifier(0, b);
        assertEq(address(router.verifiers(0)), address(a));
    }

    function test_setVerifier_rejectsZeroAndEoa() public {
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.NotAContract.selector, address(0)));
        router.setVerifier(0, IVerifier(address(0)));
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.NotAContract.selector, stranger));
        router.setVerifier(0, IVerifier(stranger));
    }

    function test_setVerifier_onlyOwner() public {
        ConstVerifier v = new ConstVerifier(true);
        vm.prank(stranger);
        vm.expectRevert(VerifierRouter.NotOwner.selector);
        router.setVerifier(0, v);
    }

    // ------------------------------------------------------------------ disableProfile (one-way kill switch)

    function test_disableProfile_removes_emits_andTombstones() public {
        ConstVerifier a = new ConstVerifier(true);
        router.setVerifier(2, a);
        vm.expectEmit(address(router));
        emit VerifierRouter.ProfileDisabled(2, address(a));
        router.disableProfile(2);
        assertEq(address(router.verifiers(2)), address(0));
        assertEq(router.profileMask(), 0);
        assertEq(router.disabledMask(), 1 << 2);
        // A disabled profile says so, distinct from a never-set one.
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.ProfileIsDisabled.selector, uint8(2)));
        router.verify(_p(2, innerProof), pis);
        // And it can never come back: disable + re-add would be a swap.
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.ProfileIsDisabled.selector, uint8(2)));
        router.setVerifier(2, a);
        ConstVerifier fresh = new ConstVerifier(true);
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.ProfileIsDisabled.selector, uint8(2)));
        router.setVerifier(2, fresh);
    }

    function test_disableProfile_rules() public {
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.ProfileNotSet.selector, uint8(9)));
        router.disableProfile(9);
        ConstVerifier a = new ConstVerifier(true);
        router.setVerifier(9, a);
        vm.prank(stranger);
        vm.expectRevert(VerifierRouter.NotOwner.selector);
        router.disableProfile(9);
        assertEq(address(router.verifiers(9)), address(a));
        router.disableProfile(9);
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.ProfileNotSet.selector, uint8(9)));
        router.disableProfile(9);
    }

    function test_disableProfile_leavesOtherProfilesLive() public {
        router.setVerifier(0, new ExactMatchVerifier(innerProof, pis));
        router.setVerifier(16, new ConstVerifier(true));
        router.disableProfile(16);
        assertTrue(router.verify(_p(0, innerProof), pis));
    }

    function test_noSwapFunctionExists() public {
        router.setVerifier(0, new ConstVerifier(false));
        (bool ok,) = address(router).call(abi.encodeWithSignature("replaceVerifier(uint8,address)", 0, address(1)));
        assertFalse(ok, "no swap path");
    }

    // ------------------------------------------------------------------ freeze

    function test_freeze_blocksAdd_isOneWay_andEmits() public {
        ConstVerifier a = new ConstVerifier(true);
        router.setVerifier(0, a);
        vm.expectEmit(address(router));
        emit VerifierRouter.Frozen();
        router.freeze();
        assertTrue(router.frozen());
        ConstVerifier b = new ConstVerifier(true);
        vm.expectRevert(VerifierRouter.RouterFrozen.selector);
        router.setVerifier(1, b);
        vm.expectRevert(VerifierRouter.RouterFrozen.selector);
        router.freeze();
        // Live profiles keep verifying after freeze.
        assertTrue(router.verify(_p(0, innerProof), pis));
    }

    function test_freeze_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(VerifierRouter.NotOwner.selector);
        router.freeze();
        assertFalse(router.frozen());
    }

    /// Kill switch still works after freeze (it can only remove acceptance).
    function test_disableProfile_allowedAfterFreeze() public {
        router.setVerifier(0, new ConstVerifier(true));
        router.freeze();
        router.disableProfile(0);
        vm.expectRevert(abi.encodeWithSelector(VerifierRouter.ProfileIsDisabled.selector, uint8(0)));
        router.verify(_p(0, innerProof), pis);
    }

    /// A new owner after freeze inherits only the disable power.
    function test_freeze_survivesOwnershipTransfer() public {
        router.freeze();
        router.transferOwnership(newOwner);
        vm.prank(newOwner);
        router.acceptOwnership();
        ConstVerifier v = new ConstVerifier(true);
        vm.prank(newOwner);
        vm.expectRevert(VerifierRouter.RouterFrozen.selector);
        router.setVerifier(0, v);
    }

    // ------------------------------------------------------------------ listing

    function test_profiles_listsLiveProfilesInIdOrder() public {
        (uint8[] memory ids, address[] memory addrs) = router.profiles();
        assertEq(ids.length, 0);
        assertEq(addrs.length, 0);

        ConstVerifier a = new ConstVerifier(true);
        ConstVerifier b = new ConstVerifier(true);
        ConstVerifier c = new ConstVerifier(true);
        router.setVerifier(255, c);
        router.setVerifier(0, a);
        router.setVerifier(32, b);
        (ids, addrs) = router.profiles();
        assertEq(ids.length, 3);
        assertEq(ids[0], 0);
        assertEq(ids[1], 32);
        assertEq(ids[2], 255);
        assertEq(addrs[0], address(a));
        assertEq(addrs[1], address(b));
        assertEq(addrs[2], address(c));

        router.disableProfile(32);
        (ids, addrs) = router.profiles();
        assertEq(ids.length, 2);
        assertEq(ids[1], 255);
        assertEq(addrs[1], address(c));
    }

    function test_profileZeroConstant() public view {
        assertEq(router.PROFILE_RUPAY_1984_1408_768_FDDA(), 0);
    }

    // ------------------------------------------------------------------ ownership

    function test_constructor_ownerIsDeployer_andEmits() public {
        vm.expectEmit();
        emit VerifierRouter.OwnershipTransferred(address(0), stranger);
        vm.prank(stranger);
        VerifierRouter r = new VerifierRouter();
        assertEq(r.owner(), stranger);
        assertEq(r.pendingOwner(), address(0));
    }

    function test_twoStepOwnership() public {
        vm.expectEmit(address(router));
        emit VerifierRouter.OwnershipTransferStarted(owner, newOwner);
        router.transferOwnership(newOwner);
        assertEq(router.owner(), owner, "nothing changes before accept");
        assertEq(router.pendingOwner(), newOwner);

        vm.prank(stranger);
        vm.expectRevert(VerifierRouter.NotPendingOwner.selector);
        router.acceptOwnership();

        vm.expectEmit(address(router));
        emit VerifierRouter.OwnershipTransferred(owner, newOwner);
        vm.prank(newOwner);
        router.acceptOwnership();
        assertEq(router.owner(), newOwner);
        assertEq(router.pendingOwner(), address(0));

        // The old owner lost every right.
        ConstVerifier v = new ConstVerifier(true);
        vm.expectRevert(VerifierRouter.NotOwner.selector);
        router.setVerifier(0, v);
        vm.expectRevert(VerifierRouter.NotOwner.selector);
        router.transferOwnership(owner);
        vm.prank(newOwner);
        router.setVerifier(0, v);
    }

    function test_transferOwnership_cancelWithZero_andOnlyOwner() public {
        router.transferOwnership(newOwner);
        router.transferOwnership(address(0));
        vm.prank(newOwner);
        vm.expectRevert(VerifierRouter.NotPendingOwner.selector);
        router.acceptOwnership();

        vm.prank(stranger);
        vm.expectRevert(VerifierRouter.NotOwner.selector);
        router.transferOwnership(stranger);
    }

    // ------------------------------------------------------------------ gas

    /// @dev Routing overhead with a 9,536-byte proof (the real UltraHonk size) and a trivial verifier, so the delta is
    /// the router's own cost: proof[0] read, one cold SLOAD, a cold CALL and re-encoding the 9.5 KB slice.
    function test_gas_routingOverhead_mock() public {
        bytes memory big = new bytes(9536);
        ConstVerifier direct = new ConstVerifier(true);
        ConstVerifier routed = new ConstVerifier(true);
        router.setVerifier(0, routed);
        bytes memory prefixed = _p(0, big);
        bytes32[] memory pi = pis;

        uint256 g0 = gasleft();
        direct.verify(big, pi);
        uint256 gDirect = g0 - gasleft();
        g0 = gasleft();
        router.verify(prefixed, pi);
        uint256 gRouted = g0 - gasleft();

        console2.log("mock verify direct    (gasleft delta)", gDirect);
        console2.log("mock verify via router(gasleft delta)", gRouted);
        console2.log("routing overhead                     ", gRouted - gDirect);
        assertLt(gRouted - gDirect, 15_000, "routing overhead should stay small");
    }
}
