// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IVerifier} from "./interfaces/IVerifier.sol";

/// @title VerifierRouter
/// @notice One IVerifier in front of several bb-generated HonkVerifiers, one per card "profile". A profile is one
/// compiled circuit: a fixed set of RSA key sizes (CA -> issuer -> ICC) and one signature path (F2 sigPath). Every
/// profile keeps the same 6 public inputs in the same F4 order, so WatermarkRegistry does not change: it is deployed
/// with this router as its (immutable) verifier.
///
/// Proof format: proof = abi.encodePacked(uint8 profileId, honkProof). The router reads the first byte, picks
/// verifiers[profileId] and forwards the rest of the proof and the public inputs unchanged. Reverts from the
/// profile's verifier bubble up; WatermarkRegistry.stamp() catches every revert and reports InvalidProof().
///
/// Lifecycle of a profile id (one way only):  unset --setVerifier--> live --disableProfile--> disabled (forever).
///   - A live profile's verifier is NEVER swapped. A fixed circuit goes in under a NEW id.
///   - disableProfile is a kill switch for a circuit/VK soundness bug: it can only make the router accept LESS.
///     A disabled id can never be set again, so a disable can't be turned into a swap.
///   - freeze() is one way and stops every future setVerifier. disableProfile stays allowed after freeze, on purpose:
///     it only removes acceptance, and a soundness bug found after the event must still be stoppable.
///
/// Trust: before freeze the owner can ADD a verifier for a new profile. A verifier decides which proofs are accepted,
/// so this is the same trust level as the registry owner's setCaRoot: hand ownership of both contracts to the same
/// owner. After freeze the owner can only disable. Every change emits an event and `profiles()` lists what is live,
/// so anyone can check each verifier's code against the published circuit. Each verifier must be a plain bb
/// HonkVerifier (no proxy): the router checks it has code and is not an EIP-7702 delegated EOA, but it cannot tell
/// an upgradeable proxy from a plain contract.
contract VerifierRouter is IVerifier {
    // ------------------------------------------------------------------ profile ids
    // The id is only a key; it carries no meaning on-chain. Convention (keep docs/interfaces.md in sync):
    //   0        RuPay, CA 1984 -> issuer 1408 -> ICC 768, e = 3, fDDA (GPO_FDDA), SDAD format 05/95,
    //            termData = UN only. Today's circuit (circuits/src/main.nr).
    //   1..15    reserved for other RuPay size profiles (e.g. a flex circuit).
    //   16..31   reserved for Visa profiles (qVSDC fDDA). Not built: needs its own circuit (Visa key sizes and
    //            its DDOL/termData differ). No verifier is registered until a real one is compiled and tested.
    //   32..47   reserved for Mastercard profiles (CDA over GENERATE AC). Not built: needs its own circuit.
    //   48..255  unassigned.

    /// @notice Profile 0: today's RuPay circuit.
    uint8 public constant PROFILE_RUPAY_1984_1408_768_FDDA = 0;

    // ------------------------------------------------------------------ storage

    /// @notice profileId => verifier. address(0) = not live (never set, or disabled).
    mapping(uint8 profileId => IVerifier) public verifiers;
    /// @notice Bit i set <=> profile i is live. Lets profiles() list them without a loop over storage.
    uint256 public profileMask;
    /// @notice Bit i set <=> profile i was disabled. A disabled id can never be set again.
    uint256 public disabledMask;
    /// @notice Once true, no verifier can ever be added. One way.
    bool public frozen;

    /// @notice May add (until frozen) and disable verifiers. Starts as the deployer; moved with transferOwnership +
    /// acceptOwnership.
    address public owner;
    /// @notice Proposed new owner, set by transferOwnership. address(0) = no transfer pending.
    address public pendingOwner;

    // ------------------------------------------------------------------ errors

    error EmptyProof();
    error UnknownProfile(uint8 profileId);
    error ProfileIsDisabled(uint8 profileId);
    error ProfileAlreadySet(uint8 profileId, address verifier);
    error ProfileNotSet(uint8 profileId);
    error RouterFrozen();
    error NotAContract(address verifier);
    error NotOwner();
    error NotPendingOwner();

    // ------------------------------------------------------------------ events

    event VerifierAdded(uint8 indexed profileId, address indexed verifier);
    event ProfileDisabled(uint8 indexed profileId, address indexed verifier);
    event Frozen();
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------ IVerifier

    /// @inheritdoc IVerifier
    /// @dev proof[0] is the profile id, proof[1:] the bb proof for that profile's circuit.
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (proof.length == 0) revert EmptyProof();
        uint8 profileId = uint8(proof[0]);
        IVerifier v = verifiers[profileId];
        if (address(v) == address(0)) {
            if (disabledMask & (uint256(1) << profileId) != 0) revert ProfileIsDisabled(profileId);
            revert UnknownProfile(profileId);
        }
        return v.verify(proof[1:], publicInputs);
    }

    // ------------------------------------------------------------------ admin

    /// @notice ADD a verifier for a profile id that was never used. Never overwrites a live profile and never
    /// revives a disabled one. Owner only, and only until freeze().
    function setVerifier(uint8 profileId, IVerifier verifier) external onlyOwner {
        if (frozen) revert RouterFrozen();
        IVerifier current = verifiers[profileId];
        if (address(current) != address(0)) revert ProfileAlreadySet(profileId, address(current));
        if (disabledMask & (uint256(1) << profileId) != 0) revert ProfileIsDisabled(profileId);
        _requireCode(address(verifier));
        verifiers[profileId] = verifier;
        profileMask |= (uint256(1) << profileId);
        emit VerifierAdded(profileId, address(verifier));
    }

    /// @notice Kill switch: take a live profile offline for good (e.g. its circuit or VK turns out to be unsound).
    /// Proofs for it stop verifying at once and the id can never be set again. Owner only; allowed after freeze.
    function disableProfile(uint8 profileId) external onlyOwner {
        IVerifier current = verifiers[profileId];
        if (address(current) == address(0)) revert ProfileNotSet(profileId);
        delete verifiers[profileId];
        profileMask &= ~(uint256(1) << profileId);
        disabledMask |= (uint256(1) << profileId);
        emit ProfileDisabled(profileId, address(current));
    }

    /// @notice One way: no verifier can be added after this. disableProfile keeps working. Owner only.
    function freeze() external onlyOwner {
        if (frozen) revert RouterFrozen();
        frozen = true;
        emit Frozen();
    }

    /// @notice Every live profile and its verifier, in id order.
    function profiles() external view returns (uint8[] memory ids, address[] memory addrs) {
        uint256 mask = profileMask;
        uint256 n = 0;
        for (uint256 m = mask; m != 0; m &= m - 1) {
            n++;
        }
        ids = new uint8[](n);
        addrs = new address[](n);
        uint256 k = 0;
        for (uint256 i = 0; i < 256 && k < n; i++) {
            if (mask & (uint256(1) << i) != 0) {
                // casting to 'uint8' is safe because i < 256
                // forge-lint: disable-next-line(unsafe-typecast)
                uint8 id = uint8(i);
                ids[k] = id;
                addrs[k] = address(verifiers[id]);
                k++;
            }
        }
    }

    // ------------------------------------------------------------------ ownership (same shape as the registry)

    /// @notice Step 1 of 2: propose `newOwner`. A second call replaces the proposal; address(0) cancels it.
    // address(0) is allowed on purpose: it cancels a pending transfer.
    // forge-lint: disable-next-line(missing-zero-check)
    function transferOwnership(address newOwner) external onlyOwner {
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

    /// @dev Refuses address(0), plain EOAs and EIP-7702 delegated EOAs. A delegated EOA has the 23-byte code
    /// 0xef0100 || impl, and whoever holds its key can re-delegate it to any code later with no router call and no
    /// event, which would silently change a live verifier.
    function _requireCode(address a) private view {
        uint256 len = a.code.length;
        if (len == 0) revert NotAContract(a);
        if (len == 23) {
            bytes memory c = a.code;
            if (c[0] == 0xef && c[1] == 0x01 && c[2] == 0x00) revert NotAContract(a);
        }
    }
}
