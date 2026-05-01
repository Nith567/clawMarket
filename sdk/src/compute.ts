/**
 * 0G Compute wrapper — sealed inference via the official broker.
 *
 * Authoritative path: `@0glabs/0g-serving-broker`.
 *   1. broker is signed by the agent's private key (no API key needed)
 *   2. ledger funds are auto-managed via `broker.ledger`
 *   3. for each call: getServiceMetadata -> getRequestHeaders -> POST to provider
 *   4. optional: processResponse() verifies TEE attestation by chat id
 *
 * Funding requirements:
 *   - 3+ OG initial ledger deposit  (broker.ledger.addLedger / depositFund)
 *   - 1+ OG locked balance per provider (auto-funded by SDK in node)
 *
 * Env knobs:
 *   OG_COMPUTE_RPC          (default https://evmrpc-testnet.0g.ai)
 *   OG_COMPUTE_PROVIDER     specific provider address — if unset, picks first listed
 *   OG_COMPUTE_LEDGER       auto-deposit amount in OG (default 5)
 *
 * Fallback: if `OPENAI_BASE_URL` + `OPENAI_API_KEY` are set, we use them
 * (Groq, Together, OpenRouter, Ollama all work). Useful when 0G Compute
 * is down or for quick local iteration. The returned `attestation` field
 * is empty in fallback mode — populated by processResponse() in the real path.
 */

import { Wallet, JsonRpcProvider } from "ethers";
import type { ZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { createRequire } from "node:module";
import type { Hex } from "viem";

// 0G's published ESM bundle is broken in 0.7.x — load the CJS build directly.
const require = createRequire(import.meta.url);
const brokerCjs: { createZGComputeNetworkBroker: (signer: unknown) => Promise<ZGComputeNetworkBroker> } =
  require("@0glabs/0g-serving-broker");
const { createZGComputeNetworkBroker } = brokerCjs;

export interface InferInput {
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  max_tokens?: number;
}

export interface InferOutput {
  text: string;
  attestation: string;
  raw: unknown;
}

let cachedBroker: ZGComputeNetworkBroker | null = null;
let cachedProvider: string | null = null;

const RPC = process.env.OG_COMPUTE_RPC ?? "https://evmrpc-testnet.0g.ai";

async function ensureBroker(privateKey: Hex): Promise<ZGComputeNetworkBroker> {
  if (cachedBroker) return cachedBroker;
  const provider = new JsonRpcProvider(RPC);
  const wallet = new Wallet(privateKey, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Make sure a ledger exists; ignore "already exists" errors.
  const seedAmount = Number(process.env.OG_COMPUTE_LEDGER ?? "5");
  try {
    await broker.ledger.addLedger(seedAmount);
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? "";
    if (!/exists|already/i.test(msg)) {
      // not a "already exists" error -> try a top-up instead
      try { await broker.ledger.depositFund(seedAmount); } catch { /* ignore */ }
    }
  }
  cachedBroker = broker;
  return broker;
}

async function pickProvider(broker: ZGComputeNetworkBroker): Promise<string> {
  if (cachedProvider) return cachedProvider;
  if (process.env.OG_COMPUTE_PROVIDER) {
    cachedProvider = process.env.OG_COMPUTE_PROVIDER;
    return cachedProvider;
  }
  const services = await broker.inference.listService();
  if (!services?.length) throw new Error("0G Compute: no providers listed on testnet");
  // First entry is fine for hackathon; prod code would pick by latency / model fit.
  // The shape is `[provider, ...]` per service struct — extract the address.
  const first = services[0] as unknown as { provider?: string; 0?: string };
  const addr = first.provider ?? (first as unknown as string[])[0];
  if (!addr) throw new Error("0G Compute: provider address missing in service entry");
  cachedProvider = addr;
  return addr;
}

/** Optional: pre-warm the broker so the first infer() isn't slow. */
export async function initCompute(privateKey: Hex): Promise<void> {
  const b = await ensureBroker(privateKey);
  await pickProvider(b);
}

/** Run sealed inference via 0G Compute, with OpenAI-compatible fallback. */
export async function infer(input: InferInput, opts?: { privateKey?: Hex }): Promise<InferOutput> {
  // Fallback path: if no PK provided AND fallback env set, use OpenAI shape.
  if (!opts?.privateKey && process.env.OPENAI_BASE_URL) {
    return openAIFallback(input);
  }
  if (!opts?.privateKey) {
    throw new Error(
      "infer(): pass { privateKey } to use 0G Compute, or set OPENAI_BASE_URL+OPENAI_API_KEY for fallback",
    );
  }

  const broker = await ensureBroker(opts.privateKey);
  const provider = await pickProvider(broker);

  const meta = await broker.inference.getServiceMetadata(provider);
  // The broker returns the provider's preferred model; respect it for billing/attestation correctness.
  const modelToUse = meta.model ?? input.model;

  const lastUser = [...input.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const headers = await broker.inference.getRequestHeaders(provider, lastUser);

  const r = await fetch(`${meta.endpoint.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(headers as unknown as Record<string, string>) },
    body: JSON.stringify({
      model: modelToUse,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.max_tokens ?? 800,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`0G infer ${r.status}: ${body.slice(0, 300)}`);
  }
  const json = (await r.json()) as {
    id?: string;
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const chatId = r.headers.get("ZG-Res-Key") ?? json.id ?? "";

  // Verify response integrity via TEE signature; ok to fail-soft for hackathon.
  let attestation = "";
  if (chatId) {
    try {
      const ok = await broker.inference.processResponse(provider, chatId);
      attestation = ok ? `valid:${chatId}` : `invalid:${chatId}`;
    } catch {
      attestation = `unverified:${chatId}`;
    }
  }

  return { text, attestation, raw: json };
}

// ---------- fallback path ----------

async function openAIFallback(input: InferInput): Promise<InferOutput> {
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const key = process.env.OPENAI_API_KEY ?? "";
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.max_tokens ?? 800,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`fallback infer ${r.status}: ${body.slice(0, 300)}`);
  }
  const json = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return { text: json.choices?.[0]?.message?.content ?? "", attestation: "", raw: json };
}
