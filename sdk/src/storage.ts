/**
 * 0G Storage wrapper — KV (working memory) + Log (append-only history).
 *
 * The official 0G Storage SDK is `@0glabs/0g-ts-sdk`. To keep this SDK light
 * and avoid native deps, we talk to a local **0G Storage gateway** via HTTP
 * (the same shape `og-storage-cli serve` exposes). Set `OG_STORAGE_GATEWAY`
 * in env, e.g. `http://127.0.0.1:5678`.
 *
 * If the gateway is unreachable, we transparently fall back to in-memory
 * storage so demos still run — and emit a `MockCID:` prefix so it's obvious.
 */

import type { Hex } from "viem";
import { ADDRESSES, TEXT_KEYS } from "./config.js";
import { agentRegistrarAbi } from "./abi.js";
import { walletClients } from "./clients.js";
import { baseSepolia } from "viem/chains";
import type { Address } from "viem";

const GATEWAY = process.env.OG_STORAGE_GATEWAY ?? "http://127.0.0.1:5678";

const memKV = new Map<string, string>();
const memLog = new Map<string, string[]>();

async function tryFetch(path: string, init?: RequestInit) {
  try {
    const r = await fetch(`${GATEWAY}${path}`, init);
    if (!r.ok) throw new Error(`gateway ${r.status}`);
    return r;
  } catch {
    return null;
  }
}

// ----------------------------- KV -----------------------------

export async function putKV(namespace: string, key: string, value: string): Promise<string> {
  const r = await tryFetch(`/kv/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "content-type": "application/octet-stream" },
    body: value,
  });
  if (r) {
    const { rootHash } = (await r.json()) as { rootHash: string };
    return rootHash;
  }
  // fallback
  memKV.set(`${namespace}:${key}`, value);
  return `MockCID:kv:${namespace}:${key}:${Buffer.from(value).length}`;
}

export async function getKV(namespace: string, key: string): Promise<string | null> {
  const r = await tryFetch(`/kv/${encodeURIComponent(namespace)}/${encodeURIComponent(key)}`);
  if (r) return r.text();
  return memKV.get(`${namespace}:${key}`) ?? null;
}

// ----------------------------- LOG -----------------------------

export async function appendLog(stream: string, entry: unknown): Promise<string> {
  const body = JSON.stringify({ ts: Date.now(), entry });
  const r = await tryFetch(`/log/${encodeURIComponent(stream)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (r) {
    const { rootHash } = (await r.json()) as { rootHash: string };
    return rootHash;
  }
  const arr = memLog.get(stream) ?? [];
  arr.push(body);
  memLog.set(stream, arr);
  return `MockCID:log:${stream}:${arr.length}`;
}

export async function readLog(stream: string): Promise<unknown[]> {
  const r = await tryFetch(`/log/${encodeURIComponent(stream)}`);
  if (r) return (await r.json()) as unknown[];
  return (memLog.get(stream) ?? []).map((s) => JSON.parse(s));
}

// ------------------- ENS memory pointer sync -------------------

/**
 * Update the agent's `og.storage.memory` text record on its ENS subname
 * to point at the latest brain root. Other agents reading the agent's
 * profile see the freshest memory pointer.
 */
export async function pinMemoryToENS(privateKey: Hex, label: string, brainCID: string) {
  const wc = walletClients(privateKey);
  return wc.base.writeContract({
    address: ADDRESSES.agentRegistrar as Address,
    abi: agentRegistrarAbi,
    chain: baseSepolia,
    account: wc.account,
    functionName: "updateText",
    args: [label, TEXT_KEYS.memory, brainCID],
  });
}
