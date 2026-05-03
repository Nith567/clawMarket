#!/usr/bin/env bash
# Query each node's /topology and write mesh.json — the SDK reads this to map
# agent labels → (axl URL, peer pubkey).
set -eo pipefail
cd "$(dirname "$0")"

NAMES=(poster translator researcher coder)
PORTS=(9002 9012 9022 9032)

echo "{" > mesh.json
for i in 0 1 2 3; do
  name=${NAMES[$i]}
  port=${PORTS[$i]}
  pubkey=$(curl -s --max-time 3 "http://127.0.0.1:$port/topology" | python3 -c "import json,sys; print(json.load(sys.stdin).get('our_public_key',''))" 2>/dev/null || echo "")
  if [ -z "$pubkey" ]; then
    echo "❌ $name (port $port) didn't respond — start it first"
    exit 1
  fi
  comma=","
  if [ $i -eq 3 ]; then comma=""; fi
  printf '  "%s": { "url": "http://127.0.0.1:%s", "peerId": "%s" }%s\n' "$name" "$port" "$pubkey" "$comma" >> mesh.json
  echo "  $name → $pubkey"
done
echo "}" >> mesh.json

echo
echo "✅ wrote mesh.json"
cat mesh.json
