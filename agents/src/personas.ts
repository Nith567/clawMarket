import type { AgentIdentity } from "@clawmarket/runtime";
import type { Hex } from "viem";
import { readFileSync } from "node:fs";

/**
 * Load the AXL mesh map written by `axl-mesh/discover.sh`.
 * Each agent gets its OWN node URL + peer key; they all target `poster` for bids.
 */
interface MeshNode { url: string; peerId: string; }
interface Mesh { poster: MeshNode; translator: MeshNode; researcher: MeshNode; coder: MeshNode; }

function loadMesh(): Mesh {
  const path = new URL("../../axl-mesh/mesh.json", import.meta.url);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Mesh;
  } catch {
    throw new Error(
      "axl-mesh/mesh.json not found.\n" +
      "→ run:  cd ../axl-mesh && ./start.sh && ./discover.sh",
    );
  }
}
export const MESH = loadMesh();
export const POSTER_AXL = MESH.poster;

const PK = process.env.AGENT_PRIVATE_KEY as Hex;
if (!PK) throw new Error("AGENT_PRIVATE_KEY missing — set it in agents/.env");

const baseIdentity = {
  privateKey: PK,
  posterAxlPeer: MESH.poster.peerId,
  pricePerCall: BigInt(1_000_000_000_000_000n), // 0.001 OG
};

export const TRANSLATOR: Omit<AgentIdentity, "inftId"> = {
  ...baseIdentity,
  label: "translator",
  axlUrl: MESH.translator.url,
  axlPeerId: MESH.translator.peerId,
  model: process.env.OG_MODEL ?? "qwen/qwen-2.5-7b-instruct",
  skills: ["translate", "summarize"],
  systemPrompt:
    "You are a precise multilingual translation agent on the ClawMarket network. " +
    "Translate the user's text accurately, preserve formatting, return ONLY the translation.",
};

export const RESEARCHER: Omit<AgentIdentity, "inftId"> = {
  ...baseIdentity,
  label: "researcher",
  axlUrl: MESH.researcher.url,
  axlPeerId: MESH.researcher.peerId,
  model: process.env.OG_MODEL ?? "qwen/qwen-2.5-7b-instruct",
  skills: ["research", "summarize"],
  systemPrompt:
    "You are a research agent on the ClawMarket network. Given a topic, write a tight " +
    "5-bullet brief with the most important facts. No fluff. No 'In conclusion'.",
};

export const CODER: Omit<AgentIdentity, "inftId"> = {
  ...baseIdentity,
  label: "coder",
  axlUrl: MESH.coder.url,
  axlPeerId: MESH.coder.peerId,
  model: process.env.OG_MODEL ?? "qwen/qwen-2.5-7b-instruct",
  skills: ["code", "debug"],
  systemPrompt:
    "You are a code-writing agent on the ClawMarket network. Output only the requested " +
    "code, no explanation, no markdown fences.",
};

export const ALL = [TRANSLATOR, RESEARCHER, CODER];
