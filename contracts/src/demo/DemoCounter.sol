// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Demo target for the sponsored SENDER frame (tools/ef-sender default calldata 0xd09de08a = increment()).
/// `count[msg.sender]` shows on chain that the wallet itself made the call while the paymaster paid.
contract DemoCounter {
    mapping(address => uint256) public count;

    event Incremented(address indexed wallet, uint256 count);

    function increment() external {
        emit Incremented(msg.sender, ++count[msg.sender]);
    }
}
