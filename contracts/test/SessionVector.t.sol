// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {WatermarkRegistry} from "../src/WatermarkRegistry.sol";
import {IWatermarkRegistry} from "../src/interfaces/IWatermarkRegistry.sol";
import {IVerifier} from "../src/interfaces/IVerifier.sol";
import {MockVerifier} from "./mocks/MockVerifier.sol";

/// @dev Exposes the internal EIP-712 and ECDSA helpers for arbitrary domains.
contract RegistryHarness is WatermarkRegistry {
    constructor(IVerifier v) WatermarkRegistry(v) {}

    function digestFor(Session calldata s, uint256 chainId, address registry) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", _buildDomainSeparator(chainId, registry), _sessionStructHash(s)));
    }

    function recover(bytes32 digest, bytes calldata sig) external pure returns (address) {
        return _recover(digest, sig);
    }
}

/// @notice Cross-language vectors: the session from sdk/src/session.test.ts and the Android SessionVerifierTest,
/// with digests and signatures produced by viem 2.57.16 (hashTypedData / signTypedData with the sdk's typed data).
/// The signer is the public anvil/hardhat account #0 (sdk DEV_SESSION_SIGNER), never a real key.
contract SessionVectorTest is Test {
    address constant DEV_SIGNER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant WALLET = 0x00000000000000000000000000000000000aB1E5;
    bytes32 constant NONCE = 0x1111111111111111111111111111111111111111111111111111111111111111;
    uint256 constant APP_ID = 12345;

    // Registry address 0x...01, chain 1874: the vector in sdk/src/session.test.ts and SessionVerifierTest.kt.
    bytes32 constant SDK_DIGEST = 0xad459948c1493e63c5709c092c042ac294970240dd0c96310a0932cc293b1cf4;
    bytes constant SDK_SIG =
        hex"292c55891ad5057fb844b0905c5d05d302ee7b22074f7fb01afb15686ec5cb1231c47253b8148b9e2e3285abf6005f0d0c6afa39b7414f96878dfa5e73901feb1c";

    // The registry address from the anvil dry run of Deploy.s.sol (fresh deployer 0xf39F...: nonces 0-1 deploy
    // the two verifier libraries through the CREATE2 factory, 2 = HonkVerifier, 3 = WatermarkRegistry).
    address constant DEPLOYED = 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9;
    // viem hashTypedData for the vector session with registry = DEPLOYED, chain 1874 and chain 31337.
    bytes32 constant VIEM_DIGEST_1874 = 0x20133ac5cc155c2785af31c90224c027edff9dfff35e174971eb3a0491ed9a98;
    bytes32 constant VIEM_DIGEST_31337 = 0x5b78c26839eb53d778b914984b6c139b8460eeb126d0fa5575777a55e8c280e8;
    // viem signTypedData by DEV_SIGNER over VIEM_DIGEST_1874.
    bytes constant VIEM_SIG_1874 =
        hex"27d906946c46a255446a13ed6e8a8b51d49d2a905123034cc56bb31524d546485288941e35b58ec98f651a573714908aad1093e5e0b1f92e500ffc97342411561b";

    uint256 constant APPS_SLOT = 1; // forge inspect WatermarkRegistry storageLayout

    function _vector(uint256 chainId, address registry) internal pure returns (IWatermarkRegistry.Session memory) {
        return IWatermarkRegistry.Session({
            wallet: WALLET,
            appId: APP_ID,
            nonce: NONCE,
            expiresAt: 1_893_456_000,
            validUntilMonth: 325,
            chainId: chainId,
            registry: registry
        });
    }

    function test_sdkAndAndroidVector() public {
        RegistryHarness h = new RegistryHarness(IVerifier(address(0)));
        assertEq(h.digestFor(_vector(1874, address(1)), 1874, address(1)), SDK_DIGEST);
        assertEq(h.recover(SDK_DIGEST, SDK_SIG), DEV_SIGNER);
    }

    function test_hashSession_matchesViem_deployedAddress_1874() public {
        vm.chainId(1874);
        deployCodeTo("WatermarkRegistry.sol:WatermarkRegistry", abi.encode(address(0)), DEPLOYED);
        assertEq(WatermarkRegistry(DEPLOYED).hashSession(_vector(1874, DEPLOYED)), VIEM_DIGEST_1874);
    }

    function test_hashSession_matchesViem_deployedAddress_31337() public {
        vm.chainId(31337);
        deployCodeTo("WatermarkRegistry.sol:WatermarkRegistry", abi.encode(address(0)), DEPLOYED);
        assertEq(WatermarkRegistry(DEPLOYED).hashSession(_vector(31337, DEPLOYED)), VIEM_DIGEST_31337);
    }

    /// @dev End to end: a session signed by viem is accepted by stamp() at the deployed address on chain 1874.
    function test_stamp_acceptsViemSignedSession() public {
        vm.chainId(1874);
        vm.warp(1_793_968_496); // 2026-11-06T12:34:56Z, month 322; the vector's validUntilMonth 325 = m + 3
        MockVerifier mock = new MockVerifier();
        deployCodeTo("WatermarkRegistry.sol:WatermarkRegistry", abi.encode(address(mock)), DEPLOYED);
        WatermarkRegistry reg = WatermarkRegistry(DEPLOYED);

        bytes32 caRoot = keccak256("ca");
        bytes32 rulesRoot = keccak256("rules");
        vm.prank(reg.owner());
        reg.setCaRoot(caRoot);
        // appId 12345 can't come out of registerApp (it is a hash), so write the App struct straight into storage.
        bytes32 base = keccak256(abi.encode(APP_ID, APPS_SLOT));
        vm.store(DEPLOYED, base, bytes32(uint256(uint160(address(this)))));
        vm.store(DEPLOYED, bytes32(uint256(base) + 1), rulesRoot);
        vm.store(DEPLOYED, bytes32(uint256(base) + 2), bytes32(uint256(uint160(DEV_SIGNER))));
        (address o, bytes32 r, address ss) = reg.apps(APP_ID);
        assertEq(o, address(this));
        assertEq(r, rulesRoot);
        assertEq(ss, DEV_SIGNER);

        bytes32[] memory pi = new bytes32[](6);
        pi[0] = caRoot;
        pi[1] = rulesRoot;
        pi[2] = bytes32(APP_ID);
        pi[3] = bytes32(uint256(0x02d449a3)); // sha256(32 x 0x11)[0..4]
        pi[4] = keccak256("nullifier");
        pi[5] = bytes32(uint256(325));

        vm.prank(makeAddr("relayer"));
        reg.stamp(_vector(1874, DEPLOYED), VIEM_SIG_1874, hex"00", pi);
        (bool ok, uint64 exp) = reg.isStamped(WALLET, APP_ID);
        assertTrue(ok);
        assertEq(exp, 1_803_859_199); // 2027-02-28T23:59:59Z
    }
}
