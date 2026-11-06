// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {WatermarkQuotaPaymaster as PM} from "../src/WatermarkQuotaPaymaster.sol";
import {FrozenMocks, FrameTxSim} from "./mocks/HegotaMocks.sol";
import {NaiveStakingRegistryStandIn} from "./mocks/NaiveStakingRegistryStandIn.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

abstract contract QuotaPaymasterBase is FrozenMocks {
    event Approved(uint256 scope);
    event Sponsored(address indexed wallet, uint64 indexed day, uint256 seq, bytes32 sigHash);

    address internal constant EP = 0x00000000000000000000000000000000000000AA;
    address internal constant EXPIRY = 0x0000000000000000000000000000000000008141;
    uint256 internal constant APP_ID = 0x00c0ffee;
    uint32 internal constant QUOTA = 3;
    uint256 internal constant MAX_COST = 2e15; // wei
    // Pinned fees (DeployQuotaPaymaster.s.sol defaults): max fee 1 gwei, tip 1e6 wei (ethrex MIN_GAS_TIP).
    uint256 internal constant FEE = 1 gwei;
    uint256 internal constant TIP = 1_000_000;
    // 2026-11-06 10:00:00 UTC; day = T0 / 1 days. A multiple of TICK (300).
    uint256 internal constant T0 = 1_793_959_200;
    // Default deadline offset from lastSeen, as tools/ef-sender: MIN_LIFETIME + TICK + 120 = 840 s, so a
    // pending tx survives one lastSeen advance (EF_PAYMASTER_DESIGN.md §2).
    uint256 internal constant DL = 840;

    // Declared frame limits used by tools/ef-sender (sidecar MAX_VERIFY_GAS = 100k over frames 0..2 + sig)
    uint256 internal constant EXPIRY_LIMIT = 5_000;
    uint256 internal constant SENDER_VERIFY_LIMIT = 10_000;
    uint256 internal constant PAY_LIMIT = 82_000;
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
        // The repo's real registry. The verifier is never touched by stampExpiry(), so any address works.
        registry = new WatermarkRegistry(IVerifier(address(0xBEEF)));
        staking = new NaiveStakingRegistryStandIn();
        vm.deal(owner, 1 ether);
        vm.prank(owner);
        pm = new PM{value: 0.1 ether}(address(registry), APP_ID, QUOTA, MAX_COST, address(staking), FEE, TIP);
        mockFrameTx(address(pm));
        _setExpiry(user, APP_ID, uint64(T0 + 30 days));
        require(registry.stampExpiry(user, APP_ID) == uint64(T0 + 30 days), "stamp slot layout");
    }

    /// Storage slot of `stampExpiry` in WatermarkRegistry: caRoot 0, apps 1, sessionUsed 2, nullifierWallet 3.
    uint256 internal constant STAMP_MAPPING_SLOT = 4;

    /// Stamps without a proof: writes stampExpiry[wallet][appId] = keccak(pad(appId) . keccak(pad(wallet) . 4)).
    function _setExpiry(address wallet, uint256 appId, uint64 expiresAt) internal {
        vm.store(address(registry), _stampSlot(wallet, appId), bytes32(uint256(expiresAt)));
    }

    function _stampSlot(address wallet, uint256 appId) internal pure returns (bytes32) {
        return keccak256(abi.encode(appId, keccak256(abi.encode(wallet, STAMP_MAPPING_SLOT))));
    }

    // ------------------------------------------------------------------ tx builders

    function _frame(address t, uint256 gasLimit, uint8 mode, uint8 flags, bytes memory data, uint8 status)
        internal
        pure
        returns (FrameTxSim.Frame memory f)
    {
        f = FrameTxSim.Frame(t, gasLimit, mode, flags, data, status, 0, 0);
    }

    /// The canonical 5-frame tx, as seen from frame `current` (2 = VERIFY, 4 = consume).
    function _buildTx(address sender, uint256 deadline, uint256 key, uint256 seq, uint256 current) internal {
        sim.reset();
        sim.pushFrame(_frame(EXPIRY, EXPIRY_LIMIT, 1, 0, abi.encodePacked(uint64(deadline)), 1));
        sim.pushFrame(_frame(sender, SENDER_VERIFY_LIMIT, 1, 2, "", 1));
        sim.pushFrame(_frame(address(pm), PAY_LIMIT, 1, 1, abi.encodePacked(PM.verifyAndPay.selector), 1));
        sim.pushFrame(_frame(target, 100_000, 2, 0, hex"d09de08a", 1));
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

    function _buildValid(uint256 seq) internal {
        uint256 deadline = block.timestamp + DL;
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), seq, 2);
    }

    function _verify() internal {
        vm.prank(EP);
        pm.verifyAndPay();
    }

    function _expectApproved() internal {
        vm.expectEmit(address(pm));
        emit Approved(1);
    }
}

