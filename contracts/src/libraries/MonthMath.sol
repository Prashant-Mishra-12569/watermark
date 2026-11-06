// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice Month index maths for Watermark (interfaces F1): month = (YYYY - 2000) * 12 + (MM - 1), in UTC.
/// Nov 2026 = 322. Civil-date conversion is Howard Hinnant's days_from_civil / civil_from_days
/// (http://howardhinnant.github.io/date_algorithms.html), restricted to dates on or after 1970-01-01 so every
/// intermediate value is non-negative and unsigned arithmetic is exact.
library MonthMath {
    /// @dev 2000-01-01T00:00:00Z. Month index 0 starts here.
    uint256 internal constant EPOCH_2000 = 946_684_800;

    error BeforeYear2000(uint256 timestamp);
    error MonthTooLarge(uint256 month);

    /// @notice Month index of a unix timestamp (UTC). Reverts before 2000-01-01.
    function monthIndex(uint256 timestamp) internal pure returns (uint256) {
        if (timestamp < EPOCH_2000) revert BeforeYear2000(timestamp);
        (uint256 y, uint256 m,) = civilFromDays(timestamp / 86_400);
        return (y - 2000) * 12 + (m - 1);
    }

    /// @notice Unix timestamp of the first second of month index `month` (UTC).
    function startOfMonth(uint256 month) internal pure returns (uint256) {
        return daysFromCivil(2000 + month / 12, (month % 12) + 1, 1) * 86_400;
    }

    /// @notice Unix timestamp of the last second of month index `month` (UTC): start of month + 1, minus 1.
    function endOfMonth(uint256 month) internal pure returns (uint256) {
        return startOfMonth(month + 1) - 1;
    }

    /// @notice endOfMonth as a uint64 (stamp expiry type). Reverts if it does not fit.
    function endOfMonth64(uint256 month) internal pure returns (uint64) {
        uint256 e = endOfMonth(month);
        if (e > type(uint64).max) revert MonthTooLarge(month);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint64(e); // checked above
    }

    // The two conversions below divide before multiplying on purpose (integer floor division is the algorithm).
    // forge-lint: disable-next-item(divide-before-multiply)
    /// @notice Days since 1970-01-01 for a proleptic Gregorian date. Requires y >= 1970, 1 <= m <= 12, 1 <= d <= 31.
    function daysFromCivil(uint256 y, uint256 m, uint256 d) internal pure returns (uint256) {
        if (m <= 2) y -= 1;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400; // [0, 399]
        uint256 doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1; // [0, 365]
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // [0, 146096]
        return era * 146_097 + doe - 719_468;
    }

    // forge-lint: disable-next-item(divide-before-multiply)
    /// @notice Proleptic Gregorian (year, month 1-12, day 1-31) for a count of days since 1970-01-01.
    function civilFromDays(uint256 z) internal pure returns (uint256 y, uint256 m, uint256 d) {
        z += 719_468;
        uint256 era = z / 146_097;
        uint256 doe = z - era * 146_097; // [0, 146096]
        uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
        y = yoe + era * 400;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
        uint256 mp = (5 * doy + 2) / 153; // [0, 11]
        d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
        m = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
        if (m <= 2) y += 1;
    }
}
