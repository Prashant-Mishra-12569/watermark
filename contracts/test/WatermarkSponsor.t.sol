// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {WatermarkSponsor} from "../src/WatermarkSponsor.sol";
import {MockRegistry} from "./mocks/MockRegistry.sol";
import {MockEIP3009} from "./mocks/MockEIP3009.sol";
import {Mock1271Wallet} from "./mocks/Mock1271Wallet.sol";

/// @notice Unit tests with a mock registry and a mock EIP-3009 token. Fork tests against the real Whitechain USDT
/// live in WatermarkSponsor.fork.t.sol.
contract WatermarkSponsorTest is Test {
    uint256 internal constant APP_ID = uint256(keccak256("watermark-test-app")) >> 8;
    uint32 internal constant QUOTA = 3;
    /// @dev Noon UTC on day 20,000, so a day boundary is 12 hours away in either direction.
    uint256 internal constant T0 = 20_000 days + 12 hours;

    MockRegistry internal registry;
    MockEIP3009 internal token;
    WatermarkSponsor internal sponsor;

    address internal relayer = makeAddr("relayer");
    address internal shop = makeAddr("shop");
    uint256 internal userKey = 0xA11CE;
    address internal user;

    uint256 internal nonceCounter;

    event PaymentRelayed(
        address indexed from, address indexed to, uint256 value, bytes32 nonce, uint32 day, uint32 usedToday
    );

    function setUp() public {
        vm.warp(T0);
        user = vm.addr(userKey);
        registry = new MockRegistry();
        token = new MockEIP3009();
        sponsor = new WatermarkSponsor(address(registry), APP_ID, address(token), relayer, QUOTA);
        token.mint(user, 1_000e6);
        registry.setStamp(user, APP_ID, uint64(T0 + 90 days));
    }

    // ------------------------------------------------------------------ helpers

    function _intent(address from, address to, uint256 value) internal returns (WatermarkSponsor.PaymentIntent memory) {
        return WatermarkSponsor.PaymentIntent({
            from: from,
            to: to,
            value: value,
            validAfter: block.timestamp - 1,
            validBefore: block.timestamp + 1 hours,
            nonce: keccak256(abi.encode("nonce", ++nonceCounter))
        });
    }

    function _sign(uint256 key, WatermarkSponsor.PaymentIntent memory i) internal view returns (bytes memory) {
        bytes32 d = token.digest(i.from, i.to, i.value, i.validAfter, i.validBefore, i.nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, d);
        return abi.encodePacked(r, s, v);
    }

    function _pay(uint256 value) internal returns (WatermarkSponsor.PaymentIntent memory i) {
        i = _intent(user, shop, value);
        bytes memory sig = _sign(userKey, i);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function _today() internal view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    // ------------------------------------------------------------------ constructor

    function test_constructor_setsImmutables() public view {
        assertEq(address(sponsor.registry()), address(registry));
        assertEq(sponsor.appId(), APP_ID);
        assertEq(address(sponsor.usdt()), address(token));
        assertEq(sponsor.relayer(), relayer);
        assertEq(sponsor.quotaPerDay(), QUOTA);
    }

    function test_constructor_rejectsZeroAddresses() public {
        vm.expectRevert(WatermarkSponsor.ZeroAddress.selector);
        new WatermarkSponsor(address(0), APP_ID, address(token), relayer, QUOTA);
        vm.expectRevert(WatermarkSponsor.ZeroAddress.selector);
        new WatermarkSponsor(address(registry), APP_ID, address(0), relayer, QUOTA);
        vm.expectRevert(WatermarkSponsor.ZeroAddress.selector);
        new WatermarkSponsor(address(registry), APP_ID, address(token), address(0), QUOTA);
    }

    function test_constructor_rejectsNonContracts() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotAContract.selector, eoa));
        new WatermarkSponsor(eoa, APP_ID, address(token), relayer, QUOTA);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotAContract.selector, eoa));
        new WatermarkSponsor(address(registry), APP_ID, eoa, relayer, QUOTA);
    }

    function test_constructor_rejectsBadAppId() public {
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.InvalidAppId.selector, 0));
        new WatermarkSponsor(address(registry), 0, address(token), relayer, QUOTA);
        uint256 tooBig = 1 << 248;
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.InvalidAppId.selector, tooBig));
        new WatermarkSponsor(address(registry), tooBig, address(token), relayer, QUOTA);
        // The largest F5 appId is accepted.
        new WatermarkSponsor(address(registry), tooBig - 1, address(token), relayer, QUOTA);
    }

    function test_constructor_rejectsZeroQuota() public {
        vm.expectRevert(WatermarkSponsor.ZeroQuota.selector);
        new WatermarkSponsor(address(registry), APP_ID, address(token), relayer, 0);
    }

    // ------------------------------------------------------------------ happy path

    function test_relayPayment_movesFundsAndCountsQuota() public {
        assertEq(sponsor.quotaLeft(user), QUOTA);
        WatermarkSponsor.PaymentIntent memory i = _pay(5e6);
        assertEq(token.balanceOf(user), 995e6);
        assertEq(token.balanceOf(shop), 5e6);
        assertTrue(token.authorizationState(user, i.nonce));
        assertEq(sponsor.quotaLeft(user), QUOTA - 1);
        assertEq(sponsor.usedToday(user), 1);
        // The relayer pays gas but never holds or receives USDT.
        assertEq(token.balanceOf(relayer), 0);
        assertEq(token.balanceOf(address(sponsor)), 0);
    }

    function test_relayPayment_emitsEvent() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 7e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectEmit(true, true, false, true, address(sponsor));
        emit PaymentRelayed(user, shop, 7e6, i.nonce, _today(), 1);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        WatermarkSponsor.PaymentIntent memory j = _intent(user, shop, 1e6);
        sig = _sign(userKey, j);
        vm.expectEmit(true, true, false, true, address(sponsor));
        emit PaymentRelayed(user, shop, 1e6, j.nonce, _today(), 2);
        vm.prank(relayer);
        sponsor.relayPayment(j, sig);
    }

    function test_relayPayment_erc1271Wallet() public {
        uint256 ownerKey = 0xB0B;
        Mock1271Wallet wallet = new Mock1271Wallet(vm.addr(ownerKey));
        token.mint(address(wallet), 10e6);
        registry.setStamp(address(wallet), APP_ID, uint64(T0 + 30 days));

        WatermarkSponsor.PaymentIntent memory i = _intent(address(wallet), shop, 4e6);
        bytes memory sig = _sign(ownerKey, i);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(token.balanceOf(shop), 4e6);
        assertEq(sponsor.quotaLeft(address(wallet)), QUOTA - 1);
    }

    // ------------------------------------------------------------------ quota

    function test_quota_exactlyQuotaPerDayThenQuotaUsed() public {
        for (uint256 k = 0; k < QUOTA; k++) {
            _pay(1e6);
        }
        assertEq(sponsor.quotaLeft(user), 0);
        assertEq(token.balanceOf(shop), uint256(QUOTA) * 1e6);

        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.QuotaUsed.selector, user, QUOTA));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_quota_demoPolicyOf20() public {
        WatermarkSponsor s20 = new WatermarkSponsor(address(registry), APP_ID, address(token), relayer, 20);
        for (uint256 k = 0; k < 20; k++) {
            WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1);
            bytes memory sig = _sign(userKey, i);
            vm.prank(relayer);
            s20.relayPayment(i, sig);
            assertEq(s20.quotaLeft(user), 19 - k);
        }
        WatermarkSponsor.PaymentIntent memory j = _intent(user, shop, 1);
        bytes memory sig2 = _sign(userKey, j);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.QuotaUsed.selector, user, uint32(20)));
        vm.prank(relayer);
        s20.relayPayment(j, sig2);
    }

    function test_quota_rollsOverAtUtcMidnight() public {
        // Use the whole quota late in the day.
        vm.warp((T0 / 1 days) * 1 days + 1 days - 10); // 23:59:50 UTC
        uint32 day0 = _today();
        for (uint256 k = 0; k < QUOTA; k++) {
            _pay(1e6);
        }
        assertEq(sponsor.quotaLeft(user), 0);

        // 23:59:59 is still the same UTC day.
        vm.warp((T0 / 1 days) * 1 days + 1 days - 1);
        assertEq(_today(), day0);
        assertEq(sponsor.quotaLeft(user), 0);
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.QuotaUsed.selector, user, QUOTA));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        // 00:00:00 the next day: full quota again, and the counter restarts at 1.
        vm.warp((T0 / 1 days) * 1 days + 1 days);
        assertEq(_today(), day0 + 1);
        assertEq(sponsor.quotaLeft(user), QUOTA);
        assertEq(sponsor.usedToday(user), 0);
        WatermarkSponsor.PaymentIntent memory j = _intent(user, shop, 1e6);
        sig = _sign(userKey, j);
        vm.expectEmit(true, true, false, true, address(sponsor));
        emit PaymentRelayed(user, shop, 1e6, j.nonce, day0 + 1, 1);
        vm.prank(relayer);
        sponsor.relayPayment(j, sig);
        assertEq(sponsor.quotaLeft(user), QUOTA - 1);

        // Skipping several days also resets (no carry-over of unused quota).
        vm.warp(block.timestamp + 5 days);
        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    function test_quota_isPerWallet() public {
        uint256 key2 = 0xC0FFEE;
        address user2 = vm.addr(key2);
        token.mint(user2, 100e6);
        registry.setStamp(user2, APP_ID, uint64(T0 + 30 days));
        for (uint256 k = 0; k < QUOTA; k++) {
            _pay(1e6);
        }
        assertEq(sponsor.quotaLeft(user), 0);
        assertEq(sponsor.quotaLeft(user2), QUOTA);

        WatermarkSponsor.PaymentIntent memory i = _intent(user2, shop, 1e6);
        bytes memory sig = _sign(key2, i);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user2), QUOTA - 1);
    }

    function test_quotaLeft_unknownWalletIsFull() public {
        assertEq(sponsor.quotaLeft(makeAddr("nobody")), QUOTA);
        assertEq(sponsor.quotaLeft(address(0)), QUOTA);
    }

    // ------------------------------------------------------------------ refusals

    function test_refuse_nonRelayer() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        address[3] memory callers = [user, shop, address(this)];
        for (uint256 k = 0; k < callers.length; k++) {
            vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotRelayer.selector, callers[k]));
            vm.prank(callers[k]);
            sponsor.relayPayment(i, sig);
        }
        assertEq(sponsor.quotaLeft(user), QUOTA);
        assertEq(token.balanceOf(shop), 0);
    }

    function test_refuse_notStamped() public {
        uint256 key2 = 0xD00D;
        address stranger = vm.addr(key2);
        token.mint(stranger, 10e6);
        WatermarkSponsor.PaymentIntent memory i = _intent(stranger, shop, 1e6);
        bytes memory sig = _sign(key2, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, stranger, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_refuse_stampedForAnotherAppOnly() public {
        uint256 key2 = 0xD00D;
        address other = vm.addr(key2);
        token.mint(other, 10e6);
        registry.setStamp(other, APP_ID + 1, uint64(T0 + 30 days));
        WatermarkSponsor.PaymentIntent memory i = _intent(other, shop, 1e6);
        bytes memory sig = _sign(key2, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, other, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_refuse_expiredStamp() public {
        registry.setStamp(user, APP_ID, uint64(T0 + 1 days));
        _pay(1e6); // still valid

        vm.warp(T0 + 1 days); // last valid second (expiry is inclusive)
        _pay(1e6);

        vm.warp(T0 + 1 days + 1);
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, user, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_refuse_expiredStampEvenIfRegistrySaysOk() public {
        // A registry that reports ok but an expiry in the past is still refused.
        registry.setStamp(user, APP_ID, uint64(T0 - 1));
        registry.setRaw(true, true);
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, user, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_refuse_registryNotOk() public {
        registry.setRaw(true, false); // expiry in the future but ok = false (e.g. revoked)
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, user, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_refuse_zeroValue() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 0);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(WatermarkSponsor.ZeroValue.selector);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_refuse_badRecipient() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, address(0), 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.InvalidRecipient.selector, address(0)));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        i = _intent(user, address(sponsor), 1e6);
        sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.InvalidRecipient.selector, address(sponsor)));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_refuse_zeroFromIsNotStamped() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(address(0), shop, 1e6);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, address(0), APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, hex"");
    }

    function test_refuse_authorizationWindow() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        i.validAfter = block.timestamp; // must be strictly before now
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(
            abi.encodeWithSelector(WatermarkSponsor.AuthorizationNotYetValid.selector, i.validAfter, block.timestamp)
        );
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        i = _intent(user, shop, 1e6);
        i.validBefore = block.timestamp; // must be strictly after now
        sig = _sign(userKey, i);
        vm.expectRevert(
            abi.encodeWithSelector(WatermarkSponsor.AuthorizationExpired.selector, i.validBefore, block.timestamp)
        );
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    // ------------------------------------------------------------------ token reverts bubble up, use no quota

    function test_tokenRevert_badSignatureBubbles() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(0xBAD, i); // wrong signer
        vm.expectRevert(MockEIP3009.InvalidSignature.selector);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user), QUOTA);
        assertFalse(token.authorizationState(user, i.nonce));
    }

    function test_tokenRevert_replayBubbles() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        vm.expectRevert(abi.encodeWithSelector(MockEIP3009.AuthorizationUsed.selector, user, i.nonce));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user), QUOTA - 1);
        assertEq(token.balanceOf(shop), 1e6);
    }

    function test_tokenRevert_stringAndEmptyBubble() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);

        token.setFailMode(1);
        vm.expectRevert(bytes("MockEIP3009: forced failure"));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        token.setFailMode(2);
        vm.expectRevert(bytes(""));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    function test_tokenRevert_insufficientBalanceBubbles() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1_000_000e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(MockEIP3009.InsufficientBalance.selector);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    // ------------------------------------------------------------------ F7 trade-off, documented

    function test_f7_directSubmissionSkipsQuotaButOnlyPaysIntendedRecipient() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 2e6);
        bytes memory sig = _sign(userKey, i);
        // A bystander submits the user's authorization straight to the token.
        vm.prank(makeAddr("bystander"));
        token.transferWithAuthorization(i.from, i.to, i.value, i.validAfter, i.validBefore, i.nonce, sig);
        assertEq(token.balanceOf(shop), 2e6); // the recipient the user chose
        assertEq(sponsor.quotaLeft(user), QUOTA); // quota skipped

        // The relayer's later submission fails inside the token and uses no quota.
        vm.expectRevert(abi.encodeWithSelector(MockEIP3009.AuthorizationUsed.selector, user, i.nonce));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    // ------------------------------------------------------------------ quota rolls back when the token reverts

    function _usage(address wallet) internal view returns (uint32 day, uint32 used) {
        (day, used) = sponsor.usage(wallet);
    }

    /// @dev The quota write happens before the token call (checks-effects-interactions). A token revert must undo it:
    /// stored (day, used) is unchanged, no PaymentRelayed event survives, and the slot can still be used later.
    function test_quotaRollback_tokenRevertAfterEarlierPayments() public {
        _pay(1e6);
        _pay(1e6);
        (uint32 dayBefore, uint32 usedBefore) = _usage(user);
        assertEq(usedBefore, 2);

        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        token.setFailMode(1);
        vm.recordLogs();
        vm.expectRevert(bytes("MockEIP3009: forced failure"));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(vm.getRecordedLogs().length, 0, "no event from a reverted payment");

        (uint32 dayAfter, uint32 usedAfter) = _usage(user);
        assertEq(dayAfter, dayBefore);
        assertEq(usedAfter, usedBefore);
        assertEq(sponsor.quotaLeft(user), QUOTA - 2);

        // The last slot of the day was not burned: the same signed intent goes through once the token works.
        token.setFailMode(0);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user), 0);
        assertTrue(token.authorizationState(user, i.nonce));
    }

    function test_quotaRollback_sameTransactionViaTryCatch() public {
        RelayerHarness h = new RelayerHarness();
        WatermarkSponsor s = new WatermarkSponsor(address(registry), APP_ID, address(token), address(h), QUOTA);
        h.setSponsor(s);

        WatermarkSponsor.PaymentIntent memory ok1 = _intent(user, shop, 1e6);
        (bool ok, uint32 used,) = h.tryRelay(ok1, _sign(userKey, ok1));
        assertTrue(ok);
        assertEq(used, 1);

        // Each kind of token failure, caught in the same transaction: usedToday reads 1 right after the revert.
        WatermarkSponsor.PaymentIntent memory bad = _intent(user, shop, 1e6);
        bytes memory err;
        (ok, used, err) = h.tryRelay(bad, _sign(0xBAD, bad)); // wrong signer
        assertFalse(ok);
        assertEq(bytes4(err), MockEIP3009.InvalidSignature.selector);
        assertEq(used, 1);

        (ok, used, err) = h.tryRelay(ok1, _sign(userKey, ok1)); // replay
        assertFalse(ok);
        assertEq(bytes4(err), MockEIP3009.AuthorizationUsed.selector);
        assertEq(used, 1);

        WatermarkSponsor.PaymentIntent memory big = _intent(user, shop, 1_000_000e6); // insufficient balance
        (ok, used, err) = h.tryRelay(big, _sign(userKey, big));
        assertFalse(ok);
        assertEq(bytes4(err), MockEIP3009.InsufficientBalance.selector);
        assertEq(used, 1);

        token.setFailMode(2); // revert with no data
        WatermarkSponsor.PaymentIntent memory empty = _intent(user, shop, 1e6);
        (ok, used, err) = h.tryRelay(empty, _sign(userKey, empty));
        assertFalse(ok);
        assertEq(err.length, 0);
        assertEq(used, 1);
        assertEq(s.quotaLeft(user), QUOTA - 1);
    }

    /// @dev Yesterday's full quota is stored; a token revert on today's first payment must not overwrite it with
    /// (today, 1). Today's quota still reads as full, and the next good payment starts the count at 1.
    function test_quotaRollback_acrossDayBoundary() public {
        for (uint256 k = 0; k < QUOTA; k++) {
            _pay(1e6);
        }
        uint32 day0 = _today();
        vm.warp(block.timestamp + 1 days);

        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(0xBAD, i);
        vm.expectRevert(MockEIP3009.InvalidSignature.selector);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);

        (uint32 day, uint32 used) = _usage(user);
        assertEq(day, day0, "stored day unchanged");
        assertEq(used, QUOTA, "stored count unchanged");
        assertEq(sponsor.quotaLeft(user), QUOTA);

        _pay(1e6);
        (day, used) = _usage(user);
        assertEq(day, day0 + 1);
        assertEq(used, 1);
    }

    /// @dev Whatever the earlier usage and whichever way the token fails, a failed call leaves storage as it was.
    function testFuzz_quotaRollback_tokenRevertNeverChangesUsage(uint8 prior, uint8 mode) public {
        prior = uint8(bound(prior, 0, QUOTA - 1));
        for (uint256 k = 0; k < prior; k++) {
            _pay(1e6);
        }
        (uint32 dayBefore, uint32 usedBefore) = _usage(user);

        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        uint256 m = mode % 4;
        if (m == 0) sig = _sign(0xBAD, i);
        else if (m == 1) token.setFailMode(1);
        else if (m == 2) token.setFailMode(2);
        else i.value = 1_000_000e6; // signed for 1e6, relayed with another value: the signature no longer matches
        vm.prank(relayer);
        (bool ok,) = address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (i, sig)));
        assertFalse(ok);

        (uint32 dayAfter, uint32 usedAfter) = _usage(user);
        assertEq(dayAfter, dayBefore);
        assertEq(usedAfter, usedBefore);
        assertEq(token.balanceOf(shop), uint256(prior) * 1e6);
    }

    // ------------------------------------------------------------------ zero-value and zero-address intents

    function _expectNoTokenCall() internal {
        vm.expectCall(address(token), abi.encodeWithSelector(MockEIP3009.transferWithAuthorization.selector), 0);
    }

    function test_zero_valueIsRefusedBeforeTheToken() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 0);
        bytes memory sig = _sign(userKey, i); // a valid signature for value 0 does not help
        _expectNoTokenCall();
        vm.expectRevert(WatermarkSponsor.ZeroValue.selector);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.usedToday(user), 0);
        assertFalse(token.authorizationState(user, i.nonce), "the nonce is not burned");
    }

    function test_zero_valueAndZeroRecipient_valueCheckedFirst() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, address(0), 0);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(WatermarkSponsor.ZeroValue.selector);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
    }

    function test_zero_recipientIsRefusedBeforeTheToken() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, address(0), 1e6);
        bytes memory sig = _sign(userKey, i);
        _expectNoTokenCall();
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.InvalidRecipient.selector, address(0)));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.usedToday(user), 0);
    }

    /// @dev Even if the registry wrongly reported address(0) as stamped (and address(0) held tokens), the sponsor
    /// refuses a zero `from` itself and never reaches the token or the registry.
    function test_zero_fromRefusedEvenIfRegistryLies() public {
        registry.setStamp(address(0), APP_ID, uint64(T0 + 90 days));
        registry.setRaw(true, true);
        token.mint(address(0), 10e6);
        WatermarkSponsor.PaymentIntent memory i = _intent(address(0), shop, 1e6);
        bytes memory junk = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), uint8(27)); // ecrecover → 0
        _expectNoTokenCall();
        vm.expectCall(address(registry), abi.encodeWithSelector(MockRegistry.isStamped.selector), 0);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, address(0), APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, junk);
        assertEq(token.balanceOf(shop), 0);
        assertEq(sponsor.usedToday(address(0)), 0);
    }

    function test_zero_callerIsNotTheRelayer() public {
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotRelayer.selector, address(0)));
        vm.prank(address(0));
        sponsor.relayPayment(i, sig);
    }

    /// @dev Any intent with a zero value, a zero `from` or a zero `to` is refused, moves nothing and uses no quota.
    function testFuzz_zeroFieldsNeverPay(uint8 which, address to, uint256 value, bool registryLies) public {
        vm.assume(to != address(0) && to != address(sponsor) && to != user);
        value = bound(value, 1, 1_000e6);
        WatermarkSponsor.PaymentIntent memory i;
        uint256 w = which % 3;
        if (w == 0) i = _intent(user, to, 0);
        else if (w == 1) i = _intent(address(0), to, value);
        else i = _intent(user, address(0), value);
        if (registryLies) {
            registry.setStamp(address(0), APP_ID, uint64(T0 + 90 days));
            registry.setRaw(true, true);
        }
        bytes memory sig = _sign(userKey, i);
        _expectNoTokenCall();
        vm.prank(relayer);
        (bool ok,) = address(sponsor).call(abi.encodeCall(WatermarkSponsor.relayPayment, (i, sig)));
        assertFalse(ok);
        assertEq(token.balanceOf(user), 1_000e6);
        assertEq(sponsor.usedToday(user), 0);
        assertEq(sponsor.usedToday(address(0)), 0);
    }

    // ------------------------------------------------------------------ a stamp that expires mid-day

    /// @dev The stamp is checked on every call, not once per day. A stamp expiring at 14:00:00 UTC allows payments up
    /// to and including 14:00:00 and refuses from 14:00:01, while the day's quota count stays where it was. A refused
    /// intent is not consumed, so after a same-day renewal the same signed intent goes through and the count continues
    /// (renewal does not reset the day's quota). The next UTC day starts from zero.
    function test_stampExpiresMidDay() public {
        uint256 dayStart = (T0 / 1 days) * 1 days;
        uint32 day0 = uint32(dayStart / 1 days);
        uint64 expiry = uint64(dayStart + 14 hours);
        registry.setStamp(user, APP_ID, expiry);

        vm.warp(dayStart + 9 hours);
        _pay(1e6);
        vm.warp(expiry); // last valid second (inclusive)
        _pay(1e6);
        assertEq(sponsor.usedToday(user), 2);

        // Signed while the stamp was live, with a window that is still open after the stamp expires.
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.warp(expiry + 1);
        assertGt(i.validBefore, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, user, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        // quotaLeft is quota only (the relayer reads isStamped separately): it still shows one left.
        assertEq(sponsor.usedToday(user), 2);
        assertEq(sponsor.quotaLeft(user), QUOTA - 2);
        assertFalse(token.authorizationState(user, i.nonce), "refused before the token: the nonce is not burned");

        // Renewed 30 minutes later, the same day: the same intent now works and the count continues at 3.
        vm.warp(expiry + 30 minutes);
        registry.setStamp(user, APP_ID, uint64(block.timestamp + 90 days));
        vm.expectEmit(true, true, false, true, address(sponsor));
        emit PaymentRelayed(user, shop, 1e6, i.nonce, day0, 3);
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        assertEq(sponsor.quotaLeft(user), 0);

        WatermarkSponsor.PaymentIntent memory j = _intent(user, shop, 1e6);
        bytes memory sigJ = _sign(userKey, j);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.QuotaUsed.selector, user, QUOTA));
        vm.prank(relayer);
        sponsor.relayPayment(j, sigJ);

        vm.warp(dayStart + 1 days);
        assertEq(sponsor.quotaLeft(user), QUOTA);
    }

    /// @dev A stamp expiring at 23:59:59 and one expiring just after midnight: expiry and the UTC day roll are
    /// independent, so the quota resets at midnight only for a wallet that is still stamped.
    function test_stampExpiryAroundMidnight() public {
        uint256 dayStart = (T0 / 1 days) * 1 days;
        registry.setStamp(user, APP_ID, uint64(dayStart + 1 days - 1)); // 23:59:59
        vm.warp(dayStart + 1 days - 1);
        _pay(1e6);
        vm.warp(dayStart + 1 days); // 00:00:00 the next day: quota is full, but the stamp is gone
        assertEq(sponsor.quotaLeft(user), QUOTA);
        WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1e6);
        bytes memory sig = _sign(userKey, i);
        vm.expectRevert(abi.encodeWithSelector(WatermarkSponsor.NotStamped.selector, user, APP_ID));
        vm.prank(relayer);
        sponsor.relayPayment(i, sig);
        (uint32 day, uint32 used) = _usage(user);
        assertEq(day, uint32(dayStart / 1 days)); // the refusal did not touch storage
        assertEq(used, 1);
    }

    // ------------------------------------------------------------------ fuzz

    /// @dev Over random sequences of calls and time jumps, a wallet never gets more than quotaPerDay payments in
    /// one UTC day, and quotaLeft + usedToday == quotaPerDay.
    function testFuzz_neverExceedsQuotaPerDay(uint8[24] calldata steps) public {
        uint32 currentDay = _today();
        uint32 count;
        for (uint256 k = 0; k < steps.length; k++) {
            uint8 st = steps[k];
            if (st % 4 == 0) {
                vm.warp(block.timestamp + (uint256(st) * 1 hours) / 4);
            }
            if (_today() != currentDay) {
                currentDay = _today();
                count = 0;
            }
            WatermarkSponsor.PaymentIntent memory i = _intent(user, shop, 1);
            bytes memory sig = _sign(userKey, i);
            vm.prank(relayer);
            try sponsor.relayPayment(i, sig) {
                count++;
            } catch (bytes memory err) {
                assertEq(bytes4(err), WatermarkSponsor.QuotaUsed.selector);
                assertEq(count, QUOTA);
            }
            assertLe(count, QUOTA);
            assertEq(sponsor.usedToday(user), count);
            assertEq(sponsor.quotaLeft(user) + sponsor.usedToday(user), QUOTA);
        }
    }
}

/// @notice Acts as the relayer and calls relayPayment inside try/catch, so a test can look at the sponsor's storage in
/// the same transaction right after a failed call (a revert must undo the quota write, not only a later transaction).
contract RelayerHarness {
    WatermarkSponsor public sponsor;

    function setSponsor(WatermarkSponsor s) external {
        sponsor = s;
    }

    /// @return ok whether relayPayment succeeded; usedAfter the wallet's usedToday read in the same transaction.
    function tryRelay(WatermarkSponsor.PaymentIntent calldata i, bytes calldata sig)
        external
        returns (bool ok, uint32 usedAfter, bytes memory err)
    {
        try sponsor.relayPayment(i, sig) {
            ok = true;
        } catch (bytes memory e) {
            err = e;
        }
        usedAfter = sponsor.usedToday(i.from);
    }
}
