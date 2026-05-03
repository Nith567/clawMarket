/**
 * 🎬 ClawMarket — end-to-end demo
 *
 *   tsx src/demo.ts
 *
 * What this does:
 *   1. Reads spawned.json (created by `tsx src/spawn-all.ts`)
 *   2. Boots all 3 agents (translator / researcher / coder) IN-PROCESS
 *      — each runs its own ClawAgent loop, watching 0G Chain for bounties
 *      — they all share the same AXL node (one peer key per machine)
 *   3. Acts as the "Poster": posts a bounty asking for "translate" skill
 *   4. Watches AXL bid envelopes flow in
 *   5. Picks the cheapest qualified bidder, on-chain assigns + waits delivery
 *   6. Settles the bounty — funds split, reputation updated, brain memory bumped
 */

import { readFileSync } from "node:fs";
import { ClawAgent, Poster } from "@clawmarket/runtime";
import { TRANSLATOR, RESEARCHER, CODER, POSTER_AXL } from "./personas.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { resolve as resolveAgent, PARENT_DOMAIN } from "@clawmarket/sdk";

const PK = process.env.AGENT_PRIVATE_KEY as Hex;
if (!PK) throw new Error("AGENT_PRIVATE_KEY missing — set it in agents/.env");

interface SpawnRecord {
  inftId: string;
  fqdn: string;
}

// Don't let stray background promise rejections (e.g. flaky 0G storage uploads) kill the demo.
process.on("unhandledRejection", (e) => {
  const msg = (e as Error)?.message ?? String(e);
  console.warn("[bg] swallowed unhandled rejection:", msg.slice(0, 200));
});

async function main() {
  const spawned: Record<string, SpawnRecord> = JSON.parse(
    readFileSync(new URL("../spawned.json", import.meta.url), "utf8"),
  );
  console.log("loaded spawned agents:", Object.keys(spawned).join(", "));

  // ----- 1) boot agents -----
  const agents = [
    new ClawAgent({ ...TRANSLATOR, inftId: BigInt(spawned[TRANSLATOR.label].inftId) }),
    new ClawAgent({ ...RESEARCHER, inftId: BigInt(spawned[RESEARCHER.label].inftId) }),
    new ClawAgent({ ...CODER, inftId: BigInt(spawned[CODER.label].inftId) }),
  ];
  for (const a of agents) a.start();

  // ----- 2) poster runs the auction on its OWN AXL node -----
  const poster = new Poster({
    privateKey: PK,
    axlPeerId: POSTER_AXL.peerId,
    axlUrl: POSTER_AXL.url,
    bidWindowMs: 6_000,
  });

  // small banner
  const me = privateKeyToAccount(PK).address;
  console.log("\n=========================================");
  console.log(" ClawMarket demo — 4-node AXL mesh");
  console.log(" Poster node     :", POSTER_AXL.url, POSTER_AXL.peerId.slice(0, 12) + "…");
  console.log(" Translator node :", TRANSLATOR.axlUrl, TRANSLATOR.axlPeerId.slice(0, 12) + "…");
  console.log(" Researcher node :", RESEARCHER.axlUrl, RESEARCHER.axlPeerId.slice(0, 12) + "…");
  console.log(" Coder node      :", CODER.axlUrl, CODER.axlPeerId.slice(0, 12) + "…");
  console.log(" Poster wallet   :", me);
  console.log("=========================================\n");

  // give the agents a beat to attach their watchers
  await new Promise((r) => setTimeout(r, 1500));

  const job = await poster.runJob({
    prompt: "Translate to French: 'The agent marketplace is now permissionless.'",
    requiredSkill: "translate",
    amountWei: 5_000_000_000_000_000n, // 0.005 OG
    deadlineSec: 600,
  });

  console.log("\n🎉 demo complete");
  console.log("   bountyId  :", job.bountyId.toString());
  console.log("   winner    :", `${job.winner}.clawmarket.eth`);
  console.log("   resultCID :", job.resultCID);

  // ----- proof panel: re-resolve winner's ENS subname and dump live state -----
  console.log("\n=========================================");
  console.log(" 🪪  Live ENS state for the winning agent");
  console.log("=========================================");

  // Poll until the agent's post-delivery memory pin lands on ENS (max 120s).
  // The agent's putKV + pinMemoryToENS run AFTER settle(), so we wait for
  // the new real 0x... root to overwrite any prior MockCID.
  console.log(" (waiting for post-delivery memory pin to land on ENS...)");
  let profile = await resolveAgent(job.winner);
  const deadlineAt = Date.now() + 120_000;
  while (Date.now() < deadlineAt) {
    profile = await resolveAgent(job.winner);
    if (profile?.memoryCID?.startsWith("0x") && profile.memoryCID.length >= 64) break;
    await new Promise((r) => setTimeout(r, 4_000));
  }
  if (!profile) {
    console.log(" (could not resolve — try in a few seconds)");
  } else {
    console.log(`  fqdn         : ${profile.fqdn}`);
    console.log(`  owner        : ${profile.owner}`);
    console.log(`  iNFT id      : ${profile.inftId}`);
    console.log(`  iNFT contract: ${profile.inftContract}`);
    console.log(`  model        : ${profile.model}`);
    console.log(`  skills       : ${profile.skills.join(", ")}`);
    console.log(`  price/call   : ${profile.pricePerCall} wei`);
    console.log(`  axl peer     : ${profile.axlPeerId.slice(0, 16)}…`);
    console.log(`  memory CID   : ${profile.memoryCID}   ← updated this run!`);
    console.log("");
    console.log(`  view live    : https://sepolia.app.ens.domains/${profile.fqdn}`);
  }

  console.log("\n=========================================");
  console.log(" 🔗  Onchain artifacts");
  console.log("=========================================");
  console.log(`  bounty escrow : https://chainscan-galileo.0g.ai/address/0x56f4080f797355fde9c0f8062f9e6244c33fae20`);
  console.log(`  agent factory : https://chainscan-galileo.0g.ai/address/0x6486800403d9a31354166f6086a46d694b6feb49`);
  console.log(`  ens registrar : https://sepolia.basescan.org/address/0x73dBB2a704EdEe7eB19335F30b81E30d30AB2d37`);

  for (const a of agents) a.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error("demo failed:", e);
  process.exit(1);
});
