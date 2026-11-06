// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

/// The test EVM has no frame opcodes, so (as in the workshop's contracts/test/HegotaMocks.sol) we vm.etch stand-ins
/// at the addresses HegotaSupport's constructor CREATEs its helpers at. ERC8421_WORKSHOP order: nonce 1 Approve,
/// 2 TxParam, 3 FrameDataLoad, 4 FrameDataCopy, 5 FrameParam, 6 SigParam, 7 SigDataCopy.
/// Unlike the workshop's fixed-answer mocks, these read a simulated frame transaction from FrameTxSim, so one test
/// can describe the whole tx (frames, nonce keys, deadline) and the paymaster sees it through the same helper ABI.
abstract contract HegotaMocks is Test {
    uint256 internal constant APPROVE_NONCE = 1;
    uint256 internal constant TXPARAM_NONCE = 2;
    uint256 internal constant FRAMEDATALOAD_NONCE = 3;
    uint256 internal constant FRAMEPARAM_NONCE = 5;

    FrameTxSim internal sim;

    function helperAt(address account, uint256 nonce) internal view returns (address) {
        return vm.computeCreateAddress(account, nonce);
    }

    /// Mocks every helper the paymaster uses. approve() emits Approved(scope) from `account` (delegatecall).
    function mockFrameTx(address account) internal {
        if (address(sim) == address(0)) sim = new FrameTxSim();
        vm.etch(helperAt(account, APPROVE_NONCE), address(new MockApprove()).code);
        vm.etch(helperAt(account, TXPARAM_NONCE), address(new MockTxParam(sim)).code);
        vm.etch(helperAt(account, FRAMEDATALOAD_NONCE), address(new MockFrameDataLoad(sim)).code);
        vm.etch(helperAt(account, FRAMEPARAM_NONCE), address(new MockFrameParam(sim)).code);
    }

    /// approve() that neither logs nor writes, so the whole VERIFY path can run under STATICCALL.
    function mockSilentApprove(address account) internal {
        vm.etch(helperAt(account, APPROVE_NONCE), address(new MockApproveSilent()).code);
    }
}

/// A simulated EIP-8141 frame transaction, answering like ethrex 9aa3645d (frame_tx.rs load_tx_param / FRAMEPARAM):
/// unknown TXPARAM ids and out-of-range frame indexes halt; FRAMEPARAM STATUS halts for the current or a later frame.
contract FrameTxSim {
    struct Frame {
        address target; // resolved target
        uint256 gasLimit; // limits.execution
        uint8 mode;
        uint8 flags;
        bytes data;
        uint8 status; // for earlier frames: 0 fail, 1 ok, 2 skipped
        uint256 value;
        uint256 stateLimit;
    }

    mapping(uint256 => uint256) internal tp;
    mapping(uint256 => bool) internal tpSet;
    Frame[] internal frames;

    function reset() external {
        delete frames;
        for (uint256 i; i <= 0x12; i++) {
            tpSet[i] = false;
            tp[i] = 0;
        }
    }

    function setTx(uint256 id, uint256 v) external {
        tp[id] = v;
        tpSet[id] = true;
    }

    function unsetTx(uint256 id) external {
        tpSet[id] = false;
    }

    function pushFrame(Frame calldata f) external {
        frames.push(f);
    }

    function setFrame(uint256 i, Frame calldata f) external {
        frames[i] = f;
    }

    function getFrame(uint256 i) external view returns (Frame memory) {
        return frames[i];
    }

    function popFrame() external {
        frames.pop();
    }

    function txparam(uint256 id) external view returns (uint256) {
        if (id == 0x09) return frames.length;
        require(tpSet[id], "TXPARAM halt");
        return tp[id];
    }

    function frameparam(uint256 i, uint256 p) external view returns (uint256) {
        require(i < frames.length, "FRAMEPARAM halt: index");
        Frame storage f = frames[i];
        if (p == 0x00) return uint160(f.target);
        if (p == 0x01) return f.gasLimit;
        if (p == 0x02) return f.mode;
        if (p == 0x03) return f.flags;
        if (p == 0x04) return f.data.length;
        if (p == 0x05) {
            require(i < tp[0x0A], "FRAMEPARAM halt: status of current/future frame");
            return f.status;
        }
        if (p == 0x06) return f.flags & 3;
        if (p == 0x07) return (f.flags >> 2) & 1;
        if (p == 0x08) return f.value;
        if (p == 0x09) return f.stateLimit;
        revert("FRAMEPARAM halt: param");
    }

    function framedataload(uint256 offset, uint256 i) external view returns (bytes32 w) {
        require(i < frames.length, "FRAMEDATALOAD halt: index");
        bytes storage d = frames[i].data;
        for (uint256 k; k < 32; k++) {
            uint256 j = offset + k;
            if (j < d.length) w |= bytes32(uint256(uint8(d[j])) << (8 * (31 - k)));
        }
    }
}