contract VerifyTest is QuotaPaymasterBase {
    function test_happyPath_approvesPayment() public {
        _buildValid(0);
        _expectApproved();
        _verify();
    }

    function test_lastQuotaSlotStillApproves() public {
        _buildValid(QUOTA - 1);
        _expectApproved();
        _verify();
    }

    function test_quotaExhausted() public {
        _buildValid(QUOTA);
        vm.expectRevert(abi.encodeWithSelector(PM.QuotaExhausted.selector, (T0 + DL) / 1 days, QUOTA));
        _verify();
    }

    function test_unstampedSender() public {
        address bot = makeAddr("bot");
        uint256 deadline = T0 + DL;
        _buildTx(bot, deadline, pm.quotaKey(deadline / 1 days), 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PM.NotStamped.selector, bot, uint64(0), uint64(deadline)));
        _verify();
    }

    function test_stampExpiresBeforeDeadline() public {
        uint256 deadline = T0 + DL;
        _setExpiry(user, APP_ID, uint64(deadline - 1));
        _buildValid(0);
        vm.expectRevert(abi.encodeWithSelector(PM.NotStamped.selector, user, uint64(deadline - 1), uint64(deadline)));
        _verify();
    }

    function test_stampOfAnotherAppDoesNotCount() public {
        _setExpiry(user, APP_ID, 0);
        _setExpiry(user, APP_ID + 1, uint64(T0 + 30 days));
        _buildValid(0);
        vm.expectRevert(abi.encodeWithSelector(PM.NotStamped.selector, user, uint64(0), uint64(T0 + DL)));
        _verify();
    }

    function test_stampValidExactlyAtDeadline() public {
        _setExpiry(user, APP_ID, uint64(T0 + DL));
        _buildValid(0);
        _expectApproved();
        _verify();
    }

    // ---------------------------------------------------------------- frame shape

    function test_missingConsumeFrame() public {
        _buildValid(0);
        sim.popFrame();
        vm.expectRevert(abi.encodeWithSelector(PM.BadFrameCount.selector, 4));
        _verify();
    }

    function test_extraFrame() public {
        _buildValid(0);
        sim.pushFrame(_frame(target, 50_000, 2, 0, "", 0));
        vm.expectRevert(abi.encodeWithSelector(PM.BadFrameCount.selector, 6));
        _verify();
    }

    function test_consumeFrameWrongTarget() public {
        _buildValid(0);
        sim.setFrame(4, _frame(target, CONSUME_LIMIT, 0, 0, abi.encodePacked(PM.consume.selector), 0));
        vm.expectRevert(PM.BadConsumeFrame.selector);
        _verify();
    }

    function test_consumeFrameWrongSelector() public {
        _buildValid(0);
        sim.setFrame(4, _frame(address(pm), CONSUME_LIMIT, 0, 0, abi.encodePacked(PM.poke.selector), 0));
        vm.expectRevert(PM.BadConsumeFrame.selector);
        _verify();
    }

    function test_consumeFrameStarvedOfGas() public {
        _buildValid(0);
        sim.setFrame(4, _frame(address(pm), 49_999, 0, 0, abi.encodePacked(PM.consume.selector), 0));
        vm.expectRevert(PM.BadConsumeFrame.selector);
        _verify();
    }

    function test_consumeFrameWrongMode() public {
        _buildValid(0);
        sim.setFrame(4, _frame(address(pm), CONSUME_LIMIT, 2, 0, abi.encodePacked(PM.consume.selector), 0));
        vm.expectRevert(PM.BadConsumeFrame.selector);
        _verify();
    }

    function test_userFrameAtomicBatchRejected() public {
        _buildValid(0);
        sim.setFrame(3, _frame(target, 100_000, 2, 4, "", 1));
        vm.expectRevert(PM.BadUserFrame.selector);
        _verify();
    }

    function test_userFrameMustBeSenderMode() public {
        _buildValid(0);
        sim.setFrame(3, _frame(target, 100_000, 0, 0, "", 1));
        vm.expectRevert(PM.BadUserFrame.selector);
        _verify();
    }

    function test_noExpiryFrame() public {
        _buildValid(0);
        sim.setFrame(0, _frame(target, EXPIRY_LIMIT, 1, 0, abi.encodePacked(uint64(T0 + DL)), 1));
        vm.expectRevert(PM.NoExpiryFrame.selector);
        _verify();
    }

    function test_payFrameAtWrongIndex() public {
        _buildValid(0);
        sim.setTx(0x0A, 1);
        vm.expectRevert(abi.encodeWithSelector(PM.NotPayFrame.selector, 1));
        _verify();
    }

    // ---------------------------------------------------------------- keys, cost, time

    function test_twoNonceKeysRejected() public {
        _buildValid(0);
        sim.setTx(0x0E, 2);
        vm.expectRevert(abi.encodeWithSelector(PM.BadNonceKeyCount.selector, 2));
        _verify();
    }

    function test_legacyNonceKeyRejected() public {
        _buildValid(0);
        sim.setTx(0x10, 0);
        vm.expectRevert(abi.encodeWithSelector(PM.WrongNonceKey.selector, 0, pm.quotaKey((T0 + DL) / 1 days)));
        _verify();
    }

    function test_maxCostCapped() public {
        _buildValid(0);
        sim.setTx(0x06, MAX_COST + 1);
        vm.expectRevert(abi.encodeWithSelector(PM.MaxCostTooHigh.selector, MAX_COST + 1, MAX_COST));
        _verify();
    }

    /// The bypass a lower time bound exists to stop: claim a future day's quota with a far deadline.
    function test_futureDayQuotaCannotBeClaimed() public {
        uint256 deadline = T0 + 1 days + 60;
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PM.DeadlineTooFar.selector, deadline, T0));
        _verify();
    }

    function test_deadlineAtMaxAheadEdge() public {
        uint256 deadline = T0 + pm.MAX_AHEAD();
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), 0, 2);
        _expectApproved();
        _verify();
    }

    function test_dayRollover() public {
        uint256 day = (T0 + DL) / 1 days;
        _buildValid(QUOTA);
        vm.expectRevert(abi.encodeWithSelector(PM.QuotaExhausted.selector, day, QUOTA));
        _verify();

        // Next UTC day. Before a heartbeat, a deadline in the new day is "too far" from the stale lastSeen.
        vm.warp((day + 1) * 1 days + 30);
        uint256 deadline = block.timestamp + DL;
        _buildTx(user, deadline, pm.quotaKey(day + 1), 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PM.DeadlineTooFar.selector, deadline, T0));
        _verify();

        pm.poke(); // plain tx by the relayer (or any earlier consume())
        assertEq(pm.lastSeen(), block.timestamp / 300 * 300);
        _expectApproved();
        _verify();

        // Yesterday's key no longer matches a deadline in the new day.
        _buildTx(user, deadline, pm.quotaKey(day), 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PM.WrongNonceKey.selector, pm.quotaKey(day), pm.quotaKey(day + 1)));
        _verify();
    }

    // ---------------------------------------------------------------- fees and minimum lifetime (review R1/R2)

    function test_tipAboveSponsoredTipRejected() public {
        _buildValid(0);
        sim.setTx(0x03, 5 gwei);
        vm.expectRevert(abi.encodeWithSelector(PM.WrongFees.selector, FEE, 5 gwei));
        _verify();
    }

    function test_lowerTipAlsoRejected() public {
        _buildValid(0);
        sim.setTx(0x03, 0);
        vm.expectRevert(abi.encodeWithSelector(PM.WrongFees.selector, FEE, 0));
        _verify();
    }

    function test_bumpedMaxFeeRejected() public {
        _buildValid(0);
        sim.setTx(0x04, FEE * 11 / 10);
        vm.expectRevert(abi.encodeWithSelector(PM.WrongFees.selector, FEE * 11 / 10, TIP));
        _verify();
    }

    /// Review R2 follow-up: a deadline at the minimum survives every poke within the same TICK, so self-poking cannot
    /// cancel it more than once per TICK; a deadline at the sender's default (lastSeen + 840) survives one advance.
    function test_minimumDeadlineSurvivesPokesWithinTheTick() public {
        uint256 eMin = T0 + pm.MIN_LIFETIME();
        uint256 eDefault = T0 + DL;
        for (uint256 dt = 6; dt < 300; dt += 6) {
            vm.warp(T0 + dt);
            pm.poke();
        }
        _buildTx(user, eMin, pm.quotaKey(eMin / 1 days), 0, 2);
        _expectApproved();
        _verify();
        vm.warp(T0 + 300); // next TICK: lastSeen advances once
        pm.poke();
        _buildTx(user, eMin, pm.quotaKey(eMin / 1 days), 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PM.DeadlineTooSoon.selector, eMin, T0 + 300));
        _verify();
        _buildTx(user, eDefault, pm.quotaKey(eDefault / 1 days), 0, 2);
        _expectApproved();
        _verify();
    }

    function test_deadlineTooSoon() public {
        uint256 deadline = T0 + pm.MIN_LIFETIME() - 1;
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), 0, 2);
        vm.expectRevert(abi.encodeWithSelector(PM.DeadlineTooSoon.selector, deadline, T0));
        _verify();
    }

    function test_deadlineAtMinLifetimeEdge() public {
        uint256 deadline = T0 + pm.MIN_LIFETIME();
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), 0, 2);
        _expectApproved();
        _verify();
    }

    function test_feeConfigGuards() public {
        vm.expectRevert(abi.encodeWithSelector(PM.BadFeeConfig.selector, 9, 0));
        new PM(address(registry), APP_ID, QUOTA, MAX_COST, address(staking), 9, 0);
        vm.expectRevert(abi.encodeWithSelector(PM.BadFeeConfig.selector, 10, 11));
        new PM(address(registry), APP_ID, QUOTA, MAX_COST, address(staking), 10, 11);
    }

    function test_verifyNotFromEntryPoint() public {
        _buildValid(0);
        vm.expectRevert(PM.NotEntryPoint.selector);
        pm.verifyAndPay();
    }

    function test_quotaKeyLayout() public view {
        uint256 k = pm.quotaKey(20_763);
        assertEq(k >> 96, uint160(address(pm)));
        assertEq(uint64(k), 20_763);
        assertTrue(k != 0);
        assertEq(pm.nonceSlot(user, 20_763), keccak256(abi.encodePacked(bytes32(uint256(uint160(user))), k)));
    }
}

