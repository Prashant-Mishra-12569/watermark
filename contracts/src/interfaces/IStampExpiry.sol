// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The validation-safe read the paymaster needs from WatermarkRegistry. It is the auto-generated getter of
/// the committed registry's `mapping(address wallet => mapping(uint256 appId => uint64)) public stampExpiry`
/// (contracts/src/WatermarkRegistry.sol L49, storage slot 4), so the registry needs no change.
/// The getter is one SLOAD: no TIMESTAMP/NUMBER or other environment opcode, so a VERIFY frame may call it.
/// Its slot keccak(pad(appId) . keccak(pad(wallet) . 4)) is NOT associated with `wallet` (the final preimage starts
/// with appId), so only a staked paymaster may read it (ERC-8421 STORAGE-032, ERC-7562 STO-033). The paymaster is
/// staked anyway because it reads its own `lastSeen` (STORAGE-031).
interface IStampExpiry {
    /// @return expiresAt last second (unix, inclusive) the stamp is valid; 0 if never stamped.
    function stampExpiry(address wallet, uint256 appId) external view returns (uint64 expiresAt);
}
