// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IL2Registry} from "./interfaces/IL2Registry.sol";

/// @title AgentRegistrar
/// @notice Registers `<label>.clawmarket.eth` subnames on Base Sepolia (Durin L2Registry)
///         and atomically seeds them with the agent's full metadata as ENS text records.
///         This is the on-chain identity card for an agent in the ClawMarket bounty network.
///
/// @dev    Text record schema (read by other agents during discovery):
///           - `agent.skills`         JSON array of capability tags
///           - `agent.price`          per-call price in wei (OG)
///           - `agent.inft.id`        iNFT tokenId on 0G Chain
///           - `agent.inft.contract`  AgentFactory address on 0G Chain
///           - `og.compute.model`     sealed model id (qwen3.6-plus, GLM-5-FP8...)
///           - `og.storage.memory`    0G Storage root CID for persistent memory
///           - `axl.peerid`           AXL public key for P2P negotiation
///           - `axl.endpoint`         A2A capability descriptor
contract AgentRegistrar {
    IL2Registry public immutable registry;
    uint256 public immutable coinType;
    uint256 public immutable chainIdSelf;

    struct AgentMetadata {
        string skills;          // JSON: ["translate","summarize"]
        uint256 pricePerCall;   // wei
        uint256 inftId;         // 0G Chain iNFT tokenId
        address inftContract;   // 0G Chain AgentFactory
        string model;           // 0G Compute sealed model id
        string brainCID;        // 0G Storage root CID
        string axlPeerId;       // AXL hex public key
        string axlEndpoint;     // optional A2A descriptor
    }

    event AgentRegistered(
        string indexed label,
        address indexed owner,
        uint256 inftId,
        bytes32 node
    );

    error LabelTooShort();
    error LabelTaken();

    constructor(address _registry) {
        registry = IL2Registry(_registry);
        uint256 cid;
        assembly { cid := chainid() }
        chainIdSelf = cid;
        coinType = (0x80000000 | cid);
    }

    /// @notice Register a subname and write all agent text records atomically.
    function registerAgent(
        string calldata label,
        address owner,
        AgentMetadata calldata meta
    ) external returns (bytes32 node) {
        if (bytes(label).length < 3) revert LabelTooShort();

        bytes32 baseNode = registry.baseNode();
        node = registry.makeNode(baseNode, label);

        // Build the text-record payload that runs in createSubnode's multicall.
        bytes[] memory data = new bytes[](10);
        data[0] = abi.encodeCall(
            IL2Registry.setAddr,
            (node, coinType, abi.encodePacked(owner))
        );
        data[1] = abi.encodeCall(
            IL2Registry.setAddr,
            (node, 60, abi.encodePacked(owner)) // mainnet ETH coinType for easy resolution
        );
        data[2] = abi.encodeCall(IL2Registry.setText, (node, "agent.skills", meta.skills));
        data[3] = abi.encodeCall(
            IL2Registry.setText,
            (node, "agent.price", _toString(meta.pricePerCall))
        );
        data[4] = abi.encodeCall(
            IL2Registry.setText,
            (node, "agent.inft.id", _toString(meta.inftId))
        );
        data[5] = abi.encodeCall(
            IL2Registry.setText,
            (node, "agent.inft.contract", _toHexString(meta.inftContract))
        );
        data[6] = abi.encodeCall(IL2Registry.setText, (node, "og.compute.model", meta.model));
        data[7] = abi.encodeCall(IL2Registry.setText, (node, "og.storage.memory", meta.brainCID));
        data[8] = abi.encodeCall(IL2Registry.setText, (node, "axl.peerid", meta.axlPeerId));
        data[9] = abi.encodeCall(IL2Registry.setText, (node, "axl.endpoint", meta.axlEndpoint));

        registry.createSubnode(baseNode, label, owner, data);

        emit AgentRegistered(label, owner, meta.inftId, node);
    }

    /// @notice Update a single text record on an already-registered agent (e.g. memory CID after a job).
    /// @dev    Caller must be the subname owner (enforced by L2Registry.setText auth).
    function updateText(
        string calldata label,
        string calldata key,
        string calldata value
    ) external {
        bytes32 node = registry.makeNode(registry.baseNode(), label);
        registry.setText(node, key, value);
    }

    /// @notice Check if a label is taken.
    function isTaken(string calldata label) external view returns (bool) {
        bytes32 node = registry.makeNode(registry.baseNode(), label);
        try registry.ownerOf(uint256(node)) returns (address o) {
            return o != address(0);
        } catch {
            return false;
        }
    }

    // ---------------------------------------------------------------
    // formatting helpers
    // ---------------------------------------------------------------

    function _toString(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 d;
        while (t != 0) { d++; t /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) { d--; b[d] = bytes1(uint8(48 + (v % 10))); v /= 10; }
        return string(b);
    }

    function _toHexString(address a) private pure returns (string memory) {
        bytes memory s = new bytes(42);
        s[0] = "0"; s[1] = "x";
        bytes20 v = bytes20(a);
        for (uint256 i = 0; i < 20; i++) {
            uint8 hi = uint8(v[i]) >> 4;
            uint8 lo = uint8(v[i]) & 0x0f;
            s[2 + i * 2] = _hex(hi);
            s[3 + i * 2] = _hex(lo);
        }
        return string(s);
    }

    function _hex(uint8 n) private pure returns (bytes1) {
        return n < 10 ? bytes1(uint8(48 + n)) : bytes1(uint8(87 + n));
    }
}
