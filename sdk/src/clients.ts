import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  custom,
  type Hex,
  type Account,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { RPC } from "./config.js";

/** 0G Galileo testnet (chainId 16602). */
export const ogTestnet = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: [RPC.ogTestnet] } },
});

/**
 * 0G testnet RPC sometimes returns `-32000 / no matching receipts found` for
 * `eth_getTransactionReceipt` on a freshly mined tx (eventually-consistent
 * indexer). viem treats this as fatal — wrap http() to swallow this specific
 * shape and return `null`, which triggers viem's normal "not yet found" retry.
 */
function ogResilientHttp(url: string): Transport {
  const inner = http(url);
  return custom({
    async request({ method, params }) {
      const transport = inner({ chain: ogTestnet });
      try {
        return await transport.request({ method, params });
      } catch (e) {
        const err = e as { code?: number; details?: string; cause?: { message?: string } };
        const msg = err?.details ?? err?.cause?.message ?? "";
        const isReceiptStale =
          err?.code === -32000 &&
          /no matching receipts found|data corruption/i.test(msg) &&
          method === "eth_getTransactionReceipt";
        if (isReceiptStale) return null;
        throw e;
      }
    },
  });
}

export function publicBase() {
  return createPublicClient({ chain: baseSepolia, transport: http(RPC.baseSepolia) });
}
export function publicOG() {
  return createPublicClient({ chain: ogTestnet, transport: ogResilientHttp(RPC.ogTestnet) });
}
export function publicClients() {
  return { base: publicBase(), og: publicOG() };
}

export function accountFromKey(privateKey: Hex): Account {
  return privateKeyToAccount(privateKey);
}

export function walletBase(privateKey: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: baseSepolia,
    transport: http(RPC.baseSepolia),
  });
}
export function walletOG(privateKey: Hex) {
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: ogTestnet,
    transport: ogResilientHttp(RPC.ogTestnet),
  });
}
export function walletClients(privateKey: Hex): {
  account: Account;
  base: ReturnType<typeof walletBase>;
  og: ReturnType<typeof walletOG>;
} {
  const account = accountFromKey(privateKey);
  return { account, base: walletBase(privateKey), og: walletOG(privateKey) };
}
