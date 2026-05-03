import {
  postBounty,
  assignBounty,
  settleBounty,
  resolve,
  appendLog,
  putKV,
  getBounty,
} from "@clawmarket/sdk";

const OG_EXPLORER = "https://chainscan-galileo.0g.ai/tx/";
const BASE_EXPLORER = "https://sepolia.basescan.org/tx/";
function ogTx(hash: string): string { return `${OG_EXPLORER}${hash}`; }
function baseTx(hash: string): string { return `${BASE_EXPLORER}${hash}`; }
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AxlClient } from "./axl.js";
import type { BidMessage, AcceptMessage } from "./types.js";

export interface PosterConfig {
  privateKey: Hex;
  axlPeerId: string;
  axlUrl: string;
  /** How long to wait for bids (ms) before picking a winner. */
  bidWindowMs?: number;
}

/**
 * Posts a bounty, runs an AXL bid auction, picks the cheapest qualified bidder,
 * settles after delivery.
 */
export class Poster {
  private axl: AxlClient;

  constructor(public cfg: PosterConfig) {
    this.axl = new AxlClient({ url: cfg.axlUrl, peerId: cfg.axlPeerId });
  }

  /** Run the full lifecycle: post -> auction -> assign -> wait deliver -> settle. */
  async runJob(input: {
    prompt: string;
    requiredSkill: string;
    amountWei: bigint;
    deadlineSec?: number;
  }): Promise<{ bountyId: bigint; winner: string; resultCID: string }> {
    const deadline = Math.floor(Date.now() / 1000) + (input.deadlineSec ?? 600);

    // 1) Stash task spec on 0G Storage (Log "tasks") -> CID
    const taskCID = await appendLog(
      "tasks",
      { prompt: input.prompt, requiredSkill: input.requiredSkill },
      { privateKey: this.cfg.privateKey },
    );

    // 2) Open the bid subscription FIRST — agents may bid the instant the chain
    //    event lands and we'd lose those bids if we subscribed after postBounty.
    const bids: BidMessage[] = [];
    let knownBountyId: string | null = null;
    const unsub = this.axl.subscribe(
      (ch) => ch.startsWith("bounty:"),
      (env) => {
        const e = env.payload as BidMessage;
        if (e?.type !== "BID") return;
        if (knownBountyId && e.bountyId !== knownBountyId) return;
        bids.push(e);
        this.log("BID recv", { from: e.agentLabel, price: e.priceWei, eta: e.etaSec });
        // Cache task spec for the bidder so it can fetch it post-accept
        putKV(`agent:${e.agentLabel}`, `task:${knownBountyId ?? e.bountyId}`, taskCID, { privateKey: this.cfg.privateKey }).catch(() => {});
      },
    );

    // 3) Post on-chain
    this.log("posting bounty", { reward: input.amountWei.toString(), skill: input.requiredSkill });
    const bountyId = await postBounty(this.cfg.privateKey, {
      taskCID,
      amountWei: input.amountWei,
      deadline,
    });
    knownBountyId = bountyId.toString();
    this.log("BountyPosted", { id: knownBountyId });

    const myAddr = privateKeyToAccount(this.cfg.privateKey).address.toLowerCase();
    const channel = `bounty:${bountyId}`;

    // Drop any pre-postBounty stragglers that don't match
    for (let i = bids.length - 1; i >= 0; i--) {
      if (bids[i].bountyId !== knownBountyId) bids.splice(i, 1);
    }

    // 4) Wait for the bid window
    await new Promise((r) => setTimeout(r, this.cfg.bidWindowMs ?? 5_000));
    unsub();

    if (bids.length === 0) throw new Error("no bids received");

    // 4) Pick cheapest qualified bidder; resolve their iNFT id from ENS for cross-check
    bids.sort((a, b) => Number(BigInt(a.priceWei) - BigInt(b.priceWei)));
    const winner = bids[0];
    const profile = await resolve(winner.agentLabel);
    if (!profile) throw new Error("winner ENS profile missing");

    this.log("WINNER", { label: winner.agentLabel, inft: winner.agentInftId });

    // 5) Assign on-chain
    const assignTx = await assignBounty(this.cfg.privateKey, bountyId, BigInt(winner.agentInftId));
    this.log("assign() tx", { url: ogTx(assignTx) });

    // 6) Tell winner over AXL
    const accept: AcceptMessage = {
      type: "ACCEPT",
      bountyId: bountyId.toString(),
      winnerLabel: winner.agentLabel,
    };
    // Send ACCEPT across the AXL mesh to the winner's own node.
    if (!profile.axlPeerId) throw new Error("winner has no axl.peerid in ENS");
    await this.axl.send(profile.axlPeerId, channel, accept);

    // 7) Wait for delivery on-chain (poll up to 4 min — 0G Storage uploads
    //    can each take 20-40s, and the agent does several before delivery).
    let resultCID = "";
    for (let i = 0; i < 240; i++) {
      const view = await getBounty(bountyId);
      if (view.status === "Delivered") {
        resultCID = view.resultCID;
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!resultCID) throw new Error("delivery timeout");
    this.log("DELIVERED", { resultCID });

    // 8) Settle (rates 5★, no brain bump on poster side)
    const settleTx = await settleBounty(this.cfg.privateKey, bountyId, 5, "");
    this.log("SETTLED ✅", { bountyId: bountyId.toString(), url: ogTx(settleTx) });

    return { bountyId, winner: winner.agentLabel, resultCID };
  }

  private log(msg: string, extra?: Record<string, unknown>) {
    const ts = new Date().toISOString().slice(11, 19);
    if (extra) console.log(`[${ts}] poster`, msg, extra);
    else console.log(`[${ts}] poster`, msg);
  }
}
