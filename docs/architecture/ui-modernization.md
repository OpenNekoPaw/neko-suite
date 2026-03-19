# UI 现代化分析

> 分析日期：2026-03-19

## 概述

neko-suite 各子包的 UI 实现存在**样式方案分裂**：6 个包采用 Tailwind + 共享 preset 的现代方案，3 个包仍使用手写 CSS。全局缺少共享 UI 组件库，控件在各包间重复实现。高对比度主题全面缺失。

---

## 全包状态矩阵

| 包 | CSS 方案 | Tailwind | VSCode 主题集成 | 高对比度 | 成熟度 |
|---|---|---|---|---|---|
| neko-cut | Tailwind + 少量自定义 CSS (321行) | ✅ 共享 preset | ✅ 完整 | ❌ 隐式 | 🟢 现代 |
| neko-agent | Tailwind + 极少自定义 CSS | ✅ 共享 preset | ✅ 完整 | ❌ 隐式 | 🟢 现代 |
| neko-canvas | Tailwind + 自定义属性 | ✅ 共享 preset | ✅ 完整 | ❌ 隐式 | 🟢 现代 |
| neko-model | Tailwind（大量内联 `bg-[var(...)]`） | ✅ 共享 preset | ✅ 但冗余 | ❌ 隐式 | 🟡 中等 |
| neko-sketch | 自定义 CSS + Tailwind 混合 (112行) | ✅ 共享 preset | ✅ 自有变量 `--sketch-*` | ❌ | 🟡 中等 |
| neko-tools | 极简 CSS (15行) | ✅ 共享 preset | ✅ | ❌ | 🟢 现代 |
| **neko-preview** | **纯自定义 CSS (1009行)** | **❌** | **✅ 37个变量** | **❌** | **🟡 遗留** |
| **neko-audio** | **纯自定义 CSS (401行)** | **❌** | **✅ 21个变量** | **❌** | **🔴 遗留** |
| **neko-story** | **纯自定义 CSS (229行)** | **❌** | **⚠️ 硬编码颜色** | **❌** | **🔴 遗留** |

### 两大阵营

- **现代派**（6包）：Tailwind + `nekoTailwindPreset` + `@neko/shared/theme/tokens.ts`
- **遗留派**（3包）：手写 CSS + 包级自定义变量（`--neko-audio-*`）或硬编码颜色

---

## 核心问题

### 1. 无共享 UI 组件库

- 进度条/滑块/音量控件/速度选择器在 audio 和 video 中各自实现
- 按钮、面板、工具栏在 neko-sketch / neko-model / neko-canvas 中重复编写
- neko-model 的 `SceneTree` / `TransformPanel` / `FaceEditorPanel` 有相同的侧边栏样式模式

### 2. 高对比度主题全面缺失

- 所有包均依赖 VSCode 隐式注入，无显式 `vscode-high-contrast` 适配
- Canvas 渲染组件（波形/频谱）的颜色不会自动跟随高对比度变量

### 3. neko-story 主题隔离

- 硬编码 `#1e1e1e` / `#d4d4d4`，未接入 VSCode 主题变量体系

### 4. neko-model 内联样式冗余

- 大量重复的 `bg-[var(--vscode-sideBar-background,#252526)]` 内联 Tailwind
- 多个面板组件有相同的侧边栏/面板样式模式，未提取为组件类

---

## 各包详细分析

### neko-preview（音频播放器 — 已完成 Phase 1-5）

**已完成**：Apple Music 风格布局、封面/歌词/波形/频谱四视图、FFmpeg 元数据提取（ID3/Vorbis 标签 + 封面流）、LRC 歌词同步（滚动高亮 + 渐隐遮罩）、AnalyserNode 频谱可视化、嵌入歌词提取。

**架构**：
- `player.css`（1009行）定义 37 个 `--neko-audio-*` CSS 变量，映射到 `var(--vscode-*)`
- 6 个 React 组件：AudioPlayer / AudioControls / WaveformCanvas / SpectrumCanvas / CoverView / LyricsView
- Canvas 组件通过 `getComputedStyle` 读取 CSS 变量实现主题感知

**待完成（风格主题优化）**：
- [ ] 统一 `--neko-audio-*` → `--neko-preview-*`，覆盖 audio + video
- [ ] 深色/浅色主题适配验证（canvas 颜色跟随）
- [ ] 视频控件样式对齐音频控件（进度条/音量/速度复用 shared 组件）
- [ ] 高对比度主题支持

### neko-preview（视频播放器）

