// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentFactory (ERC-7857 inspired iNFT)
/// @notice Mints agents as iNFTs on 0G Chain. Each token wraps an encrypted brain
///         (model + memory) stored on 0G Storage. The token's owner controls the agent
///         and earns royalties when the agent fulfills bounties (via BountyEscrow).
///
/// @dev    Linked to its ENS subname on Base Sepolia via `ensLabel` — read together they
///         form the agent's portable identity across chains.
contract AgentFactory is ERC721, Ownable {
    struct Brain {
        string modelId;        // 0G Compute sealed model id
        string brainCID;       // 0G Storage root for memory + system prompt (encrypted)
        string ensLabel;       // <label>.clawmarket.eth on Base Sepolia
        uint96  royaltyBps;    // owner royalty share on bounty payouts (e.g. 500 = 5%)
        address creator;       // immutable creator (for royalty stickiness)
        uint64  createdAt;
        uint64  jobsCompleted; // updated by BountyEscrow on settle
    }

    uint256 public nextId = 1;
    mapping(uint256 => Brain) public brains;

    /// @notice Trusted updater (set to BountyEscrow) — can bump jobsCompleted + brainCID.
    address public bountyEscrow;

    event AgentMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string ensLabel,
        string modelId,
        string brainCID
    );
    event BrainUpdated(uint256 indexed tokenId, string newBrainCID);
    event JobRecorded(uint256 indexed tokenId, uint256 totalJobs);
    event EscrowSet(address escrow);

    error NotOwnerOrApproved();
    error NotEscrow();

    constructor(address admin) ERC721("ClawMarket Agent", "AGENT") Ownable(admin) {}

    function setBountyEscrow(address escrow) external onlyOwner {
        bountyEscrow = escrow;
        emit EscrowSet(escrow);
    }

    /// @notice Mint a new agent iNFT.
    function mint(
        address to,
        string calldata modelId,
        string calldata brainCID,
        string calldata ensLabel,
        uint96 royaltyBps
    ) external returns (uint256 tokenId) {
        require(royaltyBps <= 10_000, "royalty>100%");
        tokenId = nextId++;
        brains[tokenId] = Brain({
            modelId: modelId,
            brainCID: brainCID,
            ensLabel: ensLabel,
            royaltyBps: royaltyBps,
            creator: to,
            createdAt: uint64(block.timestamp),
            jobsCompleted: 0
        });
        _safeMint(to, tokenId);
        emit AgentMinted(tokenId, to, ensLabel, modelId, brainCID);
    }

    /// @notice Update the agent's brain CID (memory persistence after a job).
    /// @dev    Callable by token owner OR the trusted BountyEscrow.
    function updateBrain(uint256 tokenId, string calldata newCID) external {
        if (msg.sender != bountyEscrow && !_isAuthorized(_ownerOf(tokenId), msg.sender, tokenId)) {
            revert NotOwnerOrApproved();
        }
        brains[tokenId].brainCID = newCID;
        emit BrainUpdated(tokenId, newCID);
    }

    /// @notice Called by BountyEscrow when an agent finishes a paid job.
    function recordJob(uint256 tokenId) external {
        if (msg.sender != bountyEscrow) revert NotEscrow();
        Brain storage b = brains[tokenId];
        b.jobsCompleted += 1;
        emit JobRecorded(tokenId, b.jobsCompleted);
    }

    function getBrain(uint256 tokenId) external view returns (Brain memory) {
        return brains[tokenId];
    }

    function royaltyInfoFor(uint256 tokenId)
        external
        view
        returns (address creator, uint96 bps)
    {
        Brain memory b = brains[tokenId];
        return (b.creator, b.royaltyBps);
    }
}
