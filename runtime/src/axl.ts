/**
 * AXL client — talks to a local AXL node over HTTP (default 127.0.0.1:9002).
 *
 * Real Gensyn AXL HTTP API (verified against axl-main/docs/api.md):
 *
 *   POST /send       header  X-Destination-Peer-Id: <hex>     body: raw bytes
 *   GET  /recv       204 if empty, else 200 with X-From-Peer-Id and raw body
 *   GET  /topology   { our_ipv6, our_public_key, peers, tree }
 *
 * AXL ships bytes between peers; we layer a JSON envelope on top so multiple
 * logical conversations can share a single peer pair:
 *
 *   { channel: "bounty:42", from: "<peer>", payload: <any>, ts: <ms> }
 *
 * MCP / A2A traffic is auto-routed by AXL and does NOT show in /recv,
 * so this client is reserved for the marketplace's bid-auction conversation.
 *
 * If the AXL node is unreachable, an in-process bus delivers locally so demos
 * still work when only one process is up.
 */

export interface AxlConfig {
  url: string;       // e.g. "http://127.0.0.1:9002"
  peerId: string;    // hex-encoded ed25519 public key (from /topology.our_public_key)
}

export interface AxlEnvelope<T = unknown> {
  channel: string;
  from: string;
  payload: T;
  ts: number;
}

type Listener = (env: AxlEnvelope) => void;
type Pred = (channel: string) => boolean;

// in-process fallback queues, keyed by recipient peerId
const memQueues = new Map<string, AxlEnvelope[]>();

// Shared per-peer state: when multiple AxlClient instances share a peerId
// (typical in single-node multi-agent demos), they MUST share listeners +
// poll loop, otherwise each instance's tick() steals envelopes from the others.
interface SharedPeerState {
  listeners: { pred: Pred; cb: Listener }[];
  pollHandle?: ReturnType<typeof setInterval>;
  ticking: boolean;
}
const sharedByPeer = new Map<string, SharedPeerState>();
function stateFor(peerId: string): SharedPeerState {
  let s = sharedByPeer.get(peerId);
  if (!s) {
    s = { listeners: [], ticking: false };
    sharedByPeer.set(peerId, s);
  }
  return s;
}

async function tryFetch(url: string, init?: RequestInit) {
  try { return await fetch(url, init); } catch { return null; }
}

export class AxlClient {
  private state: SharedPeerState;

  constructor(private cfg: AxlConfig) {
    this.state = stateFor(cfg.peerId);
  }

  /** Send a JSON envelope to a peer over the AXL mesh. */
  async send(toPeer: string, channel: string, payload: unknown): Promise<void> {
    const env: AxlEnvelope = { channel, from: this.cfg.peerId, payload, ts: Date.now() };
    const r = await tryFetch(`${this.cfg.url}/send`, {
      method: "POST",
      headers: {
        "X-Destination-Peer-Id": toPeer,
        "content-type": "application/octet-stream",
      },
      body: JSON.stringify(env),
    });
    if (!r || !r.ok) {
      // remote AXL unreachable → in-process fallback (dev only)
      const q = memQueues.get(toPeer) ?? [];
      q.push(env);
      memQueues.set(toPeer, q);
    }
  }

  /** Subscribe to envelopes matching a predicate. Returns unsubscribe fn. */
  subscribe(pred: Pred, cb: Listener): () => void {
    this.state.listeners.push({ pred, cb });
    this.ensurePolling();
    return () => {
      this.state.listeners = this.state.listeners.filter((l) => l.cb !== cb);
      if (this.state.listeners.length === 0 && this.state.pollHandle) {
        clearInterval(this.state.pollHandle);
        this.state.pollHandle = undefined;
      }
    };
  }

  /** Topology probe — returns our peer id from the live AXL node. */
  async topology(): Promise<{ our_public_key: string; peers: unknown[] } | null> {
    const r = await tryFetch(`${this.cfg.url}/topology`);
    if (!r || !r.ok) return null;
    return (await r.json()) as { our_public_key: string; peers: unknown[] };
  }

  /** ---- private: shared poll loop, dispatches one envelope to all matching listeners ---- */

  private ensurePolling(intervalMs = 250) {
    if (this.state.pollHandle) return;
    this.state.pollHandle = setInterval(() => {
      if (this.state.ticking) return;
      this.state.ticking = true;
      this.tick().finally(() => { this.state.ticking = false; });
    }, intervalMs);
  }

  private async tick() {
    // 1) drain real AXL /recv until 204
    for (;;) {
      const r = await tryFetch(`${this.cfg.url}/recv`);
      if (!r) break;
      if (r.status === 204) break;
      if (!r.ok) break;
      const text = await r.text();
      let env: AxlEnvelope | null = null;
      try { env = JSON.parse(text) as AxlEnvelope; } catch { env = null; }
      if (env) this.dispatch(env);
    }
    // 2) drain in-process fallback queue addressed to us
    const local = memQueues.get(this.cfg.peerId) ?? [];
    if (local.length) {
      memQueues.set(this.cfg.peerId, []);
      for (const e of local) this.dispatch(e);
    }
  }

  private dispatch(env: AxlEnvelope) {
    for (const { pred, cb } of this.state.listeners) {
      if (pred(env.channel)) {
        try { cb(env); } catch (e) { console.error("[axl] listener error", e); }
      }
    }
  }
}