function _ret(uint256 w) pure {
    assembly ("memory-safe") {
        mstore(0, w)
        return(0, 32)
    }
}

contract MockTxParam {
    FrameTxSim internal immutable SIM;

    constructor(FrameTxSim s) {
        SIM = s;
    }

    fallback() external {
        _ret(SIM.txparam(abi.decode(msg.data, (uint256))));
    }
}

/// Operands as HegotaSupport sends them: abi.encode(frameIndex, param).
contract MockFrameParam {
    FrameTxSim internal immutable SIM;

    constructor(FrameTxSim s) {
        SIM = s;
    }

    fallback() external {
        (uint256 i, uint256 p) = abi.decode(msg.data, (uint256, uint256));
        _ret(SIM.frameparam(i, p));
    }
}

/// Operands as HegotaSupport sends them: abi.encode(offset, frameIndex).
contract MockFrameDataLoad {
    FrameTxSim internal immutable SIM;

    constructor(FrameTxSim s) {
        SIM = s;
    }

    fallback() external {
        (uint256 off, uint256 i) = abi.decode(msg.data, (uint256, uint256));
        _ret(uint256(SIM.framedataload(off, i)));
    }
}

contract MockApprove {
    event Approved(uint256 scope);

    fallback() external payable {
        emit Approved(abi.decode(msg.data, (uint256)));
    }
}

contract MockApproveSilent {
    fallback() external payable {}
}

// ---------------------------------------------------------------------------------------------------------------
// Frozen stand-ins for gas measurement: the answers of the current FrameTxSim state baked into immutables, so a
// helper call costs about what the real 12-15 byte Yul helper costs (warm CALL + a few hundred gas of Solidity
// dispatch, versus ~30 gas for the real helper). Only frames 0..4 and offset-0 data words are supported.
// ---------------------------------------------------------------------------------------------------------------

abstract contract FrozenMocks is HegotaMocks {
    /// Replaces the TXPARAM / FRAMEPARAM / FRAMEDATALOAD stand-ins of `account` with frozen copies of `sim`.
    function freezeFrameTx(address account) internal {
        vm.etch(helperAt(account, TXPARAM_NONCE), address(new FrozenTxParam(sim)).code);
        vm.etch(helperAt(account, FRAMEPARAM_NONCE), address(new FrozenFrameParam(sim)).code);
        vm.etch(helperAt(account, FRAMEDATALOAD_NONCE), address(new FrozenFrameDataLoad(sim)).code);
    }
}

