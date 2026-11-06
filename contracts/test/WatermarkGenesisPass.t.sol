// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {WatermarkGenesisPass, IERC721Receiver} from "../src/WatermarkGenesisPass.sol";
import {WatermarkPassRenderer} from "../src/WatermarkPassRenderer.sol";
import {Base64} from "../src/libraries/Base64.sol";
import {MockRegistry} from "./mocks/MockRegistry.sol";
import {PassTestBase} from "./utils/PassTestBase.sol";

contract GoodReceiver is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract WrongReceiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return 0xdeadbeef;
    }
}

contract RevertingReceiver {
    error Nope();

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        revert Nope();
    }
}

contract NoHook {}

contract Base64Harness {
    function encode(bytes memory data) external pure returns (string memory) {
        return Base64.encode(data);
    }

    /// @dev Encodes the first `n` bytes of `data` with the rest left in memory right after them, so a reader that
    /// strays past the end would see non-zero bytes.
    function encodePrefix(bytes memory data, uint256 n) external pure returns (string memory) {
        require(n <= data.length);
        assembly ("memory-safe") {
            mstore(data, n)
        }
        return Base64.encode(data);
    }
}

contract WatermarkGenesisPassTest is PassTestBase {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event PassClaimed(address indexed wallet, uint256 indexed tokenId, uint64 stampExpiresAt);

    uint256 internal constant APP_ID = uint256(keccak256("watermark-pass-app")) >> 8;

    MockRegistry internal registry;
    WatermarkPassRenderer internal renderer;
    WatermarkGenesisPass internal pass;
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint64 internal expiry;

    function setUp() public {
        vm.warp(1_790_000_000);
        registry = new MockRegistry();
        renderer = new WatermarkPassRenderer();
        pass = new WatermarkGenesisPass(address(registry), APP_ID, minter, address(renderer));
        expiry = uint64(block.timestamp + 90 days);
        registry.setStamp(alice, APP_ID, expiry);
        registry.setStamp(bob, APP_ID, expiry);
    }

    function _mint(address to) internal returns (uint256) {
        vm.prank(minter);
        return pass.mint(to);
    }

    function _stamp(address w) internal {
        registry.setStamp(w, APP_ID, expiry);
    }

    // ------------------------------------------------------------------ constructor and constants

    function test_constants() public view {
        assertEq(pass.name(), "Watermark Genesis Pass");
        assertEq(pass.symbol(), "WGP");
        assertEq(pass.MAX_SUPPLY(), 100);
        assertEq(address(pass.registry()), address(registry));
        assertEq(pass.appId(), APP_ID);
        assertEq(pass.minter(), minter);
        assertEq(address(pass.renderer()), address(renderer));
        assertEq(pass.totalSupply(), 0);
        assertEq(pass.remaining(), 100);
    }

    function test_constructor_refusesBadArgs() public {
        address r = address(renderer);
        vm.expectRevert(WatermarkGenesisPass.ZeroAddress.selector);
        new WatermarkGenesisPass(address(0), APP_ID, minter, r);
        vm.expectRevert(WatermarkGenesisPass.ZeroAddress.selector);
        new WatermarkGenesisPass(address(registry), APP_ID, address(0), r);
        vm.expectRevert(WatermarkGenesisPass.ZeroAddress.selector);
        new WatermarkGenesisPass(address(registry), APP_ID, minter, address(0));
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotAContract.selector, alice));
        new WatermarkGenesisPass(alice, APP_ID, minter, r);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotAContract.selector, bob));
        new WatermarkGenesisPass(address(registry), APP_ID, minter, bob);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.InvalidAppId.selector, 0));
        new WatermarkGenesisPass(address(registry), 0, minter, r);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.InvalidAppId.selector, uint256(1) << 248));
        new WatermarkGenesisPass(address(registry), uint256(1) << 248, minter, r);
    }

    function test_supportsInterface() public view {
        assertTrue(pass.supportsInterface(0x01ffc9a7), "ERC-165");
        assertTrue(pass.supportsInterface(0x80ac58cd), "ERC-721");
        assertTrue(pass.supportsInterface(0x5b5e139f), "ERC-721 Metadata");
        assertFalse(pass.supportsInterface(0x780e9d63), "not Enumerable");
        assertFalse(pass.supportsInterface(0xffffffff), "0xffffffff must be false (ERC-165)");
    }

    // ------------------------------------------------------------------ mint

    function test_mint_stampedWallet() public {
        vm.expectEmit(address(pass));
        emit Transfer(address(0), alice, 1);
        vm.expectEmit(address(pass));
        emit PassClaimed(alice, 1, expiry);
        uint256 id = _mint(alice);

        assertEq(id, 1);
        assertEq(pass.ownerOf(1), alice);
        assertEq(pass.balanceOf(alice), 1);
        assertEq(pass.totalSupply(), 1);
        assertEq(pass.remaining(), 99);
        assertTrue(pass.claimed(alice));
        assertEq(pass.passOf(alice), 1);
        assertFalse(pass.claimed(bob));

        assertEq(_mint(bob), 2, "ids run in order");
    }

    function test_mint_onlyMinter() public {
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotMinter.selector, alice));
        vm.prank(alice);
        pass.mint(alice);
    }

    function test_mint_refusesZeroAddress() public {
        vm.expectRevert(WatermarkGenesisPass.ZeroAddress.selector);
        _mint(address(0));
    }

    function test_mint_refusesUnstampedAndExpired() public {
        address carol = makeAddr("carol");
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotStamped.selector, carol));
        _mint(carol);

        registry.setStamp(carol, APP_ID, uint64(block.timestamp - 1));
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotStamped.selector, carol));
        _mint(carol);

        // A stamp for another app does not count.
        registry.setStamp(carol, APP_ID + 1, expiry);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotStamped.selector, carol));
        _mint(carol);
    }

    function test_mint_secondClaimRefused_evenAfterTransfer() public {
        _mint(alice);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.AlreadyClaimed.selector, alice, 1));
        _mint(alice);

        // Alice gives her pass away: she still has claimed, so she can't claim again with the same stamp.
        vm.prank(alice);
        pass.transferFrom(alice, makeAddr("friend"), 1);
        assertEq(pass.balanceOf(alice), 0);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.AlreadyClaimed.selector, alice, 1));
        _mint(alice);
        assertEq(pass.totalSupply(), 1);
    }

    function test_mint_supplyCap() public {
        for (uint256 i = 1; i <= 100; i++) {
            address w = address(uint160(0x10000 + i));
            _stamp(w);
            assertEq(_mint(w), i);
        }
        assertEq(pass.totalSupply(), 100);
        assertEq(pass.remaining(), 0);
        address late = makeAddr("late");
        _stamp(late);
        vm.expectRevert(WatermarkGenesisPass.SoldOut.selector);
        _mint(late);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NonexistentToken.selector, 101));
        pass.ownerOf(101);
    }

    function test_status() public {
        (bool stamped, uint64 exp, uint256 id, uint256 left) = pass.status(alice);
        assertTrue(stamped);
        assertEq(exp, expiry);
        assertEq(id, 0);
        assertEq(left, 100);
        _mint(alice);
        (stamped,, id, left) = pass.status(alice);
        assertEq(id, 1);
        assertEq(left, 99);
        (stamped,, id,) = pass.status(makeAddr("nobody"));
        assertFalse(stamped);
        assertEq(id, 0);
    }

    function test_mint_toContractWithoutHook() public {
        NoHook wallet = new NoHook();
        _stamp(address(wallet));
        assertEq(_mint(address(wallet)), 1, "mint does not require onERC721Received");
    }

    // ------------------------------------------------------------------ ERC-721 transfers and approvals

    function test_views_refuseNonexistentAndZero() public {
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NonexistentToken.selector, 1));
        pass.ownerOf(1);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NonexistentToken.selector, 1));
        pass.getApproved(1);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NonexistentToken.selector, 1));
        pass.tokenURI(1);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NonexistentToken.selector, 0));
        pass.tokenURI(0);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NonexistentToken.selector, 1));
        pass.svg(1);
        vm.expectRevert(WatermarkGenesisPass.ZeroAddress.selector);
        pass.balanceOf(address(0));
    }

    function test_transferFrom_ownerApprovedOperator() public {
        _mint(alice);
        address spender = makeAddr("spender");
        address op = makeAddr("operator");

        // stranger
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotAuthorized.selector, bob, 1));
        vm.prank(bob);
        pass.transferFrom(alice, bob, 1);

        // single-token approval, cleared on transfer
        vm.expectEmit(address(pass));
        emit Approval(alice, spender, 1);
        vm.prank(alice);
        pass.approve(spender, 1);
        assertEq(pass.getApproved(1), spender);
        vm.prank(spender);
        pass.transferFrom(alice, bob, 1);
        assertEq(pass.ownerOf(1), bob);
        assertEq(pass.getApproved(1), address(0), "approval cleared");
        assertEq(pass.balanceOf(alice), 0);
        assertEq(pass.balanceOf(bob), 1);

        // operator
        vm.expectEmit(address(pass));
        emit ApprovalForAll(bob, op, true);
        vm.prank(bob);
        pass.setApprovalForAll(op, true);
        assertTrue(pass.isApprovedForAll(bob, op));
        vm.prank(op);
        pass.approve(spender, 1); // an operator may approve
        vm.prank(op);
        pass.transferFrom(bob, alice, 1);
        assertEq(pass.ownerOf(1), alice);

        // a cleared approval no longer works
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotAuthorized.selector, spender, 1));
        vm.prank(spender);
        pass.transferFrom(alice, bob, 1);
    }

    function test_transferFrom_refusals() public {
        _mint(alice);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.WrongFrom.selector, bob, alice));
        vm.prank(alice);
        pass.transferFrom(bob, alice, 1);
        vm.expectRevert(WatermarkGenesisPass.ZeroAddress.selector);
        vm.prank(alice);
        pass.transferFrom(alice, address(0), 1);
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NotAuthorized.selector, bob, 1));
        vm.prank(bob);
        pass.approve(bob, 1);
    }

    function test_safeTransferFrom_receiverChecks() public {
        _mint(alice);
        GoodReceiver good = new GoodReceiver();
        vm.prank(alice);
        pass.safeTransferFrom(alice, address(good), 1);
        assertEq(pass.ownerOf(1), address(good));

        _mint(bob);
        address wrong = address(new WrongReceiver());
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.UnsafeRecipient.selector, wrong));
        vm.prank(bob);
        pass.safeTransferFrom(bob, wrong, 2);

        address noHook = address(new NoHook());
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.UnsafeRecipient.selector, noHook));
        vm.prank(bob);
        pass.safeTransferFrom(bob, noHook, 2, "hi");

        address reverting = address(new RevertingReceiver());
        vm.expectRevert(RevertingReceiver.Nope.selector);
        vm.prank(bob);
        pass.safeTransferFrom(bob, reverting, 2);

        // to an EOA: no hook needed
        vm.prank(bob);
        pass.safeTransferFrom(bob, alice, 2);
        assertEq(pass.ownerOf(2), alice);
    }

    // ------------------------------------------------------------------ metadata

    function _mintAll() internal {
        for (uint256 i = 1; i <= 100; i++) {
            address w = address(uint160(0x20000 + i));
            _stamp(w);
            _mint(w);
        }
    }

    function test_tokenURI_isJsonWithSvg() public {
        _mint(alice);
        bytes memory svg = _checkTokenURI(pass, 1);
        assertTrue(_contains(svg, ">GATEWAY OF INDIA</text>"), "plate caption");
        assertTrue(_contains(svg, ">001</text>"), "edition");
        _assertSelfContained(svg);
        // Not minted yet: no metadata, even though the renderer can draw it.
        vm.expectRevert(abi.encodeWithSelector(WatermarkGenesisPass.NonexistentToken.selector, 2));
        pass.tokenURI(2);
        assertGt(bytes(renderer.svg(2)).length, 0);
    }

    /// @dev Every pass: tokenURI parses as JSON with the right traits, and its image is the generator's SVG. Each
    /// check runs in its own call frame, so memory doesn't pile up across the 100 payloads.
    function test_tokenURI_everyPassMatchesTheFixture() public {
        _mintAll();
        for (uint256 id = 1; id <= 100; id++) {
            this.checkTokenURI(id);
        }
    }

    function checkTokenURI(uint256 id) external view {
        _checkTokenURI(pass, id);
    }

    function test_tokenURI_landmarkChangesEveryTwentyPasses() public {
        _mintAll();
        uint256[10] memory ids = [uint256(1), 20, 21, 40, 41, 60, 61, 80, 81, 100];
        for (uint256 i; i < ids.length; i++) {
            assertEq(renderer.landmark(ids[i]), _landmark(ids[i]));
            assertEq(pass.svg(ids[i]), _fixture(ids[i]));
        }
    }

    function test_base64_rfc4648Vectors() public {
        Base64Harness h = new Base64Harness();
        assertEq(h.encode(""), "");
        assertEq(h.encode("f"), "Zg==");
        assertEq(h.encode("fo"), "Zm8=");
        assertEq(h.encode("foo"), "Zm9v");
        assertEq(h.encode("foob"), "Zm9vYg==");
        assertEq(h.encode("fooba"), "Zm9vYmE=");
        assertEq(h.encode("foobar"), "Zm9vYmFy");
        assertEq(h.encode(hex"fbff"), "+/8=");
    }

    function test_base64_ignoresBytesPastTheEnd() public {
        Base64Harness h = new Base64Harness();
        assertEq(h.encodePrefix("f\xff\xff\xff", 1), "Zg==");
        assertEq(h.encodePrefix("fo\xff\xff\xff", 2), "Zm8=");
        assertEq(h.encodePrefix("foob\xff\xff", 4), "Zm9vYg==");
        assertEq(h.encodePrefix("fooba\xff\xff", 5), "Zm9vYmE=");
        assertEq(h.encodePrefix("foobar\xff\xff", 6), "Zm9vYmFy");
    }

    function testFuzz_base64_roundTrip(bytes memory data) public {
        Base64Harness h = new Base64Harness();
        assertEq(_b64Decode(bytes(h.encode(data))), data);
    }

    /// @dev Gas for the relayer's budget (MAX_GAS for a mint) and for eth_call of tokenURI, measured on the first pass
    /// of each landmark plate. tokenURI encodes the ~9 KB SVG and then the JSON around it, ~1.3M-1.6M gas in all:
    /// fine for eth_call, whose gas cap is a node setting far above that (50M by default in geth).
    function test_gas_mintAndTokenURI() public {
        vm.prank(minter);
        uint256 g = gasleft();
        pass.mint(alice);
        uint256 mintGas = g - gasleft();
        emit log_named_uint("mint gas (excl. tx base)", mintGas);
        assertLt(mintGas, 150_000);

        for (uint256 i = 2; i <= 100; i++) {
            address w = address(uint160(0x40000 + i));
            _stamp(w);
            _mint(w);
        }
        uint256 maxGas;
        uint256[5] memory ids = [uint256(1), 21, 41, 61, 81];
        for (uint256 i; i < ids.length; i++) {
            g = gasleft();
            pass.tokenURI(ids[i]);
            uint256 uriGas = g - gasleft();
            emit log_named_uint(string.concat("tokenURI gas, pass ", vm.toString(ids[i])), uriGas);
            if (uriGas > maxGas) maxGas = uriGas;
        }
        assertLt(maxGas, 2_500_000);
    }
}
