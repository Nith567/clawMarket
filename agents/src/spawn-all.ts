/**
 * Bootstrap: mint an iNFT on 0G Chain + register a subname on Base Sepolia
 * for each persona. Run this ONCE per hackathon demo session.
 *
 *   tsx src/spawn-all.ts
 *
 * Idempotent-ish: it always mints a new iNFT, so re-running creates fresh
 * agents with new tokenIds. To reuse, hardcode the inftId in personas.ts.
 */

import {
  spawn,
  resolve,
  ADDRESSES,
  PARENT_DOMAIN,
  agentRegistrarAbi,
  publicClients,
  walletClients,
  agentFactoryAbi,
  type SpawnInput,
} from "@clawmarket/sdk";
import { ALL, MESH } from "./personas.js";
import { baseSepolia } from "viem/chains";
import type { Hex, Address } from "viem";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

const PK = process.env.AGENT_PRIVATE_KEY as Hex;
if (!PK) throw new Error("AGENT_PRIVATE_KEY missing — set it in agents/.env");

/**
 * Scan AgentFactory for iNFTs already owned by `wallet` whose ensLabel matches a persona.
 * Used to recover from a partial run (iNFT minted but ENS step crashed).
 */
async function findExistingINFTs(wallet: Address): Promise<Map<string, bigint>> {
  const found = new Map<string, bigint>();
  const { og } = publicClients();
  // Token ids start at 1 and increment. Probe up to 20 ids.
  for (let id = 1n; id <= 20n; id++) {
    try {
      const owner = (await og.readContract({
        address: ADDRESSES.agentFactory as Address,
        abi: agentFactoryAbi,
        functionName: "ownerOf",
        args: [id],
      })) as Address;
      if (owner.toLowerCase() !== wallet.toLowerCase()) continue;
      const brain = (await og.readContract({
        address: ADDRESSES.agentFactory as Address,
        abi: agentFactoryAbi,
        functionName: "getBrain",
        args: [id],
      })) as { ensLabel: string };
      const label = brain.ensLabel.replace(`.${PARENT_DOMAIN}`, "");
      if (!found.has(label)) found.set(label, id);
    } catch {
      break; // ran out of ids
    }
  }
  return found;
}

async function registerExistingOnly(
  pk: Hex,
  label: string,
  inftId: bigint,
  p: typeof ALL[number],
): Promise<string> {
  const wc = walletClients(pk);
  const tx = await wc.base.writeContract({
    address: ADDRESSES.agentRegistrar as Address,
    abi: agentRegistrarAbi,
    chain: baseSepolia,
    account: wc.account,
    functionName: "registerAgent",
    args: [
      label,
      wc.account.address,
      {
        skills: JSON.stringify(p.skills),
        pricePerCall: p.pricePerCall,
        inftId,
        inftContract: ADDRESSES.agentFactory as Address,
        model: p.model,
        brainCID: `bafy:${label}:genesis`,
        axlPeerId: (MESH as unknown as Record<string, { peerId: string; url: string }>)[label].peerId,
        axlEndpoint: (MESH as unknown as Record<string, { peerId: string; url: string }>)[label].url,
      },
    ],
  });
  const { base } = publicClients();
  await base.waitForTransactionReceipt({ hash: tx, timeout: 300_000, pollingInterval: 3000 });
  return `${label}.${PARENT_DOMAIN}`;
}

async function main() {
  const outPath = new URL("../spawned.json", import.meta.url);
  const out: Record<string, { inftId: string; fqdn: string }> = existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8"))
    : {};

  // 1) Recover orphan iNFTs (minted but ENS step crashed).
  const wc = walletClients(PK);
  console.log("scanning for orphan iNFTs...");
  const orphans = await findExistingINFTs(wc.account.address as Address);
  for (const [label, id] of orphans) {
    console.log(`  found iNFT #${id} → ensLabel=${label}`);
  }

  for (const p of ALL) {
    if (out[p.label]?.inftId) {
      console.log(`✓ ${p.label} in spawned.json (iNFT #${out[p.label].inftId}) — skipping`);
      continue;
    }
    const onENS = await resolve(p.label);
    if (onENS && onENS.inftId > 0n) {
      console.log(`✓ ${p.label} fully registered on-chain (iNFT #${onENS.inftId})`);
      out[p.label] = { inftId: onENS.inftId.toString(), fqdn: onENS.fqdn };
      writeFileSync(outPath, JSON.stringify(out, null, 2));
      continue;
    }
    if (orphans.has(p.label)) {
      const id = orphans.get(p.label)!;
      console.log(`→ recovering ${p.label}: iNFT #${id} exists, registering ENS only ...`);
      const fqdn = await registerExistingOnly(PK, p.label, id, p);
      out[p.label] = { inftId: id.toString(), fqdn };
      writeFileSync(outPath, JSON.stringify(out, null, 2));
      console.log(`  ✓ registered ${fqdn}`);
      continue;
    }
    const meshNode = (MESH as unknown as Record<string, { peerId: string; url: string }>)[p.label];
    const input: SpawnInput = {
      label: p.label,
      model: p.model,
      brainCID: `bafy:${p.label}:genesis`, // a real impl would write the system prompt to 0G Storage and use that CID
      axlPeerId: meshNode.peerId,
      axlEndpoint: meshNode.url,
      skills: JSON.stringify(p.skills),
      pricePerCall: p.pricePerCall,
      royaltyBps: 500,
    };
    console.log(`\n→ spawning ${p.label}.clawmarket.eth ...`);
    const res = await spawn(PK, input);
    console.log(`  iNFT id: ${res.inftId}`);
    console.log(`  ENS:     ${res.fqdn}`);
    console.log(`  factory: ${res.factoryTx}`);
    console.log(`  registrar: ${res.registrarTx}`);
    out[p.label] = { inftId: res.inftId.toString(), fqdn: res.fqdn };
    // Persist after each agent so a crash mid-loop is recoverable
    writeFileSync(outPath, JSON.stringify(out, null, 2));
  }

  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\n✅ all agents spawned. Saved to agents/spawned.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