- `VideoPlayer.tsx`（~730 LOC）：H.264 解码、Canvas 渲染、A/V 同步
- `VideoControls.tsx`（~230 LOC）：YouTube 风格控制条（进度条 + 按钮行）
- 样式在 `player.css` 中与音频共享，但控件实现完全独立
- 与音频播放器的进度条/音量/速度控件存在明显重复

### neko-audio（音频编辑器）

- `editor.css`（401行）：BEM 命名（`audio-editor__*`），21 个 CSS 变量
- 未使用 Tailwind，未接入共享 preset
- 按钮/工具栏/滑块与 neko-preview 重复实现

### neko-story（剧本编辑器）

- `screenplay.css`（229行）+ `print.css`（120行）
- 硬编码深色主题颜色，未使用 `var(--vscode-*)`
- 领域特殊性强（Fountain 剧本格式排版），不适合全面迁移 Tailwind
- 最小改动：颜色值替换为 VSCode 变量即可

### neko-cut（视频编辑器）

- 最成熟的现代实现：Tailwind + 共享 preset + 321 行自定义 CSS
- 52 个组件文件，按功能模块组织（Timeline / PropertyPanel / ColorCorrection / Subtitles / AssetLibrary）
- VSCode 按钮/输入框/列表项有统一的 `.vscode-*` 类
- 可作为共享组件提取的参考来源

### neko-agent（AI 助手）

- 纯 Tailwind 实现，极少自定义 CSS
- 使用 `color-mix()` 实现状态指示器颜色混合
- 组件设计成熟：ChatView / MessageItem / CodeBlock / TaskCard
- 高级技巧：渐变背景、SVG `currentColor` 自动主题继承

### neko-canvas / neko-model / neko-sketch

- 均使用 Tailwind + 共享 preset
- neko-model 内联样式冗余最严重，需提取组件类
- neko-sketch 有独立的 `--sketch-*` 变量体系，与全局 token 不统一
- neko-canvas 平衡最好：Tailwind + 领域自定义属性

---

## 现代化优先级

### P0 — neko-preview 风格主题优化

已在 TODO 中规划，直接推进：
1. `--neko-audio-*` → `--neko-preview-*` 统一命名
2. 提取 audio/video 共享控件（ProgressBar / VolumeSlider / SpeedSelector）
3. 高对比度 CSS 变量适配
4. 深浅主题 canvas 颜色验证

### P1 — 遗留包主题接入

**neko-audio**：
- 401 行自定义 CSS → Tailwind 迁移
- 接入 `nekoTailwindPreset`
- 与 neko-preview 共享滑块/按钮组件

**neko-story**：
- 硬编码颜色 → `var(--vscode-*)` 变量替换
- 保留领域特殊排版，不强制迁移 Tailwind

### P2 — 共享 UI 组件提取

从 neko-preview / neko-cut 提取通用组件到 `@neko/shared` L2 React 层：
- `Slider` — 进度条/音量/参数滑块
- `IconButton` — 图标按钮（播放/暂停/全屏等）
- `SpeedSelector` — 播放速度选择
- `Panel` — 侧边栏面板容器
- `Toolbar` — 工具栏容器

### P2 — 内联样式整理

- neko-model：重复的 `bg-[var(...)]` → 提取为 Tailwind `@apply` 组件类
- neko-sketch：emoji 图标 → 统一图标方案；`--sketch-*` → 考虑对齐全局 token

### P3 — 全局高对比度主题

- 在 `@neko/shared/theme` 添加高对比度 token 层
- Canvas 组件检测 `vscode-high-contrast` body class 并切换颜色
- 各包逐步适配

---

## 主题基础设施

```
@neko/shared/theme/
├── tokens.ts          — 100+ VSCode CSS 变量映射（所有 Tailwind 包共享）
├── tailwind-preset.ts — nekoTailwindPreset（统一 Tailwind 配置）
└── types.ts           — 主题类型定义

各包接入方式：
├── 现代派：tailwind.config.js → nekoTailwindPreset → tokens.ts
└── 遗留派：手写 CSS → var(--vscode-*) 直接引用（或硬编码）
```

## 关键文件路径

| 文件 | 说明 |
|------|------|
| `packages/neko-types/src/theme/tokens.ts` | VSCode CSS 变量映射（权威源） |
| `packages/neko-types/src/theme/tailwind-preset.ts` | 共享 Tailwind preset |
| `packages/neko-preview/packages/webview/src/styles/player.css` | 音频/视频播放器样式（1009行） |
| `packages/neko-audio/packages/webview/src/styles/editor.css` | 音频编辑器样式（401行） |
| `packages/neko-story/packages/webview/src/styles/screenplay.css` | 剧本样式（229行） |
| `packages/neko-cut/packages/webview/src/index.css` | 视频编辑器样式（321行，参考实现） |
