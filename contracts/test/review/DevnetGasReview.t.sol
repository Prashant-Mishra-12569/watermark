// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {WatermarkQuotaPaymaster as PM} from "../../src/WatermarkQuotaPaymaster.sol";
import {ReviewBase, BurningApprove} from "./ReviewBase.sol";

/// Reviewer's gas check of the declared limits under the devnet's pricing (ethrex at 9aa3645d, Hegota on Amsterdam),
/// which differs from Foundry's Prague schedule in ways the builder's GasBudgetTest does not model:
///  (a) EIP-8141 frame-entry access: ethrex charges the resolved target's cold/warm access (3000/100) out of the
///      frame's own limits.execution before any code runs (vm.rs L2572-2585). Foundry charges it to the caller.
///  (b) EIP-8038 cold account access is 3000, not 2600 (gas_cost.rs L287, L337-343): +400 per distinct cold callee.
///  (c) EIP-8250 KEYED_NONCE_FIRST_USE_GAS = 20,000 charged inside the delegatecalled APPROVE helper frame
///      (vm.rs L1983-1986), subject to the 63/64 rule at that DELEGATECALL.
///  (d) EIP-8038 SSTORE: STORAGE_WRITE 10,000 instead of Prague's 2,900 (gas_cost.rs L296, L668-690): +7,200 warm.
/// Any out-of-gas anywhere in the prefix trace is a rejection (sidecar frameTx.ts OUT_OF_GAS L660-672;
/// ERC-8421 OPCODES-040; PR#6 OP-020).
contract DevnetGasReview is ReviewBase {
    uint256 internal constant COLD_DEVNET = 3_000;
    uint256 internal constant WARM = 100;
    uint256 internal constant COLD_SURCHARGE = 400; // 3000 - 2600
    /// Distinct accounts the pay frame touches for the first time in the tx (all cold on chain 1337):
    /// TXPARAM, FRAMEPARAM, FRAMEDATALOAD, APPROVE helpers and the registry.
    uint256 internal constant COLD_CALLEES = 5;
    uint256 internal constant AMSTERDAM_SSTORE_EXTRA = 7_200; // warm, value change: (100 + 10000) - 2900

    function _coolAll() internal {
        vm.cool(address(pm));
        vm.cool(address(registry));
        for (uint256 n = 1; n <= 7; n++) {
            vm.cool(helperAt(address(pm), n));
        }
    }

    function _tryVerify(uint256 g) internal returns (bool ok) {
        _coolAll();
        uint256 snap = vm.snapshotState();
        vm.prank(EP);
        (ok,) = address(pm).call{gas: g}(abi.encodeCall(PM.verifyAndPay, ()));
        vm.revertToState(snap);
    }

    function _minVerifyGas() internal returns (uint256 lo) {
        uint256 hi = 200_000;
        lo = 1_000;
        require(_tryVerify(hi), "verify fails even with 200k");
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (_tryVerify(mid)) hi = mid;
            else lo = mid + 1;
        }
    }

    /// Pay frame, first sponsored tx of the day (first use of the keyed nonce), lean helpers, real registry.
    function test_payFrame_fitsDeclaredLimit_underDevnetPricing() public {
        _buildValid(0, 2);
        leanFrameTx();
        vm.etch(helperAt(address(pm), 1), address(new BurningApprove()).code);

        uint256 calleeMin = _minVerifyGas(); // gas the callee needs in Foundry (Prague costs, cold callees)
        uint256 devnetNeed = calleeMin + COLD_DEVNET + COLD_CALLEES * COLD_SURCHARGE;
        emit log_named_uint("pay frame: min callee gas in Foundry (lean helpers, cold, 20k first-use)", calleeMin);
        emit log_named_uint("pay frame: devnet need incl. 3000 entry + 5x400 EIP-8038", devnetNeed);
        emit log_named_uint("pay frame: declared limits.execution", PAY_LIMIT);
        emit log_named_int("pay frame: margin", int256(PAY_LIMIT) - int256(devnetNeed));
        assertLe(devnetNeed, PAY_LIMIT, "pay frame would run out of gas on chain 1337 -> OUT_OF_GAS rejection");

        // Same check with the builder's frozen (more expensive) stand-ins.
        freezeFrameTx(address(pm));
        uint256 frozenMin = _minVerifyGas();
        emit log_named_uint(
            "pay frame: devnet need with frozen stand-ins", frozenMin + COLD_DEVNET + COLD_CALLEES * COLD_SURCHARGE
        );

        // Most conservative bound: Foundry's reported gasTotalUsed for an UNCAPPED call (frozen stand-ins). Foundry
        // reports ~50.5k here although the identical opcode sequence (3,019 steps) also succeeds under a 30k cap, so
        // this over-states the need; it is the figure the builder's GasBudgetTest (53,416) is based on.
        _coolAll();
        uint256 snap = vm.snapshotState();
        vm.prank(EP);
        pm.verifyAndPay();
        uint256 used = vm.lastCallGas().gasTotalUsed;
        vm.revertToState(snap);
        uint256 worst = used + COLD_DEVNET + COLD_CALLEES * COLD_SURCHARGE;
        emit log_named_uint("pay frame: worst-case devnet need (uncapped report, 20k burn included)", worst);
        assertLe(worst, PAY_LIMIT, "worst case exceeds the declared pay-frame limit");
    }

    /// The 63/64 rule at the approve DELEGATECALL: with exactly the devnet budget the helper still gets >= 20,000.
    function test_payFrame_exactDevnetBudget_succeeds() public {
        _buildValid(0, 2);
        leanFrameTx();
        vm.etch(helperAt(address(pm), 1), address(new BurningApprove()).code);
        assertTrue(_tryVerify(PAY_LIMIT - COLD_DEVNET - COLD_CALLEES * COLD_SURCHARGE));
    }

    /// Sidecar structural rule (validationPrefix.ts L250-299, FRA-040, EIP-8141 rule 6): declared prefix sum.
    function test_prefixDeclaredGas_headroom() public pure {
        uint256 sum = EXPIRY_LIMIT + SENDER_VERIFY_LIMIT + PAY_LIMIT + SECP256K1_SIG_COST;
        assertEq(sum, 99_800);
        assertLe(sum, 100_000);
        // Any one of these breaks admission: a P256 sender (6,700), a second signature, or pay limit +201.
        assertGt(sum - SECP256K1_SIG_COST + 6_700, 100_000);
    }

    /// consume() in frame 4 on chain 1337: pm, helpers and the lastSeen slot are already warm (touched by frame 2;
    /// the warm set is shared across frames, EIP-8141 at 4a9ad32c L394-400), entry costs 100, SSTORE costs +7,200.
    /// The paymaster only requires CONSUME_GAS_MIN = 50,000; check that this floor really covers consume().
    function test_consume_fitsFloor_underDevnetPricing() public {
        _buildValid(0, 2);
        leanFrameTx();
        vm.etch(helperAt(address(pm), 1), address(new BurningApprove()).code);
        vm.prank(EP);
        pm.verifyAndPay(); // warms pm, helpers, registry, slot 0 as frame 2 would

        uint256 deadline = block.timestamp + 840;
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), 0, 4);
        sim.setFrame(2, _frame(address(pm), PAY_LIMIT, 1, 1, abi.encodePacked(PM.verifyAndPay.selector), 1));
        leanFrameTx();
        vm.warp(block.timestamp + 6); // new block: lastSeen changes, so the SSTORE happens

        uint256 lo = 1_000;
        uint256 hi = 100_000;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            uint256 snap = vm.snapshotState();
            vm.prank(EP);
            (bool ok,) = address(pm).call{gas: mid}(abi.encodeCall(PM.consume, ()));
            vm.revertToState(snap);
            if (ok) hi = mid;
            else lo = mid + 1;
        }
        uint256 devnetNeed = lo + WARM + AMSTERDAM_SSTORE_EXTRA;
        emit log_named_uint("consume: min callee gas in Foundry (warm)", lo);
        emit log_named_uint("consume: devnet need incl. entry + EIP-8038 SSTORE", devnetNeed);
        assertLe(devnetNeed, pm.CONSUME_GAS_MIN(), "CONSUME_GAS_MIN does not cover consume() on chain 1337");
    }
}
