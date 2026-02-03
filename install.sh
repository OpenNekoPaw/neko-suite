#!/bin/bash

# Neko Creative Suite Install Script
set -e

echo "🐱 Neko Creative Suite Installer"
echo ""

# Parse arguments
INSTALL_ALL=0
INSTALL_PACKAGE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --all) INSTALL_ALL=1; shift ;;
    --package) INSTALL_PACKAGE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./install.sh [options]"
      echo ""
      echo "Options:"
      echo "  --all              Install all neko packages"
      echo "  --package <name>   Install specific package (e.g., neko-cut)"
      echo "  (no options)       Install neko-cut only (default)"
      echo ""
      echo "Available packages:"
      echo "  neko-cut           Video editor (base)"
      echo "  neko-canvas        Canvas editor"
      echo "  neko-agent         AI assistant"
      echo "  neko-server        Media processing server"
      echo "  neko-tools         Media diff tools"
      echo "  neko-story         Storyboard editor"
      echo "  neko-sketch        Drawing tools"
      echo "  neko-audio         Audio workstation"
      echo "  neko-live          Virtual production"
      echo "  neko-script        Script editor"
      echo "  neko-assets        Asset management"
      echo "  neko-creative-suite Extension pack (all)"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Install single package
install_package() {
  local pkg=$1
  local vsix_file=$(ls -t ${pkg}-*.vsix packages/${pkg}/${pkg}-*.vsix 2>/dev/null | head -1)

  if [ -z "$vsix_file" ]; then
    echo "❌ No VSIX file found for $pkg. Run ./build.sh --package $pkg first."
    return 1
  fi

  echo "📦 Installing $vsix_file..."
  code --install-extension "$vsix_file" --force
}

# Uninstall package
uninstall_package() {
  local pkg=$1
  echo "🗑️  Uninstalling neko.$pkg..."
  code --uninstall-extension "neko.$pkg" 2>/dev/null || true
}

# Install all packages
install_all() {
  local packages=(
    "neko-server"
    "neko-cut"
    "neko-canvas"
    "neko-agent"
    "neko-tools"
    "neko-story"
    "neko-sketch"
    "neko-audio"
    "neko-live"
    "neko-script"
    "neko-assets"
  )

  echo "📦 Installing all Neko packages..."
  echo ""

  for pkg in "${packages[@]}"; do
    uninstall_package "$pkg"
    install_package "$pkg" || true
  done

  echo ""
  echo "✅ All packages installed!"
}

# Main
if [ -n "$INSTALL_PACKAGE" ]; then
  uninstall_package "$INSTALL_PACKAGE"
  install_package "$INSTALL_PACKAGE"
elif [ "$INSTALL_ALL" = "1" ]; then
  install_all
else
  # Default: install neko-cut only
  uninstall_package "neko-cut"
  install_package "neko-cut"
fi

echo ""
echo "✅ Installation complete!"
echo "💡 Reload VSCode to activate the extension(s)."
