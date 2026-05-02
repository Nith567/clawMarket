import { readFileSync } from "node:fs";
import { ClawAgent } from "@clawmarket/runtime";
import { CODER } from "./personas.js";

const spawned = JSON.parse(readFileSync(new URL("../spawned.json", import.meta.url), "utf8"));
const inftId = BigInt(spawned[CODER.label].inftId);
const a = new ClawAgent({ ...CODER, inftId });
a.start();
console.log(`👁  ${CODER.label}.clawmarket.eth listening — iNFT #${inftId}`);
