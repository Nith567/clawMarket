import {
  appendLog,
  putKV,
  getKV,
  pinMemoryToENS,
  infer,
  watchBounties,
  deliverBounty,
  readLog,
  PARENT_DOMAIN,
} from "@clawmarket/sdk";
import { AxlClient } from "./axl.js";
import type { AgentIdentity, BidMessage, MarketMessage } from "./types.js";

/**
 * One ClawMarket agent process. Runs forever:
 *   1. listens for `BountyPosted` events on 0G Chain
 *   2. if the task matches its skills -> resolves poster's ENS, opens AXL channel,
 *      sends a structured `BID` envelope
 *   3. if accepted -> runs 0G Compute inference, writes result to 0G Storage,
 *      delivers via AXL + on-chain `deliver()`
 *   4. on `BountySettled` -> updates its memory (KV + Log) + ENS pointer
 */
export class ClawAgent {
  private axl: AxlClient;
  private unwatch?: () => void;
  private unsubBids?: () => void;

  constructor(public id: AgentIdentity) {
    this.axl = new AxlClient({ url: id.axlUrl, peerId: id.axlPeerId });
  }

  // ------------------------------------------------------------- public

  start(): void {
    this.log("starting agent loop", { skills: this.id.skills, peer: this.id.axlPeerId });

    // 1. event watcher (chain) -> bid decision
    this.unwatch = watchBounties(async (b) => {
      try {
        await this.onBountyPosted({
          id: b.id,
          poster: b.poster,
          amount: b.amount,
          taskCID: b.taskCID,
          deadline: b.deadline,
        });
      } catch (e) {
        this.log("bounty handler error", { err: String(e) });
      }
    });

    // 2. AXL inbox for ACCEPT messages from posters (filter by label channel)
    const myChannel = `agent:${this.id.label}`;
    this.unsubBids = this.axl.subscribe(
      (ch) => ch.startsWith("bounty:") || ch === myChannel,
      (env) => {
        const e = env.payload as MarketMessage;
        if (e?.type === "ACCEPT") {
          this.onAccept(e, env.from).catch((err) => this.log("accept err", { err: String(err) }));
        }
      },
    );
  }

  stop(): void {
    this.unwatch?.();
    this.unsubBids?.();
  }

  // ------------------------------------------------------------- private

  private async onBountyPosted(b: {
    id: bigint;
    poster: `0x${string}`;
    amount: bigint;
    taskCID: string;
    deadline: bigint;
  }) {
    // fetch task spec from 0G Storage (taskCID)
    const taskSpec = await this.fetchTaskSpec(b.taskCID);
    if (!this.canHandle(taskSpec.requiredSkill)) {
      this.log("skip — skill mismatch", { id: b.id.toString(), need: taskSpec.requiredSkill });
      return;
    }
    if (b.amount < this.id.pricePerCall) {
      this.log("skip — under price", { id: b.id.toString() });
      return;
    }

    // Open AXL channel to the poster's agent (they're listening on `poster:<addr>`).
    const channel = `bounty:${b.id}`;
    const bid: BidMessage = {
      type: "BID",
      bountyId: b.id.toString(),
      agentLabel: this.id.label,
      agentInftId: (this.id.inftId ?? 0n).toString(),
      priceWei: this.id.pricePerCall.toString(),
      etaSec: 30,
      reputation: "fresh", // a real impl would attach a signed attestation
    };
    // Send across the AXL mesh to the poster's separate node.
    await this.axl.send(this.id.posterAxlPeer, channel, bid);
    this.log("BID sent", { id: b.id.toString(), to: b.poster });

    // Bid log is non-critical history — fire and forget so it doesn't block
    // the next on-chain action behind a slow 0G Storage upload.
    void appendLog(`agent:${this.id.label}:bids`, { bountyId: b.id.toString(), bid }, { privateKey: this.id.privateKey })
      .catch((e) => this.log("bid log upload failed", { err: String(e).slice(0, 80) }));
  }

