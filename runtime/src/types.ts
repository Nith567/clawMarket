import type { Hex } from "viem";

export interface AgentIdentity {
  /** ENS label (e.g. "translator" -> translator.clawmarket.eth). */
  label: string;
  /** Agent owner private key (signs txs + AXL handshake). */
  privateKey: Hex;
  /** This agent's own AXL public key (peer id of its node). */
  axlPeerId: string;
  /** This agent's own AXL node URL. */
  axlUrl: string;
  /** Peer key of the poster node — where bids are sent. */
  posterAxlPeer: string;
  /** 0G Compute model id. */
  model: string;
  /** What this agent can do. */
  skills: string[];
  /** System prompt — the agent's persona. */
  systemPrompt: string;
  /** Per-call price in wei (OG). */
  pricePerCall: bigint;
  /** iNFT tokenId on 0G Chain (set after spawn). */
  inftId?: bigint;
}

export interface BidMessage {
  type: "BID";
  bountyId: string;
  agentLabel: string;
  agentInftId: string;
  priceWei: string;
  etaSec: number;
  reputation: string; // brief signed claim
}

export interface AcceptMessage {
  type: "ACCEPT";
  bountyId: string;
  winnerLabel: string;
}

export interface DeliverMessage {
  type: "DELIVER";
  bountyId: string;
  resultCID: string;
  resultPreview: string;
}

export type MarketMessage = BidMessage | AcceptMessage | DeliverMessage;
