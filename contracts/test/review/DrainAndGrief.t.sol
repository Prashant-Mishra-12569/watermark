// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {WatermarkQuotaPaymaster as PM} from "../../src/WatermarkQuotaPaymaster.sol";
import {QuotaPaymasterBase} from "../WatermarkQuotaPaymaster.t.sol";

// Review (lens: drain / grief). Every test in this file FAILED against the pre-fix WatermarkQuotaPaymaster
// (checked during the review, before the fix landed) and passes with the fee pin (SPONSORED_MAX_FEE /
// SPONSORED_TIP) and MIN_LIFETIME. They reuse the builder's FrameTxSim stand-ins.
//
// Run: forge test --match-path 'test/review/*' -vv

// R1. The paymaster never bounds the fee per gas (TXPARAM 0x03 max_priority_fee_per_gas, 0x04 max_fee_per_gas),
// only max_cost. The devnet base fee is 7 wei (eth_getBlockByNumber latest, 2026-11-06), so almost all of a
// sponsored tx's cost can be a tip to the block's fee recipient that the sender picks freely
// (EIP-8141@4a9ad32c L479-490: charged_fee = gas_used * effective_gas_price, payer_refund = max_cost - charged_fee).
// A SENDER frame that halts exceptionally burns its whole limit (EIP-8141 L206-213), so a stamped wallet can make
// each of its sponsored txs cost the paymaster close to MAX_COST_PER_TX at zero cost to itself.
contract ReviewFeeDrainTest is QuotaPaymasterBase {
    // script/DeployQuotaPaymaster.s.sol defaults
    uint32 internal constant DEPLOY_QUOTA = 20;
    uint256 internal constant DEPLOY_MAX_COST = 5e14;
    uint256 internal constant DEPLOY_FUNDING = 0.05 ether;
    uint256 internal constant DEVNET_BASE_FEE = 7; // eth_getBlockByNumber latest, 2026-11-06

    function setUp() public override {
        super.setUp();
        vm.prank(owner);
        pm = new PM{value: DEPLOY_FUNDING}(
            address(registry), APP_ID, DEPLOY_QUOTA, DEPLOY_MAX_COST, address(staking), FEE, TIP
        );
        mockFrameTx(address(pm));
    }

    // One stamped wallet, 30 minutes before UTC midnight: today's 20 keys plus tomorrow's 20 keys
    // (EF_PAYMASTER_DESIGN.md §3 day-boundary slack). Each tx tips 5 gwei/gas on a 7-wei base fee, declares
    // max_cost == MAX_COST_PER_TX, and gives the bulk of its gas to a SENDER frame that halts.
    // The sidecar holds one pending tx per (sender, key), and the miner bundles every 10 s, so two keys
    // in parallel take about 20 x 10 s = 200 s of wall time.
    function test_oneStampedWalletBurnsMoreThanDeployFundingWithinAnHour() public {
        uint256 day = T0 / 1 days;
        uint256 midnight = (day + 1) * 1 days;
        vm.warp(midnight - 30 minutes);
        pm.poke(); // a fresh clock, as the relayer keeps it

        uint256 tip = 5 gwei; // maxPriorityFeePerGas == maxFeePerGas, as the sender script also sends (dryrun.out L165-168)
        uint256 totalGas = DEPLOY_MAX_COST / tip; // 400,000
        uint256 approved;
        for (uint256 d = day; d <= day + 1; d++) {
            for (uint256 seq; seq < DEPLOY_QUOTA; seq++) {
                uint256 deadline = d == day ? block.timestamp + 120 : midnight + 60;
                _buildTx(user, deadline, pm.quotaKey(d), seq, 2);
                // frame 3: 211k of the 400k, a call into code that loops until out of gas (full limit charged)
                sim.setFrame(3, _frame(target, 211_000, 2, 0, hex"", 1));
                sim.setTx(0x03, tip);
                sim.setTx(0x04, tip);
                sim.setTx(0x06, totalGas * tip);
                vm.prank(EP);
                try pm.verifyAndPay() {
                    approved++;
                } catch {}
            }
        }

        // Burned gas per tx: frame 3 211k (halt) + intrinsic 12k + sig 2.8k + pay 40-53k + first-use 20k (first tx
        // of each key only) + consume 20-44k ~= 300-343k of 400k. Count a conservative 75% of max_cost, charged at
        // 5 gwei/gas (refund = max_cost - charged). An attacker can push it higher by shrinking frames 2 and 4.
        uint256 burned = approved * DEPLOY_MAX_COST * 75 / 100;
        emit log_named_uint("sponsored txs approved for one wallet within 1h", approved);
        emit log_named_uint("wei the paymaster pays (mostly tip to the fee recipient)", burned);
        emit log_named_uint("deploy funding (wei)", DEPLOY_FUNDING);
        assertLe(burned, DEPLOY_FUNDING, "one stamped wallet empties the paymaster in under an hour");
    }

    // Positive bound with the fix: the attacker must use the pinned fees, so every approved tx is charged at
    // effective_gas_price = min(max_fee, base + tip) = base + SPONSORED_TIP. Even if all 40 txs burn their whole
    // max_gas = max_cost / max_fee, the paymaster pays a tiny fraction of its funding.
    function test_worstCaseBurnWithPinnedFeesIsNegligible() public {
        uint256 day = T0 / 1 days;
        uint256 midnight = (day + 1) * 1 days;
        vm.warp(midnight - 30 minutes);
        pm.poke();
        uint256 approved;
        for (uint256 d = day; d <= day + 1; d++) {
            for (uint256 seq; seq < DEPLOY_QUOTA; seq++) {
                uint256 deadline = d == day ? block.timestamp + 840 : midnight + 840;
                _buildTx(user, deadline, pm.quotaKey(d), seq, 2);
                sim.setTx(0x06, DEPLOY_MAX_COST);
                vm.prank(EP);
                try pm.verifyAndPay() {
                    approved++;
                } catch {}
            }
        }
        uint256 maxGas = DEPLOY_MAX_COST / FEE;
        uint256 burned = approved * maxGas * (DEVNET_BASE_FEE + TIP);
        emit log_named_uint("sponsored txs approved for one wallet around midnight", approved);
        emit log_named_uint("worst-case wei burned (all gas, pinned fees)", burned);
        assertEq(approved, 2 * DEPLOY_QUOTA, "day-boundary slack still allows 2N");
        assertLe(burned, DEPLOY_FUNDING / 1000, "worst case < 0.1% of funding");
    }
}