contract ConsumeTest is QuotaPaymasterBase {
    function _buildConsumeCtx() internal returns (uint256 deadline, uint256 key) {
        deadline = block.timestamp + DL;
        key = pm.quotaKey(deadline / 1 days);
        _buildTx(user, deadline, key, 1, 4);
    }

    function test_consumeInsideOurTx() public {
        (uint256 deadline,) = _buildConsumeCtx();
        vm.warp(T0 + 360);
        vm.expectEmit(address(pm));
        emit Sponsored(user, uint64(deadline / 1 days), 1, keccak256("sighash"));
        vm.prank(EP);
        pm.consume();
        assertEq(pm.lastSeen(), T0 + 300, "rounded down to a TICK");
    }

    function test_consumeCalledDirectly() public {
        _buildConsumeCtx();
        vm.expectRevert(PM.NotEntryPoint.selector);
        vm.prank(user);
        pm.consume();
    }

    /// Outside a frame transaction the real helpers execute TXPARAM (0xB0), which halts. In the test EVM the byte is
    /// an undefined opcode, which halts the same way.
    function test_consumeOutsideFrameTx() public {
        vm.prank(owner);
        PM fresh = new PM(address(registry), APP_ID, QUOTA, MAX_COST, address(staking), FEE, TIP);
        vm.prank(EP);
        vm.expectRevert();
        fresh.consume();
    }

    function test_consumeWhenSomeoneElsePaid() public {
        _buildConsumeCtx();
        // frame 2 is the sender paying for itself, not us
        sim.setFrame(2, _frame(user, PAY_LIMIT, 1, 1, "", 1));
        vm.expectRevert(PM.NotSponsoredByUs.selector);
        vm.prank(EP);
        pm.consume();
    }

    function test_consumeWhenOurVerifyFrameCalledAView() public {
        _buildConsumeCtx();
        sim.setFrame(2, _frame(address(pm), PAY_LIMIT, 1, 1, abi.encodePacked(bytes4(keccak256("lastSeen()"))), 1));
        vm.expectRevert(PM.NotSponsoredByUs.selector);
        vm.prank(EP);
        pm.consume();
    }

    function test_consumeAtWrongIndex() public {
        _buildConsumeCtx();
        sim.setTx(0x0A, 3);
        vm.expectRevert(PM.NotConsumeFrame.selector);
        vm.prank(EP);
        pm.consume();
    }

    function test_pokeIsMonotonic() public {
        vm.warp(T0 + 700);
        pm.poke();
        assertEq(pm.lastSeen(), T0 + 600);
        vm.warp(T0 + 100); // a clock can't go back, but even if a caller could, lastSeen never decreases
        pm.poke();
        assertEq(pm.lastSeen(), T0 + 600);
    }

    /// Review R2 follow-up: however often anyone pokes, lastSeen advances at most once per TICK.
    function test_lastSeenAdvancesAtMostOncePerTick() public {
        uint256 changes;
        uint64 prev = pm.lastSeen();
        for (uint256 dt = 6; dt <= 600; dt += 6) {
            // one poke per 6 s block for 10 minutes
            vm.warp(T0 + dt);
            pm.poke();
            if (pm.lastSeen() != prev) changes++;
            prev = pm.lastSeen();
        }
        assertEq(changes, 2, "two TICK boundaries in 10 minutes");
    }
}

