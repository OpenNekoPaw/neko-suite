#!/bin/bash
# Package neko-engine VSIX for a specific platform.
#
# Usage:
#   bash scripts/package-platform.sh <target>
#
# Targets:
#   darwin-arm64  darwin-x64  linux-x64  win32-x64
#
# Prerequisites:
#   - The .node native binary for the target must already be built
#   - FFmpeg must be available (Homebrew on macOS, system on Linux)
#   - Node.js / npm available

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENGINE_DIR="$(dirname "$SCRIPT_DIR")"
NAPI_DIR="$ENGINE_DIR/packages/native-napi"

# ── Parse target ──────────────────────────────────────────────────────────────

TARGET="${1:?Usage: package-platform.sh <darwin-arm64|darwin-x64|linux-x64|win32-x64>}"

# Map vsce target → .node filename
declare -A NODE_FILES=(
  [darwin-arm64]="neko-engine.darwin-arm64.node"
  [darwin-x64]="neko-engine.darwin-x64.node"
  [linux-x64]="neko-engine.linux-x64-gnu.node"
  [win32-x64]="neko-engine.win32-x64-msvc.node"
)

NODE_FILE="${NODE_FILES[$TARGET]:-}"
if [ -z "$NODE_FILE" ]; then
  echo "ERROR: Unknown target '$TARGET'"
  echo "Valid targets: ${!NODE_FILES[*]}"
  exit 1
fi

echo "🔨 Packaging neko-engine for: $TARGET"
echo ""

# ── Step 1: Verify .node exists ──────────────────────────────────────────────

if [ ! -f "$NAPI_DIR/$NODE_FILE" ]; then
  echo "ERROR: $NAPI_DIR/$NODE_FILE not found."
  echo ""
  echo "Build native-napi first:"
  echo "  cd packages/native-napi"
  echo "  npm run build:ffmpeg-env"
  echo "  npx @napi-rs/cli build --platform --release"
  exit 1
fi

echo "✅ Native binary: $NODE_FILE ($(du -h "$NAPI_DIR/$NODE_FILE" | cut -f1))"

# ── Step 2: Clean other platforms' .node files ───────────────────────────────

echo "🧹 Cleaning other platform artifacts..."
for f in "$NAPI_DIR"/neko-engine.*.node; do
  [ ! -f "$f" ] && continue
  if [ "$(basename "$f")" != "$NODE_FILE" ]; then
    rm -f "$f"
    echo "   removed $(basename "$f")"
  fi
done

# ── Step 3: Download ORT dylib (target platform only) ───────────────────────

echo ""
echo "📦 Downloading ORT dylib..."
node "$SCRIPT_DIR/download-ort.js" --platform "$TARGET" --clean

# ── Step 4: Bundle FFmpeg dylibs ─────────────────────────────────────────────

echo ""
echo "📦 Bundling FFmpeg dylibs..."
node "$SCRIPT_DIR/bundle-ffmpeg.js" --platform "$TARGET"

# ── Step 5: Compile TypeScript ───────────────────────────────────────────────

echo ""
echo "⚙️  Compiling TypeScript..."
(cd "$ENGINE_DIR" && npm run compile)

# ── Step 6: Package VSIX ─────────────────────────────────────────────────────

echo ""
echo "📦 Creating platform VSIX..."
(cd "$ENGINE_DIR" && npx @vscode/vsce package --no-dependencies --target "$TARGET")

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
VSIX_FILE=$(ls -t "$ENGINE_DIR"/*.vsix 2>/dev/null | head -1)
if [ -n "$VSIX_FILE" ]; then
  echo "✅ VSIX: $(basename "$VSIX_FILE") ($(du -h "$VSIX_FILE" | cut -f1))"
else
  echo "⚠️  No VSIX file generated"
  exit 1
fi
