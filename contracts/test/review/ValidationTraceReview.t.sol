// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {WatermarkQuotaPaymaster as PM} from "../../src/WatermarkQuotaPaymaster.sol";
import {HelperCode} from "@forshtat/hegota-support/contracts/generated/HelperCode.sol";
import {Devnet} from "@forshtat/hegota-support/contracts/Devnet.sol";
import {ReviewBase} from "./ReviewBase.sol";

/// Reviewer's independent audit of the pay frame (frame 2) against the rules by role and stake, on the REAL committed
/// WatermarkRegistry bytecode. Run with -vvv (Foundry's step tracer):
///   forge test -vvv --match-path 'test/review/*'
///
/// Rules applied (primary sources at the commits below, fetched 2026-11-06):
/// - EIP-8141 at 4a9ad32c "Banned Opcodes" L819-849 (incl. GAS-only-before-*CALL), SLOAD-only-sender L851,
///   CALL*/EXTCODE* targets must exist L816/L853.
/// - ERC-7562 PR#6  at 74a868cd OP-011 (adds SLOTNUM), OP-012, OP-041, OP-061, OP-080; STO-010/021/031/032/033.
/// - ERC-8421  at 493ba8ac OPCODES-010/030, CALLING-010, STORAGE-010/021/031/032, ASSOC-010/020.
/// - Sidecar  at 2e22ff0 validators/frameTx.ts: bannedOpCodes L68-87, STORAGE L740-808, CODE_ACCESS L810-827,
///   ENTRYPOINT_ACCESS L829-839, NESTED_CALL_VALUE L561-570; utils.ts parseEntitySlots/isSlotAssociatedWith L50-105.
/// - ethrex at 9aa3645d vm.rs check_validation_banned_opcode L4179-4275 (bans SLOTNUM, CALLCODE) and
///   validation_check_sload L4277-4300 (canonical StorageReadNonSender).
contract ValidationTraceReview is ReviewBase {
    struct Access {
        address addr;
        bytes32 slot;
        bool write;
    }

    // ------------------------------------------------------------------ rule tables

    /// EIP-8141 L819-849 banned list, plus SLOTNUM (PR#6 OP-011, ethrex vm.rs L4229) and CALLCODE (ethrex
    /// vm.rs L4262-4264). GAS is handled separately (allowed only directly before a *CALL).
    function _banned(uint8 op) internal pure returns (bool) {
        return op == 0x31 || op == 0x32 || op == 0x3A || op == 0x40 || op == 0x41 || op == 0x42 || op == 0x43
            || op == 0x44 || op == 0x45 || op == 0x47 || op == 0x48 || op == 0x49 || op == 0x4A || op == 0x4B
            || op == 0x55 || op == 0x5C || op == 0x5D || op == 0xF0 || op == 0xF2 || op == 0xF5 || op == 0xF6
            || op == 0xFE || op == 0xFF;
    }

    function _isCall(uint8 op) internal pure returns (bool) {
        return op == 0xF1 || op == 0xF2 || op == 0xF4 || op == 0xFA;
    }

    /// ASSOC-010/020 (erc-8421.md L146-147), PR#6 Definitions 6 (erc-7562.md L101-103), as the sidecar implements
    /// it: slot == pad32(a), or slot in [keccak(p), keccak(p)+128) for a traced KECCAK preimage p that STARTS with
    /// pad32(a) (utils.ts L58-104; the nested "keccak(...||assoc)" rule was removed, L42-45).
    function _associated(bytes32 slot, address a, bytes[] memory pre, uint256 nPre) internal pure returns (bool) {
        bytes32 padded = bytes32(uint256(uint160(a)));
        if (slot == padded) return true;
        for (uint256 i; i < nPre; i++) {
            bytes memory p = pre[i];
            if (p.length < 32) continue;
            bytes32 head;
            assembly ("memory-safe") {
                head := mload(add(p, 32))
            }
            if (head != padded) continue;
            uint256 k = uint256(keccak256(p));
            if (uint256(slot) >= k && uint256(slot) < k + 128) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------ trace capture

    function _startTrace() internal {
        try vm.startDebugTraceRecording() {}
        catch {
            vm.skip(true, "needs -vvv: forge test -vvv --match-path 'test/review/*'");
        }
    }

    function _tracePayFrame() internal returns (Vm.DebugStep[] memory steps) {
        _buildValid(0, 2);
        freezeFrameTx(address(pm)); // helpers answer from immutables: no FrameTxSim SLOAD noise in the trace
        _startTrace();
        vm.prank(EP);
        pm.verifyAndPay();
        steps = vm.stopAndReturnDebugTraceRecording();
    }

    // ------------------------------------------------------------------ tests

    /// Opcodes, calls and code access of everything the pay frame executes on chain (paymaster + real registry).
    /// Helpers are Foundry stand-ins, so their own steps are skipped here; their real devnet runtimes are scanned
    /// statically in test_realHelperRuntimes_noBannedOpcode_and_sizeAbove2.
    function test_payFrame_opcodesAndCalls_obeyRules() public {
        Vm.DebugStep[] memory steps = _tracePayFrame();
        uint256 audited;
        uint256 calls;
        bool[256] memory seen;
        for (uint256 i; i < steps.length; i++) {
            Vm.DebugStep memory s = steps[i];
            if (s.contractAddr != address(pm) && s.contractAddr != address(registry)) continue;
            audited++;
            uint8 op = s.opcode;
            seen[op] = true;
            assertFalse(_banned(op), string.concat("banned opcode 0x", vm.toString(abi.encodePacked(op))));
            if (op == 0x5A) {
                // EIP-8141 L838-840, PR#6 OP-012, sidecar via ethrex tracer L519-529
                assertTrue(i + 1 < steps.length && _isCall(steps[i + 1].opcode), "GAS not directly before *CALL");
            }
            if (op == 0x3B || op == 0x3C || op == 0x3F) {
                // No EXTCODE* at all, so also none on 0xaa (sidecar ENTRYPOINT_ACCESS L829-839)
                revert("EXTCODE* used in VERIFY");
            }
            if (_isCall(op)) {
                calls++;
                address callee = address(uint160(s.stack[1]));
                // CALLING-010 / PR#6 OP-041 / EIP-8141 L853 / sidecar CODE_ACCESS (size <= 2 rejected)
                assertGt(callee.code.length, 2, "call to address without code");
                if (op == 0xF1) assertEq(s.stack[2], 0, "CALL with value (OP-061)");
            }
        }
        emit log_named_uint("pay-frame opcodes audited (paymaster + real registry)", audited);
        emit log_named_uint("CALL-family ops from paymaster/registry", calls);
        assertGt(audited, 300, "trace recorded");
        // 9 TXPARAM + 10 FRAMEPARAM + 2 FRAMEDATALOAD + 1 registry STATICCALL + 1 approve DELEGATECALL
        assertEq(calls, 23, "call count");
        // Opcodes present, for the record: none outside the assigned set (ERC-8421 OPCODES-030, PR#6 OP-013).
        string memory list;
        for (uint256 op; op < 256; op++) {
            if (seen[op]) list = string.concat(list, vm.toString(abi.encodePacked(uint8(op))), " ");
        }
        emit log_named_string("distinct opcodes", list);
    }

    /// Storage of the pay frame, judged with the sidecar's own decision table (frameTx.ts L740-808) for role
    /// "payer", no factory. Result: two slots need stake, our own `lastSeen` (STORAGE-031 / STO-031) and the
    /// committed registry's stampExpiry[wallet][appId] slot, which is not sender-associated (read-only by a staked
    /// entity: STORAGE-032 / STO-033; frameTx.ts L774-775). Nothing is written, nothing is forbidden.
    /// The same trace fails the canonical EIP-8141 rule (L851, ethrex StorageReadNonSender): our story holds.
    function test_payFrame_storage_sidecarDecisionTable() public {
        Vm.DebugStep[] memory steps = _tracePayFrame();

        bytes[] memory pre = new bytes[](64);
        uint256 nPre;
        Access[] memory acc = new Access[](64);
        uint256 nAcc;
        for (uint256 i; i < steps.length; i++) {
            Vm.DebugStep memory s = steps[i];
            // Skip Foundry-only code: helper stand-ins (real helpers touch no storage) and this test contract.
            if (_isHelper(s.contractAddr) || s.contractAddr == address(this)) continue;
            if (s.opcode == 0x20) pre[nPre++] = s.memoryInput; // KECCAK256 preimage, tx-wide like the tracer
            if (s.opcode == 0x54 || s.opcode == 0x55 || s.opcode == 0x5C || s.opcode == 0x5D) {
                acc[nAcc++] = Access(s.contractAddr, bytes32(s.stack[0]), s.opcode == 0x55 || s.opcode == 0x5D);
            }
        }

        uint256 needStake;
        uint256 senderAssoc;
        uint256 registryReads;
        uint256 nonSenderReads;
        for (uint256 i; i < nAcc; i++) {
            Access memory a = acc[i];
            assertFalse(a.write, "write in VERIFY (static frame; STORAGE writes only in deploy/pre_verify)");
            if (a.addr == user || a.addr == EP) continue; // frameTx.ts L745-751
            nonSenderReads++; // EIP-8141 L851: canonical mempool rejects any of these
            if (_associated(a.slot, user, pre, nPre)) {
                senderAssoc++; // allowed unstaked: STORAGE-021 / STO-021 (no deploy frame)
                assertEq(a.addr, address(registry));
                assertEq(a.slot, stampSlot(user, APP_ID));
            } else if (_associated(a.slot, address(pm), pre, nPre) || a.addr == address(pm)) {
                needStake++; // STORAGE-031 / STO-031: only a staked payer may touch it
                assertEq(a.addr, address(pm));
                assertEq(a.slot, bytes32(0), "lastSeen is slot 0");
            } else if (a.addr == address(registry) && a.slot == stampSlot(user, APP_ID)) {
                needStake++; // STORAGE-032 / STO-033: read-only, any slot of a non-entity contract, staked only
                registryReads++;
            } else {
                emit log_named_address("unexpected access at", a.addr);
                emit log_named_bytes32("slot", a.slot);
                emit log_named_uint("keccak preimages captured", nPre);
                for (uint256 k; k < nPre; k++) {
                    emit log_named_bytes("preimage", pre[k]);
                }
                revert("read of a non-associated foreign slot: needs STORAGE-032 (staked) - unexpected");
            }
        }
        emit log_named_uint("storage accesses (excl. stand-ins)", nAcc);
        emit log_named_uint("sender-associated reads (STORAGE-021)", senderAssoc);
        emit log_named_uint("reads that require stake (STORAGE-031 + STORAGE-032)", needStake);
        assertEq(senderAssoc, 0, "committed key order: no sender-associated read");
        assertEq(registryReads, 1, "exactly one registry slot, read-only");
        assertEq(needStake, 2, "staking is REQUIRED: an unstaked paymaster gets 'unstaked payer accessed ...'");
        assertGt(nonSenderReads, 0, "canonical EIP-8141 mempool rejects: SLOAD outside tx.sender (L851)");
    }

    /// The registry key order matters only when unstaked: the committed order m[wallet][appId] gives a slot whose
    /// final preimage starts with pad(appId), so it is NOT sender-associated (needs STORAGE-032 / STO-033 = stake).
    /// The optional flipped order m[appId][wallet] (REGISTRY_CHANGES.md) is. Pure slot arithmetic.
    function test_registryKeyOrder_association() public view {
        bytes[] memory pre = new bytes[](2);
        // committed: stampExpiry[wallet][appId] at slot 4
        bytes32 inner = keccak256(abi.encode(user, uint256(4)));
        pre[0] = abi.encode(user, uint256(4));
        pre[1] = abi.encode(APP_ID, inner);
        bytes32 oldSlot = keccak256(pre[1]);
        assertFalse(_associated(oldSlot, user, pre, 2), "committed order is not sender-associated");
        assertEq(oldSlot, stampSlot(user, APP_ID));
        // optional flip: _stampExpiry[appId][wallet]
        bytes32 inner2 = keccak256(abi.encode(APP_ID, uint256(4)));
        pre[0] = abi.encode(APP_ID, uint256(4));
        pre[1] = abi.encode(user, inner2);
        assertTrue(_associated(keccak256(pre[1]), user, pre, 2), "flipped order is sender-associated");
    }

    /// The helpers that actually run on chain 1337 (HelperCode for Devnet.ERC8421_WORKSHOP): no banned opcode, and
    /// runtime size > 2 bytes, so the sidecar's CODE_ACCESS check (frameTx.ts L810-827) passes for each callee.
    function test_realHelperRuntimes_noBannedOpcode_and_sizeAbove2() public {
        bytes[4] memory inits = [
            HelperCode.approve(Devnet.ERC8421_WORKSHOP),
            HelperCode.txParam(Devnet.ERC8421_WORKSHOP),
            HelperCode.frameDataLoad(Devnet.ERC8421_WORKSHOP),
            HelperCode.frameParam(Devnet.ERC8421_WORKSHOP)
        ];
        for (uint256 h; h < 4; h++) {
            bytes memory init = inits[h];
            address a;
            assembly ("memory-safe") {
                a := create(0, add(init, 0x20), mload(init))
            }
            bytes memory code = a.code;
            emit log_named_bytes("helper runtime", code);
            assertGt(code.length, 2, "CODE_ACCESS: helper size must be > 2");
            for (uint256 i; i < code.length; i++) {
                uint8 op = uint8(code[i]);
                assertFalse(_banned(op) || op == 0x5A, "banned opcode in helper");
                if (op >= 0x60 && op <= 0x7F) i += op - 0x5F; // skip PUSH data
            }
        }
    }
}
