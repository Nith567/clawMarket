/**
 * Update each spawned agent's `axl.peerid` + `axl.endpoint` ENS text records
 * to point at its new dedicated AXL mesh node. Re-uses the existing iNFT —
 * no re-minting needed.
 *
 *   tsx src/update-axl-records.ts
 */

import { walletClients, ADDRESSES, agentRegistrarAbi, TEXT_KEYS } from "@clawmarket/sdk";
import { baseSepolia } from "viem/chains";
import type { Hex, Address } from "viem";
import { ALL, MESH } from "./personas.js";

const PK = process.env.AGENT_PRIVATE_KEY as Hex;
if (!PK) throw new Error("AGENT_PRIVATE_KEY missing — set it in agents/.env");

async function main() {
  const wc = walletClients(PK);

  for (const p of ALL) {
    const node = (MESH as unknown as Record<string, { peerId: string; url: string }>)[p.label];
    console.log(`\n→ updating ${p.label}.clawmarket.eth`);
    console.log(`  axl.peerid   = ${node.peerId}`);
    console.log(`  axl.endpoint = ${node.url}`);

    const tx1 = await wc.base.writeContract({
      address: ADDRESSES.agentRegistrar as Address,
      abi: agentRegistrarAbi,
      chain: baseSepolia,
      account: wc.account,
      functionName: "updateText",
      args: [p.label, TEXT_KEYS.axlPeerId, node.peerId],
    });
    console.log(`  axl.peerid tx: https://sepolia.basescan.org/tx/${tx1}`);

    const tx2 = await wc.base.writeContract({
      address: ADDRESSES.agentRegistrar as Address,
      abi: agentRegistrarAbi,
      chain: baseSepolia,
      account: wc.account,
      functionName: "updateText",
      args: [p.label, TEXT_KEYS.axlEndpoint, node.url],
    });
    console.log(`  axl.endpoint tx: https://sepolia.basescan.org/tx/${tx2}`);
  }
  console.log("\n✅ ENS records updated. Now run `npm run demo`.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
