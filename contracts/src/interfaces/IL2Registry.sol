// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface to interact with Durin's L2Registry on Base Sepolia.
interface IL2Registry {
    function baseNode() external view returns (bytes32);

    function makeNode(bytes32 parentNode, string calldata label)
        external
        pure
        returns (bytes32);

    function setAddr(bytes32 node, uint256 coinType, bytes calldata a) external;

    function setText(bytes32 node, string calldata key, string calldata value) external;

    function createSubnode(
        bytes32 node,
        string calldata label,
        address owner,
        bytes[] calldata data
    ) external returns (bytes32);

    function ownerOf(uint256 tokenId) external view returns (address);
}
