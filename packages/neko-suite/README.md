# Neko Suite

> 门户总管：Extension Pack，一键安装完整创意工作套件

## Context Summary

- 项目：Neko Suite - VSCode 创意工作套件
- 架构：纯 Extension Pack，无代码逻辑，仅声明扩展依赖包

## Quick Reference

- **职责**：打包分发所有子扩展，用户一键安装即可获得完整功能
- **入口**：`package.json` 中的 `extensionPack` 字段
- **依赖**：无（纯 Extension Pack）

## Architecture

```
neko-suite (Extension Pack)
  ├── neko-engine     → GPU 媒体处理引擎（所有扩展依赖）
  ├── neko-tools      → 媒体 Diff 比较工具（基础工具）
  ├── neko-preview    → 轻量媒体预览器
  ├── neko-cut        → 专业视频剪辑器
  ├── neko-canvas     → 画布/节点图编辑器
  ├── neko-sketch     → 压感绘图工具（依赖 neko-canvas）
  ├── neko-audio      → 音频工作站
  ├── neko-agent      → AI Agent 助手
  ├── neko-live       → 虚拟制片/动捕直播
  ├── neko-story      → 剧本编辑器（LSP）
  └── neko-assets     → 资产管理（Git/LFS/云同步）
```

### 激活依赖链

```
neko-engine, neko-tools          ← 基础（无依赖）
neko-preview                     → neko-engine
neko-cut, neko-canvas, neko-agent → neko-engine + neko-tools
neko-sketch                      → neko-canvas
```

### 按需安装方式

```bash
# 完整安装（推荐）
ext install neko.neko-suite

# 最小视频编辑
ext install neko.neko-engine neko.neko-cut

# 仅 AI 助手
ext install neko.neko-agent
```
