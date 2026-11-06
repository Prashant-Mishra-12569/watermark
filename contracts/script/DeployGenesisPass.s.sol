// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {WatermarkGenesisPass} from "../src/WatermarkGenesisPass.sol";
import {WatermarkPassRenderer} from "../src/WatermarkPassRenderer.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";

/// @dev The deployment file's WatermarkSponsor: the relayer reads unlock task 2 (one payment) from its events.
interface ISponsorInfo {
    function relayer() external view returns (address);
    function appId() external view returns (uint256);
}

/// @notice Deploys WatermarkPassRenderer (the on-chain artwork), then WatermarkGenesisPass wired to it, on Whitechain
/// Sepolia: two transactions. The deployer key never appears here: forge signs with the account passed on the CLI
/// (`--account deployer`, the encrypted keystore). `--verify` verifies both contracts on Blockscout.
///
/// Settings, highest priority first (empty values count as unset):
///   REGISTRY_ADDRESS  "registry" in the deployment file, else env (required). When both are set they must match
///                     (ALLOW_REGISTRY_OVERRIDE=true lets the env value win), as in DeploySponsor.
///   PASS_APP_ID       env (decimal), else "liveAppId" in the deployment file (required). APP_ID is deliberately NOT
///                     read: in .env it may hold the test app, and the pass must bind to the live app for good.
///                     The preflight refuses an app that the file's "sponsor" doesn't pay for: the relayer checks
///                     task 2 against that sponsor's payments, so no wallet could unlock both tasks.
///   RELAYER_ADDRESS   env, else the address of RELAYER_PRIVATE_KEY (required): the minter, the relayer hot wallet
///                     that calls mint and pays its gas. When both are set they must match.
/// The deployment file is ../deployments/<whitechain|devnet|local>.json for chain 1874 / 1337 / anything else, or
/// ../deployments/$DEPLOYMENT_FILE. When present its chainId must match the RPC's.
///
///   cd contracts
///   ( set -a; . ../.env; set +a; forge script script/DeployGenesisPass.s.sol --rpc-url whitechain --account deployer )
///   ( set -a; . ../.env; set +a; forge script script/DeployGenesisPass.s.sol --rpc-url whitechain --account deployer \
///       --broadcast --verify --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ )
/// The first line is the dry run (no --broadcast: nothing is sent). Then set GENESIS_PASS_ADDRESS in .env,
/// NEXT_PUBLIC_GENESIS_PASS_ADDRESS for the web, and "genesisPass" and "genesisPassRenderer" (plus their
/// "txHashes" entries) in deployments/whitechain.json.
///
/// Dry run against a local fork (nothing reaches the real chain). The fork keeps chain id 1874, so write the
/// broadcast log outside the repo and delete cache/DeployGenesisPass.s.sol/1874 afterwards. The minter is the
/// sponsor's relayer() (cast call <sponsor> "relayer()(address)").
///   anvil --fork-url https://rpc.testnet.whitechain.io --port 18800
///   FOUNDRY_BROADCAST=/tmp/wgp-fork RELAYER_ADDRESS=<relayer> DEPLOYMENT_FILE=whitechain.json \
///     forge script script/DeployGenesisPass.s.sol --rpc-url http://127.0.0.1:18800 --broadcast --private-key <key>
contract DeployGenesisPass is Script {
    struct Config {
        address registry;
        uint256 appId;
        address minter;
        address sponsor; // from the deployment file, only for a sanity warning
        string deploymentFile; // empty when no file was found
    }

    function run() external returns (WatermarkGenesisPass pass) {
        Config memory c = loadConfig();
        preflight(c);
        pass = deploy(c);
    }

    /// @notice Deploys the renderer and the pass and checks the wiring. Public so a fork test can run the same code.
    function deploy(Config memory c) public returns (WatermarkGenesisPass pass) {
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        WatermarkPassRenderer renderer = new WatermarkPassRenderer();
        pass = new WatermarkGenesisPass(c.registry, c.appId, c.minter, address(renderer));
        vm.stopBroadcast();

        require(address(pass.registry()) == c.registry, "DeployGenesisPass: registry");
        require(pass.appId() == c.appId, "DeployGenesisPass: appId");
        require(pass.minter() == c.minter, "DeployGenesisPass: minter");
        require(address(pass.renderer()) == address(renderer), "DeployGenesisPass: renderer");
        require(pass.totalSupply() == 0 && pass.remaining() == 100, "DeployGenesisPass: supply");
        // The art renders before any mint (the pass's own svg() needs a minted token, the renderer doesn't).
        require(_endsWithSvgClose(bytes(renderer.svg(100))), "DeployGenesisPass: renderer.svg");
        require(keccak256(bytes(renderer.landmark(1))) == keccak256("Gateway of India"), "DeployGenesisPass: landmark");

        console2.log("chainId              ", block.chainid);
        console2.log("deployer             ", deployer);
        console2.log("WatermarkPassRenderer", address(renderer));
        console2.log("WatermarkGenesisPass ", address(pass));
        console2.log("registry             ", c.registry);
        console2.log("appId (decimal)      ", c.appId);
        console2.log("minter (relayer)     ", c.minter);
        console2.log("sponsor (payments)   ", c.sponsor);
        console2.log("renderer code size   ", address(renderer).code.length);
        console2.log("pass code size       ", address(pass).code.length);
        console2.log("Next: GENESIS_PASS_ADDRESS in .env and \"genesisPass\" in the deployment file:");
        console2.log(address(pass));
    }

    function _endsWithSvgClose(bytes memory s) internal pure returns (bool) {
        bytes memory tail = "</svg>";
        if (s.length < tail.length) return false;
        for (uint256 i; i < tail.length; i++) {
            if (s[s.length - tail.length + i] != tail[i]) return false;
        }
        return true;
    }

    /// @notice Resolves the settings (env, then the deployment file).
    function loadConfig() public view returns (Config memory c) {
        string memory path = _deploymentPath();
        string memory json;
        if (vm.exists(path)) json = vm.readFile(path);
        c = resolve(
            json,
            block.chainid,
            vm.envOr("REGISTRY_ADDRESS", address(0)),
            vm.envOr("ALLOW_REGISTRY_OVERRIDE", false),
            vm.envOr("PASS_APP_ID", uint256(0)),
            vm.envOr("RELAYER_ADDRESS", address(0)),
            // Read with envOr(uint256) and only passed to vm.addr, both of which forge redacts in traces.
            vm.envOr("RELAYER_PRIVATE_KEY", uint256(0))
        );
        if (bytes(json).length != 0) c.deploymentFile = path;
    }

    /// @notice The whole resolution without env access, so tests can feed it values without touching process env
    /// (DeploySponsorEnvTest sets the same variable names).
    function resolve(
        string memory json,
        uint256 chainId,
        address envRegistry,
        bool allowRegistryOverride,
        uint256 envAppId,
        address envRelayer,
        uint256 relayerKey
    ) public view returns (Config memory c) {
        if (bytes(json).length != 0) {
            uint256 fileChain = _jsonUint(json, ".chainId");
            require(fileChain == 0 || fileChain == chainId, "DeployGenesisPass: deployment file is for another chain");
        }
        address fileRegistry = _jsonAddress(json, ".registry");
        if (envRegistry == address(0)) {
            c.registry = fileRegistry;
        } else if (fileRegistry == address(0) || fileRegistry == envRegistry || allowRegistryOverride) {
            c.registry = envRegistry;
        } else {
            revert(
                "DeployGenesisPass: REGISTRY_ADDRESS in .env differs from the deployment file; update .env (or set ALLOW_REGISTRY_OVERRIDE=true)"
            );
        }

        c.appId = envAppId != 0 ? envAppId : _jsonUint(json, ".liveAppId");

        c.minter = envRelayer;
        if (relayerKey != 0) {
            address fromKey = vm.addr(relayerKey);
            require(
                envRelayer == address(0) || envRelayer == fromKey,
                "DeployGenesisPass: RELAYER_ADDRESS does not match RELAYER_PRIVATE_KEY"
            );
            c.minter = fromKey;
        }
        c.sponsor = _jsonAddress(json, ".sponsor");

        require(
            c.registry != address(0), "DeployGenesisPass: set REGISTRY_ADDRESS (or registry in the deployment file)"
        );
        require(c.appId != 0, "DeployGenesisPass: set PASS_APP_ID (or liveAppId in the deployment file)");
        require(c.appId >> 248 == 0, "DeployGenesisPass: app id must be below 2^248 (F5)");
        require(c.minter != address(0), "DeployGenesisPass: set RELAYER_ADDRESS (the relayer hot wallet = minter)");
    }

    /// @notice Checks before any gas is spent.
    function preflight(Config memory c) public view {
        console2.log("deployment file      ", bytes(c.deploymentFile).length > 0 ? c.deploymentFile : "(none)");
        require(c.registry.code.length > 0, "DeployGenesisPass: REGISTRY_ADDRESS has no code on this chain");
        // The pass calls isStamped on every mint (F5).
        IWatermarkRegistry(c.registry).isStamped(c.minter, c.appId);
        (address owner,,) = IWatermarkRegistry(c.registry).apps(c.appId);
        require(owner != address(0) || block.chainid != 1874, "DeployGenesisPass: app id is not registered");
        if (owner == address(0)) console2.log("WARNING: app id is not registered; every mint will be NotStamped");
        if (c.minter.code.length > 0) console2.log("WARNING: RELAYER_ADDRESS is a contract, not the relayer EOA");
        if (c.minter.balance == 0) console2.log("WARNING: the relayer has no gas money (WBT) on this chain yet");
        if (c.sponsor != address(0) && c.sponsor.code.length > 0) {
            try ISponsorInfo(c.sponsor).relayer() returns (address r) {
                if (r != c.minter) console2.log("WARNING: the minter is not the sponsor's relayer", r);
            } catch {}
            // Task 2 is read from this sponsor's PaymentRelayed events, and it only pays for stamped wallets of its
            // own app. A pass for any other app could never be claimed.
            try ISponsorInfo(c.sponsor).appId() returns (uint256 sponsorApp) {
                require(
                    sponsorApp == c.appId, "DeployGenesisPass: the sponsor in the deployment file pays for another app"
                );
            } catch {}
        } else if (block.chainid == 1874) {
            console2.log("WARNING: no sponsor in the deployment file; the relayer can't check task 2 (one payment)");
        }
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

    function _jsonAddress(string memory json, string memory key) internal view returns (address) {
        if (_missingOrNull(json, key)) return address(0);
        return vm.parseJsonAddress(json, key);
    }

    /// @dev Accepts a JSON number or a decimal string (deployment-json.ts writes app ids as strings).
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