contract StakeTest is QuotaPaymasterBase {
    function test_stakeOnlyOwner() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        vm.expectRevert(PM.NotOwner.selector);
        pm.stake{value: 0.012 ether}(1 days);
    }

    function test_stakeNeedsValue() public {
        vm.prank(owner);
        vm.expectRevert(PM.NoValue.selector);
        pm.stake(1 days);
    }

    function test_stakeDelayAtLeastOneDay() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PM.UnstakeDelayTooShort.selector, uint32(1 days - 1)));
        pm.stake{value: 0.012 ether}(1 days - 1);
    }

    function test_stakeForwardsValueAndStakesThePaymasterItself() public {
        uint256 before = address(pm).balance;
        vm.prank(owner);
        pm.stake{value: 0.012 ether}(1 days);
        (uint256 s, uint32 delay, uint64 wt) = staking.getDepositInfo(address(pm));
        assertEq(s, 0.012 ether);
        assertEq(delay, 1 days);
        assertEq(wt, 0);
        assertEq(address(pm).balance, before); // the value went to the registry, not into the paymaster
        (uint256 ownerStake,,) = staking.getDepositInfo(owner);
        assertEq(ownerStake, 0);
    }

    function test_unlockAndWithdrawStakeBackToPaymaster() public {
        vm.startPrank(owner);
        pm.stake{value: 0.012 ether}(1 days);
        pm.unlockStake();
        vm.warp(block.timestamp + 1 days);
        uint256 before = address(pm).balance;
        pm.withdrawStake(payable(address(pm))); // lands in receive()
        vm.stopPrank();
        assertEq(address(pm).balance, before + 0.012 ether);
    }

    function test_plainTransferTopsUp() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        (bool ok,) = address(pm).call{value: 0.05 ether}("");
        assertTrue(ok);
        assertEq(address(pm).balance, 0.15 ether);
    }

    function test_withdrawOnlyOwner() public {
        vm.prank(user);
        vm.expectRevert(PM.NotOwner.selector);
        pm.withdraw(payable(user), 1);
        vm.prank(owner);
        pm.withdraw(payable(owner), 0.1 ether);
        assertEq(address(pm).balance, 0);
    }
}

