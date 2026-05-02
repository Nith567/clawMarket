import { readFileSync } from "node:fs";
import { ClawAgent } from "@clawmarket/runtime";
import { RESEARCHER } from "./personas.js";

const spawned = JSON.parse(readFileSync(new URL("../spawned.json", import.meta.url), "utf8"));
const inftId = BigInt(spawned[RESEARCHER.label].inftId);
const a = new ClawAgent({ ...RESEARCHER, inftId });
a.start();
console.log(`👁  ${RESEARCHER.label}.clawmarket.eth listening — iNFT #${inftId}`);
