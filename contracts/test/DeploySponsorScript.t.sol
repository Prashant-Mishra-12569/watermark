// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeploySponsor} from "../script/DeploySponsor.s.sol";

/// @notice The deployment-file layer of DeploySponsor.s.sol (no env vars, so it is safe to run in parallel and with a
/// sourced .env). The env layer and the deploy itself are covered by the anvil dry run documented in the script.
contract DeploySponsorScriptTest is Test {
    DeploySponsor internal script;
    address internal constant WHITECHAIN_USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;

    function setUp() public {
        script = new DeploySponsor();
    }

    /// @dev The shape deployment-json.ts writes (interfaces F11): sponsor/paymaster null, appId as a decimal string
    /// above 2^53, nested objects.
    function test_readsDeploymentJsonWrittenByDeployScript() public view {
        string memory json = string.concat(
            '{"chainId":1874,"registry":"0x5FbDB2315678afecb367f032d93F642f64180aa3",',
            '"verifier":"0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512","sponsor":null,"paymaster":null,',
            '"usdt":"0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",',
            '"appId":"340282366920938463463374607431768211457","deployedAt":"2026-11-06T10:00:00.000Z",',
            '"deployer":"0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266","caRoot":null,"rulesRoot":null,',
            '"sessionSigner":null,"libraries":{},"blockNumber":1,"txHashes":{"registry":"0x01"}}'
        );
        DeploySponsor.Config memory c = script.fromDeploymentJson(json, 1874);
        assertEq(c.registry, 0x5FbDB2315678afecb367f032d93F642f64180aa3);
        assertEq(c.appId, 340282366920938463463374607431768211457);
        assertEq(c.usdt, WHITECHAIN_USDT);
        assertEq(c.relayer, address(0), "relayer is not in the file: it must come from RELAYER_ADDRESS");
    }

    function test_nullsAndMissingKeysReadAsZero_usdtDefaults() public view {
        DeploySponsor.Config memory c = script.fromDeploymentJson('{"chainId":1337,"registry":null,"usdt":null}', 1337);
        assertEq(c.registry, address(0));
        assertEq(c.appId, 0);
        assertEq(c.usdt, WHITECHAIN_USDT);

        c = script.fromDeploymentJson("{}", 31337);
        assertEq(c.registry, address(0));
        assertEq(c.usdt, WHITECHAIN_USDT);
    }

    function test_relayerAndNumericAppIdFromFile() public view {
        DeploySponsor.Config memory c = script.fromDeploymentJson(
            '{"registry":"0x5FbDB2315678afecb367f032d93F642f64180aa3","appId":12345,'
            '"relayer":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}',
            1874
        );
        assertEq(c.appId, 12345);
        assertEq(c.relayer, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
    }

    function test_refusesAFileForAnotherChain() public {
        vm.expectRevert(bytes("DeploySponsor: deployment file is for another chain"));
        script.fromDeploymentJson('{"chainId":1337,"registry":"0x5FbDB2315678afecb367f032d93F642f64180aa3"}', 1874);
    }
}