/// Runs the VERIFY path under Foundry's opcode tracer and storage recorder, and checks it against the rules the
/// design relies on (EF_PAYMASTER_DESIGN.md §2, §6): EIP-8141 canonical banned list (eip-8141.md L819-853),
/// ERC-7562 PR#6 OP-011/OP-012/OP-080, the sidecar's bannedOpCodes (frameTx.ts L68-87), NESTED_CALL_VALUE,
/// ENTRYPOINT_ACCESS, and the storage rules STO-031 / STO-033 (own slot + one registry slot that is not
/// sender-associated, so the paymaster must be staked; no writes).
contract ValidationRulesAuditTest is QuotaPaymasterBase {
    function _banned(uint8 op) internal pure returns (bool) {
        return op == 0x31 /*BALANCE*/ || op == 0x32 /*ORIGIN*/ || op == 0x3A /*GASPRICE*/ || op == 0x40 /*BLOCKHASH*/
            || op == 0x41 /*COINBASE*/ || op == 0x42 /*TIMESTAMP*/ || op == 0x43 /*NUMBER*/ || op == 0x44 /*PREVRANDAO*/
            || op == 0x45 /*GASLIMIT*/ || op == 0x47 /*SELFBALANCE*/ || op == 0x48 /*BASEFEE*/ || op == 0x49 /*BLOBHASH*/
            || op == 0x4A /*BLOBBASEFEE*/ || op == 0x4B /*SLOTNUM*/ || op == 0x55 /*SSTORE*/ || op == 0x5C /*TLOAD*/
            || op == 0x5D /*TSTORE*/ || op == 0xF0 /*CREATE*/ || op == 0xF2 /*CALLCODE*/ || op == 0xF5 /*CREATE2*/
            || op == 0xFE /*INVALID*/ || op == 0xFF; /*SELFDESTRUCT*/
    }

    function _isCall(uint8 op) internal pure returns (bool) {
        return op == 0xF1 || op == 0xF2 || op == 0xF4 || op == 0xFA;
    }

    /// Returns the first rule violation found in `steps` for code running at `a` or `b`, or 0 if none.
    function _audit(Vm.DebugStep[] memory steps, address a, address b) internal pure returns (uint8 bad, uint256 n) {
        for (uint256 i; i < steps.length; i++) {
            Vm.DebugStep memory s = steps[i];
            if (s.contractAddr != a && s.contractAddr != b) continue;
            n++;
            uint8 op = s.opcode;
            if (_banned(op)) return (op, n);
            if (op == 0x5A && (i + 1 >= steps.length || !_isCall(steps[i + 1].opcode))) return (op, n); // OP-012
            if (op == 0xF1 && s.stack.length > 2 && s.stack[2] != 0) return (op, n); // CALL with value
            if ((op == 0x3B || op == 0x3C || op == 0x3F) && s.stack.length > 0 && s.stack[0] == uint160(EP)) {
                return (op, n); // EXTCODE* on the entry point sentinel
            }
        }
    }

    /// vm.startDebugTraceRecording needs Foundry's step tracer, which only runs at -vvv or higher. At -vv the two
    /// opcode tests skip themselves; run `forge test -vvv --match-contract ValidationRulesAuditTest` for them.
    function _startTrace() internal {
        try vm.startDebugTraceRecording() {}
        catch {
            vm.skip(true, "opcode tracer needs -vvv: forge test -vvv --match-contract ValidationRulesAuditTest");
        }
    }

    function test_verifyPathUsesNoBannedOpcode() public {
        _buildValid(0);
        _startTrace();
        _verify();
        Vm.DebugStep[] memory steps = vm.stopAndReturnDebugTraceRecording();
        (uint8 bad, uint256 n) = _audit(steps, address(pm), address(registry));
        emit log_named_uint("audited opcodes (paymaster + registry)", n);
        assertGt(n, 200, "trace recorded");
        assertEq(bad, 0, "banned opcode in VERIFY path");
    }

    /// Negative control: the auditor does catch TIMESTAMP when the registry's isStamped() runs.
    function test_auditorCatchesIsStampedTimestamp() public {
        _startTrace();
        registry.isStamped(user, APP_ID);
        Vm.DebugStep[] memory steps = vm.stopAndReturnDebugTraceRecording();
        (uint8 bad,) = _audit(steps, address(registry), address(registry));
        assertEq(bad, 0x42, "TIMESTAMP detected");
    }

    function test_verifyStorageAccessIsOwnSlotPlusOneRegistrySlot() public {
        _buildValid(0);
        vm.record();
        _verify();
        (bytes32[] memory pmReads, bytes32[] memory pmWrites) = vm.accesses(address(pm));
        (bytes32[] memory regReads, bytes32[] memory regWrites) = vm.accesses(address(registry));

        assertEq(pmWrites.length, 0, "no paymaster writes");
        assertEq(regWrites.length, 0, "no registry writes");
        assertGt(pmReads.length, 0);
        for (uint256 i; i < pmReads.length; i++) {
            assertEq(pmReads[i], bytes32(0), "only lastSeen (slot 0)");
        }

        // Committed key order stampExpiry[wallet][appId]: keccak(pad(appId) . keccak(pad(wallet) . p)). The final
        // preimage starts with appId, so this is NOT sender-associated: allowed only because the paymaster is staked
        // (ERC-8421 STORAGE-032 read-only, ERC-7562 STO-033; sidecar frameTx.ts L774-775 -> requireStakeSlot).
        bytes32 expected = _stampSlot(user, APP_ID);
        assertEq(regReads.length, 1);
        assertEq(regReads[0], expected, "only the wallet's stamp slot");
    }

    /// VERIFY frames run as STATICCALL (eip-8141.md L380-384). With an approve stand-in that does not log, the whole
    /// path succeeds under STATICCALL, so nothing in it writes state or logs.
    function test_verifyPathRunsUnderStaticcall() public {
        _buildValid(0);
        mockSilentApprove(address(pm));
        vm.prank(EP);
        (bool ok,) = address(pm).staticcall(abi.encodeCall(PM.verifyAndPay, ()));
        assertTrue(ok);
    }
}

