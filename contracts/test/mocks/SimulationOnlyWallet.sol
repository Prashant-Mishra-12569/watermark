// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice A hostile ERC-1271 wallet that signs "yes" only when tx.gasprice == 0, i.e. inside an eth_call or
/// eth_estimateGas sent without a gas price, and "no" in the mined transaction. No owner action or gas is needed per
/// attempt. Used to show that the sponsor's quota does not limit reverted relays (the relayer must).
contract SimulationOnlyWallet {
    function isValidSignature(bytes32, bytes calldata) external view returns (bytes4) {
        return tx.gasprice == 0 ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
