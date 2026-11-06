// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IStakingRegistry} from "../../src/interfaces/IStakingRegistry.sol";

/// Same semantics as the devnet's NaiveStakingRegistry (sidecar deploy/predeploy NaiveStakingRegistry.sol L11-62).
contract NaiveStakingRegistryStandIn is IStakingRegistry {
    struct Deposit {
        uint256 stake;
        uint32 unstakeDelaySec;
        uint64 withdrawTime;
    }

    mapping(address => Deposit) public deposits;

    function addStake(uint32 unstakeDelaySec) external payable {
        Deposit storage d = deposits[msg.sender];
        require(unstakeDelaySec >= d.unstakeDelaySec, "cannot decrease unstake delay");
        d.stake += msg.value;
        d.unstakeDelaySec = unstakeDelaySec;
        d.withdrawTime = 0;
    }

    function unlockStake() external {
        Deposit storage d = deposits[msg.sender];
        d.withdrawTime = uint64(block.timestamp) + d.unstakeDelaySec;
    }

    function withdrawStake(address payable to) external {
        Deposit storage d = deposits[msg.sender];
        require(d.withdrawTime != 0 && block.timestamp >= d.withdrawTime, "not due");
        uint256 amount = d.stake;
        delete deposits[msg.sender];
        (bool ok,) = to.call{value: amount}("");
        require(ok, "send failed");
    }

    function getDepositInfo(address a) external view returns (uint256, uint32, uint64) {
        Deposit memory d = deposits[a];
        return (d.stake, d.unstakeDelaySec, d.withdrawTime);
    }
}
