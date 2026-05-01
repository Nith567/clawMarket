/** Minimal ABIs for the four contracts the SDK touches. */

export const agentRegistrarAbi = [
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      {
        name: "meta",
        type: "tuple",
        components: [
          { name: "skills", type: "string" },
          { name: "pricePerCall", type: "uint256" },
          { name: "inftId", type: "uint256" },
          { name: "inftContract", type: "address" },
          { name: "model", type: "string" },
          { name: "brainCID", type: "string" },
          { name: "axlPeerId", type: "string" },
          { name: "axlEndpoint", type: "string" },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "updateText",
    stateMutability: "nonpayable",
    inputs: [
      { name: "label", type: "string" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isTaken",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const l2RegistryAbi = [
  {
    type: "function",
    name: "namehash",
    stateMutability: "pure",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "SubnodeCreated",
    inputs: [
      { name: "subnode", type: "bytes32", indexed: false },
      { name: "name", type: "bytes", indexed: false },
      { name: "owner", type: "address", indexed: false },
    ],
  },
] as const;

export const agentFactoryAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "modelId", type: "string" },
      { name: "brainCID", type: "string" },
      { name: "ensLabel", type: "string" },
      { name: "royaltyBps", type: "uint96" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getBrain",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "modelId", type: "string" },
          { name: "brainCID", type: "string" },
          { name: "ensLabel", type: "string" },
          { name: "royaltyBps", type: "uint96" },
          { name: "creator", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "jobsCompleted", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "event",
    name: "AgentMinted",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "ensLabel", type: "string", indexed: false },
      { name: "modelId", type: "string", indexed: false },
      { name: "brainCID", type: "string", indexed: false },
    ],
  },
] as const;

export const bountyEscrowAbi = [
  {
    type: "function",
    name: "post",
    stateMutability: "payable",
    inputs: [
      { name: "taskCID", type: "string" },
      { name: "deadline", type: "uint64" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "assign",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deliver",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "resultCID", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "rating", type: "uint8" },
      { name: "newBrainCID", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getBounty",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "poster", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "taskCID", type: "string" },
          { name: "resultCID", type: "string" },
          { name: "winnerTokenId", type: "uint256" },
          { name: "deadline", type: "uint64" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "BountyPosted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "poster", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "taskCID", type: "string", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BountySettled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "agentOwner", type: "address", indexed: false },
      { name: "ownerCut", type: "uint256", indexed: false },
      { name: "creator", type: "address", indexed: false },
      { name: "royaltyCut", type: "uint256", indexed: false },
      { name: "rating", type: "uint8", indexed: false },
    ],
  },
] as const;
