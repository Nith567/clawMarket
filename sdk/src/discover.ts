import type { Address, Hex } from "viem";
import { ADDRESSES, PARENT_DOMAIN, TEXT_KEYS } from "./config.js";
import { l2RegistryAbi } from "./abi.js";
import { publicClients } from "./clients.js";

export interface AgentProfile {
  fqdn: string;
  node: Hex;
  owner: Address;
  skills: string[];
  pricePerCall: bigint;
  inftId: bigint;
  inftContract: string;
  model: string;
  memoryCID: string;
  axlPeerId: string;
  axlEndpoint: string;
  reputation: string; // signed attestation root, optional
}

/** Resolve the full agent profile from its ENS subname. */
export async function resolve(label: string): Promise<AgentProfile | null> {
  const { base } = publicClients();
  const fqdn = `${label}.${PARENT_DOMAIN}`;

  const node = (await base.readContract({
    address: ADDRESSES.l2Registry as Address,
    abi: l2RegistryAbi,
    functionName: "namehash",
    args: [fqdn],
  })) as Hex;

  let owner: Address;
  try {
    owner = (await base.readContract({
      address: ADDRESSES.l2Registry as Address,
      abi: l2RegistryAbi,
      functionName: "ownerOf",
      args: [BigInt(node)],
    })) as Address;
  } catch {
    return null; // not registered
  }

  const keys = [
    TEXT_KEYS.skills,
    TEXT_KEYS.price,
    TEXT_KEYS.inftId,
    TEXT_KEYS.inftContract,
    TEXT_KEYS.model,
    TEXT_KEYS.memory,
    TEXT_KEYS.axlPeerId,
    TEXT_KEYS.axlEndpoint,
    TEXT_KEYS.reputation,
  ];
  const values = await Promise.all(
    keys.map((key) =>
      base.readContract({
        address: ADDRESSES.l2Registry as Address,
        abi: l2RegistryAbi,
        functionName: "text",
        args: [node, key],
      }) as Promise<string>,
    ),
  );
  const [
    skillsRaw,
    priceRaw,
    inftIdRaw,
    inftContract,
    model,
    memoryCID,
    axlPeerId,
    axlEndpoint,
    reputation,
  ] = values;

  let skills: string[] = [];
  if (skillsRaw) {
    try {
      const parsed = JSON.parse(skillsRaw);
      if (Array.isArray(parsed)) skills = parsed.map(String);
    } catch {
      skills = skillsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  return {
    fqdn,
    node,
    owner,
    skills,
    pricePerCall: priceRaw ? BigInt(priceRaw) : 0n,
    inftId: inftIdRaw ? BigInt(inftIdRaw) : 0n,
    inftContract,
    model,
    memoryCID,
    axlPeerId,
    axlEndpoint,
    reputation,
  };
}

/**
 * Find agents by skill across a known label set.
 *
 * For hackathon scope we accept a candidate label list (the marketplace's
 * "directory") rather than scanning all ENS events. A production version
 * would index `SubnodeCreated` from the registry.
 */
export async function discoverBySkill(
  skill: string,
  candidateLabels: string[],
): Promise<AgentProfile[]> {
  const profiles = await Promise.all(candidateLabels.map((l) => resolve(l)));
  return profiles.filter(
    (p): p is AgentProfile => !!p && p.skills.some((s) => s.toLowerCase() === skill.toLowerCase()),
  );
}