// R2. Zero-cost reputation griefing on the deployed sidecar (forshtat/mempool-workshop-sidecar@2e22ff0).
// The sidecar bumps the payer's `seen` on every admission AND on every same-slot replacement
// (MempoolService/service.ts L305-312, outside the if/else at L246-303), and bumps `included` only for a
// successful receipt (service.ts L186-189). The paymaster is BANNED once floor(seen/10) > included + 50
// (entities/ReputationEntry.ts L53-58; config.ts L601-603), after which checkStake refuses it for every
// sponsored tx (ReputationService.ts L164-169). Neither path below consumes quota or costs the attacker gas.
contract ReviewReputationGriefTest is QuotaPaymasterBase {
    // (a) Admission simulates at the head header's timestamp (ethrex@9aa3645d crates/vm/backends/levm/mod.rs
    // setup_env: `timestamp: block_header.timestamp`; ethrex.rs simulate_prefix uses the latest header), and
    // PREFIX-080 only drops a tx whose deadline is already in the past. A deadline equal to the head time is
    // admitted (seen++), the next block is 6 s later, so the expiry frame reverts there, the tx is never
    // included, and revalidation cancels it (BundlingService/reconciliation.ts L423-462). The keyed-nonce seq
    // is untouched, so the same wallet repeats this every block: ~600 seen/hour, BANNED after ~510.
    // The paymaster accepts any deadline >= nothing; it should demand a minimum remaining lifetime against its
    // own clock (and the relayer keep lastSeen fresh), so a tx it approves is still includable for a while.
    function test_deadlineThatExpiresBeforeTheNextSlotIsRejected() public {
        // head time == lastSeen == T0 (set in the constructor at T0)
        uint256 deadline = block.timestamp + 1; // < one 6 s devnet slot of life
        _buildTx(user, deadline, pm.quotaKey(deadline / 1 days), 0, 2);
        vm.expectRevert();
        _verify();
    }

    // (a') Follow-up found while fixing (a): poke() is public and lastSeen only grows, so a pending tx signed with the
    // minimum deadline E = lastSeen + MIN_LIFETIME is broken by ANY later lastSeen advance (inclusion-time VERIFY or
    // the sidecar's per-block revalidation then reverts DeadlineTooSoon and the tx is cancelled: seen++, no
    // included). With per-block lastSeen this was one free `seen` per block again. lastSeen now moves in whole
    // TICKs, so the attacker (poking every block, resubmitting after every cancel) gets at most one cancel per TICK.
    function test_selfPokeCancelsAtMostOncePerTick() public {
        uint256 cancels;
        bool pending;
        uint256 pendingDeadline;
        for (uint256 dt = 30; dt <= 1 hours; dt += 30) {
            // a poke every 30 s (finer steps only cost test gas)
            vm.warp(T0 + dt);
            if (!pending) {
                pendingDeadline = uint256(pm.lastSeen()) + pm.MIN_LIFETIME(); // minimum the paymaster accepts
                pending = true;
            }
            pm.poke(); // attacker's own plain tx, ~26k gas at 7 wei
            _buildTx(user, pendingDeadline, pm.quotaKey(pendingDeadline / 1 days), 0, 2);
            vm.prank(EP);
            try pm.verifyAndPay() {}
            catch {
                cancels++;
                pending = false;
            }
        }
        emit log_named_uint("cancels the attacker can cause in 1 h with one (wallet, key)", cancels);
        assertLe(cancels, 1 hours / pm.TICK(), "at most one per TICK");
    }

    // (b) MempoolEntry.canReplace (entities/FrameTxMempoolEntry.ts L175-191) accepts a same-(sender, keys, seq)
    // replacement when both fees are >= 110% of the old ones, and every accepted replacement is a fresh `seen`
    // for the payer. The paymaster accepts any fee pair, so one pending slot can be replaced ~200 times
    // (10 wei -> MAX_COST_PER_TX / gas at +10% each), then left to expire as in (a). Pinning
    // max_fee_per_gas / max_priority_fee_per_gas to fixed values in VERIFY makes every replacement impossible.
    function test_sameSlotFeeBumpsAreNotAllAccepted() public {
        uint256 deadline = block.timestamp + 120;
        uint256 key = pm.quotaKey(deadline / 1 days);
        uint256 fee = 10;
        uint256 accepted;
        for (uint256 i; i < 30; i++) {
            _buildTx(user, deadline + i, key, 0, 2); // same sender, key and seq: a replacement each time
            sim.setTx(0x03, 0); // tip 0 passes the sidecar's 110% check trivially (0 >= 0)
            sim.setTx(0x04, fee);
            vm.prank(EP);
            try pm.verifyAndPay() {
                accepted++;
            } catch {}
            fee = fee * 11 / 10 + 1;
        }
        emit log_named_uint("fee levels VERIFY accepts for one pending slot", accepted);
        assertLe(accepted, 1, "every accepted fee level is one more `seen` for the paymaster");
    }

    // (b') The same check uses integer division: for max_fee_per_gas <= 9 wei, old * 11 / 10 == old, so an
    // identical-fee resubmission with any other change (a new deadline) is an accepted replacement. On the
    // devnet (base fee 7 wei) a 7-9 wei max fee is includable, so this needs no fee growth at all.
    function test_maxFeeWhereTheReplacementRuleRoundsToZeroIsRejected() public {
        _buildValid(0);
        sim.setTx(0x03, 0);
        sim.setTx(0x04, 9);
        vm.expectRevert();
        _verify();
    }
}
