// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Watermark stamp registry (interfaces F5). Deployed on Whitechain Sepolia (1874)
/// and on the alt mempool devnet (1337). A stamp means "this wallet was linked to a real
/// bank card that passed this app's filter". It is not identity or KYC.
interface IWatermarkRegistry {
    struct App {
        address owner;
        bytes32 rulesRoot;
        address sessionSigner;
    }

    /// @dev EIP-712 domain: name "Watermark", version "1", chainId, verifyingContract = this registry.
    struct Session {
        address wallet;
        uint256 appId;
        bytes32 nonce;
        uint64 expiresAt;
        uint32 validUntilMonth;
        uint256 chainId;
        address registry;
    }

    event AppRegistered(uint256 indexed appId, address indexed owner, bytes32 rulesRoot, address sessionSigner);
    event Stamped(address indexed wallet, uint256 indexed appId, bytes32 nullifier, uint64 expiresAt);
    event CaRootUpdated(bytes32 root);

    /// @return appId uint256(keccak256(abi.encode(msg.sender, salt))) >> 8. Rules are immutable per appId.
    function registerApp(bytes32 salt, bytes32 rulesRoot, address sessionSigner) external returns (uint256 appId);

    /// @notice Stamps `s.wallet` (never msg.sender) after checking the session, public inputs and proof.
    function stamp(Session calldata s, bytes calldata sessionSig, bytes calldata proof, bytes32[] calldata publicInputs)
        external;

    function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt);

    function apps(uint256 appId) external view returns (address owner, bytes32 rulesRoot, address sessionSigner);

    function caRoot() external view returns (bytes32);

    /// @notice Owner only.
    function setCaRoot(bytes32 root) external;
}
