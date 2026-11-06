// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MonthMath} from "../src/libraries/MonthMath.sol";

/// @notice Month index (interfaces F1) and end-of-month maths. Reference timestamps from JavaScript Date.UTC.
contract MonthMathTest is Test {
    function test_knownDates() public pure {
        assertEq(MonthMath.monthIndex(946_684_800), 0, "2000-01-01T00:00:00Z");
        assertEq(MonthMath.monthIndex(1_793_923_200), 322, "2026-11-06T00:00:00Z");
        assertEq(MonthMath.monthIndex(1_793_968_496), 322, "2026-11-06T12:34:56Z");
        assertEq(MonthMath.monthIndex(1_793_491_200), 322, "2026-11-01T00:00:00Z");
        assertEq(MonthMath.monthIndex(1_793_491_199), 321, "2026-10-31T23:59:59Z");
        assertEq(MonthMath.monthIndex(1_796_083_199), 322, "2026-11-30T23:59:59Z");
        assertEq(MonthMath.monthIndex(1_796_083_200), 323, "2026-12-01T00:00:00Z");
    }

    function test_yearBoundary() public pure {
        assertEq(MonthMath.monthIndex(1_798_761_599), 323, "2026-12-31T23:59:59Z");
        assertEq(MonthMath.monthIndex(1_798_761_600), 324, "2027-01-01T00:00:00Z");
        assertEq(MonthMath.endOfMonth(323), 1_798_761_599, "end of Dec 2026");
        assertEq(MonthMath.startOfMonth(324), 1_798_761_600, "start of Jan 2027");
        assertEq(MonthMath.endOfMonth(324), 1_801_439_999, "end of Jan 2027");
    }

    function test_endOf325_isFeb28_2027() public pure {
        // validUntilMonth 325 (the sdk vector) = Feb 2027; 2027 is not a leap year.
        assertEq(MonthMath.endOfMonth(325), 1_803_859_199, "2027-02-28T23:59:59Z");
        assertEq(MonthMath.startOfMonth(326), 1_803_859_200, "2027-03-01T00:00:00Z");
    }

    function test_leapYears() public pure {
        // Feb 2028 (index 337) has 29 days.
        assertEq(MonthMath.monthIndex(1_835_395_199), 337, "2028-02-28T23:59:59Z");
        assertEq(MonthMath.monthIndex(1_835_481_599), 337, "2028-02-29T23:59:59Z");
        assertEq(MonthMath.endOfMonth(337), 1_835_481_599, "end of Feb 2028 = 29th");
        assertEq(MonthMath.monthIndex(1_835_481_600), 338, "2028-03-01T00:00:00Z");
        // 2000 is a leap year (divisible by 400); 2100 is not (divisible by 100).
        assertEq(MonthMath.endOfMonth(1), 951_868_799, "2000-02-29T23:59:59Z");
        assertEq(MonthMath.endOfMonth(1201), 4_107_542_399, "2100-02-28T23:59:59Z");
        assertEq(MonthMath.startOfMonth(1202), 4_107_542_400, "2100-03-01T00:00:00Z");
    }

    function test_civilRoundTrip() public pure {
        (uint256 y, uint256 m, uint256 d) = MonthMath.civilFromDays(1_793_923_200 / 86_400);
        assertEq(y, 2026);
        assertEq(m, 11);
        assertEq(d, 6);
        assertEq(MonthMath.daysFromCivil(1970, 1, 1), 0);
        assertEq(MonthMath.daysFromCivil(2026, 11, 6), 1_793_923_200 / 86_400);
    }

    /// @dev Every month from Jan 2000 to Dec 2199 against a naive days-in-month table.
    function test_allMonthsAgainstNaiveTable() public pure {
        uint256 start = 946_684_800; // 2000-01-01
        for (uint256 i = 0; i < 200 * 12; i++) {
            uint256 y = 2000 + i / 12;
            uint256 mo = i % 12 + 1;
            assertEq(MonthMath.startOfMonth(i), start);
            assertEq(MonthMath.monthIndex(start), i);
            if (i > 0) assertEq(MonthMath.monthIndex(start - 1), i - 1);
            start += _daysIn(y, mo) * 86_400;
            assertEq(MonthMath.endOfMonth(i), start - 1);
        }
    }

    function testFuzz_endOfMonthRoundTrip(uint256 m) public pure {
        m = bound(m, 0, 12 * 100_000); // up to year 102000
        uint256 e = MonthMath.endOfMonth(m);
        assertEq(MonthMath.monthIndex(e), m, "last second belongs to m");
        assertEq(MonthMath.monthIndex(e + 1), m + 1, "next second starts m + 1");
        assertEq(MonthMath.startOfMonth(m + 1), e + 1);
        (,, uint256 d) = MonthMath.civilFromDays((e + 1) / 86_400);
        assertEq(d, 1, "month starts on day 1");
        assertEq((e + 1) % 86_400, 0, "month starts at midnight UTC");
    }

    function testFuzz_timestampInsideItsMonth(uint256 t) public pure {
        t = bound(t, 946_684_800, type(uint40).max);
        uint256 m = MonthMath.monthIndex(t);
        assertLe(MonthMath.startOfMonth(m), t);
        assertLe(t, MonthMath.endOfMonth(m));
    }

    function _daysIn(uint256 y, uint256 m) internal pure returns (uint256) {
        if (m == 2) return (y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)) ? 29 : 28;
        if (m == 4 || m == 6 || m == 9 || m == 11) return 30;
        return 31;
    }
}
