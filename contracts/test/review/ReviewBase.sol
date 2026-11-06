// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Reviewer's harness (not the builder's). Differences from the builder's QuotaPaymasterBase:
// - uses the REAL committed WatermarkRegistry (contracts/src/WatermarkRegistry.sol, imported directly)
//   instead of a stand-in, so the audited bytecode and the stamp slot (mapping at slot 4) are what would run on 1337;
// - adds "lean" helper stand-ins whose cost is close to the real 12-15 byte Yul helpers, for the gas review.

import {WatermarkQuotaPaymaster as PM} from "../../src/WatermarkQuotaPaymaster.sol";
import {FrozenMocks, FrameTxSim} from "../mocks/HegotaMocks.sol";
import {NaiveStakingRegistryStandIn} from "../mocks/NaiveStakingRegistryStandIn.sol";
import {WatermarkRegistry} from "../../src/WatermarkRegistry.sol";
import {IVerifier} from "../../src/interfaces/IVerifier.sol";

abstract contract ReviewBase is FrozenMocks {
    address internal constant EP = 0x00000000000000000000000000000000000000AA;
    address internal constant EXPIRY = 0x0000000000000000000000000000000000008141;
    uint256 internal constant APP_ID = 0x00c0ffee;
    uint32 internal constant QUOTA = 20; // DeployQuotaPaymaster.s.sol default
    uint256 internal constant MAX_COST = 2e15;
    uint256 internal constant FEE = 1 gwei; // DeployQuotaPaymaster.s.sol default SPONSORED_MAX_FEE
    uint256 internal constant TIP = 1_000_000; // DeployQuotaPaymaster.s.sol default SPONSORED_TIP
    uint256 internal constant T0 = 1_793_959_200;

    /// Storage slot of `stampExpiry` in the committed registry: caRoot 0, apps 1, sessionUsed 2, nullifierWallet 3.
    uint256 internal constant STAMP_MAPPING_SLOT = 4;

    // Declared limits exactly as tools/ef-sender/src/send-quota-tx.ts (LIMITS).
    uint256 internal constant EXPIRY_LIMIT = 5_000;
    uint256 internal constant SENDER_VERIFY_LIMIT = 10_000;
    uint256 internal constant PAY_LIMIT = 82_000;
    uint256 internal constant USER_LIMIT = 100_000;
    uint256 internal constant CONSUME_LIMIT = 60_000;
    uint256 internal constant SECP256K1_SIG_COST = 2_800;

    address internal owner = makeAddr("owner");
    address internal user = makeAddr("user");
    address internal target = makeAddr("target");

    WatermarkRegistry internal registry;
    NaiveStakingRegistryStandIn internal staking;
    PM internal pm;

    function setUp() public virtual {
        vm.warp(T0);
        // The verifier is never touched by expiryOf(); any address works.
        registry = new WatermarkRegistry(IVerifier(address(0xBEEF)));
        staking = new NaiveStakingRegistryStandIn();
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        pm = new PM{value: 0.1 ether}(address(registry), APP_ID, QUOTA, MAX_COST, address(staking), FEE, TIP);
        mockFrameTx(address(pm));
        // Stamp the user without a proof: write the registry's slot directly, then prove the layout by reading it
        // back through the getter the paymaster calls.
        vm.store(address(registry), stampSlot(user, APP_ID), bytes32(uint256(T0 + 30 days)));
        require(registry.stampExpiry(user, APP_ID) == uint64(T0 + 30 days), "stamp slot layout");
    }

    /// Committed layout mapping(address wallet => mapping(uint256 appId => uint64)) at slot 4:
    /// keccak(pad(appId) . keccak(pad(wallet) . 4)).
    function stampSlot(address wallet, uint256 appId) internal pure returns (bytes32) {
        return keccak256(abi.encode(appId, keccak256(abi.encode(wallet, STAMP_MAPPING_SLOT))));
    }

    function _frame(address t, uint256 gasLimit, uint8 mode, uint8 flags, bytes memory data, uint8 status)
        internal
        pure
        returns (FrameTxSim.Frame memory f)
    {
        f = FrameTxSim.Frame(t, gasLimit, mode, flags, data, status, 0, 0);
    }

    /// The 5-frame tx that tools/ef-sender builds, seen from frame `current`.
    function _buildTx(address sender, uint256 deadline, uint256 key, uint256 seq, uint256 current) internal {
        sim.reset();
        sim.pushFrame(_frame(EXPIRY, EXPIRY_LIMIT, 1, 0, abi.encodePacked(uint64(deadline)), 1));
        sim.pushFrame(_frame(sender, SENDER_VERIFY_LIMIT, 1, 2, "", 1));
        sim.pushFrame(_frame(address(pm), PAY_LIMIT, 1, 1, abi.encodePacked(PM.verifyAndPay.selector), 1));
        sim.pushFrame(_frame(target, USER_LIMIT, 2, 0, hex"d09de08a", 1));
        sim.pushFrame(_frame(address(pm), CONSUME_LIMIT, 0, 0, abi.encodePacked(PM.consume.selector), 0));
        sim.setTx(0x00, 6);
        sim.setTx(0x01, seq);
        sim.setTx(0x02, uint160(sender));
        sim.setTx(0x03, TIP);
        sim.setTx(0x04, FEE);
        sim.setTx(0x06, 1e15);
        sim.setTx(0x08, uint256(keccak256("sighash")));
        sim.setTx(0x0A, current);
        sim.setTx(0x0E, 1);
        sim.setTx(0x10, key);
    }

    function _buildValid(uint256 seq, uint256 current) internal {
        uint256 deadline = block.timestamp + 840; // tools/ef-sender default: lastSeen + MIN_LIFETIME + TICK + 120
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), seq, current);
    }

    function _helpers() internal view returns (address[7] memory hs) {
        for (uint256 n = 1; n <= 7; n++) {
            hs[n - 1] = helperAt(address(pm), n);
        }
    }

    function _isHelper(address a) internal view returns (bool) {
        for (uint256 n = 1; n <= 7; n++) {
            if (a == helperAt(address(pm), n)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ lean helper stand-ins (gas review)
    // Real helpers (hegota-support yul/erc8421-workshop/*.yul) are ~12-15 bytes and cost ~25 gas inside the call.
    // These answer from a table in their own code with CODECOPY (~45 gas), so the measured pay-frame cost is close
    // to what ethrex would charge, instead of the frozen Solidity stand-ins' few hundred gas per call.

    /// TXPARAM(p): word p of the table. Runtime: 60 20 | 60 00 35 60 05 1b 60 13 01 | 60 00 39 | 60 20 60 00 f3
    function _leanTxParam(uint256[] memory table) internal pure returns (bytes memory) {
        return abi.encodePacked(hex"602060003560051b601301600039" hex"60206000f3", table);
    }

    /// FRAMEPARAM(frameIndex, param): word frameIndex*16 + param.
    /// Runtime: 60 20 | 60 00 35 60 04 1b 60 20 35 01 60 05 1b 60 1a 01 | 60 00 39 | 60 20 60 00 f3 (26 bytes)
    function _leanFrameParam(uint256[] memory table) internal pure returns (bytes memory) {
        return abi.encodePacked(hex"602060003560041b6020350160051b601a01600039" hex"60206000f3", table);
    }

    /// FRAMEDATALOAD(offset, frameIndex): word frameIndex (offset 0 only).
    /// Runtime: 60 20 | 60 20 35 60 05 1b 60 13 01 | 60 00 39 | 60 20 60 00 f3 (19 bytes)
    function _leanFrameDataLoad(uint256[] memory table) internal pure returns (bytes memory) {
        return abi.encodePacked(hex"602060203560051b601301600039" hex"60206000f3", table);
    }

    /// Replaces TXPARAM / FRAMEPARAM / FRAMEDATALOAD of `pm` with lean copies of the current `sim` answers.
    function leanFrameTx() internal {
        uint256[] memory tp = new uint256[](0x11);
        uint256[9] memory ids = [uint256(0x01), 0x02, 0x03, 0x04, 0x06, 0x08, 0x0A, 0x0E, 0x10];
        for (uint256 i; i < ids.length; i++) {
            tp[ids[i]] = sim.txparam(ids[i]);
        }
        tp[0x09] = sim.txparam(0x09);
        vm.etch(helperAt(address(pm), TXPARAM_NONCE), _leanTxParam(tp));

        uint256 cur = sim.txparam(0x0A);
        uint256[] memory fp = new uint256[](5 * 16);
        for (uint256 i; i < 5; i++) {
            FrameTxSim.Frame memory f = sim.getFrame(i);
            fp[i * 16 + 0] = uint160(f.target);
            fp[i * 16 + 1] = f.gasLimit;
            fp[i * 16 + 2] = f.mode;
            fp[i * 16 + 3] = f.flags;
            fp[i * 16 + 4] = f.data.length;
            fp[i * 16 + 5] = i < cur ? f.status : 0;
            fp[i * 16 + 6] = f.flags & 3;
        }
        vm.etch(helperAt(address(pm), FRAMEPARAM_NONCE), _leanFrameParam(fp));

        uint256[] memory fd = new uint256[](5);
        for (uint256 i; i < 5; i++) {
            fd[i] = uint256(sim.framedataload(0, i));
        }
        vm.etch(helperAt(address(pm), FRAMEDATALOAD_NONCE), _leanFrameDataLoad(fd));
    }
}

/// APPROVE stand-in that burns EIP-8250 KEYED_NONCE_FIRST_USE_GAS (20,000) inside the delegatecalled helper frame,
/// exactly where ethrex charges it (vm.rs L1983-1986: increase_consumed_gas on the current call frame), and runs out
/// of gas there if the frame cannot pay it (EIP-8250 at 81b976ac L167-168).
contract BurningApprove {
    fallback() external payable {
        uint256 start = gasleft();
        while (start - gasleft() < 20_000) {}
    }
}
