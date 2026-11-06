// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, console2} from "forge-std/Test.sol";
import {HonkVerifier, Errors} from "../src/generated/Verifier.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

/// @notice The whole stamp path with a REAL UltraHonk proof: the committed bb-generated HonkVerifier, the registry and
/// test/fixtures/synthetic-stamp.json (a proof of the SYNTHETIC test card, made-up keys, made by
/// script/gen-stamp-fixture.ts). The proof is for appOwner 0x...A11CE, salt 0, nonce 0x11..11 (UN 0x02d449a3) and
/// validUntilMonth 325 (Feb 2027); its caRoot holds the synthetic CA only, so the test sets that root.
contract RealProofStampTest is Test {
    string internal constant FIXTURE = "test/fixtures/synthetic-stamp.json";

    address constant APP_OWNER = address(0xA11CE);
    bytes32 constant NONCE = 0x1111111111111111111111111111111111111111111111111111111111111111;
    uint32 constant VALID_UNTIL = 325;
    uint256 constant NOW = 1_793_968_496; // 2026-11-06T12:34:56Z, month 322
    uint64 constant END_OF_FEB_2027 = 1_803_859_199; // 2027-02-28T23:59:59Z
    uint256 constant BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    HonkVerifier honk;
    WatermarkRegistry reg;
    uint256 sessionSignerPk = 0x5E55105; // test key only
    address wallet = makeAddr("user wallet");
    address relayer = makeAddr("relayer");
    uint256 appId;
    bytes proof;
    bytes32[] pis;
    bytes32 caRoot;
    bytes32 nullifier;

    function setUp() public {
        vm.warp(NOW);
        string memory json = vm.readFile(FIXTURE);
        proof = vm.parseJsonBytes(json, ".proof");
        pis = vm.parseJsonBytes32Array(json, ".publicInputs");
        caRoot = vm.parseJsonBytes32(json, ".caRoot");
        nullifier = vm.parseJsonBytes32(json, ".nullifier");

        honk = new HonkVerifier();
        reg = new WatermarkRegistry(IVerifier(address(honk)));
        reg.setCaRoot(caRoot);
        vm.prank(APP_OWNER);
        appId = reg.registerApp(bytes32(0), vm.parseJsonBytes32(json, ".rulesRoot"), vm.addr(sessionSignerPk));
    }

    // ------------------------------------------------------------------ helpers

    function _session(address w, bytes32 nonce) internal view returns (IWatermarkRegistry.Session memory) {
        return IWatermarkRegistry.Session({
            wallet: w,
            appId: appId,
            nonce: nonce,
            expiresAt: uint64(block.timestamp + 600),
            validUntilMonth: VALID_UNTIL,
            chainId: block.chainid,
            registry: address(reg)
        });
    }

    function _sign(IWatermarkRegistry.Session memory s) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(sessionSignerPk, reg.hashSession(s));
        return abi.encodePacked(r, ss, v);
    }

    function _copy(bytes32[] memory a) internal pure returns (bytes32[] memory b) {
        b = new bytes32[](a.length);
        for (uint256 i; i < a.length; ++i) {
            b[i] = a[i];
        }
    }

    function _un(bytes32 nonce) internal pure returns (uint256) {
        return uint256(uint32(bytes4(sha256(abi.encodePacked(nonce)))));
    }

    /// @dev Arguments are evaluated before expectRevert, so helper calls in them can't be "the next call".
    function _stampReverts(
        IWatermarkRegistry.Session memory s,
        bytes memory sig,
        bytes memory p,
        bytes32[] memory pi,
        bytes memory err
    ) internal {
        vm.expectRevert(err);
        reg.stamp(s, sig, p, pi);
    }

    function _assertNotStamped(IWatermarkRegistry.Session memory s) internal view {
        (bool ok, uint64 e) = reg.isStamped(s.wallet, appId);
        assertFalse(ok);
        assertEq(e, 0);
        assertFalse(reg.sessionUsed(reg.hashSession(s)));
        assertEq(reg.nullifierWallet(appId, nullifier), address(0));
    }

    // ------------------------------------------------------------------ fixture sanity

    function test_fixtureMatchesTheRegistryFormulas() public view {
        assertEq(proof.length, 9536, "proof bytes");
        assertEq(pis.length, 6);
        assertEq(appId, uint256(keccak256(abi.encode(APP_OWNER, bytes32(0)))) >> 8, "appId formula");
        assertEq(uint256(pis[0]), uint256(caRoot));
        (address owner_, bytes32 rules,) = reg.apps(appId);
        assertEq(owner_, APP_OWNER);
        assertEq(pis[1], rules);
        assertEq(uint256(pis[2]), appId, "pi[2] = appId of 0x...A11CE, salt 0");
        assertEq(uint256(pis[3]), 0x02d449a3, "pi[3] = UN of nonce 0x11..11");
        assertEq(uint256(pis[3]), _un(NONCE));
        assertEq(pis[4], nullifier);
        assertEq(uint256(pis[5]), VALID_UNTIL);
        assertLt(uint256(nullifier), BN254_R, "canonical nullifier");
    }

    // ------------------------------------------------------------------ the real stamp

    function test_realProof_stamps_andMeasuresGas() public {
        IWatermarkRegistry.Session memory s = _session(wallet, NONCE);
        bytes memory sig = _sign(s);
        // Copy to memory first: passing the storage copies would add ~300 cold SLOADs to the measurement.
        bytes memory p = proof;
        bytes32[] memory pi = _copy(pis);

        // verify() alone, on a separate verifier instance so its storage/code warmth matches the stamp call below.
        HonkVerifier fresh = new HonkVerifier();
        uint256 g0 = gasleft();
        bool ok = fresh.verify(p, pi);
        uint256 verifyGas = g0 - gasleft();
        assertTrue(ok, "real proof must verify");

        vm.expectEmit(address(reg));
        emit IWatermarkRegistry.Stamped(wallet, appId, nullifier, END_OF_FEB_2027);
        vm.prank(relayer);
        g0 = gasleft();
        reg.stamp(s, sig, p, pi);
        uint256 stampGas = g0 - gasleft();

        (bool stamped, uint64 expiresAt) = reg.isStamped(wallet, appId);
        assertTrue(stamped, "isStamped");
        assertEq(expiresAt, END_OF_FEB_2027, "expiry = end of Feb 2027");
        assertEq(reg.nullifierWallet(appId, nullifier), wallet);
        assertTrue(reg.sessionUsed(reg.hashSession(s)));
        (bool relayerStamped,) = reg.isStamped(relayer, appId);
        assertFalse(relayerStamped, "the stamp goes to s.wallet, never msg.sender");

        // gasleft deltas include the test's own ABI encoding of the 10 KB call, so they are upper bounds. The
        // README's transaction numbers come from receipts on a local anvil (prague): first stamp 2,847,267 gas used.
        console2.log("verify() gas (gasleft delta)            ", verifyGas);
        console2.log("stamp() gas (gasleft delta, upper bound)", stampGas);
        console2.log("stamp() minus verify                    ", stampGas - verifyGas);
        console2.log(
            "stamp calldata bytes                    ", abi.encodeCall(IWatermarkRegistry.stamp, (s, sig, p, pi)).length
        );

        // Pins for the README: a big drift means the verifier or registry changed and the numbers need re-measuring.
        assertApproxEqRel(verifyGas, 2_573_968, 0.02e18, "verify gas drifted from README");
        assertLt(stampGas, 3_000_000, "stamp must stay well inside MAX_GAS_PER_STAMP (3.5M)");
    }

    function test_realProof_renewalBySameWalletWithNewSession_keepsExpiry() public {
        IWatermarkRegistry.Session memory s1 = _session(wallet, NONCE);
        reg.stamp(s1, _sign(s1), proof, pis);
        // A second session (new digest: later expiresAt) carrying the same nonce, so the same proof fits it.
        vm.warp(NOW + 1 days);
        IWatermarkRegistry.Session memory s2 = _session(wallet, NONCE);
        reg.stamp(s2, _sign(s2), proof, pis);
        (bool ok, uint64 e) = reg.isStamped(wallet, appId);
        assertTrue(ok);
        assertEq(e, END_OF_FEB_2027);
    }

    // ------------------------------------------------------------------ refusals

    function test_realProof_replayOfSameSession_refused() public {
        IWatermarkRegistry.Session memory s = _session(wallet, NONCE);
        bytes memory sig = _sign(s);
        reg.stamp(s, sig, proof, pis);
        _stampReverts(
            s,
            sig,
            proof,
            pis,
            abi.encodeWithSelector(WatermarkRegistry.SessionAlreadyUsed.selector, reg.hashSession(s))
        );
    }

    function test_realProof_sameCardOtherWallet_refused() public {
        IWatermarkRegistry.Session memory s = _session(wallet, NONCE);
        reg.stamp(s, _sign(s), proof, pis);
        address other = makeAddr("other wallet");
        IWatermarkRegistry.Session memory s2 = _session(other, NONCE);
        bytes memory sig2 = _sign(s2);
        _stampReverts(
            s2,
            sig2,
            proof,
            pis,
            abi.encodeWithSelector(WatermarkRegistry.NullifierBoundToOtherWallet.selector, nullifier, wallet)
        );
    }

    /// The bb verifier reverts SumcheckFailed / ValueGeFieldOrder / ... on a tampered proof; stamp() says InvalidProof().
    function test_realProof_tamperedProof_isInvalidProof() public {
        IWatermarkRegistry.Session memory s = _session(wallet, NONCE);
        bytes memory sig = _sign(s);
        uint256 mid = proof.length / 2; // a sumcheck univariate evaluation
        bytes memory bad = proof;
        bad[mid] = bad[mid] ^ 0x01; // stays below the field order: exercises the sumcheck maths
        _stampReverts(s, sig, bad, pis, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        _assertNotStamped(s);

        bad[mid] = bad[mid] ^ 0x01 ^ 0xff; // pushes the word above the field order
        _stampReverts(s, sig, bad, pis, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        _assertNotStamped(s);

        bytes memory last = proof;
        last[last.length - 1] = last[last.length - 1] ^ 0x01; // the final opening proof point
        // This one fails in the pairing precompile, which burns all the gas it is given (see the next test); with
        // the relayer's 3.5M cap, the 1/64 the registry keeps back is still enough to revert InvalidProof().
        bytes32[] memory pi = _copy(pis);
        vm.expectRevert(abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        reg.stamp{gas: 3_500_000}(s, sig, last, pi);
        _assertNotStamped(s);
    }

    /// Documented hazard: a proof whose final pairing check fails (ShpleminiFailed) makes the verifier burn the whole
    /// gas limit. A relayer that sent such a stamp unsimulated would pay ~3.5M gas for nothing, so it must always
    /// eth_call (simulate) stamp() first; the relayer's POST /stamp does.
    function test_realProof_badPairing_burnsTheGasLimit() public {
        bytes memory last = proof;
        last[last.length - 1] = last[last.length - 1] ^ 0x01;
        bytes32[] memory pi = _copy(pis);
        uint256 g0 = gasleft();
        try honk.verify{gas: 3_500_000}(last, pi) returns (bool) {
            revert("expected a revert");
        } catch (bytes memory err) {
            uint256 used = g0 - gasleft();
            console2.log("bad pairing: verifier reverted ShpleminiFailed after burning gas", used);
            assertEq(bytes4(err), Errors.ShpleminiFailed.selector);
            assertGt(used, 3_400_000, "burned (almost) the whole limit");
        }
    }

    /// Control for the tamper test: the raw verifier REVERTS (it never returns false), which is why stamp() wraps it.
    function test_realProof_tamperedProof_rawVerifierReverts() public {
        bytes memory bad = proof;
        bad[proof.length / 2] = bad[proof.length / 2] ^ 0x01;
        bytes32[] memory pi = _copy(pis);
        try honk.verify(bad, pi) returns (bool ok) {
            assertFalse(ok, "tampered proof accepted");
            revert("expected the verifier to revert, not return");
        } catch (bytes memory err) {
            assertEq(bytes4(err), Errors.SumcheckFailed.selector);
        }
    }

    /// A session with another nonce: the session is valid and signed, but the proof answers UN(0x11..11), not this
    /// session's challenge. Check 5 refuses it before the verifier runs.
    function test_realProof_wrongNonce_isUnMismatch() public {
        bytes32 otherNonce = 0x2222222222222222222222222222222222222222222222222222222222222222;
        IWatermarkRegistry.Session memory s = _session(wallet, otherNonce);
        bytes memory sig = _sign(s);
        uint256 expectedUn = _un(otherNonce);
        assertTrue(expectedUn != 0x02d449a3);
        vm.expectCall(address(honk), abi.encodeWithSelector(IVerifier.verify.selector), 0);
        _stampReverts(
            s,
            sig,
            proof,
            pis,
            abi.encodeWithSelector(WatermarkRegistry.UnMismatch.selector, uint256(0x02d449a3), expectedUn)
        );
        _assertNotStamped(s);
    }

    /// The same proof with the UN public input rewritten to match the new session: check 5 passes, the proof fails.
    function test_realProof_unRewrittenToMatchSession_isInvalidProof() public {
        bytes32 otherNonce = 0x2222222222222222222222222222222222222222222222222222222222222222;
        IWatermarkRegistry.Session memory s = _session(wallet, otherNonce);
        bytes memory sig = _sign(s);
        bytes32[] memory pi = _copy(pis);
        pi[3] = bytes32(_un(otherNonce));
        _stampReverts(s, sig, proof, pi, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        _assertNotStamped(s);
    }

    /// nullifier + r is the same field element, but a different bytes32 key; the verifier refuses it.
    function test_realProof_nonCanonicalNullifierAlias_isInvalidProof() public {
        IWatermarkRegistry.Session memory s = _session(wallet, NONCE);
        bytes memory sig = _sign(s);
        bytes32[] memory pi = _copy(pis);
        pi[4] = bytes32(uint256(pis[4]) + BN254_R);
        _stampReverts(s, sig, proof, pi, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
    }

    function test_realProof_otherApp_isAppIdMismatch() public {
        // Same rules and signer, other salt: a different appId, so the proof's pi[2] no longer matches.
        (, bytes32 rules,) = reg.apps(appId);
        uint256 otherId = reg.registerApp(bytes32(uint256(1)), rules, vm.addr(sessionSignerPk));
        IWatermarkRegistry.Session memory s = _session(wallet, NONCE);
        s.appId = otherId;
        bytes memory sig = _sign(s);
        _stampReverts(
            s, sig, proof, pis, abi.encodeWithSelector(WatermarkRegistry.AppIdMismatch.selector, appId, otherId)
        );
    }

    function test_realProof_monthOutOfWindow_refused() public {
        // In March 2027 (month 326) a proof valid until Feb 2027 is out of the [m+1, m+3] window.
        vm.warp(1_803_859_200 + 1 days);
        IWatermarkRegistry.Session memory s = _session(wallet, NONCE);
        bytes memory sig = _sign(s);
        _stampReverts(
            s,
            sig,
            proof,
            pis,
            abi.encodeWithSelector(WatermarkRegistry.ValidUntilMonthOutOfRange.selector, uint256(325), uint256(326))
        );
    }
}