/// Gas, measured with every account the frame touches cooled (as in a fresh tx), using frozen stand-in helpers
/// (answers baked into immutables). Each stand-in costs a few hundred gas more than the real Yul helper, so these
/// numbers are a slight upper bound. Not measured on the devnet.
contract GasBudgetTest is QuotaPaymasterBase {
    function _coolAll() internal {
        vm.cool(address(pm));
        vm.cool(address(registry));
        for (uint256 n = 1; n <= 7; n++) {
            vm.cool(helperAt(address(pm), n));
        }
    }

    function test_verifyFitsDeclaredPayFrameLimit() public {
        _buildValid(0);
        freezeFrameTx(address(pm));
        _coolAll();
        vm.prank(EP);
        uint256 g = gasleft();
        pm.verifyAndPay();
        g -= gasleft();
        emit log_named_uint("verifyAndPay gas (frozen helpers, cold)", g);
        uint256 firstUse = 20_000; // EIP-8250 KEYED_NONCE_FIRST_USE_GAS, charged in the approve frame
        emit log_named_uint("+ first-use keyed nonce", g + firstUse);
        emit log_named_uint("declared pay frame limit", PAY_LIMIT);
        assertLe(g + firstUse, PAY_LIMIT, "pay frame limit");
        assertLe(EXPIRY_LIMIT + SENDER_VERIFY_LIMIT + PAY_LIMIT + SECP256K1_SIG_COST, 100_000, "sidecar MAX_VERIFY_GAS");
    }

    function test_consumeFitsMinimumGas() public {
        uint256 deadline = block.timestamp + DL;
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), 0, 4);
        freezeFrameTx(address(pm));
        _coolAll();
        vm.warp(block.timestamp + 6);
        vm.prank(EP);
        uint256 g = gasleft();
        pm.consume();
        g -= gasleft();
        emit log_named_uint("consume gas (frozen helpers, cold)", g);
        emit log_named_uint("CONSUME_GAS_MIN", pm.CONSUME_GAS_MIN());
        assertLe(g, pm.CONSUME_GAS_MIN(), "CONSUME_GAS_MIN covers consume()");
    }
}
