#!/bin/bash

# Neko Suite Install Script
set -e

echo "🐱 Neko Suite Installer"
echo ""

# =============================================================================
# Extension classification (must match build.sh)
# =============================================================================

# Core infrastructure (always installed with any pack)
CORE_PACKAGES=(
  "neko-engine"
  "neko-tools"
  "neko-preview"
  "neko-assets"
  "neko-auth"
  "neko-agent"
  "neko-market"
)

# Scene pack definitions (excluding core — auto-included)
VIDEO_PACKAGES=("neko-cut" "neko-canvas" "neko-story")
TWOD_PACKAGES=("neko-sketch")
AUDIO_PACKAGES=("neko-audio")

# Dev-only extensions (only included in --dev builds)
DEV_ONLY_PACKAGES=("neko-live" "neko-model")

# Release-ready packages = core + all scene packages
RELEASE_PACKAGES=(
  "${CORE_PACKAGES[@]}"
  "${VIDEO_PACKAGES[@]}"
  "${TWOD_PACKAGES[@]}"
  "${AUDIO_PACKAGES[@]}"
)

# =============================================================================
# Parse arguments
# =============================================================================

INSTALL_ALL=0
INSTALL_DEV=0
INSTALL_PACKAGE=""
PACKS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --all) INSTALL_ALL=1; shift ;;
    --dev) INSTALL_DEV=1; shift ;;
    --pack)
      PACKS+=("$2"); shift 2 ;;
    --package) INSTALL_PACKAGE="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: ./install.sh [options]"
      echo ""
      echo "Options:"
      echo "  --pack <name>      Install scene pack (video, 2d, audio). Repeatable."
      echo "  --all              Install all release-ready extensions (${#RELEASE_PACKAGES[@]} packages)"
      echo "  --dev              Install ALL extensions including dev-only (+ ${#DEV_ONLY_PACKAGES[@]} packages)"
      echo "  --package <name>   Install single package (e.g., neko-cut)"
      echo "  (no options)       Interactive selection menu"
      echo ""
      echo "Scene packs (auto-include core: ${CORE_PACKAGES[*]}):"
      echo "  video              AIGC video: cut + canvas + story"
      echo "  2d                 2D creation: sketch"
      echo "  audio              Audio workstation: audio"
      echo ""
      echo "Examples:"
      echo "  ./install.sh --pack video            # 10 extensions"
      echo "  ./install.sh --pack video --pack 2d  # 11 extensions (shared core)"
      echo "  ./install.sh --all                   # All release-ready"
      echo ""
      echo "Dev-only packages (--dev): ${DEV_ONLY_PACKAGES[*]}"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# =============================================================================
# Helper functions
# =============================================================================

# Install single package from VSIX
install_package() {
  local pkg=$1
  local vsix_file
  vsix_file=$(ls -t "${pkg}"-*.vsix "packages/${pkg}/${pkg}"-*.vsix 2>/dev/null | head -1)

  if [ -z "$vsix_file" ]; then
    echo "  ⚠️  No VSIX for $pkg (run ./build.sh first)"
    return 1
  fi

  echo "  📦 $pkg ← $vsix_file"
  code --install-extension "$vsix_file" --force 2>/dev/null
}

# Uninstall package
uninstall_package() {
  local pkg=$1
  code --uninstall-extension "neko.$pkg" 2>/dev/null || true
}

# Install a list of packages
install_list() {
  local packages=("$@")
  local success=0
  local fail=0

  for pkg in "${packages[@]}"; do
    uninstall_package "$pkg"
    if install_package "$pkg"; then
      ((success++))
    else
      ((fail++))
    fi
  done

  echo ""
  echo "  ✅ Installed: $success  ⚠️  Skipped: $fail"
}

# Deduplicate array
dedup_array() {
  printf '%s\n' "$@" | sort -u
}

# =============================================================================
# Interactive menu (no arguments)
# =============================================================================

interactive_menu() {
  echo "Neko Suite 安装向导"
  echo "─────────────────────"
  echo "请选择你的创作方向（输入编号，可多选逗号分隔）："
  echo ""
  echo "[1] 🎬 AIGC 视频制作    素材→剧本→分镜→AI生成→剪辑"
  echo "[2] 🎨 2D 插画/动画     压感手绘 + 骨骼动画 + AI 辅助"
  echo "[3] 🎵 音频编辑         波形编辑 + 效果链 + 频谱分析"
  echo "[4] 🔧 全部安装         全量 release 功能"
  echo ""
  echo "所有选项自动包含 AI Agent + 资产管理 + 市场等基础设施"
  echo ""
  read -rp "选择 [1-4]: " choices

  IFS=',' read -ra SELECTIONS <<< "$choices"
  for sel in "${SELECTIONS[@]}"; do
    sel=$(echo "$sel" | tr -d ' ')
    case $sel in
      1) PACKS+=("video") ;;
      2) PACKS+=("2d") ;;
      3) PACKS+=("audio") ;;
      4) INSTALL_ALL=1 ;;
      *) echo "⚠️  忽略无效选项: $sel" ;;
    esac
  done

  if [ ${#PACKS[@]} -eq 0 ] && [ "$INSTALL_ALL" -eq 0 ]; then
    echo "未选择任何选项，退出。"
    exit 0
  fi
}

# =============================================================================
# Resolve packs to package list
# =============================================================================

resolve_packs() {
  local all_packages=()

  # Always include core
  all_packages+=("${CORE_PACKAGES[@]}")

  for pack in "${PACKS[@]}"; do
    case $pack in
      video)  all_packages+=("${VIDEO_PACKAGES[@]}") ;;
      2d)     all_packages+=("${TWOD_PACKAGES[@]}") ;;
      audio)  all_packages+=("${AUDIO_PACKAGES[@]}") ;;
      *)      echo "⚠️  Unknown pack: $pack"; exit 1 ;;
    esac
  done

  # Deduplicate
  mapfile -t RESOLVED < <(dedup_array "${all_packages[@]}")
}

# =============================================================================
# Main
# =============================================================================

main() {
  # No arguments → interactive menu
  if [ -z "$INSTALL_PACKAGE" ] && [ "$INSTALL_ALL" -eq 0 ] && [ "$INSTALL_DEV" -eq 0 ] && [ ${#PACKS[@]} -eq 0 ]; then
    interactive_menu
  fi

  if [ -n "$INSTALL_PACKAGE" ]; then
    # Single package
    echo "📦 Installing $INSTALL_PACKAGE..."
    uninstall_package "$INSTALL_PACKAGE"
    install_package "$INSTALL_PACKAGE"
  elif [ "$INSTALL_DEV" = "1" ]; then
    # Dev: all release + dev-only
    echo "🔧 Installing ALL extensions (release + dev-only)..."
    echo ""
    install_list "${RELEASE_PACKAGES[@]}" "${DEV_ONLY_PACKAGES[@]}"
    echo ""
    echo "⚠️  Dev build: includes ${DEV_ONLY_PACKAGES[*]} (not release-ready)"
  elif [ "$INSTALL_ALL" = "1" ]; then
    # All release-ready
    echo "📦 Installing all release-ready extensions..."
    echo ""
    install_list "${RELEASE_PACKAGES[@]}"
  elif [ ${#PACKS[@]} -gt 0 ]; then
    # Scene packs
    resolve_packs
    echo "📦 Installing packs: ${PACKS[*]} (${#RESOLVED[@]} extensions)..."
    echo ""
    install_list "${RESOLVED[@]}"
  fi

  echo ""
  echo "✅ Installation complete!"
  echo "💡 Reload VSCode to activate the extension(s)."
}

main
