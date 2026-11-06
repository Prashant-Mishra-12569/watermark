// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Test double for WatermarkRegistry.isStamped (F5). Only the read path the sponsor uses.
contract MockRegistry {
    mapping(address => mapping(uint256 => uint64)) public stampExpiry;

    /// @dev When set, isStamped returns (rawOk, expiry) without comparing to block.timestamp (a "lying" registry).
    bool public raw;
    bool public rawOk;

    function setStamp(address wallet, uint256 appId, uint64 expiresAt) external {
        stampExpiry[wallet][appId] = expiresAt;
    }

    function setRaw(bool raw_, bool rawOk_) external {
        raw = raw_;
        rawOk = rawOk_;
    }

    function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt) {
        expiresAt = stampExpiry[wallet][appId];
        ok = raw ? rawOk : (expiresAt != 0 && block.timestamp <= expiresAt);
    }
}
