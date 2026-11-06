// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

/// @dev verify() tries to write state. The registry calls verify through a `view` interface (STATICCALL), so the
/// write fails inside the verifier.
contract StateWritingVerifier {
    uint256 public hits;

    function verify(bytes calldata, bytes32[] calldata) external returns (bool) {
        hits += 1;
        return true;
    }
}

/// @dev Burns all the gas it is given.
contract GasBurnerVerifier {
    fallback() external {
        while (true) {}
    }
}

/// @dev Returns the word 2, which is not a valid ABI bool.
contract BadBoolVerifier {
    fallback() external {
        assembly {
            mstore(0, 2)
            return(0, 32)
        }
    }
}

/// @dev Returns no data at all.
contract EmptyReturnVerifier {
    fallback() external {}
}

/// @dev Reverts with a long reason string (the verifier's errors must not leak through stamp()).
contract ReasonRevertVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        revert("verifier exploded");
    }
}

/// @notice XL-4: every way the verifier call can fail leaves no stamp. Reverts and out-of-gas inside the verifier
/// surface as InvalidProof(); a verifier that answers with malformed data makes the registry's own ABI decoding
/// revert (empty data), which try/catch does not catch. Both fail closed.
contract VerifierFailuresTest is Test {
    bytes32 constant CA_ROOT = 0x1a8637effab965c43a451a33a1df3e295b1839fc237c5de04f704e95ba0d8f10;
    bytes32 constant RULES_ROOT = 0x288520708dd4920995a6a73e6edc1c9a1726b62dfff2340c72873e2fb767fdab;
    bytes32 constant NULLIFIER = keccak256("card A");
    uint256 signerPk = 0x5EC5;
    address alice = makeAddr("alice");

    function setUp() public {
        vm.warp(1_793_968_496); // 2026-11-06, month 322
    }

    function _deploy(address v)
        internal
        returns (WatermarkRegistry r, IWatermarkRegistry.Session memory s, bytes memory sig, bytes32[] memory pi)
    {
        r = new WatermarkRegistry(IVerifier(v));
        r.setCaRoot(CA_ROOT);
        uint256 id = r.registerApp(bytes32(0), RULES_ROOT, vm.addr(signerPk));
        s = IWatermarkRegistry.Session({
            wallet: alice,
            appId: id,
            nonce: keccak256("n"),
            expiresAt: uint64(block.timestamp + 600),
            validUntilMonth: 325,
            chainId: block.chainid,
            registry: address(r)
        });
        (uint8 v_, bytes32 rr, bytes32 ss) = vm.sign(signerPk, r.hashSession(s));
        sig = abi.encodePacked(rr, ss, v_);
        pi = new bytes32[](6);
        pi[0] = CA_ROOT;
        pi[1] = RULES_ROOT;
        pi[2] = bytes32(id);
        pi[3] = bytes32(uint256(uint32(bytes4(sha256(abi.encodePacked(s.nonce))))));
        pi[4] = NULLIFIER;
        pi[5] = bytes32(uint256(325));
    }

    function _call(
        WatermarkRegistry r,
        IWatermarkRegistry.Session memory s,
        bytes memory sig,
        bytes32[] memory pi,
        uint256 gas
    ) internal returns (bool ok, bytes memory ret) {
        (ok, ret) = address(r).call{gas: gas}(abi.encodeCall(IWatermarkRegistry.stamp, (s, sig, hex"c0ffee", pi)));
    }

    function _assertNothingStored(WatermarkRegistry r, IWatermarkRegistry.Session memory s) internal view {
        (bool stamped,) = r.isStamped(alice, s.appId);
        assertFalse(stamped, "no stamp");
        assertFalse(r.sessionUsed(r.hashSession(s)), "session not consumed");
        assertEq(r.nullifierWallet(s.appId, NULLIFIER), address(0), "nullifier unbound");
    }

    function test_stateWritingVerifier_isInvalidProof() public {
        StateWritingVerifier w = new StateWritingVerifier();
        (WatermarkRegistry r, IWatermarkRegistry.Session memory s, bytes memory sig, bytes32[] memory pi) =
            _deploy(address(w));
        (bool ok, bytes memory ret) = _call(r, s, sig, pi, 5_000_000);
        assertFalse(ok);
        assertEq(ret, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        assertEq(w.hits(), 0);
        _assertNothingStored(r, s);
    }

    /// The 1/64 of gas the registry keeps back while the verifier burns the rest is enough to revert InvalidProof().
    function test_gasBurnerVerifier_isInvalidProof() public {
        (WatermarkRegistry r, IWatermarkRegistry.Session memory s, bytes memory sig, bytes32[] memory pi) =
            _deploy(address(new GasBurnerVerifier()));
        (bool ok, bytes memory ret) = _call(r, s, sig, pi, 3_500_000);
        assertFalse(ok);
        assertEq(ret, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        _assertNothingStored(r, s);
    }

    function test_reasonStringRevert_isInvalidProof() public {
        (WatermarkRegistry r, IWatermarkRegistry.Session memory s, bytes memory sig, bytes32[] memory pi) =
            _deploy(address(new ReasonRevertVerifier()));
        (bool ok, bytes memory ret) = _call(r, s, sig, pi, 5_000_000);
        assertFalse(ok);
        assertEq(ret, abi.encodePacked(WatermarkRegistry.InvalidProof.selector));
        _assertNothingStored(r, s);
    }

    function test_malformedAnswers_failClosed() public {
        address[3] memory vs = [address(0xDEAD), address(new BadBoolVerifier()), address(new EmptyReturnVerifier())];
        for (uint256 i = 0; i < vs.length; i++) {
            (WatermarkRegistry r, IWatermarkRegistry.Session memory s, bytes memory sig, bytes32[] memory pi) =
                _deploy(vs[i]);
            (bool ok, bytes memory ret) = _call(r, s, sig, pi, 5_000_000);
            assertFalse(ok, "a misbehaving verifier must never let a stamp through");
            assertEq(ret.length, 0, "decode failure in the registry: empty revert");
            _assertNothingStored(r, s);
        }
    }
}
