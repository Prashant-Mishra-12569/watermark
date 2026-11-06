// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IWatermarkRegistry} from "./interfaces/IWatermarkRegistry.sol";
import {IVerifier} from "./interfaces/IVerifier.sol";
import {MonthMath} from "./libraries/MonthMath.sol";

/// @title WatermarkRegistry
/// @notice Apps, sessions, nullifiers and stamps (interfaces F5, spec J). The same bytecode is deployed on
/// Whitechain Sepolia (1874) and the alt mempool devnet (1337).
/// A stamp means "this wallet was linked to a real bank card that passed this app's filter". It is not identity or KYC.
contract WatermarkRegistry is IWatermarkRegistry {
    // ------------------------------------------------------------------ constants

    /// @dev Number of public inputs (F4): caRoot, rulesRoot, appId, un, nullifier, validUntilMonth.
    uint256 public constant NUM_PUBLIC_INPUTS = 6;

    bytes32 public constant SESSION_TYPEHASH = keccak256(
        "Session(address wallet,uint256 appId,bytes32 nonce,uint64 expiresAt,uint32 validUntilMonth,uint256 chainId,address registry)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("Watermark");
    bytes32 private constant VERSION_HASH = keccak256("1");

    /// @dev secp256k1n / 2. Signatures with a larger s are malleable copies and are rejected (EIP-2, OpenZeppelin).
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    // ------------------------------------------------------------------ storage

    IVerifier public immutable verifier;

    uint256 private immutable _cachedChainId;
    bytes32 private immutable _cachedDomainSeparator;

    /// @inheritdoc IWatermarkRegistry
    bytes32 public caRoot;

    /// @inheritdoc IWatermarkRegistry
    mapping(uint256 appId => App) public apps;

    /// @notice EIP-712 session digests already consumed (replay protection).
    mapping(bytes32 digest => bool) public sessionUsed;

    /// @notice The wallet a nullifier is bound to, per app. Set on first use; only that wallet may renew.
    mapping(uint256 appId => mapping(bytes32 nullifier => address)) public nullifierWallet;

    /// @notice Stamp expiry (unix seconds, inclusive) per wallet and app. 0 = never stamped.
    mapping(address wallet => mapping(uint256 appId => uint64)) public stampExpiry;

    // Declared last so the F5 storage slots (caRoot 0, apps 1, ...) match the first version of this contract.

    /// @notice May call setCaRoot. Starts as the deployer; moved with transferOwnership + acceptOwnership.
    address public owner;
    /// @notice Proposed new owner, set by transferOwnership. address(0) = no transfer pending.
    address public pendingOwner;

    // ------------------------------------------------------------------ errors

    error NotOwner();
    error NotPendingOwner();
    error ZeroRulesRoot();
    error ZeroSessionSigner();
    error AppAlreadyExists(uint256 appId);

    // stamp, check 1
    error AppNotFound(uint256 appId);
    // stamp, check 2
    error ZeroWallet();
    error SessionExpired(uint64 expiresAt, uint256 nowTs);
    error WrongChainId(uint256 sessionChainId, uint256 chainId);
    error WrongRegistry(address sessionRegistry);
    // stamp, check 3
    error SessionAlreadyUsed(bytes32 digest);
    error InvalidSignature();
    error WrongSessionSigner(address recovered, address expected);
    // stamp, check 4
    error BadPublicInputsLength(uint256 length);
    error CaRootNotSet();
    error CaRootMismatch(bytes32 got, bytes32 expected);
    error RulesRootMismatch(bytes32 got, bytes32 expected);
    error AppIdMismatch(uint256 got, uint256 expected);
    // stamp, check 5
    error UnMismatch(uint256 got, uint256 expected);
    // stamp, check 6
    error ValidUntilMonthMismatch(uint256 got, uint32 expected);
    error ValidUntilMonthOutOfRange(uint256 validUntilMonth, uint256 currentMonth);
    // stamp, check 7
    error NullifierBoundToOtherWallet(bytes32 nullifier, address boundWallet);
    // stamp, check 8
    error InvalidProof();

    // ------------------------------------------------------------------ events (beyond F5)

    /// @dev Same names and arguments as OpenZeppelin Ownable2Step, so explorers and tools recognise them.
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ------------------------------------------------------------------ constructor

    constructor(IVerifier verifier_) {
        verifier = verifier_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        _cachedChainId = block.chainid;
        _cachedDomainSeparator = _buildDomainSeparator(block.chainid, address(this));
    }

    // ------------------------------------------------------------------ admin

    /// @inheritdoc IWatermarkRegistry
    function setCaRoot(bytes32 root) external {
        if (msg.sender != owner) revert NotOwner();
        caRoot = root;
        emit CaRootUpdated(root);
    }

    /// @notice Step 1 of 2: propose `newOwner`. Nothing changes until `newOwner` calls acceptOwnership, so a typo
    /// cannot lock setCaRoot forever. A second call replaces the proposal; address(0) cancels it. Owner only.
    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(msg.sender, newOwner);
    }

    /// @notice Step 2 of 2: the proposed owner takes over.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previous = owner;
        owner = msg.sender;
        delete pendingOwner;
        emit OwnershipTransferred(previous, msg.sender);
    }

    // ------------------------------------------------------------------ apps

    /// @inheritdoc IWatermarkRegistry
    function registerApp(bytes32 salt, bytes32 rulesRoot, address sessionSigner) external returns (uint256 appId) {
        if (rulesRoot == bytes32(0)) revert ZeroRulesRoot();
        if (sessionSigner == address(0)) revert ZeroSessionSigner();
        appId = computeAppId(msg.sender, salt);
        if (apps[appId].owner != address(0)) revert AppAlreadyExists(appId);
        apps[appId] = App({owner: msg.sender, rulesRoot: rulesRoot, sessionSigner: sessionSigner});
        emit AppRegistered(appId, msg.sender, rulesRoot, sessionSigner);
    }

    /// @notice appId = uint256(keccak256(abi.encode(owner, salt))) >> 8, a 248-bit value that fits the BN254 field.
    function computeAppId(address appOwner, bytes32 salt) public pure returns (uint256) {
        return uint256(keccak256(abi.encode(appOwner, salt))) >> 8;
    }

    // ------------------------------------------------------------------ stamp

    /// @inheritdoc IWatermarkRegistry
    /// @dev The F5 checks, in order (1-3 in _checkSession, 4-7 in _checkPublicInputs, 8 here, 9 in _store).
    /// Anyone (normally the relayer) may call this; the stamp goes to `s.wallet`, never msg.sender.
    function stamp(Session calldata s, bytes calldata sessionSig, bytes calldata proof, bytes32[] calldata publicInputs)
        external
    {
        (bytes32 digest, bytes32 rulesRoot) = _checkSession(s, sessionSig);
        (bytes32 nullifier, uint256 validUntilMonth, bool firstUse) = _checkPublicInputs(s, rulesRoot, publicInputs);

        // 8. The ZK proof verifies. The bb-generated HonkVerifier REVERTS on a bad proof (SumcheckFailed,
        //    ShpleminiFailed, ValueGeFieldOrder, ProofLengthWrongWithLogN, ...) rather than returning false, so any
        //    failure inside verify(), a false result included, surfaces as InvalidProof(). An out-of-gas inside the
        //    verifier is caught too (the 1/64 of gas kept back is enough to revert): give stamp() its full budget
        //    (measured below) or a too-low gas limit reads as InvalidProof().
        //    Measured with the real synthetic-card proof (test/RealProofStamp.t.sol, anvil prague receipts):
        //    verify ~2.58M gas; a first stamp transaction 2,847,267 gas used (~0.0142 WBT at 5 gwei), a renewal
        //    2,806,512. The relayer caps a stamp at 3.5M gas. A proof that fails the final pairing check makes the
        //    verifier burn its whole gas allowance, so the relayer must simulate (eth_call) before it sends.
        bool ok;
        try verifier.verify(proof, publicInputs) returns (bool result) {
            ok = result;
        } catch {
            ok = false;
        }
        if (!ok) revert InvalidProof();

        _store(s, digest, nullifier, validUntilMonth, firstUse);
    }

    /// @dev Checks 1-3. Returns the session digest and the app's rulesRoot.
    function _checkSession(Session calldata s, bytes calldata sessionSig)
        internal
        view
        returns (bytes32 digest, bytes32 rulesRoot)
    {
        // 1. The app exists.
        App storage app = apps[s.appId];
        if (app.owner == address(0)) revert AppNotFound(s.appId);

        // 2. Session is fresh and bound to this chain and this registry, and names a real wallet. address(0) is
        //    refused: it is also the "unused" marker in nullifierWallet, so a stamp to it would leave the card unbound.
        if (block.timestamp > s.expiresAt) revert SessionExpired(s.expiresAt, block.timestamp);
        if (s.chainId != block.chainid) revert WrongChainId(s.chainId, block.chainid);
        if (s.registry != address(this)) revert WrongRegistry(s.registry);
        if (s.wallet == address(0)) revert ZeroWallet();

        // 3. Session not used before, and signed by the app's session signer.
        digest = _hashSession(s);
        if (sessionUsed[digest]) revert SessionAlreadyUsed(digest);
        address signer = _recover(digest, sessionSig);
        if (signer == address(0)) revert InvalidSignature();
        address expected = app.sessionSigner;
        if (signer != expected) revert WrongSessionSigner(signer, expected);

        rulesRoot = app.rulesRoot;
    }

    /// @dev Checks 4-7 over the F4 public inputs: 0 caRoot, 1 rulesRoot, 2 appId, 3 un, 4 nullifier,
    /// 5 validUntilMonth. Each is one big-endian field element read with uint256(publicInputs[i]).
    function _checkPublicInputs(Session calldata s, bytes32 rulesRoot, bytes32[] calldata publicInputs)
        internal
        view
        returns (bytes32 nullifier, uint256 v, bool firstUse)
    {
        // 4. Public inputs match caRoot, rulesRoot and appId. caRoot must have been set.
        if (publicInputs.length != NUM_PUBLIC_INPUTS) revert BadPublicInputsLength(publicInputs.length);
        bytes32 root = caRoot;
        if (root == bytes32(0)) revert CaRootNotSet();
        if (publicInputs[0] != root) revert CaRootMismatch(publicInputs[0], root);
        if (publicInputs[1] != rulesRoot) revert RulesRootMismatch(publicInputs[1], rulesRoot);
        if (uint256(publicInputs[2]) != s.appId) revert AppIdMismatch(uint256(publicInputs[2]), s.appId);

        // 5. UN = first 4 bytes of sha256(nonce), compared as integers (never a raw bytes4 against a bytes32).
        // forge-lint: disable-next-line(unsafe-typecast)
        uint256 expectedUn = uint256(uint32(bytes4(sha256(abi.encodePacked(s.nonce))))); // 4 bytes by definition
        if (uint256(publicInputs[3]) != expectedUn) revert UnMismatch(uint256(publicInputs[3]), expectedUn);

        // 6. validUntilMonth equals the session's and lies in [m + 1, m + 3]. Equality with a uint32 comes first,
        //    so the public input is known to fit uint32 and the range maths cannot overflow.
        v = uint256(publicInputs[5]);
        if (v != uint256(s.validUntilMonth)) revert ValidUntilMonthMismatch(v, s.validUntilMonth);
        uint256 m = MonthMath.monthIndex(block.timestamp);
        if (v < m + 1 || v > m + 3) revert ValidUntilMonthOutOfRange(v, m);

        // 7. The nullifier is unused, or bound to this same wallet (a renewal).
        nullifier = publicInputs[4];
        address bound = nullifierWallet[s.appId][nullifier];
        if (bound != address(0) && bound != s.wallet) revert NullifierBoundToOtherWallet(nullifier, bound);
        firstUse = bound == address(0);
    }

    /// @dev Check 9: store everything. Expiry = last second (UTC) of validUntilMonth. A renewal never shortens a
    /// stamp the wallet already holds. The stamp goes to s.wallet.
    function _store(Session calldata s, bytes32 digest, bytes32 nullifier, uint256 validUntilMonth, bool firstUse)
        internal
    {
        sessionUsed[digest] = true;
        if (firstUse) nullifierWallet[s.appId][nullifier] = s.wallet;
        uint64 expiry = MonthMath.endOfMonth64(validUntilMonth); // <= current month + 3, always fits
        uint64 current = stampExpiry[s.wallet][s.appId];
        if (expiry > current) stampExpiry[s.wallet][s.appId] = expiry;
        else expiry = current;
        emit Stamped(s.wallet, s.appId, nullifier, expiry);
    }

    // ------------------------------------------------------------------ views

    /// @inheritdoc IWatermarkRegistry
    function isStamped(address wallet, uint256 appId) external view returns (bool ok, uint64 expiresAt) {
        expiresAt = stampExpiry[wallet][appId];
        ok = expiresAt != 0 && block.timestamp <= expiresAt;
    }

    /// @notice EIP-712 digest of a session for this chain and this registry. Equals viem's hashTypedData with the
    /// sdk's sessionTypedData(s) when s.chainId == block.chainid and s.registry == address(this).
    function hashSession(Session calldata s) external view returns (bytes32) {
        return _hashSession(s);
    }

    /// @notice EIP-712 domain separator: {name "Watermark", version "1", block.chainid, address(this)}.
    function domainSeparator() public view returns (bytes32) {
        return
            block.chainid == _cachedChainId
                ? _cachedDomainSeparator
                : _buildDomainSeparator(block.chainid, address(this));
    }

    /// @notice Current month index (F1) of block.timestamp.
    function currentMonth() external view returns (uint256) {
        return MonthMath.monthIndex(block.timestamp);
    }

    /// @notice Last second (UTC) of a month index; a stamp made with that validUntilMonth expires then.
    function endOfMonth(uint256 month) external pure returns (uint64) {
        return MonthMath.endOfMonth64(month);
    }

    // ------------------------------------------------------------------ internal

    function _hashSession(Session calldata s) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(), _sessionStructHash(s)));
    }

    function _sessionStructHash(Session calldata s) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                SESSION_TYPEHASH, s.wallet, s.appId, s.nonce, s.expiresAt, s.validUntilMonth, s.chainId, s.registry
            )
        );
    }

    function _buildDomainSeparator(uint256 chainId, address verifyingContract) internal pure returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, chainId, verifyingContract));
    }

    /// @dev ecrecover over a 65-byte r ‖ s ‖ v signature. Returns address(0) for anything malformed: wrong length,
    /// v not in {27, 28} (0/1 accepted and mapped to 27/28), s > secp256k1n/2, or a failed recovery.
    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 sv = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        if (uint256(sv) > HALF_N) return address(0);
        return ecrecover(digest, v, r, sv);
    }
}
