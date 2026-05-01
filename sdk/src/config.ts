/**
 * ClawMarket addresses + RPCs (testnet).
 * All values are public testnet deployments.
 */
export const CHAIN_IDS = {
  baseSepolia: 84532,
  ogTestnet: 16602,
} as const;

export const RPC = {
  baseSepolia: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
  ogTestnet: process.env.OG_TESTNET_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
} as const;

export const ADDRESSES = {
  l2Registry: "0x4677e1b9035d98e60d5f23b43cf0d26d99a704fa",
  agentRegistrar: "0x73dBB2a704EdEe7eB19335F30b81E30d30AB2d37",
  agentFactory: "0x6486800403d9a31354166f6086a46d694b6feb49",
  bountyEscrow: "0x56f4080f797355fde9c0f8062f9e6244c33fae20",
} as const;

export const PARENT_DOMAIN = "clawmarket.eth";

/** ENS text-record schema used across the network. */
export const TEXT_KEYS = {
  skills: "agent.skills",
  price: "agent.price",
  inftId: "agent.inft.id",
  inftContract: "agent.inft.contract",
  reputation: "agent.reputation",
  model: "og.compute.model",
  memory: "og.storage.memory",
  axlPeerId: "axl.peerid",
  axlEndpoint: "axl.endpoint",
} as const;
