/**
 * One-time 0G Compute setup. Run BEFORE `npm run demo`.
 *
 *   tsx src/bootstrap-compute.ts
 *
 * Steps:
 *   1. Create / top-up ledger (5 OG default)
 *   2. List providers, pick one
 *   3. Acknowledge the provider's TEE signer (so signed responses validate)
 *
 * Idempotent: safe to re-run. Saves the chosen provider to compute-provider.json.
 */

import { Wallet, JsonRpcProvider } from "ethers";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import type { Hex } from "viem";

// CJS workaround for broken ESM bundle in @0glabs/0g-serving-broker@0.7.x
const require = createRequire(import.meta.url);
const { createZGComputeNetworkBroker } =
  require("@0glabs/0g-serving-broker") as {
    createZGComputeNetworkBroker: (signer: unknown) => Promise<{
      ledger: {
        addLedger: (n: number) => Promise<void>;
        depositFund: (n: number) => Promise<void>;
        getLedger: () => Promise<unknown>;
      };
      inference: {
        listService: () => Promise<unknown[]>;
        checkProviderSignerStatus: (p: string) => Promise<{ isAcknowledged: boolean }>;
        acknowledgeProviderTEESigner: (p: string) => Promise<void>;
      };
    }>;
  };

const PK = process.env.AGENT_PRIVATE_KEY as Hex;
if (!PK) throw new Error("AGENT_PRIVATE_KEY missing — set it in agents/.env");
const RPC = process.env.OG_COMPUTE_RPC ?? "https://evmrpc-testnet.0g.ai";
const SEED = Number(process.env.OG_COMPUTE_LEDGER ?? "4");

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(PK, provider);
  console.log("wallet:", await wallet.getAddress());

  const broker = await createZGComputeNetworkBroker(wallet);

  // 1) ledger
  try {
    console.log(`addLedger(${SEED}) ...`);
    await broker.ledger.addLedger(SEED);
    console.log("✅ ledger created");
  } catch (e) {
    const msg = (e as Error)?.message ?? "";
    console.log("ledger exists, depositing top-up instead...");
    try {
      await broker.ledger.depositFund(SEED);
      console.log("✅ deposit ok");
    } catch (e2) {
      console.warn("deposit failed (maybe already funded):", (e2 as Error)?.message?.slice(0, 100));
    }
  }
  const ledger = await broker.ledger.getLedger();
  console.log("ledger balance:", ledger);

  // 2) discover providers
  console.log("\nlisting providers ...");
  const services = await broker.inference.listService();
  console.log(`found ${services.length} providers`);
  if (!services.length) throw new Error("no providers — try again later");

  // shape: ServiceStructOutput tuple [provider, name, serviceType, url, inputPrice, outputPrice, updatedAt, model, verifiability]
  for (let i = 0; i < Math.min(5, services.length); i++) {
    const s = services[i] as unknown as { provider?: string; model?: string; url?: string };
    console.log(`  [${i}] provider=${s.provider} model=${s.model} url=${s.url}`);
  }
  const chosen = services[0] as unknown as { provider: string; model: string; url: string };
  console.log(`\n→ choosing: ${chosen.provider} (model=${chosen.model})`);

  // 3) acknowledge its TEE signer (required pre-inference)
  try {
    const status = await broker.inference.checkProviderSignerStatus(chosen.provider);
    if (status.isAcknowledged) {
      console.log("✅ TEE signer already acknowledged");
    } else {
      console.log("acknowledging TEE signer...");
      await broker.inference.acknowledgeProviderTEESigner(chosen.provider);
      console.log("✅ acknowledged");
    }
  } catch (e) {
    console.warn("acknowledge step skipped:", (e as Error)?.message?.slice(0, 200));
  }

  writeFileSync(
    new URL("../compute-provider.json", import.meta.url),
    JSON.stringify({ provider: chosen.provider, model: chosen.model, endpoint: chosen.url }, null, 2),
  );
  console.log("\n✅ saved → agents/compute-provider.json");
  console.log("   set this in env before running the demo:");
  console.log(`     export OG_COMPUTE_PROVIDER=${chosen.provider}`);
  console.log(`     export OG_MODEL=${chosen.model}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ bootstrap failed:", e);
    process.exit(1);
  });
