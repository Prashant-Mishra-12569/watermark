// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4);
}

/// @notice Minimal EIP-3009 token for unit tests: real EIP-712 digest, ecrecover for EOAs, ERC-1271 for contracts,
/// the bytes-signature overload only. Custom errors so tests can check that reverts bubble up through the sponsor.
contract MockEIP3009 {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    /// @dev 0 = normal, 1 = revert with a string, 2 = revert with no data.
    uint8 public failMode;

    error InvalidSignature();
    error AuthorizationUsed(address from, bytes32 nonce);
    error InsufficientBalance();

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Mock USD"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setFailMode(uint8 m) external {
        failMode = m;
    }

    function digest(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        public
        view
        returns (bytes32)
    {
        bytes32 structHash =
            keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        if (failMode == 1) revert("MockEIP3009: forced failure");
        if (failMode == 2) revert();
        require(block.timestamp > validAfter, "authorization is not yet valid");
        require(block.timestamp < validBefore, "authorization is expired");
        if (authorizationState[from][nonce]) revert AuthorizationUsed(from, nonce);

        bytes32 d = digest(from, to, value, validAfter, validBefore, nonce);
        if (from.code.length > 0) {
            if (IERC1271(from).isValidSignature(d, signature) != IERC1271.isValidSignature.selector) {
                revert InvalidSignature();
            }
        } else {
            if (signature.length != 65) revert InvalidSignature();
            bytes32 r = bytes32(signature[0:32]);
            bytes32 s = bytes32(signature[32:64]);
            uint8 v = uint8(signature[64]);
            address signer = ecrecover(d, v, r, s);
            if (signer == address(0) || signer != from) revert InvalidSignature();
        }

        authorizationState[from][nonce] = true;
        if (balanceOf[from] < value) revert InsufficientBalance();
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}
