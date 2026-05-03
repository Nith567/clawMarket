#!/usr/bin/env bash
# Launch 4 AXL nodes in parallel — one per persona.
# Logs to logs/<name>.log. Stop with stop-all.sh.

set -e
cd "$(dirname "$0")"

AXL_BIN="${AXL_BIN:-/Users/nithinreddy/Desktop/eth/axl-main/node}"
if [ ! -x "$AXL_BIN" ]; then
  echo "❌ AXL binary not found at $AXL_BIN — set AXL_BIN env or 'make build' in axl-main"
  exit 1
fi

mkdir -p logs pids
for name in translator researcher coder poster; do
  echo "▶ starting $name (port $(jq -r .api_port $name/node-config.json))"
  (cd "$name" && "$AXL_BIN" -config node-config.json) > "logs/$name.log" 2>&1 &
  echo $! > "pids/$name.pid"
done

echo ""
echo "✅ 4 AXL nodes launched. Tail logs:"
echo "   tail -f logs/translator.log"
echo "   tail -f logs/poster.log"
echo ""
echo "Run 'tsx probe-peers.ts' (in agents/) to fetch each node's peer key."
