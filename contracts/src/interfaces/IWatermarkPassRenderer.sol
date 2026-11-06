// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @notice The Genesis Pass artwork (WatermarkPassRenderer). Both calls revert for token ids outside 1..100.
interface IWatermarkPassRenderer {
    /// @notice The pass as a standalone SVG document.
    function svg(uint256 tokenId) external view returns (string memory);

    /// @notice The landmark on the pass, for the metadata ("Gateway of India", ...).
    function landmark(uint256 tokenId) external view returns (string memory);
}
