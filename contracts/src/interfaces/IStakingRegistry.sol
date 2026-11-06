// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice NaiveStakingRegistry on the alt mempool devnet (0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f).
/// Everything is keyed on msg.sender, so a contract entity must call addStake itself.
/// Selectors checked against the deployed code: addStake 0x0396cb60, getDepositInfo 0x5287ce12,
/// unlockStake 0xbb9fe6bf, withdrawStake 0xc23a5cea.
interface IStakingRegistry {
    function addStake(uint32 unstakeDelaySec) external payable;
    function unlockStake() external;
    function withdrawStake(address payable withdrawAddress) external;
    function getDepositInfo(address account)
        external
        view
        returns (uint256 stake, uint32 unstakeDelaySec, uint64 withdrawTime);
}
