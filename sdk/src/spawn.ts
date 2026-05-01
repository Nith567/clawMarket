import type { Address, Hex } from "viem";
import { decodeEventLog } from "viem";
import { ADDRESSES, PARENT_DOMAIN } from "./config.js";
import { agentFactoryAbi, agentRegistrarAbi } from "./abi.js";
import { baseSepolia } from "viem/chains";
import { publicClients, walletClients, ogTestnet } from "./clients.js";

export interface SpawnInput {
  /** Subdomain label, e.g. "translator" -> translator.clawmarket.eth */
  label: string;
  /** Sealed model id available on 0G Compute. */
  model: string;
  /** 0G Storage root CID where this agent's brain (system prompt + memory) lives. */
  brainCID: string;
  /** AXL public key (hex) — how peers will reach this agent. */
  axlPeerId: string;
  /** Optional A2A endpoint descriptor. */
  axlEndpoint?: string;
  /** Skill tags JSON, e.g. '["translate","summarize"]'. */
  skills: string;
  /** Per-call price in wei (OG). */
  pricePerCall: bigint;
  /** Royalty bps for the creator (0..10_000). 500 = 5%. */
  royaltyBps?: number;
}

export interface SpawnResult {
  fqdn: string;            // gardener.clawmarket.eth
  inftId: bigint;          // 0G Chain iNFT tokenId
  factoryTx: Hex;
  registrarTx: Hex;
  ensNode: Hex;
}

/**
 * Spawn an agent end-to-end:
 *   1. mint iNFT on 0G Chain (AgentFactory)
 *   2. register subname on Base Sepolia (AgentRegistrar) with all text records
 *
 * Both txs must succeed; on failure of step 2 the iNFT exists but is unregistered
 * (the owner can retry by calling registerOnly()).
 */
export async function spawn(privateKey: Hex, input: SpawnInput): Promise<SpawnResult> {
  const wc = walletClients(privateKey);
  const pc = publicClients();
  const owner = wc.account.address as Address;
  const royaltyBps = input.royaltyBps ?? 500;

  // 1) mint iNFT on 0G
  const factoryTx = await wc.og.writeContract({
    address: ADDRESSES.agentFactory as Address,
    abi: agentFactoryAbi,
    chain: ogTestnet,
    account: wc.account,
    functionName: "mint",
    args: [
      owner,
      input.model,
      input.brainCID,
      `${input.label}.${PARENT_DOMAIN}`,
      BigInt(royaltyBps),
    ],
  });
  const factoryReceipt = await pc.og.waitForTransactionReceipt({
    hash: factoryTx,
    timeout: 180_000, // 3 min for 0G testnet
    pollingInterval: 3000,
    retryCount: 50,
  });
  let inftId: bigint | undefined;
  for (const log of factoryReceipt.logs) {
    try {
      const ev = decodeEventLog({
        abi: agentFactoryAbi,
        data: log.data,
        topics: log.topics,
      });
      if (ev.eventName === "AgentMinted") {
        inftId = ev.args.tokenId as bigint;
        break;
      }
    } catch {}
  }
  if (inftId === undefined) throw new Error("AgentMinted event not found");

  // 2) register subname on Base Sepolia
  const registrarTx = await wc.base.writeContract({
    address: ADDRESSES.agentRegistrar as Address,
    abi: agentRegistrarAbi,
    chain: baseSepolia,
    account: wc.account,
    functionName: "registerAgent",
    args: [
      input.label,
      owner,
      {
        skills: input.skills,
        pricePerCall: input.pricePerCall,
        inftId,
        inftContract: ADDRESSES.agentFactory as Address,
        model: input.model,
        brainCID: input.brainCID,
        axlPeerId: input.axlPeerId,
        axlEndpoint: input.axlEndpoint ?? "",
      },
    ],
  });
  const regReceipt = await pc.base.waitForTransactionReceipt({
    hash: registrarTx,
    timeout: 120_000, // 2 min for Base Sepolia
    pollingInterval: 2000,
  });

  // pull the AgentRegistered node from logs (last topic-less event w/ data)
  let ensNode: Hex = "0x0";
  for (const log of regReceipt.logs) {
    if (log.address.toLowerCase() === ADDRESSES.agentRegistrar.toLowerCase()) {
      // 4th topic of AgentRegistered isn't packed; node is in data — we just compute it offline.
    }
  }
  // namehash via the registry view as ground truth
  ensNode = (await pc.base.readContract({
    address: ADDRESSES.l2Registry as Address,
    abi: [
      {
        type: "function",
        name: "namehash",
        stateMutability: "pure",
        inputs: [{ name: "name", type: "string" }],
        outputs: [{ type: "bytes32" }],
      },
    ] as const,
    functionName: "namehash",
    args: [`${input.label}.${PARENT_DOMAIN}`],
  })) as Hex;

  return {
    fqdn: `${input.label}.${PARENT_DOMAIN}`,
    inftId,
    factoryTx,
    registrarTx,
    ensNode,
  };
}
