// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {WatermarkSponsor} from "../src/WatermarkSponsor.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";

/// @notice Deploys one WatermarkSponsor for one app on Whitechain Sepolia (interfaces F5, F7). The deployer key never
/// appears here: forge signs with the account passed on the CLI (`--account deployer`, the encrypted keystore).
///
/// Settings, highest priority first (each falls back to the next source):
///   REGISTRY_ADDRESS  "registry" in the deployment file, else env (required). When both are set they must match,
///                     because a stale .env value would bind the sponsor to an old registry for good
///                     (ALLOW_REGISTRY_OVERRIDE=true lets the env value win).
///   APP_ID            env (decimal), else "liveAppId" in the deployment file, else its "appId" (required). The live
///                     app wins over the test app, so a redeploy without APP_ID still serves the real card taps.
///   RELAYER_ADDRESS   env, else "relayer" in the deployment file, else the address of RELAYER_PRIVATE_KEY (required:
///                     the relayer hot wallet that calls relayPayment). When RELAYER_PRIVATE_KEY is set, the address
///                     must be its address.
///   QUOTA_PER_DAY     env, else "quotaPerDay" in ../policies/$POLICY (POLICY empty or unset = test.json), else 20
///   USDT_ADDRESS      env, else "usdt" in the deployment file, else 0xcedf…55a7 (Whitechain USDT)
/// Empty values count as unset.
/// The deployment file is ../deployments/<whitechain|devnet|local>.json for chain 1874 / 1337 / anything else, or
/// ../deployments/$DEPLOYMENT_FILE. It is optional; when present its chainId must match the RPC's.
/// On chain 1874 an APP_ID that isn't registered in the registry is refused (set ALLOW_UNREGISTERED_APP=true to override).
///
/// forge only auto-loads .env from contracts/, so export the repo's .env in a subshell (the keys in it do not outlive
/// the command):
///   cd contracts
///   ( set -a; . ../.env; set +a; \
///     forge script script/DeploySponsor.s.sol --rpc-url whitechain --account deployer --broadcast )
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
        Config memory file;
        if (vm.exists(path)) {
            file = fromDeploymentJson(vm.readFile(path), block.chainid);
            c.deploymentFile = path;
        } else {
            file.usdt = WHITECHAIN_USDT;
        }

        // vm.envOr returns the default for an unset or empty address / uint / bool.
        c.registry = resolveRegistry(
            vm.envOr("REGISTRY_ADDRESS", address(0)), file.registry, vm.envOr("ALLOW_REGISTRY_OVERRIDE", false)
        );
        c.appId = vm.envOr("APP_ID", file.appId);
        // The key is read with envOr(uint256) and only passed to vm.addr, both of which forge redacts in traces.
        c.relayer =
            resolveRelayer(vm.envOr("RELAYER_ADDRESS", file.relayer), vm.envOr("RELAYER_PRIVATE_KEY", uint256(0)));
        c.usdt = vm.envOr("USDT_ADDRESS", file.usdt);
        // Only read the policy file when QUOTA_PER_DAY is unset (an envOr default would be evaluated anyway).
        uint256 quota = vm.envOr("QUOTA_PER_DAY", uint256(0));
        c.quota = quota != 0 ? quota : _policyQuota();

        require(c.registry != address(0), "DeploySponsor: set REGISTRY_ADDRESS (or registry in the deployment file)");
        require(c.appId != 0, "DeploySponsor: set APP_ID (or appId in the deployment file)");
        require(c.relayer != address(0), "DeploySponsor: set RELAYER_ADDRESS (the relayer hot wallet)");
        require(c.quota > 0 && c.quota <= type(uint32).max, "DeploySponsor: QUOTA_PER_DAY out of range");
        require(c.appId >> 248 == 0, "DeploySponsor: APP_ID must be below 2^248 (F5)");
    }

    /// @notice The registry to use: the deployment file's (fresh from deployment-json.ts) unless only env names one.
    /// A different env value is refused unless `allowOverride`, so a stale REGISTRY_ADDRESS can't win silently.
    function resolveRegistry(address fromEnv, address fromFile, bool allowOverride) public pure returns (address) {
        if (fromEnv == address(0)) return fromFile;
        if (fromFile == address(0) || fromFile == fromEnv || allowOverride) return fromEnv;
        revert(
            "DeploySponsor: REGISTRY_ADDRESS in .env differs from the deployment file; update .env (or set ALLOW_REGISTRY_OVERRIDE=true)"
        );
    }

    /// @notice The relayer address, checked against RELAYER_PRIVATE_KEY when that is set (or derived from it).
    function resolveRelayer(address configured, uint256 relayerKey) public pure returns (address) {
        if (relayerKey == 0) return configured;
        address fromKey = vm.addr(relayerKey);
        require(
            configured == address(0) || configured == fromKey,
            "DeploySponsor: RELAYER_ADDRESS does not match RELAYER_PRIVATE_KEY"
        );
        return fromKey;
    }

    /// @notice The file layer alone, without env (so tests can feed it JSON). Missing keys and nulls read as
    /// zero; usdt falls back to Whitechain USDT. appId is "liveAppId" when the file has one, else "appId". A "chainId"
    /// in the file must equal `chainId`.
    function fromDeploymentJson(string memory json, uint256 chainId) public view returns (Config memory c) {
        uint256 fileChain = _jsonUint(json, ".chainId");
        require(fileChain == 0 || fileChain == chainId, "DeploySponsor: deployment file is for another chain");
        c.registry = _jsonAddress(json, ".registry");
        c.appId = _jsonUint(json, ".liveAppId");
        if (c.appId == 0) c.appId = _jsonUint(json, ".appId");
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
        string memory policy = vm.envOr("POLICY", string(""));
        if (bytes(policy).length == 0) policy = "test.json"; // an exported `POLICY=` line is "" here, not unset
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
