// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IWatermarkRegistry} from "./interfaces/IWatermarkRegistry.sol";
import {IWatermarkPassRenderer} from "./interfaces/IWatermarkPassRenderer.sol";
import {Base64} from "./libraries/Base64.sol";

/// @notice ERC-721 receiver hook (EIP-721), checked by safeTransferFrom.
interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

/// @title WatermarkGenesisPass
/// @notice "Watermark Genesis Pass" (WGP): 100 passes, one per real bank card, minted gas-free. Watermark uses its own
/// service here: a wallet can claim only while it holds a live stamp in WatermarkRegistry for the live app.
///
/// Why one card gets at most one pass: the registry binds each card to one wallet per app through the card's
/// nullifier, so a card that stamped wallet A can't stamp wallet B in this app. `mint` requires a live stamp and
/// remembers every wallet that ever claimed (`passOf`), even after it transfers the pass away. So a card holder can't
/// get a second pass: their card can't stamp a second wallet, and their one wallet has already claimed.
/// A stamp means "this wallet was linked to a real bank card that passed the app's filter"; it is not identity or KYC.
///
/// Unlock task 2 ("made at least one gas-free payment through WatermarkSponsor") is NOT checked here: a contract
/// can't read past events, and the sponsor keeps only today's usage. The relayer (the only `minter`) checks it from
/// the sponsor's PaymentRelayed logs before it calls `mint`. Trust in that check is trust in the minter.
///
/// Minimal ERC-721 written for this project (no OpenZeppelin). Token ids run 1..MAX_SUPPLY. `mint` does not call
/// onERC721Received (like OpenZeppelin's `_mint`), so a stamped smart wallet without the hook can still claim.
/// tokenURI is fully on-chain: base64 JSON with a base64 SVG and no external assets. The artwork (a Mumbai postage
/// stamp, a different landmark per 20 passes) comes from WatermarkPassRenderer, fixed at deploy.
contract WatermarkGenesisPass {
    using Base64 for bytes;

    // ------------------------------------------------------------------ constants and immutables

    string public constant name = "Watermark Genesis Pass";
    string public constant symbol = "WGP";
    uint256 public constant MAX_SUPPLY = 100;

    /// @notice WatermarkRegistry on this chain.
    IWatermarkRegistry public immutable registry;
    /// @notice The app whose stamp unlocks a pass (the live app).
    uint256 public immutable appId;
    /// @notice The only address allowed to call `mint` (the relayer hot wallet, which pays the gas).
    address public immutable minter;
    /// @notice The artwork (WatermarkPassRenderer): svg(tokenId) and the landmark name for the metadata.
    IWatermarkPassRenderer public immutable renderer;

    // ------------------------------------------------------------------ storage

    /// @notice Passes minted so far. Token ids are 1..totalSupply.
    uint256 public totalSupply;
    /// @notice The token id a wallet claimed, or 0. Never cleared: a wallet that transferred its pass has still claimed.
    mapping(address wallet => uint256 tokenId) public passOf;
    /// @notice ERC-721 single-token approval.
    mapping(uint256 tokenId => address spender) internal _approved;
    /// @notice ERC-721 operator approval.
    mapping(address owner => mapping(address operator => bool)) public isApprovedForAll;

    mapping(uint256 tokenId => address) internal _owners;
    mapping(address owner => uint256) internal _balances;

    // ------------------------------------------------------------------ events

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    /// @notice A stamped wallet claimed pass `tokenId`. `stampExpiresAt` is the registry stamp's expiry at mint time.
    event PassClaimed(address indexed wallet, uint256 indexed tokenId, uint64 stampExpiresAt);

    // ------------------------------------------------------------------ errors

    error ZeroAddress();
    error NotAContract(address account);
    error InvalidAppId(uint256 appId);
    // mint (the relayer maps these to reason codes)
    error NotMinter(address caller);
    error AlreadyClaimed(address wallet, uint256 tokenId);
    error SoldOut();
    error NotStamped(address wallet);
    // ERC-721
    error NonexistentToken(uint256 tokenId);
    error NotAuthorized(address caller, uint256 tokenId);
    error WrongFrom(address from, address owner);
    error UnsafeRecipient(address to);

    constructor(address registry_, uint256 appId_, address minter_, address renderer_) {
        if (registry_ == address(0) || minter_ == address(0) || renderer_ == address(0)) revert ZeroAddress();
        if (registry_.code.length == 0) revert NotAContract(registry_);
        if (renderer_.code.length == 0) revert NotAContract(renderer_);
        if (appId_ == 0 || appId_ >> 248 != 0) revert InvalidAppId(appId_);
        registry = IWatermarkRegistry(registry_);
        appId = appId_;
        minter = minter_;
        renderer = IWatermarkPassRenderer(renderer_);
    }

    // ------------------------------------------------------------------ mint

    /// @notice Mints the next pass to `to`. Minter only. Requires a live stamp for `appId`, a wallet that has never
    /// claimed, and supply left.
    function mint(address to) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert NotMinter(msg.sender);
        if (to == address(0)) revert ZeroAddress();
        uint256 existing = passOf[to];
        if (existing != 0) revert AlreadyClaimed(to, existing);
        if (totalSupply >= MAX_SUPPLY) revert SoldOut();
        (bool ok, uint64 expiresAt) = registry.isStamped(to, appId);
        if (!ok) revert NotStamped(to);

        tokenId = ++totalSupply;
        passOf[to] = tokenId;
        _owners[tokenId] = to;
        unchecked {
            _balances[to] += 1;
        }
        emit Transfer(address(0), to, tokenId);
        emit PassClaimed(to, tokenId, expiresAt);
    }

    /// @notice True once `wallet` has claimed a pass (even if it later transferred it).
    function claimed(address wallet) external view returns (bool) {
        return passOf[wallet] != 0;
    }

    /// @notice Passes left to mint.
    function remaining() public view returns (uint256) {
        return MAX_SUPPLY - totalSupply;
    }

    /// @notice Everything the relayer and website need about one wallet, in one eth_call. `tokenId` is 0 when the
    /// wallet hasn't claimed. Unlock task 2 (a sponsored payment) is not here: see the contract notes.
    function status(address wallet)
        external
        view
        returns (bool stamped, uint64 stampExpiresAt, uint256 tokenId, uint256 left)
    {
        (stamped, stampExpiresAt) = registry.isStamped(wallet, appId);
        tokenId = passOf[wallet];
        left = remaining();
    }

    // ------------------------------------------------------------------ ERC-721

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ZeroAddress();
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address owner) {
        owner = _owners[tokenId];
        if (owner == address(0)) revert NonexistentToken(tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        ownerOf(tokenId);
        return _approved[tokenId];
    }

    function approve(address spender, uint256 tokenId) external {
        address owner = ownerOf(tokenId);
        if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) revert NotAuthorized(msg.sender, tokenId);
        _approved[tokenId] = spender;
        emit Approval(owner, spender, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        if (from != owner) revert WrongFrom(from, owner);
        if (to == address(0)) revert ZeroAddress();
        if (msg.sender != owner && msg.sender != _approved[tokenId] && !isApprovedForAll[owner][msg.sender]) {
            revert NotAuthorized(msg.sender, tokenId);
        }
        delete _approved[tokenId];
        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length == 0) return;
        try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 ret) {
            if (ret != IERC721Receiver.onERC721Received.selector) revert UnsafeRecipient(to);
        } catch (bytes memory reason) {
            if (reason.length == 0) revert UnsafeRecipient(to);
            assembly ("memory-safe") {
                revert(add(reason, 32), mload(reason))
            }
        }
    }

    /// @notice ERC-165: ERC-165, ERC-721 and ERC-721 Metadata.
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x01ffc9a7 // ERC-165
                || interfaceId == 0x80ac58cd // ERC-721
                || interfaceId == 0x5b5e139f; // ERC-721 Metadata
    }

    // ------------------------------------------------------------------ metadata (on-chain)

    string internal constant DESCRIPTION = "One of 100. Each Watermark Genesis Pass is claimed with one real bank "
        "card and is free to mint: Watermark stamps the wallet after a card tap, and the pass is minted gas-free on "
        "Whitechain. Protected by Watermark: a card can stamp only one wallet in this app, and each wallet claims once. "
        "Transferable: the limit applies to claiming, not to holding. A stamp is not identity or KYC.";
    string internal constant EDITION_TAIL = ',"max_value":100},{"trait_type":"Series","value":"Genesis"},'
        '{"trait_type":"City","value":"Mumbai"}]}';

    /// @notice data:application/json;base64 metadata with an on-chain SVG image: name "Watermark Genesis Pass #042",
    /// and the traits Landmark, Edition (42 of 100), Series "Genesis" and City "Mumbai".
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        string memory image = string.concat("data:image/svg+xml;base64,", bytes(svg(tokenId)).encode());
        string memory json = string.concat(
            '{"name":"Watermark Genesis Pass #',
            _edition(tokenId),
            '","description":"',
            DESCRIPTION,
            '","image":"',
            image
        );
        json = string.concat(
            json,
            '","attributes":[{"trait_type":"Landmark","value":"',
            renderer.landmark(tokenId),
            '"},{"trait_type":"Edition","display_type":"number","value":',
            _toString(tokenId),
            EDITION_TAIL
        );
        return string.concat("data:application/json;base64,", bytes(json).encode());
    }

    /// @notice The pass artwork as raw SVG (also embedded in tokenURI), from the renderer: a Mumbai postage stamp
    /// whose landmark changes every 20 passes, with a postmark placed from the token id and the edition "#042 / 100".
    function svg(uint256 tokenId) public view returns (string memory) {
        ownerOf(tokenId);
        return renderer.svg(tokenId);
    }

    /// @dev "7" -> "007", "42" -> "042", "100" -> "100". Token ids are 1..MAX_SUPPLY, so three digits always fit.
    function _edition(uint256 v) internal pure returns (string memory) {
        string memory s = _toString(v);
        if (v < 10) return string.concat("00", s);
        if (v < 100) return string.concat("0", s);
        return s;
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 digits = 0;
        for (uint256 t = v; t != 0; t /= 10) {
            digits++;
        }
        bytes memory out = new bytes(digits);
        for (; v != 0; v /= 10) {
            // forge-lint: disable-next-line(unsafe-typecast) 48 + (v % 10) is at most 57
            out[--digits] = bytes1(uint8(48 + (v % 10)));
        }
        return string(out);
    }
}
