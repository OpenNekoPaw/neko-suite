#!/bin/bash

# Neko Suite Build Script
set -e

echo "🔨 Building Neko Suite..."

# 避免写入全局 ~/.npm 缓存导致权限问题
export npm_config_cache="${PWD}/.npm-cache"

# 抑制 pnpm 配置项在 npm 中的警告
export npm_config_loglevel=error

# =============================================================================
# Extension classification
# =============================================================================

# Release-ready extensions (included in --all builds)
RELEASE_PACKAGES=(
  "neko-engine"
  "neko-tools"
  "neko-cut"
  "neko-canvas"
  "neko-agent"
  "neko-story"
  "neko-sketch"
  "neko-audio"
  "neko-assets"
)

# Development-only extensions (only included in --dev builds)
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
while [[ $# -gt 0 ]]; do
  case $1 in
    --all) BUILD_ALL=1; shift ;;
    --dev) BUILD_DEV=1; shift ;;
    --package) BUILD_PACKAGE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./build.sh [options]"
      echo ""
      echo "Options:"
      echo "  --all              Build release-ready extensions (${#RELEASE_PACKAGES[@]} packages)"
      echo "  --dev              Build ALL extensions including dev-only (${#RELEASE_PACKAGES[@]} + ${#DEV_ONLY_PACKAGES[@]} packages)"
      echo "  --package <name>   Build specific package (e.g., neko-cut)"
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
# Build functions
# =============================================================================

# Clean previous builds
clean_builds() {
  echo "🧹 Cleaning previous builds..."
  rm -rf packages/neko-*/dist
  rm -f packages/neko-*/*.vsix
  rm -f neko-*.vsix
}

# Install dependencies
install_deps() {
  ROOT_TSC="node_modules/.bin/tsc"
  ROOT_VITE="node_modules/.bin/vite"
  if [ ! -x "$ROOT_TSC" ] || [ ! -x "$ROOT_VITE" ]; then
    echo "📦 Installing dependencies..."
    npm install
  fi
}

# Build UI packages (webview, canvas, assistant)
build_ui() {
  echo "🧩 Building webview..."
  npm -w @neko/webview run build

  echo "🎨 Building canvas..."
  npm -w @neko/canvas run build

  echo "🤖 Building agent webview..."
  npm -w @neko-agent/webview run build
}

# Build effects-core
build_effects() {
  echo "✨ Building effects-core..."
  npm -w @neko/effects-core run build
}

# Build Rust native addon
build_rust() {
  echo "🦀 Building Rust native addon..."
  npm -w @neko/native-napi run build
}

# Build single neko package
build_neko_package() {
  local pkg=$1
  echo "⚙️  Building $pkg..."
  npm -w "$pkg" run compile
}

# Package single extension
package_extension() {
  local pkg=$1
  local pkg_dir="packages/$pkg"
  echo "📦 Packaging $pkg..."
  (
    cd "$pkg_dir"
    npx @vscode/vsce package --allow-missing-repository --no-dependencies
  )
  cp -f "$pkg_dir"/*.vsix . 2>/dev/null || true
}

# Build a list of packages
build_package_list() {
  local packages=("$@")
  for pkg in "${packages[@]}"; do
    build_neko_package "$pkg"
    package_extension "$pkg"
  done
}

# =============================================================================
# Main build flow
# =============================================================================

main() {
  if [ -n "$BUILD_PACKAGE" ]; then
    # Build single package
    install_deps
    build_ui
    build_neko_package "$BUILD_PACKAGE"
    package_extension "$BUILD_PACKAGE"
  elif [ "$BUILD_DEV" = "1" ]; then
    # Build ALL packages (release + dev-only)
    clean_builds
    install_deps
    build_effects
    build_ui
    build_rust
    build_package_list "${RELEASE_PACKAGES[@]}" "${DEV_ONLY_PACKAGES[@]}"
    package_extension "neko-suite"
    echo ""
    echo "⚠️  Dev build: includes neko-live, neko-model (not release-ready)"
  elif [ "$BUILD_ALL" = "1" ]; then
    # Build release-ready packages only
    clean_builds
    install_deps
    build_effects
    build_ui
    build_rust
    build_package_list "${RELEASE_PACKAGES[@]}"
    package_extension "neko-suite"
  else
    # Default: build neko-cut only
    install_deps
    build_ui
    build_neko_package "neko-cut"
    package_extension "neko-cut"
  fi

  echo ""
  echo "✅ Build complete!"
  echo ""
  ls -la neko-*.vsix 2>/dev/null || echo "No VSIX files generated."
}

main
