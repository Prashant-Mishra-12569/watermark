// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {HonkVerifier} from "../src/generated/Verifier.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";

/// @notice Deploys HonkVerifier (forge deploys and links ZKTranscriptLib first), then WatermarkRegistry(verifier),
/// sets caRoot and registers the app. The deployer key never appears here: it is the encrypted Foundry keystore
/// "deployer" (`cast wallet import deployer --interactive`), unlocked with its password at broadcast time.
///
/// forge only auto-loads a .env that sits in contracts/ (the project root); ours is in the repo root, so export it
/// in a subshell (the variables do not outlive the command):
///
///   cd contracts
///   ( set -a; . ../.env; set +a; \
///     forge script script/Deploy.s.sol --rpc-url whitechain --account deployer --broadcast )
///   node script/deployment-json.ts 1874
///
/// Dry run first: the same command without --broadcast simulates against the live chain and sends nothing.
/// Devnet: --rpc-url devnet, then `node script/deployment-json.ts 1337`.
///
/// Environment (empty values count as unset, so a blank line in .env is harmless):
///   SESSION_SIGNER_ADDRESS  required; the relayer's session signer (not the relayer or deployer key)
///   APP_SALT                bytes32, default 0x00..00; a new salt = a new appId from the same deployer
///   POLICY                  policies/<file> that supplies RULES_ROOT, default test.json
///   CA_ROOT                 default ../policies/ca-keys.json .caRoot
///   RULES_ROOT              default ../policies/$POLICY .rulesRoot
/// The deployer becomes the registry owner (setCaRoot). Move it later with transferOwnership + acceptOwnership.
contract Deploy is Script {
    /// @dev Reads an env var as a string; unset and empty both return "".
    function _env(string memory name) internal view returns (string memory) {
        return vm.envOr(name, string(""));
    }

    function _isSet(string memory v) internal pure returns (bool) {
        return bytes(v).length != 0;
    }

    function run() external returns (address verifier, address registry, uint256 appId) {
        string memory root = vm.projectRoot();
        string memory policy = _isSet(_env("POLICY")) ? _env("POLICY") : "test.json";

        bytes32 caRoot;
        if (_isSet(_env("CA_ROOT"))) {
            caRoot = vm.parseBytes32(_env("CA_ROOT"));
        } else {
            string memory caJson = vm.readFile(string.concat(root, "/../policies/ca-keys.json"));
            caRoot = vm.parseJsonBytes32(caJson, ".caRoot");
        }
        bytes32 rulesRoot;
        if (_isSet(_env("RULES_ROOT"))) {
            rulesRoot = vm.parseBytes32(_env("RULES_ROOT"));
        } else {
            string memory policyJson = vm.readFile(string.concat(root, "/../policies/", policy));
            rulesRoot = vm.parseJsonBytes32(policyJson, ".rulesRoot");
        }
        require(_isSet(_env("SESSION_SIGNER_ADDRESS")), "Deploy: set SESSION_SIGNER_ADDRESS (export ../.env first)");
        address sessionSigner = vm.parseAddress(_env("SESSION_SIGNER_ADDRESS"));
        bytes32 salt = _isSet(_env("APP_SALT")) ? vm.parseBytes32(_env("APP_SALT")) : bytes32(0);

        require(sessionSigner != address(0), "Deploy: sessionSigner is zero");

        require(caRoot != bytes32(0), "Deploy: caRoot is zero");
        require(rulesRoot != bytes32(0), "Deploy: rulesRoot is zero");

        console2.log("chainId          ", block.chainid);
        console2.log("policy           ", policy);
        console2.log("caRoot");
        console2.logBytes32(caRoot);
        console2.log("rulesRoot");
        console2.logBytes32(rulesRoot);
        console2.log("sessionSigner    ", sessionSigner);
        console2.log("appSalt");
        console2.logBytes32(salt);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers(); // the broadcasting account from --private-key / --account
        verifier = address(new HonkVerifier());
        WatermarkRegistry reg = new WatermarkRegistry(IVerifier(verifier));
        reg.setCaRoot(caRoot);
        appId = reg.registerApp(salt, rulesRoot, sessionSigner);
        vm.stopBroadcast();
        registry = address(reg);

        require(appId == reg.computeAppId(deployer, salt), "Deploy: appId mismatch");
        (address appOwner, bytes32 storedRules, address storedSigner) = reg.apps(appId);
        require(appOwner == deployer && storedRules == rulesRoot && storedSigner == sessionSigner, "Deploy: app");
        require(reg.caRoot() == caRoot, "Deploy: caRoot");
        require(reg.owner() == deployer, "Deploy: owner");

        console2.log("deployer         ", deployer);
        console2.log("HonkVerifier     ", verifier);
        console2.log("WatermarkRegistry", registry);
        console2.log("appId (decimal)  ", appId);
        console2.log("appId (hex)");
        console2.logBytes32(bytes32(appId));
        console2.log("verifier code size", verifier.code.length);
        console2.log("registry code size", registry.code.length);
    }
}
