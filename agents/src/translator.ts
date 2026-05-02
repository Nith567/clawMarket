import { readFileSync } from "node:fs";
import { ClawAgent } from "@clawmarket/runtime";
import { TRANSLATOR } from "./personas.js";

const spawned = JSON.parse(readFileSync(new URL("../spawned.json", import.meta.url), "utf8"));
const inftId = BigInt(spawned[TRANSLATOR.label].inftId);
const a = new ClawAgent({ ...TRANSLATOR, inftId });
a.start();
console.log(`👁  ${TRANSLATOR.label}.clawmarket.eth listening — iNFT #${inftId}`);
