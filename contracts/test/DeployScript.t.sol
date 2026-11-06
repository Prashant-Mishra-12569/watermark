// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";

/// @notice Deploy.s.sol's session-signer checks (review finding DEPLOY-1). An app's session signer is immutable, so a
/// wrong or public signer would only show up at the first real stamp: every stamp refused (stale address), or anyone
/// able to sign sessions and steal taps in flight (public key; RealProofAttacksTest shows the theft).
///
/// These tests set process env vars, and forge runs test functions in parallel, so every scenario that touches the
/// Deploy variables lives in ONE function. No other test file sets these variables. Keys are public anvil keys only.
contract DeployScriptTest is Test {
    uint256 internal constant ANVIL_0_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 internal constant ANVIL_2_KEY = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
    uint256 internal constant ANVIL_3_KEY = 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6;
    uint256 internal constant PRIVATE_SIGNER_KEY = 0x5E55105; // not one of the anvil accounts (test value)
    // policies/ca-keys.json .caRoot and policies/test.json .rulesRoot.
    bytes32 internal constant CA_ROOT = 0x1a8637effab965c43a451a33a1df3e295b1839fc237c5de04f704e95ba0d8f10;
    bytes32 internal constant RULES_ROOT = 0x288520708dd4920995a6a73e6edc1c9a1726b62dfff2340c72873e2fb767fdab;
    uint256 internal constant NOW = 1_793_968_496; // 2026-11-06T12:34:56Z, month 322

    function _env(string memory signerAddress, uint256 signerKey) internal {
        vm.setEnv("SESSION_SIGNER_ADDRESS", signerAddress);
        vm.setEnv("SESSION_SIGNER_KEY", signerKey == 0 ? "" : vm.toString(bytes32(signerKey)));
        vm.setEnv("CA_ROOT", vm.toString(CA_ROOT));
        vm.setEnv("RULES_ROOT", vm.toString(RULES_ROOT));
        vm.setEnv("APP_SALT", "");
        vm.setEnv("ALLOW_TEST_SIGNER", "");
    }

    function _clearEnv() internal {
        _env("", 0);
        vm.setEnv("CA_ROOT", "");
        vm.setEnv("RULES_ROOT", "");
    }

    function _expectRunReverts(string memory reason) internal {
        Deploy script = new Deploy();
        vm.expectRevert(bytes(reason));
        script.run();
    }

    function _run() internal returns (WatermarkRegistry reg, uint256 appId, address storedSigner) {
        (, address registry, uint256 id) = new Deploy().run();
        reg = WatermarkRegistry(registry);
        appId = id;
        (,, storedSigner) = reg.apps(appId);
    }

    function _session(WatermarkRegistry reg, uint256 appId) internal returns (IWatermarkRegistry.Session memory) {
        return IWatermarkRegistry.Session({
            wallet: makeAddr("user"),
            appId: appId,
            nonce: keccak256("deploy test nonce"),
            expiresAt: uint64(block.timestamp + 600),
            validUntilMonth: 325,
            chainId: block.chainid,
            registry: address(reg)
        });
    }

    function _sign(uint256 pk, WatermarkRegistry reg, IWatermarkRegistry.Session memory s)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 ss) = vm.sign(pk, reg.hashSession(s));
        return abi.encodePacked(r, ss, v);
    }

    function _pi(bytes32 nonce, uint256 appId) internal pure returns (bytes32[] memory p) {
        p = new bytes32[](6);
        p[0] = CA_ROOT;
        p[1] = RULES_ROOT;
        p[2] = bytes32(appId);
        p[3] = bytes32(uint256(uint32(bytes4(sha256(abi.encodePacked(nonce))))));
        p[4] = keccak256("some card");
        p[5] = bytes32(uint256(325));
    }

    function test_isPublicTestAccount_allTenAnvilAccounts() public {
        Deploy script = new Deploy();
        string memory mnemonic = "test test test test test test test test test test test junk";
        for (uint32 i; i < 10; ++i) {
            assertTrue(script.isPublicTestAccount(vm.addr(vm.deriveKey(mnemonic, i))));
        }
        assertFalse(script.isPublicTestAccount(vm.addr(PRIVATE_SIGNER_KEY)));
        assertFalse(script.isPublicTestAccount(vm.addr(vm.deriveKey(mnemonic, 10))));
    }

    function test_sessionSignerChecks() public {
        vm.warp(NOW);
        address publicSigner = vm.addr(ANVIL_0_KEY);

        // 1. The public dev signer (sdk DEV_SESSION_SIGNER) is refused on Whitechain and on the devnet.
        vm.chainId(1874);
        _env(vm.toString(publicSigner), 0);
        _expectRunReverts("Deploy: SESSION_SIGNER_ADDRESS is a public test key");
        vm.chainId(1337);
        _expectRunReverts("Deploy: SESSION_SIGNER_ADDRESS is a public test key");
        // ... also when it only comes from SESSION_SIGNER_KEY.
        _env("", ANVIL_0_KEY);
        _expectRunReverts("Deploy: SESSION_SIGNER_ADDRESS is a public test key");

        // 2. Local chains and an explicit ALLOW_TEST_SIGNER=true (a local fork of 1874) accept it.
        vm.chainId(31337);
        _env(vm.toString(publicSigner), 0);
        (,, address stored) = _run();
        assertEq(stored, publicSigner);
        vm.chainId(1874);
        vm.setEnv("ALLOW_TEST_SIGNER", "true");
        (,, stored) = _run();
        assertEq(stored, publicSigner);

        // 3. A stale SESSION_SIGNER_ADDRESS next to the key the relayer really signs with is refused, before any tx.
        _env(vm.toString(vm.addr(ANVIL_3_KEY)), ANVIL_2_KEY);
        vm.setEnv("ALLOW_TEST_SIGNER", "true"); // so the mismatch, not the public-key rule, is what's tested
        _expectRunReverts("Deploy: SESSION_SIGNER_ADDRESS does not match SESSION_SIGNER_KEY");

        // 4. Nothing set at all.
        _env("", 0);
        _expectRunReverts("Deploy: set SESSION_SIGNER_ADDRESS (export ../.env first)");

        // 5. The session signer may not be the deployer (forge's default broadcaster in tests).
        _env(vm.toString(DEFAULT_SENDER), 0);
        _expectRunReverts("Deploy: session signer must not be the deployer");

        // 6. Key only: the address is derived, and a session the key signs passes the signer check on chain (it then
        //    stops at the verifier, because the proof here is a placeholder).
        _env("", PRIVATE_SIGNER_KEY);
        (WatermarkRegistry reg, uint256 appId, address derived) = _run();
        assertEq(derived, vm.addr(PRIVATE_SIGNER_KEY));
        IWatermarkRegistry.Session memory s = _session(reg, appId);
        bytes memory sig = _sign(PRIVATE_SIGNER_KEY, reg, s);
        bytes32[] memory pi = _pi(s.nonce, appId);
        vm.expectRevert(WatermarkRegistry.InvalidProof.selector);
        reg.stamp(s, sig, hex"00", pi);

        // 7. Address and key that agree.
        _env(vm.toString(vm.addr(PRIVATE_SIGNER_KEY)), PRIVATE_SIGNER_KEY);
        vm.setEnv("APP_SALT", vm.toString(bytes32(uint256(7))));
        (,, stored) = _run();
        assertEq(stored, vm.addr(PRIVATE_SIGNER_KEY));

        _clearEnv();
    }
}
