// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {MonthMath} from "../src/libraries/MonthMath.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";

contract WatermarkRegistryTest is Test {
    // Values from policies/ca-keys.json and policies/test.json on main.
    bytes32 constant CA_ROOT = 0x1a8637effab965c43a451a33a1df3e295b1839fc237c5de04f704e95ba0d8f10;
    bytes32 constant RULES_ROOT = 0x288520708dd4920995a6a73e6edc1c9a1726b62dfff2340c72873e2fb767fdab;
    uint256 constant SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;

    // 2026-11-06T12:34:56Z, month index 322 (Nov 2026).
    uint256 constant NOW = 1_793_968_496;
    uint256 constant M = 322;
    uint64 constant END_OF_325 = 1_803_859_199; // 2027-02-28T23:59:59Z

    event AppRegistered(uint256 indexed appId, address indexed owner, bytes32 rulesRoot, address sessionSigner);
    event Stamped(address indexed wallet, uint256 indexed appId, bytes32 nullifier, uint64 expiresAt);
    event CaRootUpdated(bytes32 root);

    WatermarkRegistry reg;
    MockVerifier verifier;

    uint256 signerPk = 0xA11CE;
    address signer;
    address appOwner = makeAddr("appOwner");
    address relayer = makeAddr("relayer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    bytes32 constant SALT = bytes32(uint256(42));
    bytes32 constant NULLIFIER = keccak256("card key A");
    uint256 appId;
    uint256 nonceCounter;

    bytes constant PROOF = hex"c0ffee";

    function setUp() public {
        vm.warp(NOW);
        signer = vm.addr(signerPk);
        verifier = new MockVerifier();
        reg = new WatermarkRegistry(IVerifier(address(verifier)));
        reg.setCaRoot(CA_ROOT);
        vm.prank(appOwner);
        appId = reg.registerApp(SALT, RULES_ROOT, signer);
    }

    // ------------------------------------------------------------------ helpers

    function _session(address wallet, uint32 v) internal returns (IWatermarkRegistry.Session memory s) {
        s = IWatermarkRegistry.Session({
            wallet: wallet,
            appId: appId,
            nonce: keccak256(abi.encode("nonce", ++nonceCounter)),
            expiresAt: uint64(block.timestamp + 600),
            validUntilMonth: v,
            chainId: block.chainid,
            registry: address(reg)
        });
    }

    function _session(address wallet) internal returns (IWatermarkRegistry.Session memory) {
        return _session(wallet, uint32(M + 3));
    }

    function _un(bytes32 nonce) internal pure returns (uint256) {
        return uint256(uint32(bytes4(sha256(abi.encodePacked(nonce)))));
    }

    function _pi(IWatermarkRegistry.Session memory s, bytes32 nullifier) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](6);
        p[0] = CA_ROOT;
        p[1] = RULES_ROOT;
        p[2] = bytes32(s.appId);
        p[3] = bytes32(_un(s.nonce));
        p[4] = nullifier;
        p[5] = bytes32(uint256(s.validUntilMonth));
    }

    /// @dev Independent EIP-712 digest (no call into the registry, so it is safe between expectRevert and stamp).
    function _digest(IWatermarkRegistry.Session memory s) internal view returns (bytes32) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Watermark"),
                keccak256("1"),
                block.chainid,
                s.registry
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "Session(address wallet,uint256 appId,bytes32 nonce,uint64 expiresAt,uint32 validUntilMonth,uint256 chainId,address registry)"
                ),
                s.wallet,
                s.appId,
                s.nonce,
                s.expiresAt,
                s.validUntilMonth,
                s.chainId,
                s.registry
            )
        );
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }

    function _signWith(uint256 pk, IWatermarkRegistry.Session memory s) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(pk, _digest(s));
        return abi.encodePacked(r, ss, v);
    }

    function _sign(IWatermarkRegistry.Session memory s) internal view returns (bytes memory) {
        return _signWith(signerPk, s);
    }

    function _stamp(IWatermarkRegistry.Session memory s, bytes32 nullifier) internal {
        vm.prank(relayer);
        reg.stamp(s, _sign(s), PROOF, _pi(s, nullifier));
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

    function _stampRevertsPartial(
        WatermarkRegistry r,
        IWatermarkRegistry.Session memory s,
        bytes memory sig,
        bytes memory proof,
        bytes32[] memory pi,
        bytes4 selector
    ) internal {
        vm.expectPartialRevert(selector);
        r.stamp(s, sig, proof, pi);
    }

    function _expectNoVerify() internal {
        vm.expectCall(address(verifier), abi.encodeWithSelector(IVerifier.verify.selector), 0);
    }

    // ------------------------------------------------------------------ constructor / admin

    function test_constructor() public view {
        assertEq(reg.owner(), address(this));
        assertEq(address(reg.verifier()), address(verifier));
        assertEq(reg.caRoot(), CA_ROOT);
    }

    function test_setCaRoot_ownerOnly() public {
        vm.prank(alice);
        vm.expectRevert(WatermarkRegistry.NotOwner.selector);
        reg.setCaRoot(bytes32(uint256(1)));
        assertEq(reg.caRoot(), CA_ROOT);
    }

    // ------------------------------------------------------------------ two-step ownership

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    function test_ownership_constructorEmitsAndNoPending() public {
        vm.expectEmit();
        emit OwnershipTransferred(address(0), alice);
        vm.prank(alice);
        WatermarkRegistry r = new WatermarkRegistry(IVerifier(address(verifier)));
        assertEq(r.owner(), alice);
        assertEq(r.pendingOwner(), address(0));
    }

    function test_ownership_twoStepTransfer() public {
        address newOwner = makeAddr("newOwner");
        vm.expectEmit(address(reg));
        emit OwnershipTransferStarted(address(this), newOwner);
        reg.transferOwnership(newOwner);
        // Nothing moves until the new owner accepts.
        assertEq(reg.owner(), address(this));
        assertEq(reg.pendingOwner(), newOwner);
        reg.setCaRoot(keccak256("still the old owner"));

        vm.expectEmit(address(reg));
        emit OwnershipTransferred(address(this), newOwner);
        vm.prank(newOwner);
        reg.acceptOwnership();
        assertEq(reg.owner(), newOwner);
        assertEq(reg.pendingOwner(), address(0));

        // The old owner lost setCaRoot and transferOwnership; the new owner has them.
        vm.expectRevert(WatermarkRegistry.NotOwner.selector);
        reg.setCaRoot(bytes32(uint256(1)));
        vm.expectRevert(WatermarkRegistry.NotOwner.selector);
        reg.transferOwnership(address(this));
        vm.prank(newOwner);
        reg.setCaRoot(CA_ROOT);
        assertEq(reg.caRoot(), CA_ROOT);
    }

    function test_ownership_onlyOwnerCanPropose() public {
        vm.prank(alice);
        vm.expectRevert(WatermarkRegistry.NotOwner.selector);
        reg.transferOwnership(alice);
        assertEq(reg.pendingOwner(), address(0));
    }

    function test_ownership_onlyPendingCanAccept() public {
        reg.transferOwnership(alice);
        vm.prank(bob);
        vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
        // The current owner cannot "accept" on the new owner's behalf either.
        vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
        assertEq(reg.owner(), address(this));
    }

    function test_ownership_acceptWithNothingPendingReverts() public {
        // pendingOwner is address(0), which no transaction can be sent from.
        vm.prank(alice);
        vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
    }

    function test_ownership_reproposeReplacesAndZeroCancels() public {
        reg.transferOwnership(alice);
        reg.transferOwnership(bob);
        vm.prank(alice);
        vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
        reg.transferOwnership(address(0));
        vm.prank(bob);
        vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
        assertEq(reg.owner(), address(this));
        assertEq(reg.pendingOwner(), address(0));
    }

    function test_ownership_transferKeepsStampsAndApps() public {
        _stamp(_session(alice), NULLIFIER);
        reg.transferOwnership(bob);
        vm.prank(bob);
        reg.acceptOwnership();
        (bool ok, uint64 e) = reg.isStamped(alice, appId);
        assertTrue(ok);
        assertEq(e, END_OF_325);
        (address o,,) = reg.apps(appId);
        assertEq(o, appOwner, "app ownership is separate from registry ownership");
    }

    function testFuzz_ownership_strangersCannotTakeOver(address caller, address target) public {
        // address(0) is excluded: no transaction can come from it, and it equals the empty pendingOwner.
        vm.assume(caller != address(this) && caller != address(0));
        vm.prank(caller);
        vm.expectRevert(WatermarkRegistry.NotOwner.selector);
        reg.transferOwnership(target);
        vm.prank(caller);
        vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();
        assertEq(reg.owner(), address(this));
    }

    function test_setCaRoot_emits() public {
        bytes32 newRoot = keccak256("new root");
        vm.expectEmit(address(reg));
        emit CaRootUpdated(newRoot);
        reg.setCaRoot(newRoot);
        assertEq(reg.caRoot(), newRoot);
    }

    // ------------------------------------------------------------------ registerApp

    function test_registerApp_storesAndFormula() public view {
        (address o, bytes32 r, address ss) = reg.apps(appId);
        assertEq(o, appOwner);
        assertEq(r, RULES_ROOT);
        assertEq(ss, signer);
        assertEq(appId, uint256(keccak256(abi.encode(appOwner, SALT))) >> 8);
        assertEq(appId, reg.computeAppId(appOwner, SALT));
        assertLt(appId, 1 << 248);
    }

    function test_registerApp_emits() public {
        bytes32 salt = keccak256("other");
        uint256 expected = uint256(keccak256(abi.encode(alice, salt))) >> 8;
        vm.expectEmit(address(reg));
        emit AppRegistered(expected, alice, RULES_ROOT, signer);
        vm.prank(alice);
        assertEq(reg.registerApp(salt, RULES_ROOT, signer), expected);
    }

    function test_registerApp_duplicateReverts() public {
        vm.prank(appOwner);
        vm.expectRevert(abi.encodeWithSelector(WatermarkRegistry.AppAlreadyExists.selector, appId));
        reg.registerApp(SALT, keccak256("different rules"), alice);
        (, bytes32 r,) = reg.apps(appId);
        assertEq(r, RULES_ROOT, "rules are immutable");
    }

    function test_registerApp_sameSaltOtherSenderIsDifferentApp() public {
        vm.prank(alice);
        uint256 id = reg.registerApp(SALT, RULES_ROOT, signer);
        assertTrue(id != appId);
    }

    function test_registerApp_zeroSignerReverts() public {
        vm.expectRevert(WatermarkRegistry.ZeroSessionSigner.selector);
        reg.registerApp(bytes32(0), RULES_ROOT, address(0));
    }

    function test_registerApp_zeroRulesRootReverts() public {
        vm.expectRevert(WatermarkRegistry.ZeroRulesRoot.selector);
        reg.registerApp(bytes32(0), bytes32(0), signer);
    }

    // ------------------------------------------------------------------ happy path

    function test_stamp_happyPath() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        bytes memory sig = _sign(s);

        vm.expectCall(address(verifier), abi.encodeCall(IVerifier.verify, (PROOF, pi)), 1);
        vm.expectEmit(address(reg));
        emit Stamped(alice, appId, NULLIFIER, END_OF_325);
        vm.prank(relayer); // anyone may submit
        reg.stamp(s, sig, PROOF, pi);

        (bool ok, uint64 exp) = reg.isStamped(alice, appId);
        assertTrue(ok);
        assertEq(exp, END_OF_325);
        assertEq(reg.stampExpiry(alice, appId), END_OF_325);
        assertTrue(reg.sessionUsed(reg.hashSession(s)));
        assertEq(reg.nullifierWallet(appId, NULLIFIER), alice);

        // The stamp goes to s.wallet, never msg.sender.
        (bool relayerOk, uint64 relayerExp) = reg.isStamped(relayer, appId);
        assertFalse(relayerOk);
        assertEq(relayerExp, 0);
    }

    function test_isStamped_beforeAndAfterExpiry() public {
        (bool ok0, uint64 e0) = reg.isStamped(alice, appId);
        assertFalse(ok0);
        assertEq(e0, 0);

        _stamp(_session(alice), NULLIFIER);
        vm.warp(END_OF_325);
        (bool ok1,) = reg.isStamped(alice, appId);
        assertTrue(ok1, "valid through the last second of the month");
        vm.warp(uint256(END_OF_325) + 1);
        (bool ok2, uint64 e2) = reg.isStamped(alice, appId);
        assertFalse(ok2, "expired from the first second of the next month");
        assertEq(e2, END_OF_325);
        (bool okOtherApp,) = reg.isStamped(alice, appId + 1);
        assertFalse(okOtherApp);
    }

    // ------------------------------------------------------------------ check 1: app exists

    function test_check1_appNotFound() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        s.appId = appId + 1;
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.AppNotFound.selector, appId + 1)
        );
    }

    function test_order_check1_before_check2() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        s.appId = 777;
        s.expiresAt = uint64(block.timestamp - 1);
        _stampReverts(
            reg, s, hex"", PROOF, new bytes32[](0), abi.encodeWithSelector(WatermarkRegistry.AppNotFound.selector, 777)
        );
    }

    // ------------------------------------------------------------------ check 2: expiry, chain, registry

    function test_check2_expiresAtEqualsNowIsOk() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        s.expiresAt = uint64(block.timestamp);
        _stamp(s, NULLIFIER);
        (bool ok,) = reg.isStamped(alice, appId);
        assertTrue(ok);
    }

    function test_check2_expiredByOneSecond() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        s.expiresAt = uint64(block.timestamp);
        bytes memory sig = _sign(s);
        vm.warp(block.timestamp + 1);
        _stampReverts(
            reg,
            s,
            sig,
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.SessionExpired.selector, s.expiresAt, block.timestamp)
        );
    }

    function test_check2_wrongChainId() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        s.chainId = 1337;
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.WrongChainId.selector, 1337, block.chainid)
        );
    }

    function test_check2_wrongRegistry() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        s.registry = address(0xBEEF);
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.WrongRegistry.selector, address(0xBEEF))
        );
    }

    function test_check2_sessionSignedForOtherChainCannotBeReplayedHere() public {
        // Signed for 1337 (as the devnet registry would see it), submitted here: the chainId check refuses it.
        IWatermarkRegistry.Session memory s = _session(alice);
        s.chainId = 1337;
        vm.chainId(1337);
        bytes memory sig = _sign(s);
        vm.chainId(31337);
        _stampReverts(
            reg,
            s,
            sig,
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.WrongChainId.selector, 1337, 31337)
        );
    }

    function test_order_check2_before_check3() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        s.expiresAt = uint64(block.timestamp - 1);
        _stampReverts(
            reg,
            s,
            hex"deadbeef",
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.SessionExpired.selector, s.expiresAt, block.timestamp)
        );
    }

    /// SEC-1: address(0) is the "unused" marker in nullifierWallet, so a stamp to it is refused in check 2.
    function test_check2_zeroWalletRefused() public {
        IWatermarkRegistry.Session memory s = _session(address(0));
        bytes memory sig = _sign(s);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        _expectNoVerify();
        _stampReverts(reg, s, sig, PROOF, pi, abi.encodePacked(WatermarkRegistry.ZeroWallet.selector));
        (bool ok, uint64 e) = reg.isStamped(address(0), appId);
        assertFalse(ok);
        assertEq(e, 0);
        assertEq(reg.nullifierWallet(appId, NULLIFIER), address(0));
    }

    /// SEC-1, the attack it closes: one card must not stamp address(0) and then, still unbound, a second wallet.
    function test_check2_zeroWalletCannotLeaveCardUnbound() public {
        IWatermarkRegistry.Session memory s0 = _session(address(0));
        bytes memory sig0 = _sign(s0);
        bytes32[] memory pi0 = _pi(s0, NULLIFIER);
        _stampReverts(reg, s0, sig0, PROOF, pi0, abi.encodePacked(WatermarkRegistry.ZeroWallet.selector));
        _stamp(_session(alice), NULLIFIER);
        IWatermarkRegistry.Session memory sb = _session(bob);
        bytes memory sigB = _sign(sb);
        bytes32[] memory piB = _pi(sb, NULLIFIER);
        _stampReverts(
            reg,
            sb,
            sigB,
            PROOF,
            piB,
            abi.encodeWithSelector(WatermarkRegistry.NullifierBoundToOtherWallet.selector, NULLIFIER, alice)
        );
    }

    function test_order_check2_zeroWalletAfterExpiryAndBeforeSignature() public {
        IWatermarkRegistry.Session memory s = _session(address(0));
        s.expiresAt = uint64(block.timestamp - 1);
        _stampReverts(
            reg,
            s,
            hex"",
            PROOF,
            new bytes32[](0),
            abi.encodeWithSelector(WatermarkRegistry.SessionExpired.selector, s.expiresAt, block.timestamp)
        );
        s.expiresAt = uint64(block.timestamp + 600);
        _stampReverts(
            reg, s, hex"deadbeef", PROOF, new bytes32[](0), abi.encodePacked(WatermarkRegistry.ZeroWallet.selector)
        );
    }

    // ------------------------------------------------------------------ check 3: replay and signature

    function test_check3_replay() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes memory sig = _sign(s);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        reg.stamp(s, sig, PROOF, pi);
        _stampReverts(
            reg, s, sig, PROOF, pi, abi.encodeWithSelector(WatermarkRegistry.SessionAlreadyUsed.selector, _digest(s))
        );
    }

    function test_check3_wrongSigner() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        uint256 otherPk = 0xB0B;
        _stampReverts(
            reg,
            s,
            _signWith(otherPk, s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.WrongSessionSigner.selector, vm.addr(otherPk), signer)
        );
    }

    function test_check3_tamperedSessionRecoversSomeoneElse() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes memory sig = _sign(s);
        s.wallet = bob; // the relayer can't redirect a stamp
        _stampRevertsPartial(reg, s, sig, PROOF, _pi(s, NULLIFIER), WatermarkRegistry.WrongSessionSigner.selector);
    }

    function test_check3_highSRejected() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32 digest = _digest(s);
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(signerPk, digest);
        bytes32 highS = bytes32(SECP256K1_N - uint256(ss));
        uint8 flippedV = v == 27 ? 28 : 27;
        // The malleable twin is a valid secp256k1 signature for the same signer...
        assertEq(ecrecover(digest, flippedV, r, highS), signer);
        // ...but the registry only accepts the low-s form.
        _stampReverts(
            reg,
            s,
            abi.encodePacked(r, highS, flippedV),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodePacked(WatermarkRegistry.InvalidSignature.selector)
        );
    }

    function test_check3_vZeroOneAccepted() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(signerPk, _digest(s));
        reg.stamp(s, abi.encodePacked(r, ss, uint8(v - 27)), PROOF, _pi(s, NULLIFIER));
        (bool ok,) = reg.isStamped(alice, appId);
        assertTrue(ok);
    }

    function test_check3_malformedSignatures() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes memory good = _sign(s);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        (bytes32 r, bytes32 ss) = abi.decode(good, (bytes32, bytes32));
        uint8 v = uint8(good[64]);

        bytes[] memory bad = new bytes[](7);
        bad[0] = hex"";
        bad[1] = abi.encodePacked(r, ss); // 64 bytes (EIP-2098 compact is not accepted)
        bad[2] = abi.encodePacked(good, uint8(0)); // 66 bytes
        bad[3] = abi.encodePacked(r, ss, uint8(29)); // bad v
        bad[4] = abi.encodePacked(r, ss, uint8(2)); // bad v
        bad[5] = new bytes(65); // all zero: ecrecover returns address(0)
        bad[6] = abi.encodePacked(bytes32(0), ss, v); // r = 0
        for (uint256 i = 0; i < bad.length; i++) {
            _stampReverts(reg, s, bad[i], PROOF, pi, abi.encodePacked(WatermarkRegistry.InvalidSignature.selector));
        }
        // The good one still works afterwards.
        reg.stamp(s, good, PROOF, pi);
    }

    function test_order_check3_before_check4() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[0] = bytes32(uint256(1)); // wrong caRoot too
        _stampReverts(reg, s, new bytes(65), PROOF, pi, abi.encodePacked(WatermarkRegistry.InvalidSignature.selector));
    }

    function test_order_replayBeforeSignatureAndInputs() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        _stamp(s, NULLIFIER);
        _stampReverts(
            reg,
            s,
            hex"",
            PROOF,
            new bytes32[](0),
            abi.encodeWithSelector(WatermarkRegistry.SessionAlreadyUsed.selector, _digest(s))
        );
    }

    // ------------------------------------------------------------------ check 4: caRoot, rulesRoot, appId

    function test_check4_publicInputsLength() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes memory sig = _sign(s);
        bytes32[] memory five = new bytes32[](5);
        _stampReverts(
            reg, s, sig, PROOF, five, abi.encodeWithSelector(WatermarkRegistry.BadPublicInputsLength.selector, 5)
        );

        bytes32[] memory seven = new bytes32[](7);
        bytes32[] memory six = _pi(s, NULLIFIER);
        for (uint256 i = 0; i < 6; i++) {
            seven[i] = six[i];
        }
        _stampReverts(
            reg, s, sig, PROOF, seven, abi.encodeWithSelector(WatermarkRegistry.BadPublicInputsLength.selector, 7)
        );
    }

    function test_check4_caRootUnset() public {
        WatermarkRegistry fresh = new WatermarkRegistry(IVerifier(address(verifier)));
        vm.prank(appOwner);
        uint256 id = fresh.registerApp(SALT, RULES_ROOT, signer);
        IWatermarkRegistry.Session memory s = _session(alice);
        s.appId = id;
        s.registry = address(fresh);
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(signerPk, fresh.hashSession(s));
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[0] = bytes32(0); // a zero caRoot public input must not "match" an unset root
        _stampReverts(
            fresh, s, abi.encodePacked(r, ss, v), PROOF, pi, abi.encodePacked(WatermarkRegistry.CaRootNotSet.selector)
        );
    }

    function test_check4_caRootMismatch() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[0] = keccak256("old root");
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.CaRootMismatch.selector, pi[0], CA_ROOT)
        );
    }

    function test_check4_caRootRotationInvalidatesOldProofs() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32 newRoot = keccak256("rotated");
        reg.setCaRoot(newRoot);
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.CaRootMismatch.selector, CA_ROOT, newRoot)
        );
    }

    function test_check4_rulesRootMismatch() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[1] = keccak256("another app's filter");
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.RulesRootMismatch.selector, pi[1], RULES_ROOT)
        );
    }

    function test_check4_appIdMismatch() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[2] = bytes32(appId + 1);
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.AppIdMismatch.selector, appId + 1, appId)
        );
    }

    function test_order_check4_lengthBeforeCaRoot_and_caRootBeforeRules() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes memory sig = _sign(s);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[0] = bytes32(uint256(5));
        pi[1] = bytes32(uint256(6));
        _stampReverts(
            reg, s, sig, PROOF, pi, abi.encodeWithSelector(WatermarkRegistry.CaRootMismatch.selector, pi[0], CA_ROOT)
        );
    }

    function test_order_check4_before_check5() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[1] = bytes32(uint256(6));
        pi[3] = bytes32(uint256(7)); // UN wrong too
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.RulesRootMismatch.selector, pi[1], RULES_ROOT)
        );
    }

    // ------------------------------------------------------------------ check 5: UN

    function test_check5_unMismatch() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        uint256 good = uint256(pi[3]);
        pi[3] = bytes32(good ^ 1);
        _stampReverts(
            reg, s, _sign(s), PROOF, pi, abi.encodeWithSelector(WatermarkRegistry.UnMismatch.selector, good ^ 1, good)
        );
    }

    function test_check5_leftAlignedBytes4IsRejected() public {
        // The classic bug: bytes32(bytes4(x)) puts the 4 bytes on the left. F4 encodes UN as a big-endian integer.
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        bytes32 leftAligned = bytes32(bytes4(sha256(abi.encodePacked(s.nonce))));
        pi[3] = leftAligned;
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.UnMismatch.selector, uint256(leftAligned), _un(s.nonce))
        );
    }

    function test_check5_knownVector() public pure {
        // sha256(32 x 0x11)[0..4] = 02d449a3; sha256(32 x 0x00)[0..4] = 66687aad (sdk/src/session.test.ts)
        assertEq(_un(bytes32(0x1111111111111111111111111111111111111111111111111111111111111111)), 0x02d449a3);
        assertEq(_un(bytes32(0)), 0x66687aad);
    }

    function test_order_check5_before_check6() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[3] = bytes32(uint256(7));
        pi[5] = bytes32(uint256(999));
        _stampReverts(
            reg, s, _sign(s), PROOF, pi, abi.encodeWithSelector(WatermarkRegistry.UnMismatch.selector, 7, _un(s.nonce))
        );
    }

    // ------------------------------------------------------------------ check 6: validUntilMonth

    function test_check6_mismatchWithSession() public {
        IWatermarkRegistry.Session memory s = _session(alice, uint32(M + 3));
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[5] = bytes32(M + 2);
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthMismatch.selector, M + 2, M + 3)
        );
    }

    function test_check6_overflowGuard() public {
        IWatermarkRegistry.Session memory s = _session(alice, uint32(M + 3));
        bytes32[] memory pi = _pi(s, NULLIFIER);
        bytes memory sig = _sign(s);
        // Same low 32 bits as the session, but does not fit uint32: must not be truncated into a match.
        pi[5] = bytes32((uint256(1) << 32) + M + 3);
        _stampReverts(
            reg,
            s,
            sig,
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthMismatch.selector, uint256(pi[5]), M + 3)
        );
        pi[5] = bytes32(type(uint256).max);
        _stampReverts(
            reg,
            s,
            sig,
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthMismatch.selector, type(uint256).max, M + 3)
        );
    }

    function test_check6_sessionMonthMaxUint32IsOutOfRange() public {
        IWatermarkRegistry.Session memory s = _session(alice, type(uint32).max);
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthOutOfRange.selector, type(uint32).max, M)
        );
    }

    function test_check6_boundaries() public {
        // m + 1 and m + 3 pass
        IWatermarkRegistry.Session memory s1 = _session(alice, uint32(M + 1));
        _stamp(s1, NULLIFIER);
        (, uint64 e1) = reg.isStamped(alice, appId);
        assertEq(e1, 1_798_761_599, "end of Dec 2026");

        IWatermarkRegistry.Session memory s3 = _session(bob, uint32(M + 3));
        _stamp(s3, keccak256("card key B"));
        (, uint64 e3) = reg.isStamped(bob, appId);
        assertEq(e3, END_OF_325);

        // m and m + 4 fail
        IWatermarkRegistry.Session memory s0 = _session(alice, uint32(M));
        _stampReverts(
            reg,
            s0,
            _sign(s0),
            PROOF,
            _pi(s0, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthOutOfRange.selector, M, M)
        );

        IWatermarkRegistry.Session memory s4 = _session(alice, uint32(M + 4));
        _stampReverts(
            reg,
            s4,
            _sign(s4),
            PROOF,
            _pi(s4, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthOutOfRange.selector, M + 4, M)
        );
    }

    function test_check6_monthRollsOverAtUtcMidnight() public {
        // At 2026-11-30T23:59:59Z the current month is 322, so 326 is out of range; one second later it is fine.
        vm.warp(1_796_083_199);
        IWatermarkRegistry.Session memory s = _session(alice, uint32(326));
        bytes memory sig = _sign(s);
        _stampReverts(
            reg,
            s,
            sig,
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthOutOfRange.selector, 326, 322)
        );
        vm.warp(1_796_083_200);
        reg.stamp(s, sig, PROOF, _pi(s, NULLIFIER));
        (bool ok,) = reg.isStamped(alice, appId);
        assertTrue(ok);
    }

    function test_order_check6_before_check7() public {
        _stamp(_session(alice), NULLIFIER); // NULLIFIER now bound to alice
        IWatermarkRegistry.Session memory s = _session(bob, uint32(M));
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthOutOfRange.selector, M, M)
        );
    }

    // ------------------------------------------------------------------ check 7: nullifier

    function test_check7_otherWalletRejected() public {
        _stamp(_session(alice), NULLIFIER);
        IWatermarkRegistry.Session memory s = _session(bob);
        _stampReverts(
            reg,
            s,
            _sign(s),
            PROOF,
            _pi(s, NULLIFIER),
            abi.encodeWithSelector(WatermarkRegistry.NullifierBoundToOtherWallet.selector, NULLIFIER, alice)
        );
    }

    function test_check7_nullifierIsPerApp() public {
        _stamp(_session(alice), NULLIFIER);
        // Another app may see the same field value (it can't in practice: the nullifier hashes in appId).
        vm.prank(appOwner);
        uint256 app2 = reg.registerApp(keccak256("app2"), RULES_ROOT, signer);
        IWatermarkRegistry.Session memory s = _session(bob);
        s.appId = app2;
        _stamp(s, NULLIFIER);
        assertEq(reg.nullifierWallet(app2, NULLIFIER), bob);
        assertEq(reg.nullifierWallet(appId, NULLIFIER), alice);
    }

    function test_check7_renewalBySameWalletExtends() public {
        _stamp(_session(alice, uint32(M + 1)), NULLIFIER);
        (, uint64 e1) = reg.isStamped(alice, appId);
        assertEq(e1, 1_798_761_599); // end of Dec 2026

        // In December, renew with the same card: the stamp now runs to the end of March 2027.
        vm.warp(1_796_083_200 + 3 days); // 2026-12-04
        IWatermarkRegistry.Session memory s = _session(alice, uint32(M + 4));
        vm.expectEmit(address(reg));
        emit Stamped(alice, appId, NULLIFIER, 1_806_537_599);
        _stamp(s, NULLIFIER);
        (bool ok, uint64 e2) = reg.isStamped(alice, appId);
        assertTrue(ok);
        assertEq(e2, 1_806_537_599); // 2027-03-31T23:59:59Z
        assertEq(reg.nullifierWallet(appId, NULLIFIER), alice);
    }

    function test_check7_renewalNeverShortens() public {
        _stamp(_session(alice, uint32(M + 3)), NULLIFIER);
        IWatermarkRegistry.Session memory s = _session(alice, uint32(M + 1));
        vm.expectEmit(address(reg));
        emit Stamped(alice, appId, NULLIFIER, END_OF_325);
        _stamp(s, NULLIFIER);
        (, uint64 e) = reg.isStamped(alice, appId);
        assertEq(e, END_OF_325);
    }

    function test_order_check7_before_check8() public {
        _stamp(_session(alice), NULLIFIER);
        verifier.setResult(false);
        IWatermarkRegistry.Session memory s = _session(bob);
        bytes memory sig = _sign(s);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        _expectNoVerify();
        _stampReverts(
            reg,
            s,
            sig,
            PROOF,
            pi,
            abi.encodeWithSelector(WatermarkRegistry.NullifierBoundToOtherWallet.selector, NULLIFIER, alice)
        );
    }

    // ------------------------------------------------------------------ check 8: proof

    function test_check8_invalidProof() public {
        verifier.setResult(false);
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        vm.expectCall(address(verifier), abi.encodeCall(IVerifier.verify, (PROOF, pi)), 1);
        _stampReverts(reg, s, _sign(s), PROOF, pi, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        // Nothing was stored (check 9 never ran).
        (bool ok,) = reg.isStamped(alice, appId);
        assertFalse(ok);
        assertFalse(reg.sessionUsed(reg.hashSession(s)));
        assertEq(reg.nullifierWallet(appId, NULLIFIER), address(0));
    }

    /// XL-4: the real HonkVerifier reverts with its own errors instead of returning false. Every verifier revert
    /// surfaces as the registry's InvalidProof(), and nothing is stored.
    function test_check8_verifierRevertBecomesInvalidProof() public {
        verifier.setRevert(true);
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        vm.expectCall(address(verifier), abi.encodeCall(IVerifier.verify, (PROOF, pi)), 1);
        _stampReverts(reg, s, _sign(s), PROOF, pi, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        (bool ok,) = reg.isStamped(alice, appId);
        assertFalse(ok);
        assertFalse(reg.sessionUsed(reg.hashSession(s)));
        assertEq(reg.nullifierWallet(appId, NULLIFIER), address(0));
    }

    function test_noVerifyCallWhenEarlierCheckFails() public {
        IWatermarkRegistry.Session memory s = _session(alice);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        pi[3] = bytes32(0);
        bytes memory sig = _sign(s);
        _expectNoVerify();
        _stampRevertsPartial(reg, s, sig, PROOF, pi, WatermarkRegistry.UnMismatch.selector);
    }

    // ------------------------------------------------------------------ misc views

    function test_monthViews() public {
        assertEq(reg.currentMonth(), M);
        assertEq(reg.endOfMonth(325), END_OF_325);
        vm.warp(946_684_799); // 1999-12-31T23:59:59Z
        vm.expectRevert(abi.encodeWithSelector(MonthMath.BeforeYear2000.selector, 946_684_799));
        reg.currentMonth();
    }

    function test_domainSeparator_followsChainId() public {
        bytes32 d1 = reg.domainSeparator();
        assertEq(
            d1,
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256("Watermark"),
                    keccak256("1"),
                    block.chainid,
                    address(reg)
                )
            )
        );
        vm.chainId(1874);
        bytes32 d2 = reg.domainSeparator();
        assertTrue(d1 != d2);
        assertEq(
            d2,
            keccak256(
                abi.encode(
                    keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                    keccak256("Watermark"),
                    keccak256("1"),
                    uint256(1874),
                    address(reg)
                )
            )
        );
    }

    function testFuzz_hashSessionMatchesIndependentDigest(
        address wallet,
        uint256 id,
        bytes32 nonce,
        uint64 expiresAt,
        uint32 v,
        uint256 chainId
    ) public view {
        IWatermarkRegistry.Session memory s =
            IWatermarkRegistry.Session(wallet, id, nonce, expiresAt, v, chainId, address(reg));
        assertEq(reg.hashSession(s), _digest(s));
    }

    function testFuzz_stampGoesToSessionWallet(address wallet, address caller) public {
        vm.assume(wallet != address(0) && caller != wallet);
        IWatermarkRegistry.Session memory s = _session(wallet);
        bytes memory sig = _sign(s);
        bytes32[] memory pi = _pi(s, NULLIFIER);
        vm.prank(caller);
        reg.stamp(s, sig, PROOF, pi);
        (bool ok,) = reg.isStamped(wallet, appId);
        assertTrue(ok);
        (bool callerOk,) = reg.isStamped(caller, appId);
        assertFalse(callerOk);
    }
}

