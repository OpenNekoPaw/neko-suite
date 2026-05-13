#!/bin/bash

# Neko Suite Build Script
# Uses Turborepo for caching + parallel builds
set -e

echo "🔨 Building Neko Suite..."

# =============================================================================
# Extension classification
# =============================================================================

# Release-ready extensions
RELEASE_PACKAGES=(
  "neko-engine"
  "neko-tools"
  "neko-preview"
  "neko-cut"
  "neko-canvas"
  "neko-agent"
  "neko-story"
  "neko-sketch"
  "neko-puppet"
  "neko-audio"
  "neko-assets"
  "neko-auth"
  "neko-market"
  "neko-dashboard"
)

# Development-only extensions
DEV_ONLY_PACKAGES=(
  "neko-live"
  "neko-model"
)

# =============================================================================
# Parse arguments
# =============================================================================

BUILD_ALL=0
BUILD_DEV=0
BUILD_PACKAGE=""
SKIP_PACKAGE=0
TARGET_PLATFORM=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --all) BUILD_ALL=1; shift ;;
    --dev) BUILD_DEV=1; shift ;;
    --package) BUILD_PACKAGE="$2"; shift 2 ;;
    --skip-package) SKIP_PACKAGE=1; shift ;;
    --target) TARGET_PLATFORM="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./build.sh [options]"
      echo ""
      echo "Options:"
      echo "  --all              Build release-ready extensions (${#RELEASE_PACKAGES[@]} packages)"
      echo "  --dev              Build ALL extensions including dev-only (+ ${#DEV_ONLY_PACKAGES[@]} packages)"
      echo "  --package <name>   Build specific package (e.g., neko-cut)"
      echo "  --target <platform> Platform target for neko-engine VSIX (darwin-arm64|darwin-x64|linux-x64|win32-x64)"
      echo "  --skip-package     Compile only, skip VSIX packaging"
      echo "  (no options)       Build neko-cut only (default)"
      echo ""
      echo "Release packages: ${RELEASE_PACKAGES[*]}"
      echo "Dev-only packages: ${DEV_ONLY_PACKAGES[*]}"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# =============================================================================
# Helper functions
# =============================================================================

# Build turbo --filter flags from package list
make_filters() {
  local filters=""
  for pkg in "$@"; do
    filters+=" --filter=${pkg}"
  done
  echo "$filters"
}

# Package single extension to VSIX
package_extension() {
  local pkg=$1
  local pkg_dir="packages/$pkg"
  if [ ! -d "$pkg_dir" ]; then
    echo "  ⚠️  $pkg_dir not found, skipping"
    return 0
  fi

  # neko-engine with --target: use platform-specific packaging
  if [ "$pkg" = "neko-engine" ] && [ -n "$TARGET_PLATFORM" ]; then
    echo "  📦 $pkg (platform: $TARGET_PLATFORM)"
    bash "$pkg_dir/scripts/package-platform.sh" "$TARGET_PLATFORM"
    cp -f "$pkg_dir"/*.vsix . 2>/dev/null || true
    return 0
  fi

  echo "  📦 $pkg"
  (cd "$pkg_dir" && npx @vscode/vsce package --allow-missing-repository --no-dependencies 2>/dev/null)
  cp -f "$pkg_dir"/*.vsix . 2>/dev/null || true
}

# Package a list of extensions
package_list() {
  echo ""
  echo "📦 Packaging VSIX..."
  for pkg in "$@"; do
    package_extension "$pkg"
  done
}

# =============================================================================
# Main
# =============================================================================

main() {
  local filters=""
  local packages=()

  if [ -n "$BUILD_PACKAGE" ]; then
    # Single package
    filters="--filter=${BUILD_PACKAGE}..."
    packages=("$BUILD_PACKAGE")
  elif [ "$BUILD_DEV" = "1" ]; then
    # All packages (release + dev-only)
    packages=("${RELEASE_PACKAGES[@]}" "${DEV_ONLY_PACKAGES[@]}")
    filters=$(make_filters "${packages[@]}")
  elif [ "$BUILD_ALL" = "1" ]; then
    # Release-ready only
    packages=("${RELEASE_PACKAGES[@]}")
    filters=$(make_filters "${packages[@]}")
  else
    # Default: neko-cut + dependencies
    filters="--filter=neko-cut..."
    packages=("neko-cut")
  fi

  # Turbo handles: dependency resolution, parallel execution, caching
  echo "⚡ Running turbo compile (cached + parallel)..."
  # shellcheck disable=SC2086
  pnpm turbo compile $filters

  # Package VSIX (not cacheable — depends on dist/ content)
  if [ "$SKIP_PACKAGE" = "0" ]; then
    package_list "${packages[@]}"

    # Also package neko-suite extension pack for full builds
    if [ "$BUILD_ALL" = "1" ] || [ "$BUILD_DEV" = "1" ]; then
      package_extension "neko-suite"
    fi
  fi

  echo ""
  echo "✅ Build complete!"
  if [ "$BUILD_DEV" = "1" ]; then
    echo "⚠️  Dev build: includes ${DEV_ONLY_PACKAGES[*]} (not release-ready)"
  fi
  echo ""
  ls -la neko-*.vsix 2>/dev/null || echo "No VSIX files generated."
}

main
