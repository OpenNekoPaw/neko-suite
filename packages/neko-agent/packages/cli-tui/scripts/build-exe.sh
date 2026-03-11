#!/bin/sh
# Build neko standalone binary using bun compile.
# Searches for bun in PATH, common install locations, and BUN_BIN env variable.
set -e

if [ -n "$BUN_BIN" ]; then
  BUN="$BUN_BIN"
elif command -v bun >/dev/null 2>&1; then
  BUN="bun"
elif [ -x "$HOME/.bun/bin/bun" ]; then
  BUN="$HOME/.bun/bin/bun"
else
  echo "error: bun not found. Install with: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
exec "$BUN" run build-neko.ts
