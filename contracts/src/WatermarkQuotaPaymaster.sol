// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {HegotaSupport} from "@forshtat/hegota-support/contracts/HegotaSupport.sol";
import {Devnet} from "@forshtat/hegota-support/contracts/Devnet.sol";
import {Scope, TxParam, FrameParam, FrameMode} from "@forshtat/hegota-support/contracts/Params.sol";
import {IStakingRegistry} from "./interfaces/IStakingRegistry.sol";
import {IStampExpiry} from "./interfaces/IStampExpiry.sol";

/// @title WatermarkQuotaPaymaster (alt mempool devnet, chain 1337)
/// @notice Pays for up to `QUOTA_PER_DAY` frame transactions per UTC day for every wallet that holds a valid
/// Watermark stamp for `APP_ID`. Design and rule citations: docs/EF_PAYMASTER_DESIGN.md.
///
/// Frame shape (5 frames; F9 corrected):
///   0 VERIFY  flags 0    -> 0x...8141 (EXPIRY_VERIFIER)  data = uint64be(deadline)
///   1 VERIFY  flags 0x2  -> null (tx.sender)              the user approves execution (EOA default code)
///   2 VERIFY  flags 0x1  -> this, data = verifyAndPay()   checks below, then APPROVE(PAYMENT)
///   3 SENDER  flags 0    -> any target                    the user's call
///   4 DEFAULT flags 0    -> this, data = consume()        heartbeat + Sponsored event (bookkeeping only)
/// Envelope: nonce_keys = [quotaKey(deadline / 1 days)], nonce_seq < QUOTA_PER_DAY.
///
/// The VERIFY path uses no environment opcode (no TIMESTAMP/NUMBER/BALANCE/...), never writes, and reads only:
/// signed tx fields (TXPARAM/FRAMEPARAM/FRAMEDATALOAD), our own `lastSeen` slot (staked: STORAGE-031/STO-031)
/// and one slot of the committed registry's `stampExpiry[wallet][appId]` (not sender-associated: read-only access
/// for a staked entity, STORAGE-032/STO-033). The paymaster must therefore stay staked.
/// Time comes from the protocol: the expiry frame proves inclusion time <= deadline, and `lastSeen` (written only
/// from execution frames with block.timestamp, monotonic) proves inclusion time >= lastSeen.
/// The daily counter is the EIP-8250 keyed nonce, consumed by the protocol inside our APPROVE(PAYMENT).
/// Fees are pinned to exact values (SPONSORED_MAX_FEE / SPONSORED_TIP): the sender cannot turn our max_cost into a
/// tip, and a pending tx can never be fee-bumped (no replacement can raise max_fee_per_gas by 10%).
contract WatermarkQuotaPaymaster is HegotaSupport(Devnet.ERC8421_WORKSHOP) {
    // ------------------------------------------------------------------ constants

    /// @dev EIP-8141 ENTRY_POINT: the caller of every top-level DEFAULT and VERIFY frame.
    address public constant ENTRY_POINT = 0x00000000000000000000000000000000000000AA;
    /// @dev EIP-8141 EXPIRY_VERIFIER: canonical code checks block.timestamp <= uint64be(calldata).
    address public constant EXPIRY_VERIFIER = 0x0000000000000000000000000000000000008141;

    uint256 public constant FRAME_COUNT = 5;
    uint256 public constant EXPIRY_FRAME = 0;
    uint256 public constant PAY_FRAME = 2;
    uint256 public constant USER_FRAME = 3;
    uint256 public constant CONSUME_FRAME = 4;

    /// @notice A deadline may be at most this far past `lastSeen`. Bounds the day a tx can claim
    /// (EF_PAYMASTER_DESIGN.md §3).
    uint256 public constant MAX_AHEAD = 1 hours;
    /// @notice `lastSeen` moves in whole ticks: _touch() stores floor(block.timestamp / TICK) * TICK. Any lower bound
    /// tied to a growing lastSeen can be broken for a pending tx by advancing lastSeen (anyone can poke), which
    /// makes revalidation cancel it, a free `seen` against us (EF_PAYMASTER_DESIGN.md §5). Ticks cap that at one
    /// per TICK.
    uint256 public constant TICK = 5 minutes;
    /// @notice A deadline must be at least this far past `lastSeen`. lastSeen >= head - TICK - (poke delay), so an
    /// admitted tx still has >= ~2 minutes to be mined and cannot be made to expire right after admission.
    uint256 public constant MIN_LIFETIME = TICK + 2 minutes;
    /// @notice Smallest allowed SPONSORED_MAX_FEE. The sidecar's replacement rule compares new >= old * 11 / 10 in
    /// integers (FrameTxMempoolEntry.ts canReplace), which lets an identical fee replace when old <= 9.
    uint256 public constant MIN_SPONSORED_MAX_FEE = 10;
    /// @notice Minimum execution gas the user must give the consume() frame (FRAMEPARAM 0x01 is checked).
    uint256 public constant CONSUME_GAS_MIN = 50_000;
    /// @notice ERC-8421 STAKING requires >= 1 day; the registry never lets the delay go down.
    uint32 public constant MIN_UNSTAKE_DELAY = 1 days;

    // ------------------------------------------------------------------ immutables (code, not storage)

    IStampExpiry public immutable REGISTRY;
    uint256 public immutable APP_ID;
    uint32 public immutable QUOTA_PER_DAY;
    /// @notice Upper bound on TXPARAM(0x06) max_cost (wei) for one sponsored tx.
    uint256 public immutable MAX_COST_PER_TX;
    IStakingRegistry public immutable STAKING_REGISTRY;
    address public immutable OWNER;
    /// @notice TXPARAM(0x04) max_fee_per_gas must equal this. Must stay above the base fee, or sponsorship stops.
    uint256 public immutable SPONSORED_MAX_FEE;
    /// @notice TXPARAM(0x03) max_priority_fee_per_gas must equal this.
    uint256 public immutable SPONSORED_TIP;

    /// @dev HegotaSupport's read helpers (its private immutables), at their fixed CREATE nonces on
    /// ERC8421_WORKSHOP: 2 TxParam, 3 FrameDataLoad, 5 FrameParam. Read with assembly STATICCALLs (_txp/_fp/_fdl)
    /// to save ~600 gas per read over HelperCalls' abi encode/decode: the pay frame has a 100k-shared budget.
    address internal immutable TXPARAM_HELPER;
    address internal immutable FRAMEDATALOAD_HELPER;
    address internal immutable FRAMEPARAM_HELPER;

    // ------------------------------------------------------------------ storage

    /// @notice Latest block.timestamp seen by an execution frame (consume/poke). Only grows. Slot 0.
    uint64 public lastSeen;

    // ------------------------------------------------------------------ events / errors

    event Sponsored(address indexed wallet, uint64 indexed day, uint256 seq, bytes32 sigHash);

    error NotEntryPoint();
    error NotOwner();
    error BadFrameCount(uint256 count);
    error NotPayFrame(uint256 index);
    error NoExpiryFrame();
    error BadUserFrame();
    error BadConsumeFrame();
    error MaxCostTooHigh(uint256 maxCost, uint256 cap);
    error WrongFees(uint256 maxFee, uint256 tip);
    error DeadlineTooFar(uint256 deadline, uint256 lastSeen);
    error DeadlineTooSoon(uint256 deadline, uint256 lastSeen);
    error BadNonceKeyCount(uint256 count);
    error WrongNonceKey(uint256 key, uint256 expected);
    error QuotaExhausted(uint256 day, uint256 seq);
    error NotStamped(address wallet, uint64 expiresAt, uint64 deadline);
    error NotConsumeFrame();
    error NotSponsoredByUs();
    error UnstakeDelayTooShort(uint32 delay);
    error NoValue();
    error TransferFailed();
    error BadFeeConfig(uint256 maxFee, uint256 tip);

    // ------------------------------------------------------------------ constructor

    /// @dev Fund it through the CREATE value (or receive()). Stake afterwards with stake().
    constructor(
        address registry,
        uint256 appId,
        uint32 quotaPerDay,
        uint256 maxCostPerTx,
        address stakingRegistry,
        uint256 sponsoredMaxFee,
        uint256 sponsoredTip
    ) payable {
        if (sponsoredMaxFee < MIN_SPONSORED_MAX_FEE || sponsoredTip > sponsoredMaxFee) {
            revert BadFeeConfig(sponsoredMaxFee, sponsoredTip);
        }
        SPONSORED_MAX_FEE = sponsoredMaxFee;
        SPONSORED_TIP = sponsoredTip;
        REGISTRY = IStampExpiry(registry);
        APP_ID = appId;
        QUOTA_PER_DAY = quotaPerDay;
        MAX_COST_PER_TX = maxCostPerTx;
        STAKING_REGISTRY = IStakingRegistry(stakingRegistry);
        OWNER = msg.sender;
        TXPARAM_HELPER = _createAddress(2);
        FRAMEDATALOAD_HELPER = _createAddress(3);
        FRAMEPARAM_HELPER = _createAddress(5);
        // Non-zero from the start, so consume() never creates a slot (no EIP-8037 state gas in frame 4).
        lastSeen = uint64(block.timestamp / TICK * TICK);
    }

    // ------------------------------------------------------------------ frame 2: VERIFY (validation prefix)

    /// @notice Target of the pay frame. Static, no environment opcodes; APPROVE is the last thing it does.
    function verifyAndPay() external {
        if (msg.sender != ENTRY_POINT) revert NotEntryPoint();

        // Shape. Frame 1 needs no check: APPROVE(PAYMENT) reverts unless the sender already approved execution.
        uint256 count = _txp(TxParam.FRAME_COUNT);
        if (count != FRAME_COUNT) revert BadFrameCount(count);
        uint256 index = _txp(TxParam.CURRENT_FRAME_INDEX);
        if (index != PAY_FRAME) revert NotPayFrame(index);
        if (
            _fp(EXPIRY_FRAME, FrameParam.RESOLVED_TARGET) != uint160(EXPIRY_VERIFIER)
                || _fp(EXPIRY_FRAME, FrameParam.MODE) != uint256(FrameMode.VERIFY)
                || _fp(EXPIRY_FRAME, FrameParam.DATA_LENGTH) != 8
        ) revert NoExpiryFrame();
        if (_fp(USER_FRAME, FrameParam.MODE) != uint256(FrameMode.SENDER) || _fp(USER_FRAME, FrameParam.FLAGS) != 0) {
            revert BadUserFrame();
        }
        if (
            _fp(CONSUME_FRAME, FrameParam.RESOLVED_TARGET) != uint160(address(this))
                || _fp(CONSUME_FRAME, FrameParam.MODE) != uint256(FrameMode.DEFAULT)
                || _fp(CONSUME_FRAME, FrameParam.FLAGS) != 0 || _fp(CONSUME_FRAME, FrameParam.DATA_LENGTH) != 4
                || _fp(CONSUME_FRAME, FrameParam.EXECUTION_GAS_LIMIT) < CONSUME_GAS_MIN
                || bytes4(_fdl(0, CONSUME_FRAME)) != this.consume.selector
        ) revert BadConsumeFrame();

        // Fees, exact. charged_fee = gas_used * effective_gas_price (EIP-8141 Gas Accounting), so an unbounded tip
        // would let the sender pay the block's fee recipient with our max_cost. Exact values also make every
        // replacement of a pending tx impossible (both fees must rise 10%), so replacements cannot inflate `seen`.
        uint256 maxFee = _txp(TxParam.MAX_FEE);
        uint256 tip = _txp(TxParam.MAX_PRIORITY_FEE_PER_GAS);
        if (maxFee != SPONSORED_MAX_FEE || tip != SPONSORED_TIP) revert WrongFees(maxFee, tip);
        // Cost cap (TXPARAM 0x06 includes state gas on this devnet). With the fee pinned this caps total gas.
        uint256 maxCost = _txp(TxParam.MAX_COST);
        if (maxCost > MAX_COST_PER_TX) revert MaxCostTooHigh(maxCost, MAX_COST_PER_TX);

        // Time, without TIMESTAMP: lastSeen <= t_inclusion <= deadline <= lastSeen + MAX_AHEAD.
        uint64 deadline = uint64(uint256(_fdl(0, EXPIRY_FRAME)) >> 192);
        uint256 last = lastSeen;
        if (deadline > last + MAX_AHEAD) revert DeadlineTooFar(deadline, last);
        if (deadline < last + MIN_LIFETIME) revert DeadlineTooSoon(deadline, last);
        uint256 day = deadline / 1 days;

        // Quota = EIP-8250 keyed nonce. The whole key set is exactly [quotaKey(day)].
        uint256 keyCount = _txp(TxParam.NONCE_KEY_COUNT);
        if (keyCount != 1) revert BadNonceKeyCount(keyCount);
        uint256 key = _txp(TxParam.NONCE_KEY_0);
        uint256 expected = quotaKey(day);
        if (key != expected) revert WrongNonceKey(key, expected);
        uint256 seq = _txp(TxParam.NONCE);
        if (seq >= QUOTA_PER_DAY) revert QuotaExhausted(day, seq);

        // Stamp still valid at inclusion: t_inclusion <= deadline <= expiresAt. The registry's public mapping getter:
        // one SLOAD, no TIMESTAMP (isStamped() executes TIMESTAMP and must never run here).
        address sender = address(uint160(_txp(TxParam.SENDER)));
        uint64 expiresAt = REGISTRY.stampExpiry(sender, APP_ID);
        if (expiresAt < deadline) revert NotStamped(sender, expiresAt, deadline);

        approve(Scope.PAYMENT); // must stay last: consumes nonce_keys, debits max_cost, sets payer
    }

    // ------------------------------------------------------------------ frame 4: DEFAULT (execution)

    /// @notice Post-op bookkeeping. Moves `lastSeen` forward and logs the sponsorship. It never decides payment:
    /// the quota was already consumed by the protocol at APPROVE. Authenticated so the event can be trusted.
    function consume() external {
        if (msg.sender != ENTRY_POINT) revert NotEntryPoint(); // top-level DEFAULT/VERIFY frame of a frame tx
        // TXPARAM halts outside a frame tx, so reaching the next line already proves we are inside one.
        if (_txp(TxParam.CURRENT_FRAME_INDEX) != CONSUME_FRAME || _txp(TxParam.FRAME_COUNT) != FRAME_COUNT) {
            revert NotConsumeFrame();
        }
        if (
            _fp(PAY_FRAME, FrameParam.RESOLVED_TARGET) != uint160(address(this))
                || _fp(PAY_FRAME, FrameParam.MODE) != uint256(FrameMode.VERIFY)
                || _fp(PAY_FRAME, FrameParam.ALLOWED_SCOPE) != uint256(Scope.PAYMENT)
                || _fp(PAY_FRAME, FrameParam.STATUS) != 1 || bytes4(_fdl(0, PAY_FRAME)) != this.verifyAndPay.selector
        ) revert NotSponsoredByUs();

        _touch();
        address wallet = address(uint160(_txp(TxParam.SENDER)));
        uint256 key = _txp(TxParam.NONCE_KEY_0);
        emit Sponsored(wallet, uint64(key), _txp(TxParam.NONCE), bytes32(_txp(TxParam.SIG_HASH)));
    }

    /// @notice Heartbeat: anyone may record the current time (rounded down to a TICK). Harmless: it can only write
    /// the truth, and at most one advance per TICK can happen however often it is called. The relayer calls it with
    /// a plain tx right after each TICK boundary when no sponsored tx did
    /// (tools/ef-sender/src/send-quota-tx.ts poke --every).
    function poke() external {
        _touch();
    }

    // ------------------------------------------------------------------ views

    /// @notice The EIP-8250 nonce key of `day` (UTC days since epoch): our address in the top 160 bits, the day
    /// in the low 64. Never 0; domain-separated per paymaster.
    function quotaKey(uint256 day) public view returns (uint256) {
        return (uint256(uint160(address(this))) << 96) | uint64(day);
    }

    /// @notice NONCE_MANAGER (0x...8250) slot holding `wallet`'s next seq for `day`; read it with eth_getStorageAt.
    /// quotaLeft = QUOTA_PER_DAY - that value. (NONCE_MANAGER reverts on calls, so no on-chain view is possible.)
    function nonceSlot(address wallet, uint256 day) external view returns (bytes32) {
        return keccak256(abi.encode(wallet, quotaKey(day)));
    }

    // ------------------------------------------------------------------ owner: stake and funds

    /// @notice Stakes this contract in the staking registry. The registry keys on msg.sender, so we call it.
    function stake(uint32 unstakeDelaySec) external payable {
        _onlyOwner();
        if (msg.value == 0) revert NoValue();
        if (unstakeDelaySec < MIN_UNSTAKE_DELAY) revert UnstakeDelayTooShort(unstakeDelaySec);
        STAKING_REGISTRY.addStake{value: msg.value}(unstakeDelaySec);
    }

    /// @notice Starts the unstake delay. The paymaster stops counting as staked immediately.
    function unlockStake() external {
        _onlyOwner();
        STAKING_REGISTRY.unlockStake();
    }

    function withdrawStake(address payable to) external {
        _onlyOwner();
        STAKING_REGISTRY.withdrawStake(to);
    }

    function withdraw(address payable to, uint256 amount) external {
        _onlyOwner();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Top-ups and stake refunds. Uses no frame opcode, so a plain transfer works (unlike a fallback
    /// that calls APPROVE).
    receive() external payable {}

    // ------------------------------------------------------------------ internal

    /// TXPARAM(p). Same operand layout as HegotaSupport.txparam: one 32-byte word, no selector.
    /// `staticcall(gas(), ...)`: Yul evaluates arguments right to left, so GAS directly precedes STATICCALL (OP-012).
    function _txp(TxParam p) internal view returns (uint256 r) {
        address h = TXPARAM_HELPER;
        assembly ("memory-safe") {
            mstore(0x00, p)
            if iszero(staticcall(gas(), h, 0x00, 0x20, 0x00, 0x20)) {
                returndatacopy(0x00, 0x00, returndatasize())
                revert(0x00, returndatasize())
            }
            r := mload(0x00)
        }
    }

    /// FRAMEPARAM(frameIndex, p), operands (frameIndex, param) as HegotaSupport.frameparam.
    function _fp(uint256 frameIndex, FrameParam p) internal view returns (uint256 r) {
        address h = FRAMEPARAM_HELPER;
        assembly ("memory-safe") {
            mstore(0x00, frameIndex)
            mstore(0x20, p)
            if iszero(staticcall(gas(), h, 0x00, 0x40, 0x00, 0x20)) {
                returndatacopy(0x00, 0x00, returndatasize())
                revert(0x00, returndatasize())
            }
            r := mload(0x00)
        }
    }

    /// FRAMEDATALOAD(offset, frameIndex), operands (offset, frameIndex) as HegotaSupport.framedataload.
    function _fdl(uint256 offset, uint256 frameIndex) internal view returns (bytes32 r) {
        address h = FRAMEDATALOAD_HELPER;
        assembly ("memory-safe") {
            mstore(0x00, offset)
            mstore(0x20, frameIndex)
            if iszero(staticcall(gas(), h, 0x00, 0x40, 0x00, 0x20)) {
                returndatacopy(0x00, 0x00, returndatasize())
                revert(0x00, returndatasize())
            }
            r := mload(0x00)
        }
    }

    /// CREATE address of this contract at `nonce` (1..0x7f): keccak(rlp([this, nonce]))[12:].
    function _createAddress(uint8 nonce) private view returns (address a) {
        a = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), address(this), nonce)))));
        require(a.code.length != 0, "helper missing");
    }

    function _touch() internal {
        uint256 t = block.timestamp / TICK * TICK;
        if (t > lastSeen) lastSeen = uint64(t);
    }

    function _onlyOwner() internal view {
        if (msg.sender != OWNER) revert NotOwner();
    }
}
