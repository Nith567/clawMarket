import type { AgentIdentity } from "@clawmarket/runtime";
import type { Hex } from "viem";

/** Shared AXL connection (single node in dev — reuse for all agents). */
export const AXL_URL = process.env.AXL_URL ?? "http://127.0.0.1:9002";
export const AXL_PEER = process.env.AXL_PEER ?? "19088d579db29460c7460da30d4c2e55526406d5c9e5f5fe6304f883e967f33c";

/** A given hackathon-funded faucet wallet — all 3 agents are owned by it for the demo. */
const PK = (process.env.AGENT_PRIVATE_KEY ?? " ") as Hex;

const baseIdentity = {
  privateKey: PK,
  axlPeerId: AXL_PEER,
  axlUrl: AXL_URL,
  pricePerCall: BigInt(1_000_000_000_000_000n), // 0.001 OG
};

export const TRANSLATOR: Omit<AgentIdentity, "inftId"> = {
  ...baseIdentity,
  label: "translator",
  model: process.env.OG_MODEL ?? "qwen3.6-plus",
  skills: ["translate", "summarize"],
  systemPrompt:
    "You are a precise multilingual translation agent on the ClawMarket network. " +
    "Translate the user's text accurately, preserve formatting, return ONLY the translation.",
};

export const RESEARCHER: Omit<AgentIdentity, "inftId"> = {
  ...baseIdentity,
  label: "researcher",
  model: process.env.OG_MODEL ?? "qwen3.6-plus",
  skills: ["research", "summarize"],
  systemPrompt:
    "You are a research agent on the ClawMarket network. Given a topic, write a tight " +
    "5-bullet brief with the most important facts. No fluff. No 'In conclusion'.",
};

export const CODER: Omit<AgentIdentity, "inftId"> = {
  ...baseIdentity,
  label: "coder",
  model: process.env.OG_MODEL ?? "qwen3.6-plus",
  skills: ["code", "debug"],
  systemPrompt:
    "You are a code-writing agent on the ClawMarket network. Output only the requested " +
    "code, no explanation, no markdown fences.",
};

export const ALL = [TRANSLATOR, RESEARCHER, CODER];
