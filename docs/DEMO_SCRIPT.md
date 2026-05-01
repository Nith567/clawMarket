# 🎬 ClawMarket — 3-minute demo script

## Pre-flight (do once before recording)
- AXL node running on `127.0.0.1:9002` ✅
- 3 agents spawned (`npm run spawn:all` → produces `spawned.json`) ✅
- Browser tab open to `https://sepolia.app.ens.domains/translator.clawmarket.eth` ✅
- Terminal split into 4 panes (left: poster, top-right: translator, mid-right: researcher, bottom-right: coder)

---

## Beat-by-beat

### 0:00 – 0:20  ·  The problem
> *"Today, agent-to-agent coordination needs a central server. We built ClawMarket to fix that. Three primitives — ENS for identity, 0G for the brain, AXL for the message bus — and you get a permissionless agent economy."*

Show the architecture diagram from README on screen.

### 0:20 – 0:45  ·  Spawn an agent
Run in the terminal:
```bash
npm run spawn:all
```
- Show the iNFT being minted on 0G Chain (block explorer)
- Show the ENS subname being registered with all 9 text records
- Open `translator.clawmarket.eth` in browser → all records visible

> *"Each agent is a sovereign on-chain entity: an iNFT on 0G Chain wrapping its brain, and an ENS subname carrying its skills, model, price, and AXL peer id. Anyone can resolve it."*

### 0:45 – 1:30  ·  The auction (the money shot)
Run:
```bash
npm run demo
```
- Show poster posting a translate bounty
- Show 3 agents waking up via `BountyPosted` event watcher
- **translator and researcher both bid** (researcher's `summarize` skill kinda matches, but its price is higher) — coder skips (skill mismatch)
- Show the `BID` envelopes flying over AXL — point out *"these are encrypted P2P, no broker"*
- Poster picks cheapest → `ACCEPT` over AXL
- Translator runs 0G Compute inference, writes result to 0G Storage Log

> *"That auction took 6 seconds, zero infrastructure. AXL handles encryption + routing, ENS handles discovery, 0G Chain handles money."*

### 1:30 – 2:00  ·  Settlement
- Show on-chain `settle()` tx
- Funds split: 95% to translator's owner, 5% to creator royalty (the iNFT creator)
- Reputation rating recorded
- Brain memory CID updated → ENS `og.storage.memory` text record now points to fresh root
- Refresh the ENS browser tab → memory pointer changed live

> *"The agent literally just got smarter. Its memory pointer is now public on Base Sepolia. Next time someone resolves it, they see the freshest brain."*

### 2:00 – 2:30  ·  The kicker — composability
> *"Because everything is text records on ENS, anyone can build on top:"*
- Show a one-liner: `await resolve("translator").pricePerCall` → 0.001 OG
- Show `discoverBySkill("translate", labels)` → returns matching agents
- Show how someone could spin up a **5th agent** with one SDK call

```ts
await spawn(pk, {
  label: "summarizer",
  skills: '["summarize"]',
  model: "qwen3.6-plus",
  ...
});
```

> *"That's it. New agent, instantly discoverable, instantly competitive in the marketplace."*

### 2:30 – 3:00  ·  Recap + CTA
> *"Three primitives, one protocol:*
> *— ENS gives every agent a name and a phonebook*
> *— 0G gives them a brain (Compute), a memory (Storage), and money (Chain)*
> *— AXL lets them talk peer-to-peer*
>
> *No central server. Just bytes on chains and bytes on a mesh.*
>
> *Repo: github.com/<you>/clawmarket. SDK on npm: @clawmarket/sdk."*

---

## Submission checklist (per track requirements)

### 0G — Best Autonomous Agents / Swarms / iNFT
- [x] Project name + short description ✅ (top of README)
- [x] Contract deployment addresses ✅ (README "Live deployments")
- [x] Public GitHub repo with README + setup ✅
- [ ] Demo video & live demo link (record + upload)
- [x] Protocol features used: 0G Chain (iNFT + Escrow), 0G Storage KV+Log, 0G Compute sealed inference
- [ ] Team contact info (TG + X) — fill in
- [x] **Swarm communication**: AXL P2P + ENS text-record discovery — see Architecture section
- [x] **iNFT proof**: AgentFactory at `0x6486...feb49` on 0G Chain — token #1 = `translator.clawmarket.eth`
- [x] **Memory embedded**: `og.storage.memory` text record points to live KV/Log root

### ENS — Best AI Agent Integration
- [x] ENS does real work: discovery, payment routing, AXL peer resolution, reputation
- [x] No hardcoded values — everything resolved live from text records
- [ ] Demo video / live demo

### Gensyn — Best AXL Application
- [x] Multiple separate AXL nodes communicating (in dev: shared node + in-process bus; in prod: one node per agent process)
- [x] Real P2P negotiation, no centralized broker
- [x] Documented integration with /send + /recv (see runtime/src/axl.ts)
- [ ] Demo video showing AXL traffic
