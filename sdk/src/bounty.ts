import type { Address, Hex } from "viem";
import { decodeEventLog, parseAbiItem } from "viem";
import { ADDRESSES } from "./config.js";
import { bountyEscrowAbi } from "./abi.js";
import { publicClients, walletClients, ogTestnet } from "./clients.js";

export interface PostInput {
  /** 0G Storage CID describing the task spec. */
  taskCID: string;
  /** Native OG (wei) locked in escrow as payment. */
  amountWei: bigint;
  /** Unix seconds. */
  deadline: number;
}

export interface BountyView {
  id: bigint;
  poster: Address;
  amount: bigint;
  taskCID: string;
  resultCID: string;
  winnerTokenId: bigint;
  deadline: bigint;
  status: "Open" | "Assigned" | "Delivered" | "Settled" | "Cancelled";
}

const STATUS = ["Open", "Assigned", "Delivered", "Settled", "Cancelled"] as const;

/** Post a bounty on 0G Chain. Returns the bounty id. */
export async function postBounty(privateKey: Hex, input: PostInput): Promise<bigint> {
  const wc = walletClients(privateKey);
  const pc = publicClients();
  const tx = await wc.og.writeContract({
    address: ADDRESSES.bountyEscrow as Address,
    abi: bountyEscrowAbi,
    chain: ogTestnet,
    account: wc.account,
    functionName: "post",
    args: [input.taskCID, BigInt(input.deadline)],
    value: input.amountWei,
  });
  const r = await pc.og.waitForTransactionReceipt({ hash: tx });
  for (const log of r.logs) {
    try {
      const ev = decodeEventLog({ abi: bountyEscrowAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "BountyPosted") return ev.args.id as bigint;
    } catch {}
  }
  throw new Error("BountyPosted event not found");
}

export async function assignBounty(privateKey: Hex, id: bigint, tokenId: bigint) {
  const wc = walletClients(privateKey);
  return wc.og.writeContract({
    address: ADDRESSES.bountyEscrow as Address,
    abi: bountyEscrowAbi,
    chain: ogTestnet,
    account: wc.account,
    functionName: "assign",
    args: [id, tokenId],
  });
}

export async function deliverBounty(privateKey: Hex, id: bigint, resultCID: string) {
  const wc = walletClients(privateKey);
  return wc.og.writeContract({
    address: ADDRESSES.bountyEscrow as Address,
    abi: bountyEscrowAbi,
    chain: ogTestnet,
    account: wc.account,
    functionName: "deliver",
    args: [id, resultCID],
  });
}

export async function settleBounty(
  privateKey: Hex,
  id: bigint,
  rating: number,
  newBrainCID: string,
) {
  if (rating < 1 || rating > 5) throw new Error("rating must be 1..5");
  const wc = walletClients(privateKey);
  return wc.og.writeContract({
    address: ADDRESSES.bountyEscrow as Address,
    abi: bountyEscrowAbi,
    chain: ogTestnet,
    account: wc.account,
    functionName: "settle",
    args: [id, rating, newBrainCID],
  });
}

export async function getBounty(id: bigint): Promise<BountyView> {
  const { og } = publicClients();
  const r = (await og.readContract({
    address: ADDRESSES.bountyEscrow as Address,
    abi: bountyEscrowAbi,
    functionName: "getBounty",
    args: [id],
  })) as {
    poster: Address;
    amount: bigint;
    taskCID: string;
    resultCID: string;
    winnerTokenId: bigint;
    deadline: bigint;
    status: number;
  };
  return { id, ...r, status: STATUS[r.status] };
}

/**
 * Watch for new bounties. Returns an `unwatch` fn.
 * Each agent subscribes to this so they can decide whether to bid.
 */
export function watchBounties(
  onPost: (b: { id: bigint; poster: Address; amount: bigint; taskCID: string; deadline: bigint }) => void,
) {
  const { og } = publicClients();
  return og.watchEvent({
    address: ADDRESSES.bountyEscrow as Address,
    event: parseAbiItem(
      "event BountyPosted(uint256 indexed id, address indexed poster, uint256 amount, string taskCID, uint64 deadline)",
    ),
    onLogs: (logs) => {
      for (const l of logs) {
        if (l.args.id !== undefined) {
          onPost({
            id: l.args.id as bigint,
            poster: l.args.poster as Address,
            amount: l.args.amount as bigint,
            taskCID: l.args.taskCID as string,
            deadline: l.args.deadline as bigint,
          });
        }
      }
    },
  });
}
