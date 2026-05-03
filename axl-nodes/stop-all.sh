#!/usr/bin/env bash
cd "$(dirname "$0")"
for f in pids/*.pid; do
  [ -e "$f" ] || continue
  pid=$(cat "$f")
  if kill "$pid" 2>/dev/null; then
    echo "stopped $(basename "$f" .pid) (pid $pid)"
  fi
  rm "$f"
done