  private async onAccept(env: MarketMessage, fromPeer: string) {
    if (env.type !== "ACCEPT") return;
    if (env.winnerLabel !== this.id.label) return;
    this.log("ACCEPT received — running inference", { id: env.bountyId });

    // Fetch task spec again to drive the LLM
    const taskCID = await getKV(`agent:${this.id.label}`, `task:${env.bountyId}`);
    const spec = taskCID ? await this.fetchTaskSpec(taskCID) : { prompt: "(missing task spec)", requiredSkill: "" };

    const result = await infer(
      {
        model: this.id.model,
        messages: [
          { role: "system", content: this.id.systemPrompt },
          { role: "user", content: spec.prompt },
        ],
      },
      { privateKey: this.id.privateKey },
    );

    // ----- ALL ETHERS-SIGNED 0G STORAGE WRITES FIRST -----
    // (avoids racing the wallet's nonce with viem-signed contract calls below)

    // 1. Persist result to 0G Storage Log
    const resultCID = await appendLog(
      `agent:${this.id.label}:results`,
      { bountyId: env.bountyId, output: result.text, attestation: result.attestation },
      { privateKey: this.id.privateKey },
    );

    // 2. Update memory KV with last-job context (also via 0G Storage)
    const newRoot = await putKV(
      `agent:${this.id.label}`,
      "lastJob",
      JSON.stringify({ bountyId: env.bountyId, resultCID, ts: Date.now() }),
      { privateKey: this.id.privateKey },
    );

    // ----- NOW VIEM-SIGNED CONTRACT CALLS -----

    // 3. Deliver on-chain (0G Chain via viem)
    const txHash = await deliverBounty(this.id.privateKey, BigInt(env.bountyId), resultCID);
    this.log("DELIVERED", {
      id: env.bountyId,
      cid: resultCID,
      tx: `https://chainscan-galileo.0g.ai/tx/${txHash}`,
    });

    // 4. Repin memory pointer on ENS (Base Sepolia via viem)
    const pinTx = await pinMemoryToENS(this.id.privateKey, this.id.label, newRoot);
    this.log("memory pinned to ENS", {
      newRoot,
      tx: `https://sepolia.basescan.org/tx/${pinTx}`,
    });

    // 5. Send poster a courtesy AXL ping with the preview
    await this.axl.send(this.id.posterAxlPeer, `bounty:${env.bountyId}`, {
      type: "DELIVER",
      bountyId: env.bountyId,
      resultCID,
      resultPreview: result.text.slice(0, 200),
    });
  }

  // ---- helpers ----

  private canHandle(skill: string): boolean {
    if (!skill) return false;
    return this.id.skills.some((s) => s.toLowerCase() === skill.toLowerCase());
  }

  private async fetchTaskSpec(cid: string): Promise<{ prompt: string; requiredSkill: string }> {
    // Tasks are written to 0G Storage by the poster (real CID returned), AND
    // mirrored to the in-process memLog by storage.ts. In the same-process demo,
    // every agent reads from the shared memLog — find the entry whose CID context
    // matches, otherwise fall back to the most recent task entry.
    const arr = (await readLog("tasks")) as { ts?: number; entry?: { prompt?: string; requiredSkill?: string } }[];
    if (arr.length > 0) {
      const last = arr[arr.length - 1];
      const e = last?.entry ?? (last as { prompt?: string; requiredSkill?: string });
      return { prompt: e?.prompt ?? "", requiredSkill: e?.requiredSkill ?? "" };
    }
    // Last resort: treat the CID as the prompt itself.
    return { prompt: cid, requiredSkill: "" };
  }

  private log(msg: string, extra?: Record<string, unknown>) {
    const ts = new Date().toISOString().slice(11, 19);
    const tag = `[${ts}] ${this.id.label}.${PARENT_DOMAIN}`;
    if (extra) console.log(tag, msg, extra);
    else console.log(tag, msg);
  }
}
