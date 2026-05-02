// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AgentFactory} from "./AgentFactory.sol";

/// @title BountyEscrow
/// @notice On 0G Chain. Posters create bounties with native OG locked in escrow.
///         Agents (identified by their iNFT tokenId) bid via AXL off-chain,
///         the poster picks a winner on-chain, the winner delivers (writes result
///         CID), poster settles -> funds split between agent owner + creator royalty.
contract BountyEscrow is ReentrancyGuard {
    enum Status { Open, Assigned, Delivered, Settled, Cancelled }

    struct Bounty {
        address poster;
        uint256 amount;          // wei (OG)
        string  taskCID;         // 0G Storage CID describing the task
        string  resultCID;       // 0G Storage CID of the delivered result
        uint256 winnerTokenId;   // iNFT id of the winning agent
        uint64  deadline;
        Status  status;
    }

    AgentFactory public immutable factory;

    uint256 public nextBountyId = 1;
    mapping(uint256 => Bounty) public bounties;

    /// @notice Signed reputation attestations: bountyId => rating (1-5)
    mapping(uint256 => uint8) public ratings;

    event BountyPosted(
        uint256 indexed id,
        address indexed poster,
        uint256 amount,
        string taskCID,
        uint64 deadline
    );
    event BountyAssigned(uint256 indexed id, uint256 indexed tokenId);
    event BountyDelivered(uint256 indexed id, string resultCID);
    event BountySettled(
        uint256 indexed id,
        uint256 indexed tokenId,
        address agentOwner,
        uint256 ownerCut,
        address creator,
        uint256 royaltyCut,
        uint8 rating
    );
    event BountyCancelled(uint256 indexed id);

    error BadStatus();
    error NotPoster();
    error NotWinnerOwner();
    error PastDeadline();
    error BadRating();
    error ZeroAmount();

    constructor(address _factory) {
        factory = AgentFactory(_factory);
    }

    /// @notice Post a new bounty, locking native OG in escrow.
    function post(string calldata taskCID, uint64 deadline)
        external
        payable
        returns (uint256 id)
    {
        if (msg.value == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert PastDeadline();

        id = nextBountyId++;
        bounties[id] = Bounty({
            poster: msg.sender,
            amount: msg.value,
            taskCID: taskCID,
            resultCID: "",
            winnerTokenId: 0,
            deadline: deadline,
            status: Status.Open
        });
        emit BountyPosted(id, msg.sender, msg.value, taskCID, deadline);
    }

    /// @notice Poster picks a winning agent (after off-chain AXL negotiation).
    function assign(uint256 id, uint256 tokenId) external {
        Bounty storage b = bounties[id];
        if (b.status != Status.Open) revert BadStatus();
        if (msg.sender != b.poster) revert NotPoster();
        if (block.timestamp > b.deadline) revert PastDeadline();

        b.winnerTokenId = tokenId;
        b.status = Status.Assigned;
        emit BountyAssigned(id, tokenId);
    }

    /// @notice Winning agent's owner posts the result CID on 0G Storage.
    function deliver(uint256 id, string calldata resultCID) external {
        Bounty storage b = bounties[id];
        if (b.status != Status.Assigned) revert BadStatus();

        address agentOwner = factory.ownerOf(b.winnerTokenId);
        if (msg.sender != agentOwner) revert NotWinnerOwner();

        b.resultCID = resultCID;
        b.status = Status.Delivered;
        emit BountyDelivered(id, resultCID);
    }

    /// @notice Poster confirms delivery. Funds split, reputation written, brain memory bumped.
    function settle(uint256 id, uint8 rating, string calldata newBrainCID)
        external
        nonReentrant
    {
        Bounty storage b = bounties[id];
        if (b.status != Status.Delivered) revert BadStatus();
        if (msg.sender != b.poster) revert NotPoster();
        if (rating == 0 || rating > 5) revert BadRating();

        b.status = Status.Settled;
        ratings[id] = rating;

        (address creator, uint96 bps) = factory.royaltyInfoFor(b.winnerTokenId);
        address agentOwner = factory.ownerOf(b.winnerTokenId);

        uint256 royalty = (b.amount * bps) / 10_000;
        uint256 ownerCut = b.amount - royalty;

        // Update brain memory CID + job count via the factory hook.
        if (bytes(newBrainCID).length > 0) {
            factory.updateBrain(b.winnerTokenId, newBrainCID);
        }
        factory.recordJob(b.winnerTokenId);

        if (royalty > 0 && creator != address(0)) {
            (bool ok1, ) = creator.call{value: royalty}("");
            require(ok1, "royalty xfer");
        } else {
            // no royalty path -> all to owner
            ownerCut = b.amount;
        }
        (bool ok2, ) = agentOwner.call{value: ownerCut}("");
        require(ok2, "owner xfer");

        emit BountySettled(id, b.winnerTokenId, agentOwner, ownerCut, creator, royalty, rating);
    }

    /// @notice Poster reclaims funds if no one picks up the bounty before deadline.
    function cancel(uint256 id) external nonReentrant {
        Bounty storage b = bounties[id];
        if (b.status != Status.Open) revert BadStatus();
        if (msg.sender != b.poster) revert NotPoster();
        if (block.timestamp <= b.deadline) revert PastDeadline();

        b.status = Status.Cancelled;
        uint256 amt = b.amount;
        b.amount = 0;
        (bool ok, ) = b.poster.call{value: amt}("");
        require(ok, "refund");
        emit BountyCancelled(id);
    }

    function getBounty(uint256 id) external view returns (Bounty memory) {
        return bounties[id];
    }
}
