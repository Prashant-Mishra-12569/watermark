// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";

/// Stamps WALLET on a devnet WatermarkRegistry with a synthetic-card proof fixture (the JSON written by
/// contracts/script/gen-stamp-fixture.ts), e.g. test/fixtures/devnet-stamp.json.
///
/// The proof's public input [2] is the appId, which is bound to the app owner (registerApp keys on msg.sender), so
/// the committed fixture (appOwner 0x...A11CE) cannot be used on a registry we deploy: regenerate it with
/// APP_OWNER = the devnet deployer (tools/ef-sender/README.md, step 3). Session nonce, UN, caRoot, rulesRoot and
/// validUntilMonth all come from the fixture; the session is signed with the app's session signer.
///
///   FIXTURE=test/fixtures/devnet-stamp.json REGISTRY=0x... WALLET=0x... \
///   forge script script/StampFromFixture.s.sol --rpc-url devnet --account devnet --broadcast --legacy \
///     --with-gas-price 100000007 --gas-estimate-multiplier 300 --slow
///     (SESSION_SIGNER_PK in the environment; it is used only for vm.sign and never printed)
/// The devnet charges state gas that forge's estimate omits, hence the multiplier (tools/ef-sender/README.md).
contract StampFromFixture is Script {
    function run() external {
        string memory json = vm.readFile(vm.envString("FIXTURE"));
        IWatermarkRegistry reg = IWatermarkRegistry(vm.envAddress("REGISTRY"));
        address wallet = vm.envAddress("WALLET");

        uint256 appId = _checkApp(reg, json);
        IWatermarkRegistry.Session memory s = _session(reg, json, wallet, appId);
        bytes memory sig = _sign(reg, s);
        // The registry's verifier is a VerifierRouter: prefix the RuPay profile byte 0x00 (interfaces F3/F5 v1.1).
        bytes memory proof = abi.encodePacked(uint8(0), vm.parseJsonBytes(json, ".proof"));
        bytes32[] memory pis = vm.parseJsonBytes32Array(json, ".publicInputs");

        vm.startBroadcast();
        reg.stamp(s, sig, proof, pis);
        vm.stopBroadcast();

        (bool ok, uint64 expiresAt) = reg.isStamped(wallet, appId);
        require(ok, "not stamped");
        console2.log("stamped wallet", wallet);
        console2.log("appId         ", appId);
        console2.log("expiresAt     ", expiresAt);
    }

    function _checkApp(IWatermarkRegistry reg, string memory json) internal view returns (uint256 appId) {
        appId = vm.parseUint(vm.parseJsonString(json, ".appId"));
        (address appOwner, bytes32 rulesRoot, address sessionSigner) = reg.apps(appId);
        require(appOwner != address(0), "appId of the fixture is not registered here: regenerate with APP_OWNER");
        require(sessionSigner == vm.addr(vm.envUint("SESSION_SIGNER_PK")), "SESSION_SIGNER_PK is not the app's signer");
        require(
            rulesRoot == vm.parseJsonBytes32(json, ".rulesRoot"),
            "rulesRoot mismatch (deploy with RULES_ROOT=<fixture rulesRoot>)"
        );
        require(reg.caRoot() == vm.parseJsonBytes32(json, ".caRoot"), "caRoot mismatch (CA_ROOT=<fixture caRoot>?)");
    }

    function _session(IWatermarkRegistry reg, string memory json, address wallet, uint256 appId)
        internal
        view
        returns (IWatermarkRegistry.Session memory)
    {
        return IWatermarkRegistry.Session({
            wallet: wallet,
            appId: appId,
            nonce: vm.parseJsonBytes32(json, ".nonce"),
            expiresAt: uint64(block.timestamp + 1 hours),
            validUntilMonth: uint32(vm.parseJsonUint(json, ".validUntilMonth")),
            chainId: block.chainid,
            registry: address(reg)
        });
    }

    function _sign(IWatermarkRegistry reg, IWatermarkRegistry.Session memory s) internal view returns (bytes memory) {
        bytes32 digest = HashSession(address(reg)).hashSession(s);
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(vm.envUint("SESSION_SIGNER_PK"), digest);
        return abi.encodePacked(r, ss, v);
    }
}

interface HashSession {
    function hashSession(IWatermarkRegistry.Session calldata s) external view returns (bytes32);
}
