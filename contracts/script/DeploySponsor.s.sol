// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {WatermarkSponsor} from "../src/WatermarkSponsor.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";

/// @notice Deploys one WatermarkSponsor for one app on Whitechain Sepolia (interfaces F5, F7). The deployer key never
/// appears here: forge signs with the account passed on the CLI (`--account deployer`, the encrypted keystore).
///
/// Settings, highest priority first (each falls back to the next source):
///   REGISTRY_ADDRESS  env, else "registry" in the deployment file (required)
///   APP_ID            env (decimal), else "appId" in the deployment file (required)
///   RELAYER_ADDRESS   env, else "relayer" in the deployment file (required: the relayer hot wallet that calls
///                     relayPayment; deployment-json.ts doesn't write it, so normally from env)
///   QUOTA_PER_DAY     env, else "quotaPerDay" in ../policies/$POLICY (POLICY defaults to test.json), else 20
///   USDT_ADDRESS      env, else "usdt" in the deployment file, else 0xcedf…55a7 (Whitechain USDT)
/// The deployment file is ../deployments/<whitechain|devnet|local>.json for chain 1874 / 1337 / anything else, or
/// ../deployments/$DEPLOYMENT_FILE. It is optional; when present its chainId must match the RPC's.
/// On chain 1874 an APP_ID that isn't registered in the registry is refused (set ALLOW_UNREGISTERED_APP=true to override).
///
/// forge only auto-loads .env from contracts/, so load the repo's .env yourself (it has RELAYER_ADDRESS etc.):
///   cd contracts
///   set -a; . ../.env; set +a
///   forge script script/DeploySponsor.s.sol --rpc-url whitechain --account deployer --broadcast
/// Leave out --broadcast for a simulation first (it still asks for the keystore password). Then put the printed
/// address in deployments/whitechain.json ("sponsor", "txHashes.sponsor") and SPONSOR_ADDRESS in .env.
///
/// Dry run against a local fork (nothing reaches the real chain):
///   anvil --fork-url https://rpc.testnet.whitechain.io --port 18581
///   forge script script/DeploySponsor.s.sol --rpc-url http://127.0.0.1:18581 --broadcast \
///     --private-key <anvil test key>
contract DeploySponsor is Script {
    address internal constant WHITECHAIN_USDT = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    uint256 internal constant DEFAULT_QUOTA = 20;

    struct Config {
        address registry;
        uint256 appId;
        address usdt;
        address relayer;
        uint256 quota;
        string deploymentFile; // empty when no file was found
    }

    function run() external returns (WatermarkSponsor sponsor) {
        Config memory c = loadConfig();
        _preflight(c);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers(); // the broadcasting account from --account / --private-key
        // forge-lint: disable-next-line(unsafe-typecast) range-checked in loadConfig
        sponsor = new WatermarkSponsor(c.registry, c.appId, c.usdt, c.relayer, uint32(c.quota));
        vm.stopBroadcast();

        require(address(sponsor.registry()) == c.registry, "DeploySponsor: registry");
        require(sponsor.appId() == c.appId, "DeploySponsor: appId");
        require(address(sponsor.usdt()) == c.usdt, "DeploySponsor: usdt");
        require(sponsor.relayer() == c.relayer, "DeploySponsor: relayer");
        require(sponsor.quotaPerDay() == c.quota, "DeploySponsor: quotaPerDay");

        console2.log("chainId          ", block.chainid);
        console2.log("deployer         ", deployer);
        console2.log("WatermarkSponsor ", address(sponsor));
        console2.log("registry         ", c.registry);
        console2.log("appId (decimal)  ", c.appId);
        console2.log("usdt             ", c.usdt);
        console2.log("relayer          ", c.relayer);
        console2.log("quotaPerDay      ", c.quota);
        console2.log("sponsor code size", address(sponsor).code.length);
        console2.log("Next: SPONSOR_ADDRESS in .env and \"sponsor\" in the deployment file:");
        console2.log(address(sponsor));
    }

    /// @notice Resolves the settings (env, then the deployment file, then defaults). Public so it can be run alone
    /// with `forge script script/DeploySponsor.s.sol --sig "loadConfig()"`.
    function loadConfig() public view returns (Config memory c) {
        string memory path = _deploymentPath();
        if (vm.exists(path)) {
            c = fromDeploymentJson(vm.readFile(path), block.chainid);
            c.deploymentFile = path;
        } else {
            c.usdt = WHITECHAIN_USDT;
        }

        c.registry = vm.envOr("REGISTRY_ADDRESS", c.registry);
        c.appId = vm.envOr("APP_ID", c.appId);
        c.relayer = vm.envOr("RELAYER_ADDRESS", c.relayer);
        c.usdt = vm.envOr("USDT_ADDRESS", c.usdt);
        c.quota = vm.envOr("QUOTA_PER_DAY", _policyQuota());

        require(c.registry != address(0), "DeploySponsor: set REGISTRY_ADDRESS (or registry in the deployment file)");
        require(c.appId != 0, "DeploySponsor: set APP_ID (or appId in the deployment file)");
        require(c.relayer != address(0), "DeploySponsor: set RELAYER_ADDRESS (the relayer hot wallet)");
        require(c.quota > 0 && c.quota <= type(uint32).max, "DeploySponsor: QUOTA_PER_DAY out of range");
        require(c.appId >> 248 == 0, "DeploySponsor: APP_ID must be below 2^248 (F5)");
    }

    /// @notice The file layer alone, without env (so tests can feed it JSON). Missing keys and nulls read as
    /// zero; usdt falls back to Whitechain USDT. A "chainId" in the file must equal `chainId`.
    function fromDeploymentJson(string memory json, uint256 chainId) public view returns (Config memory c) {
        uint256 fileChain = _jsonUint(json, ".chainId");
        require(fileChain == 0 || fileChain == chainId, "DeploySponsor: deployment file is for another chain");
        c.registry = _jsonAddress(json, ".registry");
        c.appId = _jsonUint(json, ".appId");
        c.relayer = _jsonAddress(json, ".relayer");
        c.usdt = _jsonAddress(json, ".usdt");
        if (c.usdt == address(0)) c.usdt = WHITECHAIN_USDT;
    }

    /// @dev Checks before any gas is spent.
    function _preflight(Config memory c) internal view {
        console2.log("deployment file  ", bytes(c.deploymentFile).length > 0 ? c.deploymentFile : "(none)");
        require(c.registry.code.length > 0, "DeploySponsor: REGISTRY_ADDRESS has no code on this chain");
        require(c.usdt.code.length > 0, "DeploySponsor: USDT has no code on this chain");
        if (block.chainid == 1874) {
            require(c.usdt == WHITECHAIN_USDT, "DeploySponsor: unexpected USDT on Whitechain Sepolia");
        }
        // The registry must answer isStamped (F5); the sponsor calls it on every payment.
        IWatermarkRegistry(c.registry).isStamped(c.relayer, c.appId);

        (address owner,,) = IWatermarkRegistry(c.registry).apps(c.appId);
        if (owner == address(0)) {
            bool allow = vm.envOr("ALLOW_UNREGISTERED_APP", false);
            require(block.chainid != 1874 || allow, "DeploySponsor: APP_ID is not registered in this registry");
            console2.log("WARNING: APP_ID is not registered in this registry; every payment will be NOT_STAMPED");
        } else {
            console2.log("app owner        ", owner);
        }
        if (c.relayer.code.length > 0) console2.log("WARNING: RELAYER_ADDRESS is a contract, not the relayer EOA");
        if (c.relayer.balance == 0) console2.log("WARNING: the relayer has no gas money (WBT) on this chain yet");
    }

    function _deploymentPath() internal view returns (string memory) {
        string memory name = vm.envOr("DEPLOYMENT_FILE", string(""));
        if (bytes(name).length == 0) {
            if (block.chainid == 1874) name = "whitechain.json";
            else if (block.chainid == 1337) name = "devnet.json";
            else name = "local.json";
        }
        return string.concat(vm.projectRoot(), "/../deployments/", name);
    }

    /// @dev Reads ../policies/$POLICY .quotaPerDay, or DEFAULT_QUOTA when the file or key is missing.
    function _policyQuota() internal view returns (uint256) {
        string memory policy = vm.envOr("POLICY", string("test.json"));
        string memory path = string.concat(vm.projectRoot(), "/../policies/", policy);
        if (!vm.exists(path)) return DEFAULT_QUOTA;
        uint256 q = _jsonUint(vm.readFile(path), ".quotaPerDay");
        return q == 0 ? DEFAULT_QUOTA : q;
    }

    /// @dev address(0) when the key is missing or null (deployment files use null for "not deployed yet").
    function _jsonAddress(string memory json, string memory key) internal view returns (address) {
        if (_missingOrNull(json, key)) return address(0);
        return vm.parseJsonAddress(json, key);
    }

    /// @dev 0 when the key is missing or null. Accepts a JSON number or a decimal string ("12345"), which is how
    /// deployment-json.ts writes appId (it can exceed 2^53).
    function _jsonUint(string memory json, string memory key) internal view returns (uint256) {
        if (_missingOrNull(json, key)) return 0;
        return vm.parseJsonUint(json, key);
    }

    /// @dev forge decodes a JSON null as one zero word.
    function _missingOrNull(string memory json, string memory key) internal view returns (bool) {
        if (bytes(json).length == 0 || !vm.keyExistsJson(json, key)) return true;
        bytes memory raw = vm.parseJson(json, key);
        return raw.length == 32 && bytes32(raw) == bytes32(0);
    }
}
