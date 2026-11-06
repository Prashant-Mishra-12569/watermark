// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployGenesisPass} from "../script/DeployGenesisPass.s.sol";

/// @notice The config layer of DeployGenesisPass.s.sol through `resolve`, which takes the env values as arguments, so
/// this test never sets process env vars (DeploySponsorEnvTest sets the same names and runs in parallel).
contract DeployGenesisPassScriptTest is Test {
    DeployGenesisPass internal script;
    address internal constant REG = 0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6;
    /// @dev The current live app (RuPay bank debit, salt 0x…03) and its sponsor. Pinned on purpose: if
    /// deployments/whitechain.json moves to another live app, test_theCommittedDeploymentFileResolves fails, as a
    /// reminder that a pass bound to the old app can't be claimed with the new sponsor's payments.
    uint256 internal constant LIVE = 393344891601835728760966937624776276735512086066329273346256164761263100630;
    address internal constant LIVE_SPONSOR = 0x21B6aE18A412aFB84A09263939C5e787d374939a;
    uint256 internal constant PREVIOUS_LIVE =
        245737539065175059008558421319713289281964530398934598066600266060113564106;
    uint256 internal constant TEST_APP = 242622643093352524455632509511752146182158360637522126326090117364223963656;
    address internal constant RELAYER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    uint256 internal constant RELAYER_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d; // anvil #1

    string internal json;

    function setUp() public {
        script = new DeployGenesisPass();
        json = string.concat(
            '{"chainId":1874,"registry":"0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6",',
            '"sponsor":"0x21b6ae18a412afb84a09263939c5e787d374939a",',
            '"appId":"242622643093352524455632509511752146182158360637522126326090117364223963656",',
            '"liveAppId":"393344891601835728760966937624776276735512086066329273346256164761263100630",',
            '"previousLive":{"liveAppId":"245737539065175059008558421319713289281964530398934598066600266060113564106"}}'
        );
    }

    function test_readsTheLiveAppNotTheTestApp() public view {
        DeployGenesisPass.Config memory c = script.resolve(json, 1874, address(0), false, 0, RELAYER, 0);
        assertEq(c.registry, REG);
        assertEq(c.appId, LIVE);
        assertTrue(c.appId != TEST_APP);
        assertEq(c.minter, RELAYER);
        assertEq(c.sponsor, LIVE_SPONSOR);
        assertTrue(c.appId != PREVIOUS_LIVE, "never the previous live app");
    }

    function test_theCommittedDeploymentFileResolves() public view {
        string memory file = vm.readFile(string.concat(vm.projectRoot(), "/../deployments/whitechain.json"));
        DeployGenesisPass.Config memory c = script.resolve(file, 1874, address(0), false, 0, RELAYER, 0);
        assertEq(c.registry, REG);
        assertEq(c.appId, LIVE);
        assertEq(c.appId, vm.parseJsonUint(file, ".sponsorAppId"), "liveAppId == sponsorAppId");
        assertEq(c.sponsor, LIVE_SPONSOR, "the current sponsor");
    }

    function test_passAppIdOverrides() public view {
        DeployGenesisPass.Config memory c = script.resolve(json, 1874, address(0), false, 12345, RELAYER, 0);
        assertEq(c.appId, 12345);
    }

    function test_noLiveAppIdIsRefused() public {
        vm.expectRevert(bytes("DeployGenesisPass: set PASS_APP_ID (or liveAppId in the deployment file)"));
        script.resolve(
            '{"chainId":1874,"registry":"0x998934Efa31a6bE75945fDfAa126d3D6401F8Fd6","appId":"5"}',
            1874,
            address(0),
            false,
            0,
            RELAYER,
            0
        );
    }

    function test_registryRules() public {
        address stale = makeAddr("stale");
        assertEq(script.resolve(json, 1874, REG, false, 0, RELAYER, 0).registry, REG, "env equal to file");
        assertEq(script.resolve(json, 1874, stale, true, 0, RELAYER, 0).registry, stale, "explicit override");
        assertEq(script.resolve("", 31337, stale, false, 1, RELAYER, 0).registry, stale, "no file: env");
        vm.expectRevert(
            bytes(
                "DeployGenesisPass: REGISTRY_ADDRESS in .env differs from the deployment file; update .env (or set ALLOW_REGISTRY_OVERRIDE=true)"
            )
        );
        script.resolve(json, 1874, stale, false, 0, RELAYER, 0);
    }

    function test_minterFromKeyAndMismatch() public {
        assertEq(script.resolve(json, 1874, address(0), false, 0, address(0), RELAYER_KEY).minter, RELAYER);
        assertEq(script.resolve(json, 1874, address(0), false, 0, RELAYER, RELAYER_KEY).minter, RELAYER);
        vm.expectRevert(bytes("DeployGenesisPass: RELAYER_ADDRESS does not match RELAYER_PRIVATE_KEY"));
        script.resolve(json, 1874, address(0), false, 0, makeAddr("other"), RELAYER_KEY);
    }

    function test_missingMinterRefused() public {
        vm.expectRevert(bytes("DeployGenesisPass: set RELAYER_ADDRESS (the relayer hot wallet = minter)"));
        script.resolve(json, 1874, address(0), false, 0, address(0), 0);
    }

    function test_fileForAnotherChainRefused() public {
        vm.expectRevert(bytes("DeployGenesisPass: deployment file is for another chain"));
        script.resolve(json, 1337, address(0), false, 0, RELAYER, 0);
    }

    function test_appIdRange() public {
        vm.expectRevert(bytes("DeployGenesisPass: app id must be below 2^248 (F5)"));
        script.resolve(json, 1874, address(0), false, uint256(1) << 248, RELAYER, 0);
    }
}
