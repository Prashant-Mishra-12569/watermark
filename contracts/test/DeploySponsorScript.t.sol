// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeploySponsor} from "../script/DeploySponsor.s.sol";

/// @notice The deployment-file layer and the pure resolvers of DeploySponsor.s.sol (no env vars, so it is safe to run in
/// parallel and with a sourced .env). DeploySponsorEnvTest below covers the env layer; the deploy itself is covered by
/// the anvil dry run documented in the script.
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

    /// @dev deployments/whitechain.json holds the test app ("appId") and the live app ("liveAppId"). Without APP_ID the
    /// sponsor must bind to the live one, or every real card-tap wallet would be NOT_STAMPED (DEPLOY-APPID-FALLBACK).
    function test_liveAppIdWinsOverTheTestAppId() public view {
        DeploySponsor.Config memory c = script.fromDeploymentJson(
            '{"chainId":1874,"appId":"242622643093352524455632509511752146182158360637522126326090117364223963656",'
            '"liveAppId":"245737539065175059008558421319713289281964530398934598066600266060113564106"}',
            1874
        );
        assertEq(c.appId, 245737539065175059008558421319713289281964530398934598066600266060113564106);

        c = script.fromDeploymentJson('{"appId":12345,"liveAppId":null}', 1874);
        assertEq(c.appId, 12345, "a null liveAppId falls back to appId");
    }

    function test_refusesAFileForAnotherChain() public {
        vm.expectRevert(bytes("DeploySponsor: deployment file is for another chain"));
        script.fromDeploymentJson('{"chainId":1337,"registry":"0x5FbDB2315678afecb367f032d93F642f64180aa3"}', 1874);
    }

    /// DEPLOY-3: a stale REGISTRY_ADDRESS in .env must not silently beat a fresh deployments/<chain>.json.
    function test_resolveRegistry_fileWinsAndAConflictIsRefused() public {
        address fresh = makeAddr("fresh registry");
        address stale = makeAddr("stale registry");
        assertEq(script.resolveRegistry(address(0), fresh, false), fresh, "file only");
        assertEq(script.resolveRegistry(stale, address(0), false), stale, "env only (no deployment file)");
        assertEq(script.resolveRegistry(fresh, fresh, false), fresh, "both, equal");
        assertEq(script.resolveRegistry(stale, fresh, true), stale, "explicit override");
        vm.expectRevert(
            bytes(
                "DeploySponsor: REGISTRY_ADDRESS in .env differs from the deployment file; update .env (or set ALLOW_REGISTRY_OVERRIDE=true)"
            )
        );
        script.resolveRegistry(stale, fresh, false);
    }

    /// DEPLOY-1 (sponsor half): RELAYER_ADDRESS must be the address of RELAYER_PRIVATE_KEY, the key that calls
    /// relayPayment; the sponsor's relayer is immutable.
    function test_resolveRelayer_checkedAgainstOrDerivedFromTheKey() public {
        uint256 key = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d; // anvil #1 (public)
        address fromKey = vm.addr(key);
        address other = makeAddr("other");
        assertEq(script.resolveRelayer(other, 0), other, "no key: the configured address");
        assertEq(script.resolveRelayer(address(0), key), fromKey, "key only: derived");
        assertEq(script.resolveRelayer(fromKey, key), fromKey, "both, equal");
        vm.expectRevert(bytes("DeploySponsor: RELAYER_ADDRESS does not match RELAYER_PRIVATE_KEY"));
        script.resolveRelayer(other, key);
    }
}

/// @notice The env layer of DeploySponsor.loadConfig. It sets process env vars, so every scenario lives in ONE test
/// function, and no other test file sets these variables (DeployScriptTest uses a disjoint set).
contract DeploySponsorEnvTest is Test {
    function _clear() internal {
        vm.setEnv("REGISTRY_ADDRESS", "");
        vm.setEnv("APP_ID", "");
        vm.setEnv("RELAYER_ADDRESS", "");
        vm.setEnv("RELAYER_PRIVATE_KEY", "");
        vm.setEnv("QUOTA_PER_DAY", "");
        vm.setEnv("POLICY", "");
        vm.setEnv("ALLOW_REGISTRY_OVERRIDE", "");
    }

    /// DEPLOY-2: `set -a; . ../.env` exports a `POLICY=` line as "", which must read as unset (test.json), and the
    /// policy file must not be read at all when QUOTA_PER_DAY is set.
    function test_loadConfig_emptyValuesReadAsUnset() public {
        DeploySponsor script = new DeploySponsor();
        _clear();
        vm.setEnv("REGISTRY_ADDRESS", "0x5FbDB2315678afecb367f032d93F642f64180aa3");
        vm.setEnv("APP_ID", "12345");
        vm.setEnv("RELAYER_ADDRESS", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

        vm.setEnv("POLICY", "test.json");
        DeploySponsor.Config memory c = script.loadConfig();
        assertEq(c.quota, 20, "policies/test.json quotaPerDay");
        assertEq(c.appId, 12345);

        vm.setEnv("POLICY", "");
        c = script.loadConfig();
        assertEq(c.quota, 20, "empty POLICY = test.json");

        vm.setEnv("QUOTA_PER_DAY", "7");
        vm.setEnv("POLICY", "no-such-policy.json");
        c = script.loadConfig();
        assertEq(c.quota, 7, "QUOTA_PER_DAY wins");

        // RELAYER_ADDRESS empty: derived from RELAYER_PRIVATE_KEY (public anvil #1 key).
        vm.setEnv("RELAYER_ADDRESS", "");
        vm.setEnv("RELAYER_PRIVATE_KEY", "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
        c = script.loadConfig();
        assertEq(c.relayer, 0x70997970C51812dc3A010C7d01b50e0d17dc79C8);

        // A RELAYER_ADDRESS that is not the key's address is refused.
        vm.setEnv("RELAYER_ADDRESS", "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
        vm.expectRevert(bytes("DeploySponsor: RELAYER_ADDRESS does not match RELAYER_PRIVATE_KEY"));
        script.loadConfig();

        // Neither set: a clear message.
        vm.setEnv("RELAYER_ADDRESS", "");
        vm.setEnv("RELAYER_PRIVATE_KEY", "");
        vm.expectRevert(bytes("DeploySponsor: set RELAYER_ADDRESS (the relayer hot wallet)"));
        script.loadConfig();

        _clear();
    }
}
