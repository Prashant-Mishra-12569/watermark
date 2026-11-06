// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {HonkVerifier} from "../src/generated/Verifier.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {VerifierRouter} from "../src/VerifierRouter.sol";
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
///   SESSION_SIGNER_ADDRESS  the relayer's session signer (not the relayer or deployer key). Required unless
///                           SESSION_SIGNER_KEY is set, in which case it is derived from the key.
///   SESSION_SIGNER_KEY      optional cross-check: when set, its address must equal SESSION_SIGNER_ADDRESS. This is
///                           the key the relayer really signs with, and an app's session signer can never change.
///   APP_SALT                bytes32, default 0x00..00; a new salt = a new appId from the same deployer
///   POLICY                  policies/<file> that supplies RULES_ROOT, default test.json
///   CA_ROOT                 default ../policies/ca-keys.json .caRoot
///   RULES_ROOT              default ../policies/$POLICY .rulesRoot
///   ALLOW_TEST_SIGNER       "true" lets a public anvil/hardhat address be the session signer on 1874 / 1337 (local
///                           forks of those chains only; never for the real deploy)
/// Refused: a session signer that is one of the 10 public anvil/hardhat accounts on chain 1874 or 1337 (anyone could
/// sign sessions and steal taps in flight), and a session signer equal to the deployer.
/// The deployer becomes the registry owner (setCaRoot). Move it later with transferOwnership + acceptOwnership.
contract Deploy is Script {
    /// @dev Reads an env var as a string; unset and empty both return "".
    function _env(string memory name) internal view returns (string memory) {
        return vm.envOr(name, string(""));
    }

    function _isSet(string memory v) internal pure returns (bool) {
        return bytes(v).length != 0;
    }

    /// @notice The 10 default anvil/hardhat accounts ("test test ... junk"). Their keys are public.
    function isPublicTestAccount(address a) public pure returns (bool) {
        return a == 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 || a == 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
            || a == 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC || a == 0x90F79bf6EB2c4f870365E785982E1f101E93b906
            || a == 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 || a == 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc
            || a == 0x976EA74026E726554dB657fA54763abd0C3a0aa9 || a == 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955
            || a == 0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f || a == 0xa0Ee7A142d267C1f36714E4a8F75612F20a79720;
    }

    /// @notice SESSION_SIGNER_ADDRESS, checked against SESSION_SIGNER_KEY when that is set (or derived from it).
    /// @dev The key is read with envOr(uint256) and only passed to vm.addr, both of which forge redacts in traces.
    function sessionSignerFromEnv() public view returns (address signer) {
        uint256 key = vm.envOr("SESSION_SIGNER_KEY", uint256(0));
        address fromKey = key == 0 ? address(0) : vm.addr(key);
        if (_isSet(_env("SESSION_SIGNER_ADDRESS"))) {
            signer = vm.parseAddress(_env("SESSION_SIGNER_ADDRESS"));
            require(
                fromKey == address(0) || fromKey == signer,
                "Deploy: SESSION_SIGNER_ADDRESS does not match SESSION_SIGNER_KEY"
            );
        } else {
            require(fromKey != address(0), "Deploy: set SESSION_SIGNER_ADDRESS (export ../.env first)");
            signer = fromKey;
        }
        require(signer != address(0), "Deploy: sessionSigner is zero");
        bool liveChain = block.chainid == 1874 || block.chainid == 1337;
        bool allowTest = keccak256(bytes(_env("ALLOW_TEST_SIGNER"))) == keccak256("true");
        require(
            !liveChain || allowTest || !isPublicTestAccount(signer),
            "Deploy: SESSION_SIGNER_ADDRESS is a public test key"
        );
    }

    struct Cfg {
        string policy;
        bytes32 caRoot;
        bytes32 rulesRoot;
        address sessionSigner;
        bytes32 salt;
        bytes32 liveRulesRoot; // zero = no live app
        bytes32 liveSalt;
    }

    function _config() internal view returns (Cfg memory c) {
        string memory root = vm.projectRoot();
        c.policy = _isSet(_env("POLICY")) ? _env("POLICY") : "test.json";
        if (_isSet(_env("CA_ROOT"))) {
            c.caRoot = vm.parseBytes32(_env("CA_ROOT"));
        } else {
            c.caRoot = vm.parseJsonBytes32(vm.readFile(string.concat(root, "/../policies/ca-keys.json")), ".caRoot");
        }
        if (_isSet(_env("RULES_ROOT"))) {
            c.rulesRoot = vm.parseBytes32(_env("RULES_ROOT"));
        } else {
            c.rulesRoot = vm.parseJsonBytes32(vm.readFile(string.concat(root, "/../policies/", c.policy)), ".rulesRoot");
        }
        c.sessionSigner = sessionSignerFromEnv();
        c.salt = _isSet(_env("APP_SALT")) ? vm.parseBytes32(_env("APP_SALT")) : bytes32(0);
        require(c.caRoot != bytes32(0), "Deploy: caRoot is zero");
        require(c.rulesRoot != bytes32(0), "Deploy: rulesRoot is zero");

        // Live app: policies/live.json under LIVE_APP_SALT (default 0x..01), unless REGISTER_LIVE=false or the main
        // policy already is live.json. Rules are immutable per appId, so the live filter gets its own app.
        c.liveSalt = _isSet(_env("LIVE_APP_SALT")) ? vm.parseBytes32(_env("LIVE_APP_SALT")) : bytes32(uint256(1));
        bool registerLive = keccak256(bytes(_env("REGISTER_LIVE"))) != keccak256("false")
            && keccak256(bytes(c.policy)) != keccak256("live.json");
        if (registerLive) {
            c.liveRulesRoot =
                vm.parseJsonBytes32(vm.readFile(string.concat(root, "/../policies/live.json")), ".rulesRoot");
            require(c.liveSalt != c.salt, "Deploy: LIVE_APP_SALT must differ from APP_SALT");
        }
    }

    /// @dev Profile 0 = today's RuPay circuit. The registry calls the router, which strips the 1-byte profile prefix
    /// and forwards to that profile's HonkVerifier, so new card profiles can be added later without a redeploy.
    function _deploy(Cfg memory c)
        internal
        returns (address router, address registry, address honk, uint256 appId, uint256 liveAppId)
    {
        honk = address(new HonkVerifier());
        VerifierRouter r = new VerifierRouter();
        r.setVerifier(0, IVerifier(honk));
        router = address(r);
        WatermarkRegistry reg = new WatermarkRegistry(IVerifier(router));
        reg.setCaRoot(c.caRoot);
        appId = reg.registerApp(c.salt, c.rulesRoot, c.sessionSigner);
        if (c.liveRulesRoot != bytes32(0)) liveAppId = reg.registerApp(c.liveSalt, c.liveRulesRoot, c.sessionSigner);
        registry = address(reg);
    }

    function _check(Cfg memory c, WatermarkRegistry reg, address deployer, uint256 appId, uint256 liveAppId)
        internal
        view
    {
        require(appId == reg.computeAppId(deployer, c.salt), "Deploy: appId mismatch");
        (address appOwner, bytes32 storedRules, address storedSigner) = reg.apps(appId);
        require(appOwner == deployer && storedRules == c.rulesRoot && storedSigner == c.sessionSigner, "Deploy: app");
        if (c.liveRulesRoot != bytes32(0)) {
            require(liveAppId == reg.computeAppId(deployer, c.liveSalt), "Deploy: live appId mismatch");
            (appOwner, storedRules, storedSigner) = reg.apps(liveAppId);
            require(
                appOwner == deployer && storedRules == c.liveRulesRoot && storedSigner == c.sessionSigner,
                "Deploy: live app"
            );
        }
        require(reg.caRoot() == c.caRoot, "Deploy: caRoot");
        require(reg.owner() == deployer, "Deploy: owner");
        require(address(reg.verifier()) != address(0), "Deploy: verifier");
    }

    function run() external returns (address verifier, address registry, uint256 appId) {
        Cfg memory c = _config();
        console2.log("chainId          ", block.chainid);
        console2.log("policy           ", c.policy);
        console2.log("caRoot");
        console2.logBytes32(c.caRoot);
        console2.log("rulesRoot");
        console2.logBytes32(c.rulesRoot);
        console2.log("live rulesRoot");
        console2.logBytes32(c.liveRulesRoot);
        console2.log("sessionSigner    ", c.sessionSigner);
        console2.log("appSalt");
        console2.logBytes32(c.salt);

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers(); // the broadcasting account from --private-key / --account
        // Checked before the first transaction: the deployer key must not also be able to sign sessions.
        if (c.sessionSigner == deployer) {
            vm.stopBroadcast(); // nothing was sent yet; close the broadcast so the revert leaves no state behind
            revert("Deploy: session signer must not be the deployer");
        }
        address honk;
        uint256 liveAppId;
        (verifier, registry, honk, appId, liveAppId) = _deploy(c);
        vm.stopBroadcast();
        _check(c, WatermarkRegistry(registry), deployer, appId, liveAppId);

        console2.log("deployer         ", deployer);
        console2.log("HonkVerifier (p0)", honk);
        console2.log("VerifierRouter   ", verifier);
        console2.log("WatermarkRegistry", registry);
        console2.log("appId (decimal)  ", appId);
        console2.log("appId (hex)");
        console2.logBytes32(bytes32(appId));
        console2.log("live appId (dec) ", liveAppId);
        console2.log("router code size ", verifier.code.length);
        console2.log("registry code size", registry.code.length);
    }
}
