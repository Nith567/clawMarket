#!/usr/bin/env bash
# Start a 4-node AXL mesh on the local machine.
#
#   poster      api=9002  listen=9001  ← hub (others peer to this)
#   translator  api=9012  → poster
#   researcher  api=9022  → poster
#   coder       api=9032  → poster
#
# Each node uses a distinct ed25519 key; messages between agents are routed
# by Yggdrasil through the mesh (translator → poster, etc).
#
# Usage:
#   ./start.sh                 # generate keys (if missing) + launch all 4 nodes
#   ./stop.sh                  # kill them
#   ./discover.sh              # write mesh.json with each node's peer key

set -eo pipefail
cd "$(dirname "$0")"

# Resolve to absolute path so it works after `cd configs`
NODE_BIN_DEFAULT="$(cd .. && pwd)/../axl-main/node"
NODE_BIN="${NODE_BIN:-$NODE_BIN_DEFAULT}"
[ -x "$NODE_BIN" ] || { echo "❌ AXL binary not found at $NODE_BIN"; exit 1; }

mkdir -p keys logs

# Generate keys if missing
for n in poster translator researcher coder; do
  if [ ! -f "keys/$n.pem" ]; then
    echo "→ generating keys/$n.pem"
    openssl genpkey -algorithm ed25519 -out "keys/$n.pem"
  fi
done

# Boot poster first (it's the hub the others peer to)
order=(poster translator researcher coder)
for n in "${order[@]}"; do
  if pgrep -f "node -config configs/$n.json" > /dev/null; then
    echo "✓ $n already running"
    continue
  fi
  echo "→ starting $n ..."
  ( cd configs && "$NODE_BIN" -config "$n.json" > "../logs/$n.log" 2>&1 ) &
  echo "  pid=$! log=logs/$n.log"
  sleep 1   # give it a beat to bind ports before next one tries to peer
done

echo
echo "✅ AXL mesh up. Inspect topology with:"
echo "    curl -s http://127.0.0.1:9002/topology | jq"
echo "    curl -s http://127.0.0.1:9012/topology | jq"
echo "    curl -s http://127.0.0.1:9022/topology | jq"
echo "    curl -s http://127.0.0.1:9032/topology | jq"
echo
echo "Then run discovery to write mesh.json:"
echo "    ./discover.sh"