/// @notice Ownership takeover attempts (from the adversarial review; all held). A random sequence of
/// transferOwnership / acceptOwnership / setCaRoot calls from four actors is checked against a two-line model:
/// only `owner` may propose or set caRoot, only `pendingOwner` may accept, and acceptance clears the proposal.
contract WatermarkRegistryOwnershipModelTest is Test {
    WatermarkRegistry reg;
    address[4] actors;
    address modelOwner;
    address modelPending;
    bytes32 modelRoot;

    function setUp() public {
        reg = new WatermarkRegistry(IVerifier(address(new MockVerifier())));
        actors = [address(this), makeAddr("a"), makeAddr("b"), makeAddr("c")];
        modelOwner = address(this);
    }

    function testFuzz_ownershipMatchesTwoStepModel(uint8[32] calldata ops) public {
        for (uint256 i; i < ops.length; ++i) {
            address caller = actors[ops[i] & 3];
            uint8 action = (ops[i] >> 2) % 3;
            address target = (ops[i] >> 4) & 4 == 0 ? actors[(ops[i] >> 5) & 3] : address(0);

            vm.prank(caller);
            if (action == 0) {
                (bool ok,) = address(reg).call(abi.encodeCall(reg.transferOwnership, (target)));
                assertEq(ok, caller == modelOwner, "only the owner proposes");
                if (ok) modelPending = target;
            } else if (action == 1) {
                (bool ok,) = address(reg).call(abi.encodeCall(reg.acceptOwnership, ()));
                assertEq(ok, caller == modelPending && caller != address(0), "only the pending owner accepts");
                if (ok) {
                    modelOwner = caller;
                    modelPending = address(0);
                }
            } else {
                bytes32 root = keccak256(abi.encode(i, caller));
                (bool ok,) = address(reg).call(abi.encodeCall(reg.setCaRoot, (root)));
                assertEq(ok, caller == modelOwner, "only the owner sets caRoot");
                if (ok) modelRoot = root;
            }
            assertEq(reg.owner(), modelOwner);
            assertEq(reg.pendingOwner(), modelPending);
            assertEq(reg.caRoot(), modelRoot);
        }
    }

    /// A proposal the owner replaced or cancelled can't be accepted later, and the previous owner keeps no power.
    function test_stalePendingAndPreviousOwnerHaveNoPower() public {
        address a = actors[1];
        address b = actors[2];
        reg.transferOwnership(a);
        reg.transferOwnership(b); // replaces a
        vm.prank(a);
        vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
        reg.acceptOwnership();

        vm.prank(b);
        reg.acceptOwnership();
        vm.expectRevert(WatermarkRegistry.NotOwner.selector);
        reg.setCaRoot(bytes32(uint256(1)));
        vm.expectRevert(WatermarkRegistry.NotOwner.selector);
        reg.transferOwnership(address(this));

        // Cancel (address(0)) leaves no acceptor among real senders. (Only msg.sender == address(0) would match an
        // empty proposal, which no transaction can have; OpenZeppelin Ownable2Step behaves the same.)
        vm.prank(b);
        reg.transferOwnership(address(0));
        for (uint256 i; i < actors.length; ++i) {
            vm.prank(actors[i]);
            vm.expectRevert(WatermarkRegistry.NotPendingOwner.selector);
            reg.acceptOwnership();
        }
        assertEq(reg.owner(), b);
    }
}
