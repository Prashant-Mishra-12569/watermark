// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IVerifier} from "../../src/interfaces/IVerifier.sol";

/// @notice Test double for the generated HonkVerifier. verify() is `view` (the registry STATICCALLs it), so it cannot
/// write call records itself: tests record and assert calls with vm.expectCall instead.
contract MockVerifier is IVerifier {
    error MockVerifierRevert();

    bool public result = true;
    bool public shouldRevert;

    function setResult(bool r) external {
        result = r;
    }

    function setRevert(bool r) external {
        shouldRevert = r;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        if (shouldRevert) revert MockVerifierRevert();
        return result;
    }
}
