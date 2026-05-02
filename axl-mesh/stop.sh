#!/usr/bin/env bash
# Stop all 4 AXL nodes spawned by start.sh
set -euo pipefail
cd "$(dirname "$0")"

for n in poster translator researcher coder; do
  pids=$(pgrep -f "node -config configs/$n.json" || true)
  if [ -n "$pids" ]; then
    echo "→ killing $n (pids: $pids)"
    kill $pids 2>/dev/null || true
  fi
done
echo "✅ stopped"
