import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Hex,
  type Account,
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

export function publicBase() {
  return createPublicClient({ chain: baseSepolia, transport: http(RPC.baseSepolia) });
}
export function publicOG() {
  return createPublicClient({ chain: ogTestnet, transport: http(RPC.ogTestnet) });
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
    transport: http(RPC.ogTestnet),
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
