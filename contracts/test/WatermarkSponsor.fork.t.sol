// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test, Vm, console2} from "forge-std/Test.sol";
import {WatermarkSponsor} from "../src/WatermarkSponsor.sol";
import {MockRegistry} from "./mocks/MockRegistry.sol";
import {Mock1271Wallet} from "./mocks/Mock1271Wallet.sol";

interface IWhitechainUSDT {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function TRANSFER_WITH_AUTHORIZATION_TYPEHASH() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

/// @notice Fork tests against the real Whitechain Sepolia USDT (0xcedf…55a7). Read-only fork: nothing is broadcast.
/// Run with `forge test --fork-url https://rpc.testnet.whitechain.io` (or plain `forge test`: setUp forks itself when
/// the current chain isn't 1874, using $WHITECHAIN_RPC or the public RPC). Set SKIP_FORK=true to skip offline.
contract WatermarkSponsorForkTest is Test {
    address internal constant USDT_ADDR = 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7;
    IWhitechainUSDT internal constant USDT = IWhitechainUSDT(USDT_ADDR);
    uint256 internal constant APP_ID = uint256(keccak256("watermark-fork-app")) >> 8;
    uint32 internal constant QUOTA = 20;
    bytes32 internal constant TWA_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    MockRegistry internal registry;
    WatermarkSponsor internal sponsor;
    address internal relayer = makeAddr("relayer");
    address internal shop = makeAddr("shop");
    uint256 internal userKey = 0xA11CE;
    address internal user;
    uint256 internal nonceCounter;
    bool internal skipFork;

    function setUp() public {
        if (vm.envOr("SKIP_FORK", false)) {
            skipFork = true;
            return;
        }
        if (block.chainid != 1874) {
            vm.createSelectFork(vm.envOr("WHITECHAIN_RPC", string("https://rpc.testnet.whitechain.io")));
        }
        assertEq(block.chainid, 1874, "not a Whitechain Sepolia fork");
        assertGt(USDT_ADDR.code.length, 0, "USDT has no code on this fork");

        user = vm.addr(userKey);
        registry = new MockRegistry();
        sponsor = new WatermarkSponsor(address(registry), APP_ID, USDT_ADDR, relayer, QUOTA);
        registry.setStamp(user, APP_ID, uint64(block.timestamp + 90 days));
        _fund(user, 100e6);
    }

    modifier forkOnly() {
        if (skipFork) {
            vm.skip(true);
        }
        _;
    }

    // ------------------------------------------------------------------ helpers

    /// @dev Funds `to` with USDT inside the fork. deal() finds the proxy's balance slot through stdStorage.
    function _fund(address to, uint256 amount) internal {
        uint256 before = USDT.balanceOf(to);
        deal(USDT_ADDR, to, before + amount);
        assertEq(USDT.balanceOf(to), before + amount, "deal failed to set the USDT balance");
    }

    function _intent(address from, address to, uint256 value) internal returns (WatermarkSponsor.PaymentIntent memory) {
        return WatermarkSponsor.PaymentIntent({
            from: from,
            to: to,
            value: value,
            validAfter: vm.getBlockTimestamp() - 60,
            validBefore: vm.getBlockTimestamp() + 1 hours,
            nonce: keccak256(abi.encode("fork-nonce", ++nonceCounter))
        });
    }

    function _digest(WatermarkSponsor.PaymentIntent memory i) internal view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(TWA_TYPEHASH, i.from, i.to, i.value, i.validAfter, i.validBefore, i.nonce));
        return keccak256(abi.encodePacked("\x19\x01", USDT.DOMAIN_SEPARATOR(), structHash));
    }

    function _sign(uint256 key, WatermarkSponsor.PaymentIntent memory i) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, _digest(i));
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------ token facts

    function test_fork_tokenFacts() public forkOnly {
        assertEq(USDT.symbol(), "USDT");
        assertEq(USDT.name(), "Tether USD");
        assertEq(USDT.decimals(), 6);
        assertEq(USDT.TRANSFER_WITH_AUTHORIZATION_TYPEHASH(), TWA_TYPEHASH);
        bytes32 expectedDomain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Tether USD"),
                keccak256("1"),
                uint256(1874),
                USDT_ADDR
            )
        );
        assertEq(USDT.DOMAIN_SEPARATOR(), expectedDomain);
        assertEq(USDT.DOMAIN_SEPARATOR(), 0xcdcfacb6b15c8238b4e5fbb47bdb83b7f83f50a531d264bf9763d2bd1d3d2a25);
    }

    // ------------------------------------------------------------------ happy path + gas

    function test_fork_relayPayment_realUsdt() public forkOnly {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 12_345_678); // 12.345678 USDT
        bytes memory sig = _sign(userKey, i);
        uint256 userBefore = USDT.balanceOf(user);
        uint256 shopBefore = USDT.balanceOf(shop);
        assertFalse(USDT.authorizationState(user, i.nonce));

        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        Vm.Gas memory g1 = vm.lastFrameGas();

        assertEq(USDT.balanceOf(user), userBefore - 12_345_678);
        assertEq(USDT.balanceOf(shop), shopBefore + 12_345_678);
        assertTrue(USDT.authorizationState(user, i.nonce));
        assertEq(USDT.balanceOf(relayer), 0);
        assertEq(USDT.balanceOf(address(sponsor)), 0);
        assertEq(sponsor.quotaLeft(user), QUOTA - 1);

        // A second payment the same day (quota slot already non-zero).
        WatermarkSponsor.PaymentIntent memory j = _intent(user, shop, 1e6);
        sig = _sign(userKey, j);
        vm.prank(relayer);
        sponsor.relayPayment(j, sig);
        Vm.Gas memory g2 = vm.lastFrameGas();
        assertEq(sponsor.quotaLeft(user), QUOTA - 2);

        // With --isolate each call is its own transaction, so gasTotalUsed includes the 21,000 intrinsic gas and
        // calldata, and refunds are final: tx gas = gasTotalUsed - gasRefunded (refund capped at 1/5, EIP-3529).
        console2.log("isolate mode:", vm.isIsolateMode());
        console2.log(
            "first payment of the day: gasTotalUsed", g1.gasTotalUsed, "refund", uint256(int256(g1.gasRefunded))
        );
        console2.log(
            "later payment same day:   gasTotalUsed", g2.gasTotalUsed, "refund", uint256(int256(g2.gasRefunded))
        );
    }

    function test_fork_erc1271Wallet() public forkOnly {
        uint256 ownerKey = 0xB0B;
        Mock1271Wallet wallet = new Mock1271Wallet(vm.addr(ownerKey));
        _fund(address(wallet), 10e6);
        registry.setStamp(address(wallet), APP_ID, uint64(block.timestamp + 30 days));

        WatermarkSponsor.PaymentIntent memory i = _intent(address(wallet), shop, 3e6);
        bytes memory sig = _sign(ownerKey, i);
        uint256 shopBefore = USDT.balanceOf(shop);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(USDT.balanceOf(shop), shopBefore + 3e6);
        assertTrue(USDT.authorizationState(address(wallet), i.nonce));
    }

    // ------------------------------------------------------------------ refusals on the real token

    function test_fork_replayFails() public forkOnly {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        uint256 shopAfterFirst = USDT.balanceOf(shop);

        vm.prank(relayer);
        (bool ok, bytes memory err) = address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (i, sig)));
        assertFalse(ok, "replay must fail");
        console2.log("replay revert data:");
        console2.logBytes(err);
        assertEq(USDT.balanceOf(shop), shopAfterFirst);
        assertEq(sponsor.quotaLeft(user), QUOTA - 1, "a failed replay must not use quota");
    }

    function test_fork_wrongSignerFails() public forkOnly {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(0xBAD, i);
        uint256 userBefore = USDT.balanceOf(user);

        vm.prank(relayer);
        (bool ok, bytes memory err) = address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (i, sig)));
        assertFalse(ok, "wrong signer must fail");
        console2.log("wrong-signer revert data:");
        console2.logBytes(err);
        assertEq(USDT.balanceOf(user), userBefore);
        assertFalse(USDT.authorizationState(user, i.nonce));
        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    function test_fork_tamperedAmountFails() public forkOnly {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        i.value = 50e6; // relayer (or anyone) tries to raise the amount
        vm.prank(relayer);
        (bool ok,) = address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (i, sig)));
        assertFalse(ok, "tampered value must fail");
    }

    function test_fork_notStampedRefusedBeforeToken() public forkOnly {
        uint256 key2 = 0xD00D;
        address stranger = vm.addr(key2);
        _fund(stranger, 5e6);
        WatermarkSponsor.PaymentIntent memory i = _intent(stranger, shop, 1e6);
        bytes memory sig = _sign(key2, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, stranger, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_fork_quotaOnRealToken() public forkOnly {
        WatermarkSponsor small = new WatermarkSponsor(address(registry), APP_ID, USDT_ADDR, relayer, 2);
        for (uint256 k = 0; k < 2; k++) {
            WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
            bytes memory s = _sign(userKey, i);
            vm.prank(relayer);
            small.relayPayment(i, s);
        }
        WatermarkSponsor.PaymentIntent memory j = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, j);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.QuotaUsed.selector, user, uint32(2)));
        vm.prank(relayer);
        small.relayPayment(j, sig);
    }

    /// @dev F7 known trade-off on the real token: a bystander can submit the authorization directly. Funds still go
    /// only to the recipient the user signed for; the sponsor's quota isn't used; the relayer's later call fails.
    function test_fork_f7_directSubmission() public forkOnly {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 2e6);
        bytes memory sig = _sign(userKey, i);
        uint256 shopBefore = USDT.balanceOf(shop);
        vm.prank(makeAddr("bystander"));
        USDT.transferWithAuthorization(i.from, i.to, i.value, i.validAfter, i.validBefore, i.nonce, sig);
        assertEq(USDT.balanceOf(shop), shopBefore + 2e6);
        assertEq(sponsor.quotaLeft(user), QUOTA);

        vm.prank(relayer);
        (bool ok,) = address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (i, sig)));
        assertFalse(ok);
        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    // ------------------------------------------------------------------ quota rollback, zero fields, mid-day expiry

    /// @dev A revert inside the real USDT (insufficient balance, wrong signer) undoes the sponsor's quota write.
    function test_fork_quotaRollsBackOnTokenRevert() public forkOnly {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        (uint32 dayBefore, uint32 usedBefore) = sponsor.usage(user);
        assertEq(usedBefore, 1);

        WatermarkSponsor.PaymentIntent memory big = _intent(user, shop, USDT.balanceOf(user) + 1);
        bytes memory sigBig = _sign(userKey, big);
        vm.prank(relayer);
        (bool ok, bytes memory err) =
            address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (big, sigBig)));
        assertFalse(ok, "overdraft must fail");
        console2.log("insufficient-balance revert data:");
        console2.logBytes(err);

        WatermarkSponsor.PaymentIntent memory bad = _intent(user, shop, 1e6);
        bytes memory sigBad = _sign(0xBAD, bad);
        vm.prank(relayer);
        (ok,) = address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (bad, sigBad)));
        assertFalse(ok);

        (uint32 dayAfter, uint32 usedAfter) = sponsor.usage(user);
        assertEq(dayAfter, dayBefore);
        assertEq(usedAfter, usedBefore, "token reverts must not use quota");
        assertFalse(USDT.authorizationState(user, big.nonce));
        assertFalse(USDT.authorizationState(user, bad.nonce));
    }

    /// @dev Zero value, zero recipient and zero `from` (even with a registry that wrongly says address(0) is stamped)
    /// are refused by the sponsor before the real token is called.
    function test_fork_zeroFieldsRefusedBeforeToken() public forkOnly {
        vm.expectCall(USDT_ADDR, abi.encodeWithSelector(IWhitechainUSDT.transferWithAuthorization.selector), 0);

        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 0);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(WatermarkSponsor.ZeroValue.selector);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        i = _intent(user, address(0), 1e6);
        sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.InvalidRecipient.selector, address(0)));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        registry.setStamp(address(0), APP_ID, uint64(block.timestamp + 90 days));
        registry.setRaw(true, true);
        i = _intent(address(0), shop, 1e6);
        sig = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27));
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, address(0), APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.usedToday(user), 0);
    }

    /// @dev On the real token: payments stop the second after a mid-day expiry, the refused intent is not consumed,
    /// and after a same-day renewal the same intent pays and the day's count continues.
    function test_fork_stampExpiresMidDay() public forkOnly {
        uint256 dayStart = (block.timestamp / 1 days) * 1 days;
        vm.warp(dayStart + 1 days + 9 hours); // 09:00 UTC tomorrow, so the times below are in the future of the fork
        uint64 expiry = uint64(dayStart + 1 days + 14 hours);
        registry.setStamp(user, APP_ID, expiry);

        WatermarkSponsor.PaymentIntent memory a = _intent(user, shop, 1e6);
        bytes memory sigA = _sign(userKey, a);
        vm.prank(relayer);
        sponsor.relayPayment(a, sigA);

        vm.warp(expiry + 1);
        WatermarkSponsor.PaymentIntent memory b = _intent(user, shop, 1e6);
        bytes memory sigB = _sign(userKey, b);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, user, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(b, sigB);
        assertFalse(USDT.authorizationState(user, b.nonce));
        assertEq(sponsor.usedToday(user), 1);

        registry.setStamp(user, APP_ID, uint64(block.timestamp + 90 days));
        uint256 shopBefore = USDT.balanceOf(shop);
        vm.prank(relayer);
        sponsor.relayPayment(b, sigB);
        assertEq(USDT.balanceOf(shop), shopBefore + 1e6);
        assertEq(sponsor.usedToday(user), 2);
    }

    // ------------------------------------------------------------------ gas profile

    function _payGas(uint256 key, address from, address to) internal returns (uint256 total, int256 refund) {
        WatermarkSponsor.PaymentIntent memory i = _intent(from, to, 1e6);
        bytes memory sig = _sign(key, i);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        Vm.Gas memory g = vm.lastFrameGas();
        return (g.gasTotalUsed, g.gasRefunded);
    }

    /// @dev Prints relayPayment gas on the real token for the cases the relayer meets, to a shop that already holds
    /// USDT (the usual case for a merchant). Run with -vv. In isolate mode each call is its own transaction, so the
    /// figure includes the 21,000 base and calldata; tx gas = gasTotalUsed - gasRefunded.
    function test_fork_gasProfile() public forkOnly {
        _fund(shop, 1e6);
        console2.log("isolate mode:", vm.isIsolateMode());

        (uint256 first, int256 r1) = _payGas(userKey, user, shop);
        console2.log("EOA, first-ever payment (quota slot 0 -> set):", first, "refund", uint256(r1));
        (uint256 later, int256 r2) = _payGas(userKey, user, shop);
        console2.log("EOA, later payment same day:                 ", later, "refund", uint256(r2));
        vm.warp(block.timestamp + 1 days);
        (uint256 nextDay, int256 r3) = _payGas(userKey, user, shop);
        console2.log("EOA, first payment of a later day:           ", nextDay, "refund", uint256(r3));

        uint256 ownerKey = 0xB0B;
        Mock1271Wallet wallet = new Mock1271Wallet(vm.addr(ownerKey));
        _fund(address(wallet), 10e6);
        registry.setStamp(address(wallet), APP_ID, uint64(block.timestamp + 30 days));
        (uint256 w1, int256 r4) = _payGas(ownerKey, address(wallet), shop);
        console2.log("ERC-1271 wallet, first payment:              ", w1, "refund", uint256(r4));

        address newShop = makeAddr("new-shop"); // recipient with no USDT yet: one more cold slot set from zero
        (uint256 fresh, int256 r5) = _payGas(userKey, user, newShop);
        console2.log("EOA, to a recipient with zero USDT:          ", fresh, "refund", uint256(r5));

        // The relayer's MAX_GAS_PER_PAY default (300,000) must cover every case with room to spare.
        uint256 maxSeen = first;
        if (later > maxSeen) maxSeen = later;
        if (nextDay > maxSeen) maxSeen = nextDay;
        if (w1 > maxSeen) maxSeen = w1;
        if (fresh > maxSeen) maxSeen = fresh;
        assertLt(maxSeen, 300_000 * 3 / 4, "relayPayment gas too close to MAX_GAS_PER_PAY");
    }
}
