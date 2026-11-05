// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice NaiveStakingRegistry on the alt mempool devnet (0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f).
/// The staked entity must call addStake itself: a contract can't be staked from an EOA.
/// Signatures follow the devnet staking guide. Confirm them against the deployed contract before use.
interface IStakingRegistry {
    function addStake(uint32 unstakeDelaySec) external payable;
    function unlockStake() external;
    function withdrawStake(address payable withdrawAddress) external;
}