contract FrozenTxParam {
    uint256 internal immutable P01;
    uint256 internal immutable P02;
    uint256 internal immutable P03;
    uint256 internal immutable P04;
    uint256 internal immutable P06;
    uint256 internal immutable P08;
    uint256 internal immutable P09;
    uint256 internal immutable P0A;
    uint256 internal immutable P0E;
    uint256 internal immutable P10;

    constructor(FrameTxSim s) {
        (P01, P02, P06, P08) = (s.txparam(0x01), s.txparam(0x02), s.txparam(0x06), s.txparam(0x08));
        (P09, P0A, P0E, P10) = (s.txparam(0x09), s.txparam(0x0A), s.txparam(0x0E), s.txparam(0x10));
        (P03, P04) = (s.txparam(0x03), s.txparam(0x04));
    }

    fallback() external {
        uint256 p;
        assembly ("memory-safe") { p := calldataload(0) }
        uint256 r;
        if (p == 0x01) r = P01;
        else if (p == 0x02) r = P02;
        else if (p == 0x03) r = P03;
        else if (p == 0x04) r = P04;
        else if (p == 0x06) r = P06;
        else if (p == 0x08) r = P08;
        else if (p == 0x09) r = P09;
        else if (p == 0x0A) r = P0A;
        else if (p == 0x0E) r = P0E;
        else if (p == 0x10) r = P10;
        else revert();
        _ret(r);
    }
}

contract FrozenFrameParam {
    // per frame: target << 96 | mode << 88 | flags << 80 | status << 72 | dataLen << 56
    uint256 internal immutable F0;
    uint256 internal immutable F1;
    uint256 internal immutable F2;
    uint256 internal immutable F3;
    uint256 internal immutable F4;
    uint256 internal immutable G0;
    uint256 internal immutable G1;
    uint256 internal immutable G2;
    uint256 internal immutable G3;
    uint256 internal immutable G4;
    uint256 internal immutable CUR;

    function _pack(FrameTxSim s, uint256 i) private view returns (uint256) {
        FrameTxSim.Frame memory f = s.getFrame(i);
        return uint256(uint160(f.target)) << 96 | uint256(f.mode) << 88 | uint256(f.flags) << 80 | uint256(f.status)
            << 72 | f.data.length << 56;
    }

    constructor(FrameTxSim s) {
        (F0, F1, F2, F3, F4) = (_pack(s, 0), _pack(s, 1), _pack(s, 2), _pack(s, 3), _pack(s, 4));
        (G0, G1, G2) = (s.getFrame(0).gasLimit, s.getFrame(1).gasLimit, s.getFrame(2).gasLimit);
        (G3, G4) = (s.getFrame(3).gasLimit, s.getFrame(4).gasLimit);
        CUR = s.txparam(0x0A);
    }

    fallback() external {
        uint256 i;
        uint256 p;
        assembly ("memory-safe") {
            i := calldataload(0)
            p := calldataload(32)
        }
        uint256 w = i == 0 ? F0 : i == 1 ? F1 : i == 2 ? F2 : i == 3 ? F3 : i == 4 ? F4 : type(uint256).max;
        if (w == type(uint256).max) revert();
        uint256 r;
        if (p == 0x00) {
            r = w >> 96;
        } else if (p == 0x01) {
            r = i == 0 ? G0 : i == 1 ? G1 : i == 2 ? G2 : i == 3 ? G3 : G4;
        } else if (p == 0x02) {
            r = (w >> 88) & 0xff;
        } else if (p == 0x03) {
            r = (w >> 80) & 0xff;
        } else if (p == 0x04) {
            r = (w >> 56) & 0xffff;
        } else if (p == 0x05) {
            if (i >= CUR) revert();
            r = (w >> 72) & 0xff;
        } else if (p == 0x06) {
            r = (w >> 80) & 3;
        } else {
            revert();
        }
        _ret(r);
    }
}

contract FrozenFrameDataLoad {
    bytes32 internal immutable W0;
    bytes32 internal immutable W2;
    bytes32 internal immutable W4;

    constructor(FrameTxSim s) {
        (W0, W2, W4) = (s.framedataload(0, 0), s.framedataload(0, 2), s.framedataload(0, 4));
    }

    fallback() external {
        uint256 off;
        uint256 i;
        assembly ("memory-safe") {
            off := calldataload(0)
            i := calldataload(32)
        }
        if (off != 0) revert();
        _ret(uint256(i == 0 ? W0 : i == 2 ? W2 : i == 4 ? W4 : bytes32(0)));
    }
}
