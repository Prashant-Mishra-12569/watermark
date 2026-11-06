// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IWatermarkRegistry} from "./interfaces/IWatermarkRegistry.sol";

/// @notice The EIP-3009 entry point WatermarkSponsor uses on Whitechain USDT (0xcedf…55a7).
/// This is the `bytes signature` overload (selector 0xcf092995): the token checks the signature itself, with
/// ecrecover for an EOA `from` and ERC-1271 `isValidSignature` for a contract `from`.
interface IEIP3009Bytes {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

/// @title WatermarkSponsor
/// @notice Gasless USDT payments for stamped wallets on Whitechain Sepolia (interfaces F5, F7; spec J, K).
/// One sponsor is deployed per app. The business's relayer pays the gas and calls `relayPayment`; this contract
/// checks that `intent.from` holds a live stamp for `appId` in WatermarkRegistry and that the wallet still has
/// sponsored payments left today, then submits the user's EIP-3009 authorization to USDT.
///
/// @dev Payment ↔ app binding: the EIP-3009 signature doesn't cover `appId`. A payment belongs to an app because it
/// goes through that app's sponsor, whose `appId` is immutable (PLAN.md correction 3).
///
/// Known trade-off (F7): an EIP-3009 authorization is a bearer instrument. Anyone who sees a signed authorization (in
/// the relayer's request, or in the mempool once `relayPayment` is broadcast) can submit it to USDT directly. That only
/// moves the user's own USDT to the recipient the user signed for, for the amount and time window the user signed for,
/// and it skips this contract's quota. It never moves anything held by this contract. If the direct submission lands
/// before the relayer simulates, the simulation fails and the relayer sends nothing. If it lands while the relayer's
/// `relayPayment` is already in flight, that transaction reverts inside USDT ("authorization is used") and the
/// relayer has paid its gas.
///
/// Quota: `quotaPerDay` sponsored payments per wallet per UTC day (`block.timestamp / 1 days`). A reverted call
/// (including a revert inside USDT) uses no quota, because the whole call reverts. So the quota bounds SUCCESSFUL
/// payments only, not the relayer's gas: a stamped ERC-1271 wallet can sign "valid" only inside eth_call (for example
/// when tx.gasprice == 0) and "invalid" in the mined transaction, and every such relay reverts, costs the relayer gas
/// and uses no quota (WatermarkSponsorFailedRelayTest). The relayer must therefore (1) simulate and estimate with its
/// real fee fields, and (2) count on-chain-reverted relays per wallet per UTC day and refuse a wallet after one or two.
contract WatermarkSponsor {
    /// @notice An EIP-3009 TransferWithAuthorization message (interfaces F7). `value` has 6 decimals (USDT).
    /// The token accepts it when `validAfter < block.timestamp < validBefore` and `nonce` is unused for `from`.
    struct PaymentIntent {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    /// @dev Per-wallet usage, packed into one slot. `used` counts payments on UTC day `day` only.
    struct Usage {
        uint32 day;
        uint32 used;
    }

    // ------------------------------------------------------------------ immutables

    /// @notice WatermarkRegistry on this chain.
    IWatermarkRegistry public immutable registry;
    /// @notice The app this sponsor pays for. Payments are refused unless `from` is stamped for it.
    uint256 public immutable appId;
    /// @notice The EIP-3009 token (Whitechain USDT).
    IEIP3009Bytes public immutable usdt;
    /// @notice The only address allowed to call `relayPayment` (the business's relayer hot wallet).
    address public immutable relayer;
    /// @notice Sponsored payments allowed per wallet per UTC day.
    uint32 public immutable quotaPerDay;

    // ------------------------------------------------------------------ storage

    /// @notice Sponsored-payment usage per wallet. Read it through `quotaLeft` or `usedToday`.
    mapping(address wallet => Usage) public usage;

    // ------------------------------------------------------------------ errors

    // constructor
    error ZeroAddress();
    error NotAContract(address account);
    error InvalidAppId(uint256 appId);
    error ZeroQuota();

    // relayPayment, in check order. The relayer maps them to F6 refusal reasons:
    // NotStamped → NOT_STAMPED, QuotaUsed → QUOTA_USED, the authorization errors → BAD_SIGNATURE.
    error NotRelayer(address caller);
    error ZeroValue();
    error InvalidRecipient(address to);
    error AuthorizationNotYetValid(uint256 validAfter, uint256 nowTs);
    error AuthorizationExpired(uint256 validBefore, uint256 nowTs);
    error NotStamped(address wallet, uint256 appId);
    error QuotaUsed(address wallet, uint32 quotaPerDay);

    // ------------------------------------------------------------------ events

    /// @notice One sponsored payment. `day` is the UTC day index (`block.timestamp / 1 days`) and `usedToday` is the
    /// wallet's count for that day including this payment.
    event PaymentRelayed(
        address indexed from, address indexed to, uint256 value, bytes32 nonce, uint32 day, uint32 usedToday
    );

    // ------------------------------------------------------------------ constructor

    /// @param registry_ WatermarkRegistry on this chain (must already be deployed).
    /// @param appId_ The app's id from `registerApp` (non-zero, below 2^248 as F5 derives it).
    /// @param usdt_ The EIP-3009 token (Whitechain USDT 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7).
    /// @param relayer_ The relayer hot wallet. It is immutable: rotating it means deploying a new sponsor.
    /// @param quotaPerDay_ Sponsored payments per wallet per UTC day (20 in the demo policy).
    constructor(address registry_, uint256 appId_, address usdt_, address relayer_, uint32 quotaPerDay_) {
        if (registry_ == address(0) || usdt_ == address(0) || relayer_ == address(0)) revert ZeroAddress();
        if (registry_.code.length == 0) revert NotAContract(registry_);
        if (usdt_.code.length == 0) revert NotAContract(usdt_);
        if (appId_ == 0 || appId_ >> 248 != 0) revert InvalidAppId(appId_);
        if (quotaPerDay_ == 0) revert ZeroQuota();

        registry = IWatermarkRegistry(registry_);
        appId = appId_;
        usdt = IEIP3009Bytes(usdt_);
        relayer = relayer_;
        quotaPerDay = quotaPerDay_;
    }

    // ------------------------------------------------------------------ relayer entry point

    /// @notice Submits the user's EIP-3009 authorization to USDT, sponsored by the relayer. Relayer only.
    /// @dev Checks, in order: caller is the relayer; non-zero value; recipient is not zero or this contract; the
    /// authorization's time window is open now; `intent.from` is non-zero, stamped for `appId` and the stamp hasn't
    /// expired (checked per call, so a stamp that expires mid-day stops payments at that second); the wallet has quota
    /// left today. Then it counts the payment and calls USDT, which checks the signature and the nonce. Any revert
    /// inside USDT is bubbled up unchanged and uses no quota (see the contract notes: the relayer, not this contract,
    /// limits reverted relays).
    ///
    /// Gas was measured on a Whitechain Sepolia fork with the real USDT, for the whole transaction including the
    /// 21,000 base; test_fork_gasProfile prints the figures:
    /// - about 107k in the usual case, including the first payment of a later day (the packed quota slot is already
    ///   non-zero);
    /// - about 124k for a wallet's first-ever payment, or for a recipient that holds no USDT yet;
    /// - about 141k for both at once;
    /// - about 126k for a first payment from an ERC-1271 wallet.
    /// The relayer's MAX_GAS_PER_PAY default of 300,000 covers every case.
    /// @param intent The signed TransferWithAuthorization fields.
    /// @param userSig The user's signature over the token's EIP-712 TransferWithAuthorization digest: 65 bytes
    /// (r, s, v) for an EOA, or whatever the wallet's ERC-1271 `isValidSignature` accepts for a contract wallet.
    function relayPayment(PaymentIntent calldata intent, bytes calldata userSig) external {
        if (msg.sender != relayer) revert NotRelayer(msg.sender);
        if (intent.value == 0) revert ZeroValue();
        if (intent.to == address(0) || intent.to == address(this)) revert InvalidRecipient(intent.to);
        // Same window as EIP-3009 (validAfter < now < validBefore). Refusing here gives the relayer a clear reason
        // instead of the token's string revert.
        if (block.timestamp <= intent.validAfter) revert AuthorizationNotYetValid(intent.validAfter, block.timestamp);
        if (block.timestamp >= intent.validBefore) revert AuthorizationExpired(intent.validBefore, block.timestamp);

        // address(0) is never a stamped wallet: the registry refuses it (it is also the registry's "unused" sentinel,
        // SEC-1). Refusing it here as well keeps the sponsor safe without relying on that, and skips the registry call.
        if (intent.from == address(0)) revert NotStamped(intent.from, appId);
        // The registry's `ok` already includes expiry; the second test guards against a registry that doesn't.
        (bool ok, uint64 expiresAt) = registry.isStamped(intent.from, appId);
        if (!ok || block.timestamp > expiresAt) revert NotStamped(intent.from, appId);

        // forge-lint: disable-next-line(unsafe-typecast) day index fits uint32 for ~11.7 million years
        uint32 today = uint32(block.timestamp / 1 days);
        Usage memory u = usage[intent.from];
        uint32 used = u.day == today ? u.used : 0;
        if (used >= quotaPerDay) revert QuotaUsed(intent.from, quotaPerDay);
        unchecked {
            ++used; // used < quotaPerDay <= type(uint32).max
        }
        usage[intent.from] = Usage({day: today, used: used});
        // Emitted before the token call (checks-effects-interactions); a revert in USDT discards it with the rest.
        emit PaymentRelayed(intent.from, intent.to, intent.value, intent.nonce, today, used);

        usdt.transferWithAuthorization(
            intent.from, intent.to, intent.value, intent.validAfter, intent.validBefore, intent.nonce, userSig
        );
    }

    // ------------------------------------------------------------------ views

    /// @notice Sponsored payments `wallet` can still make today (UTC). This is quota only: it doesn't check the stamp,
    /// so the relayer reads `isStamped` separately (F6 `GET /status`).
    function quotaLeft(address wallet) external view returns (uint32) {
        return quotaPerDay - usedToday(wallet);
    }

    /// @notice Sponsored payments `wallet` has made today (UTC).
    function usedToday(address wallet) public view returns (uint32) {
        Usage memory u = usage[wallet];
        // forge-lint: disable-next-line(unsafe-typecast) day index fits uint32 for ~11.7 million years
        return u.day == uint32(block.timestamp / 1 days) ? u.used : 0;
    }
}
