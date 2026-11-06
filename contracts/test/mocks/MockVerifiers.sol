// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IVerifier} from "../../src/interfaces/IVerifier.sol";

/// @notice Returns true only for one exact (proof, publicInputs) pair, so a test can prove the router forwards the
/// bytes unchanged (profile byte stripped, nothing else touched).
contract ExactMatchVerifier is IVerifier {
    bytes32 public immutable proofHash;
    bytes32 public immutable piHash;

    constructor(bytes memory proof, bytes32[] memory publicInputs) {
        proofHash = keccak256(proof);
        piHash = keccak256(abi.encodePacked(publicInputs));
    }

    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        return keccak256(proof) == proofHash && keccak256(abi.encodePacked(publicInputs)) == piHash;
    }
}

/// @notice Always returns a fixed answer.
contract ConstVerifier is IVerifier {
    bool public immutable answer;

    constructor(bool a) {
        answer = a;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return answer;
    }
}

/// @notice Reverts like the bb HonkVerifier does on a bad proof (custom error with arguments).
contract RevertingVerifier is IVerifier {
    error SumcheckFailedMock(uint256 round);

    function verify(bytes calldata proof, bytes32[] calldata) external pure returns (bool) {
        revert SumcheckFailedMock(proof.length);
    }
}
