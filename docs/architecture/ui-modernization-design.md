# UI 现代化优化 — 设计方案

> 基于 [ui-modernization.md](./ui-modernization.md) 分析结论

---

## 目标

以 macOS 视觉语言为设计基准，结合 VSCode 主题配色系统，将 neko-suite 的 UI 统一为现代、精致、一致的视觉体验。技术栈统一为 React + Tailwind CSS。

### 设计理念

**macOS 视觉语言核心特征**：
- 毛玻璃（Frosted Glass）：`backdrop-filter: blur()` + 半透明背景
- 分层透明度：前景实体 → 中间层半透明 → 背景模糊，营造深度感
- 柔和渐变：微妙的线性渐变替代纯色块，增加质感
- 圆润圆角：大圆角（12-16px）用于卡片/面板，中圆角（8px）用于按钮/输入框
- 分层阴影：双层 shadow（大范围柔和 + 小范围锐利）模拟真实光照
- 流畅动效：0.15-0.3s 过渡，弹性缩放反馈

**与 VSCode 的融合策略**：
- 颜色从 `var(--vscode-*)` 派生，确保跟随用户主题
- 通过 `color-mix()` 和 `rgba` 在 VSCode 基色上叠加 macOS 质感
- 高对比度模式下回退为纯色 + 边框，不使用透明/模糊效果

---

## Phase 0：neko-preview Tailwind 基础设施接入

### 0.1 现状

neko-preview 是唯一未接入 Tailwind 的主要 webview 包。当前使用 1009 行手写 CSS（`player.css`），无 `tailwind.config.js`、无 `postcss.config.js`。

### 0.2 接入步骤 ✅

1. 添加 `tailwindcss` / `postcss` / `autoprefixer` devDependencies
2. 创建 `tailwind.config.js`（引用 `nekoTailwindPreset`，content 扫描 `video.html` / `audio.html` / `src/**/*.{tsx,ts}`）
3. 创建 `postcss.config.js`
4. 在 `player.css` 顶部添加 `@tailwind base/components/utilities` 指令

### 0.3 Tailwind + CSS 协作策略

**不是全面替换 CSS，而是分层协作**：

```
player.css 结构：
├── @tailwind base/components/utilities      — Tailwind 指令
├── @layer base { :root 主题变量 }            — CSS 变量定义 + 主题覆盖
├── @layer components {                       — 不可 Tailwind 化的工具类（~90 行）
│   ├── .neko-audio-bg                        — color-mix() 渐变背景
│   ├── .neko-cover-gradient                  — 封面占位符渐变
│   ├── .neko-fade-mask                       — mask-image 歌词渐隐
│   ├── .neko-scrollbar-hide                  — ::-webkit-scrollbar 隐藏
│   ├── .neko-slider                          — ::-webkit-slider-thumb 伪元素
│   └── .neko-*-bg / .neko-speed-border       — color-mix() 背景/边框
│ }
├── @keyframes neko-cover-pulse               — 自定义动画
└── 视频播放器 + 共享 controls CSS             — Phase 3 再迁移
```

**JSX 中只用 Tailwind 类 + 上述工具类**，不再使用 BEM 类名。

### 0.4 不可 Tailwind 化的 CSS 特性（保留为工具类）

| CSS 特性 | 原因 | 工具类 |
|---------|------|--------|
| `color-mix(in srgb, ...)` | Tailwind 颜色值必须静态，`color-mix()` 是运行时 CSS 函数 | `.neko-audio-bg` / `.neko-cover-gradient` / `.neko-*-bg` |
| `::-webkit-slider-thumb` | 伪元素需要多属性组合，Tailwind 语法过长 | `.neko-slider` |
| `mask-image: linear-gradient()` | Tailwind 无 `mask-image` 工具类 | `.neko-fade-mask` |
| `::-webkit-scrollbar` | Tailwind 不支持滚动条伪元素 | `.neko-scrollbar-hide` |
| `@keyframes` 自定义动画 | 非内置动画需自定义 | `@keyframes neko-cover-pulse` |
| CSS 变量作用域定义 | Tailwind 只能引用变量，不能定义 | `@layer base :root {}` |
| `body[data-vscode-theme-kind]` | Tailwind `dark:` 不支持自定义属性选择器 | `@layer base` 主题覆盖 |

---

## Phase 1：macOS 风格 Design Token 体系

### 1.1 扩展 `@neko/shared` 全局 Token

在 `tokens.ts` 中新增 macOS 质感相关的语义 token：

```typescript
// tokens.ts 新增
export const vscodeCSSTokens = {
  colors: {
    // ... 现有 token 保留 ...

    // === macOS Surface Tokens ===
    // 毛玻璃背景（各包通过 Tailwind bg-neko-glass 使用）
    'neko-glass': 'color-mix(in srgb, var(--vscode-editor-background) 70%, transparent)',
    'neko-glass-heavy': 'color-mix(in srgb, var(--vscode-editor-background) 85%, transparent)',
    'neko-glass-light': 'color-mix(in srgb, var(--vscode-editor-background) 50%, transparent)',

    // 表面层级
    'neko-surface-0': 'var(--vscode-editor-background)',
    'neko-surface-1': 'color-mix(in srgb, var(--vscode-editor-background) 95%, #fff 5%)',
    'neko-surface-2': 'color-mix(in srgb, var(--vscode-editor-background) 88%, #fff 8%)',

    // 悬浮/弹出层
    'neko-elevated': 'var(--vscode-editorWidget-background)',
    'neko-overlay': 'color-mix(in srgb, var(--vscode-editor-background) 80%, transparent)',
  },

  // ... fontFamily / fontSize 保留 ...

  // === macOS Effect Tokens（Tailwind extend 用）===
  borderRadius: {
    'neko-sm': '6px',
    'neko-md': '10px',
    'neko-lg': '14px',
    'neko-xl': '20px',
  },

  boxShadow: {
    'neko-sm': '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
    'neko-md': '0 4px 16px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)',
    'neko-lg': '0 8px 32px rgba(0,0,0,0.2), 0 2px 8px rgba(0,0,0,0.12)',
    'neko-xl': '0 16px 48px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.15)',
  },

  backdropBlur: {
    'neko-glass': '20px',
    'neko-glass-heavy': '40px',
  },
} as const;
```

### 1.2 扩展 Tailwind Preset

```typescript
// tailwind-preset.ts 更新
export const nekoTailwindPreset = {
  content: [] as string[],
  theme: {
    extend: {
      colors: { ...vscodeCSSTokens.colors },
      fontFamily: { ...vscodeCSSTokens.fontFamily },
      fontSize: { ...vscodeCSSTokens.fontSize },
      borderRadius: { ...vscodeCSSTokens.borderRadius },
      boxShadow: { ...vscodeCSSTokens.boxShadow },
      backdropBlur: { ...vscodeCSSTokens.backdropBlur },
    },
  },
};
```

### 1.3 Tailwind 使用示例

```tsx
{/* 毛玻璃面板 */}
<div className="bg-neko-glass backdrop-blur-neko-glass rounded-neko-lg shadow-neko-md border border-vscode-panel-border">
  ...
</div>

{/* 悬浮卡片 */}
<div className="bg-neko-elevated rounded-neko-md shadow-neko-lg">
  ...
</div>

{/* 控件按钮 */}
<button className="bg-neko-surface-1 hover:bg-neko-surface-2 rounded-neko-sm shadow-neko-sm
  transition-all duration-150 active:scale-95">
  ...
</button>
```

---

## Phase 1.5：neko-preview CSS 变量统一

### 变量重命名：`--neko-audio-*` → `--neko-preview-*`

**现状**：`player.css` 在 `.audio-player` 作用域内定义 9 个 `--neko-audio-*` 变量。视频播放器直接引用裸 `var(--vscode-*)`。

**方案**：提升到 `:root`，统一命名为 `--neko-preview-*`，同时融入 macOS 质感。

```css
:root {
  /* 背景：macOS 风格微妙渐变底色 */
  --neko-preview-bg: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 85%, #000);
  --neko-preview-surface: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 92%, #fff 5%);

  /* 强调色 */
  --neko-preview-accent: var(--vscode-button-background, #0e639c);
  --neko-preview-accent-hover: var(--vscode-button-hoverBackground, #1177bb);

  /* 文本 */
  --neko-preview-text-primary: var(--vscode-editor-foreground, #cccccc);
  --neko-preview-text-secondary: var(--vscode-descriptionForeground, #999);

  /* 边框 */
  --neko-preview-border: var(--vscode-panel-border, #333);

  /* 渐变 */
  --neko-preview-gradient-start: color-mix(in srgb, var(--vscode-button-background, #0e639c) 25%, var(--vscode-editor-background, #1e1e1e));
  --neko-preview-gradient-end: var(--neko-preview-bg);

  /* macOS 毛玻璃 */
  --neko-preview-glass: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 70%, transparent);
  --neko-preview-glass-blur: 20px;
}
```

**迁移**：全局替换 `--neko-audio-*` → `--neko-preview-*`（CSS ~40 处 + TSX getCssVar 7 处）。

### 主题覆盖层

```css
/* 浅色主题 */
body.vscode-light :root {
  --neko-preview-bg: color-mix(in srgb, var(--vscode-editor-background) 90%, #fff);
  --neko-preview-surface: color-mix(in srgb, var(--vscode-editor-background) 95%, #000 3%);
  --neko-preview-gradient-start: color-mix(in srgb, var(--vscode-button-background) 15%, var(--vscode-editor-background));
  --neko-preview-glass: color-mix(in srgb, var(--vscode-editor-background) 75%, transparent);
}

/* 高对比度 — 去掉透明/模糊/渐变，纯色 + 边框 */
body.vscode-high-contrast :root,
body.vscode-high-contrast-light :root {
  --neko-preview-bg: var(--vscode-editor-background);
  --neko-preview-surface: var(--vscode-editor-background);
  --neko-preview-accent: var(--vscode-button-background);
  --neko-preview-accent-hover: var(--vscode-button-hoverBackground);
  --neko-preview-text-primary: var(--vscode-editor-foreground);
  --neko-preview-text-secondary: var(--vscode-editor-foreground);
  --neko-preview-border: var(--vscode-contrastBorder, var(--vscode-panel-border));
  --neko-preview-gradient-start: var(--vscode-editor-background);
  --neko-preview-gradient-end: var(--vscode-editor-background);
  --neko-preview-glass: var(--vscode-editor-background);
  --neko-preview-glass-blur: 0px;
}

body.vscode-high-contrast .controls__btn,
body.vscode-high-contrast-light .controls__btn {
  border: 1px solid var(--vscode-contrastBorder);
}
```

---

## Phase 2：macOS 风格组件重构（React + Tailwind）✅

### 2.1 实施结果

删除 520 行 BEM CSS 规则，替换为 ~90 行 `@layer components` 工具类 + JSX 中的 Tailwind 类。CSS 体积从 33.5KB → 26.2KB（减少 22%）。

**迁移的组件**：

| 组件 | 改动 |
|------|------|
| AudioPlayer.tsx | BEM `audio-player__*` → Tailwind flex/padding/text + `.neko-audio-bg` 工具类 |
| AudioControls.tsx | BEM 按钮/滑块 → MacIconButton / MacButton / MacTabs / MacSlider 组件 |
| ProgressBar.tsx | BEM `controls__progress-*` → Tailwind group-hover + `.neko-progress-track-bg` |
| CoverView.tsx | BEM `audio-player__cover*` → Tailwind + inline style（`color-mix` 渐变） |
| LyricsView.tsx | BEM `audio-player__lyrics*` → Tailwind + `.neko-fade-mask` / `.neko-scrollbar-hide` |
| WaveformCanvas.tsx | `audio-player__waveform` → `w-full h-full` |
| SpectrumCanvas.tsx | `audio-player__spectrum-container` → Tailwind 类 |

### 2.2 新建的 macOS 风格共享组件

```
packages/neko-preview/packages/webview/src/shared/
├── MacButton.tsx       — 4 种变体（primary/secondary/ghost/icon）+ 3 种尺寸
├── MacIconButton.tsx   — 圆形图标按钮（default/primary 变体 + 4 种尺寸）
├── MacTabs.tsx         — 分段控件（毛玻璃背景 + 滑动活跃指示器）
├── MacSlider.tsx       — 滑块（使用 .neko-slider CSS 工具类）
├── ProgressBar.tsx     — 进度条（Tailwind group-hover 膨胀效果）
├── types.ts            — 消息协议类型
└── useVscodeMessage.ts — postMessage 通信 hook
```

### 2.3 CSS 工具类清单（`@layer components`）

| 工具类 | 用途 | 不可 Tailwind 原因 |
|--------|------|-------------------|
| `.neko-audio-bg` | 渐变背景 + CSS 变量定义 | `color-mix()` 运行时函数 |
| `.neko-cover-gradient` | 封面占位符渐变 | `color-mix()` |
| `.neko-fade-mask` | 歌词上下渐隐遮罩 | `mask-image` 无 Tailwind 类 |
| `.neko-scrollbar-hide` | 隐藏滚动条 | `::-webkit-scrollbar` 伪元素 |
| `.neko-slider` | 滑块轨道 + thumb 样式 | `::-webkit-slider-thumb` 伪元素 |
| `.neko-progress-track-bg` | 进度条轨道背景 | `color-mix()` |
| `.neko-speed-border` | 速度按钮边框 | `color-mix()` |
| `.neko-tabs-bg` | 标签栏背景 | `color-mix()` |
| `.neko-volume-track-bg` | 音量滑块轨道背景 | `color-mix()` |

---

## Phase 3：macOS 风格全局组件模式

定义可在所有包中复用的 macOS 视觉模式（通过 Tailwind 类组合，非独立组件）。

### 3.1 毛玻璃面板

适用于弹出层/浮动面板/右键菜单/Toast：

```tsx
<div className="bg-neko-glass backdrop-blur-neko-glass
  rounded-neko-md shadow-neko-lg border border-white/[0.08]">
  {children}
</div>
```

### 3.2 按钮体系

```tsx
{/* Primary：实心强调色 */}
<button className="px-4 py-1.5 rounded-neko-sm bg-vscode-button text-vscode-button-fg
  shadow-neko-sm hover:brightness-110 active:scale-[0.97] transition-all duration-150" />

{/* Secondary：毛玻璃 */}
<button className="px-4 py-1.5 rounded-neko-sm bg-neko-glass backdrop-blur-neko-glass
  text-vscode-fg border border-white/[0.08]
  hover:bg-neko-surface-1 active:scale-[0.97] transition-all duration-150" />

{/* Ghost：透明 hover */}
<button className="px-3 py-1.5 rounded-neko-sm text-vscode-description
  hover:bg-neko-surface-1 hover:text-vscode-fg active:scale-[0.97] transition-all duration-150" />

{/* Icon：圆形图标按钮 */}
<button className="w-8 h-8 flex items-center justify-center rounded-full
  text-vscode-description hover:text-vscode-fg hover:bg-neko-surface-1
  active:scale-90 transition-all duration-150" />
```

### 3.3 输入控件

```tsx
{/* 输入框 */}
<input className="w-full px-3 py-1.5 rounded-neko-sm
  bg-vscode-input-bg text-vscode-input-fg border border-vscode-input-border
  focus:border-vscode-accent focus:ring-1 focus:ring-vscode-accent/30
  transition-all duration-150 outline-none" />

{/* 滑块 */}
<input type="range" className="w-full h-1 appearance-none rounded-full bg-white/15
  [&::-webkit-slider-thumb]:appearance-none
  [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5
  [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
  [&::-webkit-slider-thumb]:shadow-neko-sm
  [&::-webkit-slider-thumb]:active:scale-110
  [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150" />
```

### 3.4 动效规范

| 场景 | 时长 | Tailwind |
|------|------|----------|
| hover 颜色变化 | 150ms | `transition-colors duration-150` |
| 按钮按压缩放 | 150ms | `active:scale-[0.97] transition-transform duration-150` |
| 面板展开/折叠 | 200ms | `transition-all duration-200` |
| 视图切换淡入 | 300ms | `transition-opacity duration-300` |
| 弹出层出现 | 150ms | `animate-in fade-in-0 zoom-in-95 duration-150` |

### 3.5 圆角规范

| 元素 | Token | 值 | 示例 |
|------|-------|-----|------|
| 大卡片/封面 | `rounded-neko-lg` | 14px | 专辑封面、模态框 |
| 面板/容器 | `rounded-neko-md` | 10px | 右键菜单、弹出面板 |
| 按钮/输入框 | `rounded-neko-sm` | 6px | 按钮、输入框、标签 |
| 胶囊/全圆 | `rounded-full` | 50% | 播放按钮、滑块 thumb |

### 3.6 阴影层级

| 层级 | Token | 用途 |
|------|-------|------|
| 微阴影 | `shadow-neko-sm` | 按钮、滑块 thumb、标签 |
| 中阴影 | `shadow-neko-md` | 面板、卡片、下拉菜单 |
| 大阴影 | `shadow-neko-lg` | 右键菜单、弹出层 |
| 超大阴影 | `shadow-neko-xl` | 模态框、封面卡片 |

---

## Phase 4：neko-audio Tailwind 迁移 + macOS 化（P1）

### 4.1 现状

`editor.css`（401 行）使用 21 个 `--neko-audio-editor-*` CSS 变量，已映射到 `var(--vscode-*)`。未使用 Tailwind。

### 4.2 方案

1. 接入 Tailwind（同 Phase 0 模式：添加 tailwind.config.js + postcss.config.js）
2. 渐进式迁移：新增/修改组件用 Tailwind，现有 CSS 逐步替换
3. 工具栏按钮、面板容器使用 Phase 3 定义的 macOS 组件模式
4. 添加高对比度 + 浅色主题覆盖

---

## Phase 5：neko-story 主题接入（P1）

### 5.1 现状

`screenplay.css`（229 行）硬编码深色颜色值（`#1e1e1e`、`#d4d4d4`、`#569cd6` 等），完全不响应 VSCode 主题切换。

### 5.2 方案：最小替换

```css
/* 替换映射 */
#1e1e1e  → var(--vscode-editor-background, #1e1e1e)
#d4d4d4  → var(--vscode-editor-foreground, #d4d4d4)
#569cd6  → var(--vscode-button-background, #569cd6)
#333     → var(--vscode-panel-border, #333)
```

保留 Fountain 剧本排版的领域特殊 CSS，仅替换颜色值。`print.css` 不改。
不迁移 Tailwind（剧本排版的领域 CSS 占比高，Tailwind 收益低）。

---

## Phase 5.5：macOS 风格 VSCode 主题配色（P1）

### 5.5.1 目标

提供 Neko macOS Light / Dark 两套颜色主题，让 VSCode 原生 UI（侧边栏/标签栏/状态栏等）的配色与 Webview 内的 macOS 风格统一。

### 5.5.2 放置位置

在 `neko-tools` 扩展的 `package.json` 中声明（主题是跨功能关注点，不绑定特定编辑器）：

```jsonc
// packages/neko-tools/package.json → contributes
"themes": [
  {
    "label": "Neko macOS Dark",
    "uiTheme": "vs-dark",
    "path": "./themes/neko-macos-dark-color-theme.json"
  },
  {
    "label": "Neko macOS Light",
    "uiTheme": "vs",
    "path": "./themes/neko-macos-light-color-theme.json"
  }
]
```

### 5.5.3 配色方案 — 暗色主题

基于 macOS Sonoma 暖灰色阶 + Apple 系统蓝（`#0A84FF`）：

```jsonc
{
  "name": "Neko macOS Dark",
  "type": "dark",
  "colors": {
    // ── 全局 ──
    "foreground": "#A3A2A2",
    "focusBorder": "#0A84FF",
    "selection.background": "#0A84FF40",
    "widget.shadow": "#00000040",

    // ── 编辑器 ──
    "editor.background": "#1C1C1E",
    "editor.foreground": "#FFFFFFD8",
    "editor.lineHighlightBackground": "#2C2C2E",
    "editor.selectionBackground": "#0A84FF40",
    "editor.findMatchBackground": "#FFD60A40",
    "editor.findMatchHighlightBackground": "#FFD60A20",
    "editorCursor.foreground": "#0A84FF",
    "editorLineNumber.foreground": "#48484A",
    "editorLineNumber.activeForeground": "#8E8E93",
    "editorIndentGuide.background": "#2C2C2E",
    "editorIndentGuide.activeBackground": "#48484A",
    "editorBracketMatch.background": "#0A84FF30",
    "editorBracketMatch.border": "#0A84FF",
    "editorRuler.foreground": "#2C2C2E",
    "editorGutter.addedBackground": "#30D158",
    "editorGutter.modifiedBackground": "#0A84FF",
    "editorGutter.deletedBackground": "#FF453A",

    // ── 侧边栏 ──
    "sideBar.background": "#2C2C2E",
    "sideBar.foreground": "#DEDEDE",
    "sideBar.border": "#1C1C1E",
    "sideBarTitle.foreground": "#EBEBEB",
    "sideBarSectionHeader.background": "#2C2C2E",
    "sideBarSectionHeader.foreground": "#8E8E93",

    // ── 活动栏 ──
    "activityBar.background": "#1C1C1E",
    "activityBar.foreground": "#0A84FF",
    "activityBar.inactiveForeground": "#636366",
    "activityBar.border": "#1C1C1E",
    "activityBar.activeBorder": "#0A84FF",
    "activityBarBadge.background": "#FF453A",
    "activityBarBadge.foreground": "#FFFFFF",

    // ── 标题栏 ──
    "titleBar.activeBackground": "#2C2C2E",
    "titleBar.activeForeground": "#DEDEDE",
    "titleBar.inactiveBackground": "#1C1C1E",
    "titleBar.inactiveForeground": "#636366",
    "titleBar.border": "#1C1C1E",

    // ── 标签页 ──
    "tab.activeBackground": "#1C1C1E",
    "tab.activeForeground": "#EBEBEB",
    "tab.activeBorderTop": "#0A84FF",
    "tab.inactiveBackground": "#2C2C2E",
    "tab.inactiveForeground": "#8E8E93",
    "tab.border": "#1C1C1E",
    "tab.hoverBackground": "#3A3A3C",
    "editorGroupHeader.tabsBackground": "#2C2C2E",

    // ── 面板 ──
    "panel.background": "#1C1C1E",
    "panel.border": "#2C2C2E",
    "panelTitle.activeForeground": "#EBEBEB",
    "panelTitle.activeBorder": "#0A84FF",
    "panelTitle.inactiveForeground": "#636366",

    // ── 状态栏 ──
    "statusBar.background": "#1C1C1E",
    "statusBar.foreground": "#8E8E93",
    "statusBar.border": "#2C2C2E",
    "statusBar.debuggingBackground": "#FF9F0A",
    "statusBar.debuggingForeground": "#000000",
    "statusBar.noFolderBackground": "#2C2C2E",
    "statusBarItem.hoverBackground": "#3A3A3C",
    "statusBarItem.remoteBackground": "#30D158",
    "statusBarItem.remoteForeground": "#000000",

    // ── 按钮 ──
    "button.background": "#0A84FF",
    "button.foreground": "#FFFFFF",
    "button.hoverBackground": "#409CFF",
    "button.secondaryBackground": "#3A3A3C",
    "button.secondaryForeground": "#DEDEDE",
    "button.secondaryHoverBackground": "#48484A",

    // ── 输入框 ──
    "input.background": "#3A3A3C",
    "input.foreground": "#DEDEDE",
    "input.border": "#48484A",
    "input.placeholderForeground": "#636366",
    "inputOption.activeBackground": "#0A84FF30",
    "inputOption.activeBorder": "#0A84FF",
    "inputValidation.errorBorder": "#FF453A",
    "inputValidation.warningBorder": "#FFD60A",
    "inputValidation.infoBorder": "#0A84FF",

    // ── 列表/树 ──
    "list.activeSelectionBackground": "#0A84FF30",
    "list.activeSelectionForeground": "#FFFFFF",
    "list.inactiveSelectionBackground": "#3A3A3C",
    "list.hoverBackground": "#2C2C2E",
    "list.focusOutline": "#0A84FF",
    "list.highlightForeground": "#0A84FF",
    "tree.indentGuidesStroke": "#3A3A3C",

    // ── 下拉/菜单 ──
    "dropdown.background": "#3A3A3C",
    "dropdown.foreground": "#DEDEDE",
    "dropdown.border": "#48484A",
    "menu.background": "#2C2C2E",
    "menu.foreground": "#DEDEDE",
    "menu.selectionBackground": "#0A84FF",
    "menu.selectionForeground": "#FFFFFF",
    "menu.separatorBackground": "#48484A",

    // ── 通知 ──
    "notifications.background": "#2C2C2E",
    "notifications.foreground": "#DEDEDE",
    "notifications.border": "#3A3A3C",

    // ── 滚动条 ──
    "scrollbar.shadow": "#00000030",
    "scrollbarSlider.background": "#63636650",
    "scrollbarSlider.hoverBackground": "#63636680",
    "scrollbarSlider.activeBackground": "#636366A0",

    // ── Widget ──
    "editorWidget.background": "#2C2C2E",
    "editorWidget.foreground": "#DEDEDE",
    "editorHoverWidget.background": "#2C2C2E",
    "editorHoverWidget.border": "#3A3A3C",
    "editorSuggestWidget.background": "#2C2C2E",
    "editorSuggestWidget.border": "#3A3A3C",
    "editorSuggestWidget.selectedBackground": "#0A84FF30",

    // ── 徽章 ──
    "badge.background": "#FF453A",
    "badge.foreground": "#FFFFFF",

    // ── 进度条 ──
    "progressBar.background": "#0A84FF",

    // ── 错误/警告 ──
    "editorError.foreground": "#FF453A",
    "editorWarning.foreground": "#FFD60A",
    "editorInfo.foreground": "#0A84FF",

    // ── Git 装饰 ──
    "gitDecoration.addedResourceForeground": "#30D158",
    "gitDecoration.modifiedResourceForeground": "#0A84FF",
    "gitDecoration.deletedResourceForeground": "#FF453A",
    "gitDecoration.untrackedResourceForeground": "#30D158",
    "gitDecoration.ignoredResourceForeground": "#48484A",
    "gitDecoration.conflictingResourceForeground": "#FF9F0A",

    // ── Diff ──
    "diffEditor.insertedTextBackground": "#30D15820",
    "diffEditor.removedTextBackground": "#FF453A20",
    "diffEditor.insertedLineBackground": "#30D15815",
    "diffEditor.removedLineBackground": "#FF453A15",

    // ── 终端 ANSI ──
    "terminal.foreground": "#DEDEDE",
    "terminal.ansiBlack": "#1C1C1E",
    "terminal.ansiRed": "#FF453A",
    "terminal.ansiGreen": "#30D158",
    "terminal.ansiYellow": "#FFD60A",
    "terminal.ansiBlue": "#0A84FF",
    "terminal.ansiMagenta": "#BF5AF2",
    "terminal.ansiCyan": "#64D2FF",
    "terminal.ansiWhite": "#DEDEDE",
    "terminal.ansiBrightBlack": "#636366",
    "terminal.ansiBrightRed": "#FF6961",
    "terminal.ansiBrightGreen": "#4BDE80",
    "terminal.ansiBrightYellow": "#FFE066",
    "terminal.ansiBrightBlue": "#409CFF",
    "terminal.ansiBrightMagenta": "#DA8FFF",
    "terminal.ansiBrightCyan": "#8BE9FF",
    "terminal.ansiBrightWhite": "#FFFFFF",

    // ── Charts ──
    "charts.red": "#FF453A",
    "charts.green": "#30D158",
    "charts.blue": "#0A84FF",
    "charts.yellow": "#FFD60A",
    "charts.orange": "#FF9F0A",
    "charts.purple": "#BF5AF2"
  }
}
```

### 5.5.4 配色方案 — 浅色主题

基于 macOS Sonoma 冷灰色阶 + Apple 系统蓝（`#007AFF`）：

```jsonc
{
  "name": "Neko macOS Light",
  "type": "light",
  "colors": {
    "foreground": "#3C3C43",
    "focusBorder": "#007AFF",
    "editor.background": "#FFFFFF",
    "editor.foreground": "#1D1D1F",
    "editor.lineHighlightBackground": "#F2F2F7",
    "editor.selectionBackground": "#007AFF30",
    "editorCursor.foreground": "#007AFF",
    "editorLineNumber.foreground": "#C7C7CC",
    "editorLineNumber.activeForeground": "#8E8E93",

    "sideBar.background": "#F2F2F7",
    "sideBar.foreground": "#3C3C43",
    "sideBar.border": "#E5E5EA",

    "activityBar.background": "#F2F2F7",
    "activityBar.foreground": "#007AFF",
    "activityBar.inactiveForeground": "#8E8E93",
    "activityBar.activeBorder": "#007AFF",
    "activityBarBadge.background": "#FF3B30",

    "titleBar.activeBackground": "#E5E5EA",
    "titleBar.activeForeground": "#1D1D1F",
    "titleBar.border": "#D1D1D6",

    "tab.activeBackground": "#FFFFFF",
    "tab.activeForeground": "#1D1D1F",
    "tab.activeBorderTop": "#007AFF",
    "tab.inactiveBackground": "#F2F2F7",
    "tab.inactiveForeground": "#8E8E93",
    "tab.border": "#E5E5EA",
    "editorGroupHeader.tabsBackground": "#F2F2F7",

    "panel.background": "#FFFFFF",
    "panel.border": "#E5E5EA",
    "panelTitle.activeBorder": "#007AFF",

    "statusBar.background": "#F2F2F7",
    "statusBar.foreground": "#3C3C43",
    "statusBar.border": "#E5E5EA",
    "statusBar.debuggingBackground": "#FF9500",

    "button.background": "#007AFF",
    "button.foreground": "#FFFFFF",
    "button.hoverBackground": "#0055D4",
    "button.secondaryBackground": "#E5E5EA",
    "button.secondaryForeground": "#3C3C43",

    "input.background": "#FFFFFF",
    "input.foreground": "#1D1D1F",
    "input.border": "#D1D1D6",
    "input.placeholderForeground": "#AEAEB2",

    "list.activeSelectionBackground": "#007AFF20",
    "list.activeSelectionForeground": "#007AFF",
    "list.hoverBackground": "#F2F2F7",

    "dropdown.background": "#FFFFFF",
    "dropdown.border": "#D1D1D6",
    "menu.background": "#FFFFFF",
    "menu.selectionBackground": "#007AFF",
    "menu.selectionForeground": "#FFFFFF",

    "scrollbarSlider.background": "#AEAEB240",
    "scrollbarSlider.hoverBackground": "#AEAEB260",

    "editorWidget.background": "#FFFFFF",
    "editorSuggestWidget.selectedBackground": "#007AFF15",
    "badge.background": "#FF3B30",
    "progressBar.background": "#007AFF",

    "editorError.foreground": "#FF3B30",
    "editorWarning.foreground": "#FF9500",
    "editorInfo.foreground": "#007AFF",

    "gitDecoration.addedResourceForeground": "#34C759",
    "gitDecoration.modifiedResourceForeground": "#007AFF",
    "gitDecoration.deletedResourceForeground": "#FF3B30",

    "terminal.ansiBlack": "#1D1D1F",
    "terminal.ansiRed": "#FF3B30",
    "terminal.ansiGreen": "#34C759",
    "terminal.ansiYellow": "#FFCC00",
    "terminal.ansiBlue": "#007AFF",
    "terminal.ansiMagenta": "#AF52DE",
    "terminal.ansiCyan": "#5AC8FA",
    "terminal.ansiWhite": "#F2F2F7",

    "charts.red": "#FF3B30",
    "charts.green": "#34C759",
    "charts.blue": "#007AFF",
    "charts.yellow": "#FFCC00",
    "charts.orange": "#FF9500",
    "charts.purple": "#AF52DE"
  }
}
```

### 5.5.5 配色来源

暗色主题使用 Apple 暗色系统色（`#0A84FF` / `#FF453A` / `#30D158` 等），灰阶基于 `systemGray6`（`#1C1C1E`）到 `systemGray2`（`#636366`）。

浅色主题使用 Apple 浅色系统色（`#007AFF` / `#FF3B30` / `#34C759` 等），灰阶基于 `systemGray6`（`#F2F2F7`）到 `systemGray2`（`#AEAEB2`）。

> 参考 [Apple HIG - Color](https://developer.apple.com/design/human-interface-guidelines/color)

---

## Phase 5.6：Webview SVG 图标统一 + File Icon Theme（P1）

### 5.6.1 Webview SVG 图标现状

完整盘点发现 **60+ 个内联 SVG 图标**，分布在 5 个包中，存在严重的风格不一致：

**风格分裂**：

| 包 | 图标数 | 风格 | viewBox | currentColor |
|---|---|---|---|---|
| neko-agent | ~35 | stroke 描边，strokeWidth=2（Lucide 风格） | 24×24 | ✅ |
| neko-preview | ~15 | fill 填充（Material Design 风格） | 24×24 | 部分缺失 |
| neko-cut | ~13 | fill 填充（Material Design 风格） | 20×20 | ✅ |
| neko-canvas | ~4 | stroke 描边（线条风格） | 24×24 | ✅ |
| neko-sketch | 1 | fill 填充 | 24×24 | ✅ |

**核心问题**：
1. **描边 vs 填充混用** — neko-agent 用 stroke 描边（线条感），neko-preview/neko-cut 用 fill 填充（实心感），视觉语言不统一
2. **相同图标多次定义** — ChevronIcon 在 6 处重复定义，CheckIcon/ErrorIcon 各 3-4 处
3. **viewBox 不统一** — 24×24 和 20×20 混用
4. **部分图标缺少 currentColor** — neko-preview 的播放/音量图标直接写 fill 属性，不跟随主题

**重复图标清单**：

| 图标 | 重复定义位置 |
|------|------------|
| ChevronIcon | agent/MessageContent, agent/ToolCallDisplay, agent/DiffBlock, agent/ThinkingBlock, agent/AudioPlayer, agent/DropdownMenu |
| CheckIcon | agent/MessageContent, agent/ToolCallDisplay, agent/DiffBlock, agent/PlanReview |
| ErrorIcon (X) | agent/ToolCallDisplay, agent/DiffBlock, agent/PlanReview |
| PlayIcon | preview/VideoControls, preview/AudioControls, cut/Toolbar, agent/AudioPlayer, agent/VideoPlayer |
| PauseIcon | preview/VideoControls, preview/AudioControls, cut/Toolbar |
| VolumeIcon | preview/VideoControls, preview/AudioControls |

### 5.6.2 方案：统一 SVG 图标系统

**目标风格**：macOS SF Symbols 风格 — **stroke 描边、圆角端点、1.5-2px 线宽、24×24 viewBox**。

理由：
- 与 macOS 视觉语言一致（SF Symbols 以描边为主）
- neko-agent（图标最多的包）已采用此风格，迁移成本最低
- 描边风格在小尺寸下辨识度优于填充风格

**实施方案**：在 `@neko/shared` L2 React 层新建图标模块：

```
packages/neko-types/src/icons/
├── index.ts                    — 统一导出
├── media.tsx                   — 媒体控件：Play, Pause, Stop, SkipBack, SkipForward, Volume, VolumeOff
├── navigation.tsx              — 导航：ChevronRight, ChevronDown, ArrowLeft, ArrowRight
├── action.tsx                  — 操作：Copy, Check, Download, Refresh, Edit, Send, Plus, Upload
├── status.tsx                  — 状态：Error, Warning, Success, Loading
├── editor.tsx                  — 编辑器：Code, File, Zoom​In, Zoom​Out, Undo, Redo
└── types.ts                    — IconProps 接口
```

通过 `@neko/shared/icons` 子路径导出。

**接口设计**：

```typescript
// types.ts
interface IconProps {
  size?: number;           // 默认 16
  className?: string;      // Tailwind 类
  strokeWidth?: number;    // 默认 2
}

// 示例：统一的 Play 图标
export function PlayIcon({ size = 16, className, strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <polygon points="6,3 20,12 6,21" />
    </svg>
  );
}
```

**迁移策略**：
1. 先在 `@neko/shared/icons` 定义全部 ~25 个去重后的图标
2. neko-agent 最先迁移（图标最多，已是 stroke 风格，改动最小）
3. neko-preview / neko-cut 后迁移（需要从 fill 转 stroke）
4. 各包中的内联 SVG 替换为 `import { PlayIcon } from '@neko/shared/icons'`

### 5.6.3 File Icon Theme — 支持 neko-suite 自定义文件格式

neko-suite 注册了 **13 个自定义文件扩展名**，当前在 VSCode 文件树中全部显示为默认图标，无法区分。

**需要图标的文件格式**：

| 扩展名 | 格式 | 所属包 | 图标含义 |
|--------|------|--------|---------|
| `.jvi` | JVI Timeline | neko-cut | 视频时间线/剪辑 |
| `.jvc` | JVC Canvas | neko-canvas | 画布/合成 |
| `.nka` | NKA Audio | neko-audio | 音频项目 |
| `.nks` | NKS Sketch | neko-sketch | 2D 绘画 |
| `.nkp` | NKP Puppet | neko-sketch | 骨骼/木偶 |
| `.inp` | INP Puppet | neko-sketch | Live2D 兼容木偶 |
| `.nkm` | NKM Model | neko-model | 3D 模型项目 |
| `.gltf` | glTF | neko-model | 3D 模型（文本） |
| `.glb` | glTF Binary | neko-model | 3D 模型（二进制） |
| `.vrm` | VRM Avatar | neko-model | VR 虚拟形象 |
| `.asset-diff` | Asset Diff | neko-tools | 资产对比 |
| `.story` | Story Script | neko-story | 剧本 |
| `.fountain` | Fountain | neko-story | Fountain 剧本 |

**实施方案**：在 `neko-tools` 扩展中声明 File Icon Theme：

```jsonc
// packages/neko-tools/package.json → contributes
"iconThemes": [
  {
    "id": "neko-file-icons",
    "label": "Neko File Icons",
    "path": "./themes/neko-file-icon-theme.json"
  }
]
```

```jsonc
// themes/neko-file-icon-theme.json
{
  "hidesExplorerArrows": false,
  "fileExtensions": {
    "jvi": "_neko_timeline",
    "jvc": "_neko_canvas",
    "nka": "_neko_audio",
    "nks": "_neko_sketch",
    "nkp": "_neko_puppet",
    "inp": "_neko_puppet",
    "nkm": "_neko_model",
    "gltf": "_neko_3d",
    "glb": "_neko_3d",
    "vrm": "_neko_avatar",
    "asset-diff": "_neko_diff",
    "story": "_neko_story",
    "fountain": "_neko_story"
  },
  "iconDefinitions": {
    "_neko_timeline": { "iconPath": "./icons/file-timeline.svg" },
    "_neko_canvas":   { "iconPath": "./icons/file-canvas.svg" },
    "_neko_audio":    { "iconPath": "./icons/file-audio.svg" },
    "_neko_sketch":   { "iconPath": "./icons/file-sketch.svg" },
    "_neko_puppet":   { "iconPath": "./icons/file-puppet.svg" },
    "_neko_model":    { "iconPath": "./icons/file-model.svg" },
    "_neko_3d":       { "iconPath": "./icons/file-3d.svg" },
    "_neko_avatar":   { "iconPath": "./icons/file-avatar.svg" },
    "_neko_diff":     { "iconPath": "./icons/file-diff.svg" },
    "_neko_story":    { "iconPath": "./icons/file-story.svg" }
  }
}
```

图标 SVG 设计风格与 Webview 图标统一：stroke 描边、macOS SF Symbols 风格、16×16 viewBox。

### 5.6.4 字体

**不需要自定义字体**，理由不变：
- `var(--vscode-font-family)` 自动跟随用户设置
- macOS 上就是 SF Pro，Windows 上 Segoe UI
- macOS 风格核心是颜色/透明度/动效，不是字体

---

## Phase 6：跨包共享 UI 组件（P2）

### 6.1 全包 UI 重复度分析

对全部 9 个 webview 包的组件实现进行了深度探索，结论如下：

#### 重复度矩阵

| 组件类型 | 独立实现数 | 总 LOC | 重复度 | 共享价值 |
|---------|-----------|--------|--------|---------|
| ContextMenu（右键菜单） | 2（neko-cut 432行 + neko-canvas 287行） | 719 | 高 | ⭐⭐⭐ |
| CollapsibleSection（折叠面板） | 3+（neko-cut ShapePanel/PropertyPanel + neko-canvas PropertyPanel） | 内联 | 高 | ⭐⭐⭐ |
| TimelineRuler（时间标尺） | 2（neko-cut 101行 + neko-audio 106行） | 207 | 高 | ⭐⭐⭐ |
| Toast 通知 | 2（neko-cut + neko-canvas） | ~200 | 中 | ⭐⭐ |
| LayerPanel（图层面板） | 2（neko-canvas 285行 + neko-sketch ~150行） | ~435 | 中 | ⭐⭐ |
| PropertyRow（属性行） | 2（neko-cut + neko-canvas） | ~300 | 中 | ⭐⭐ |
| Toolbar（工具栏） | 7 个实现 | 1,611 | 低 | ❌ |
| Timeline（时间线） | 4 个实现 | ~5,800 | 低 | ❌ |
| Panel 容器 | 35+ 个 | 大量 | 低 | ❌ |
| Playhead（播放头） | 2（neko-cut + neko-audio） | ~120 | 低 | ⭐ |

#### ContextMenu 对比

| 特性 | neko-cut (432 LOC) | neko-canvas (287 LOC) |
|------|-------------------|----------------------|
| VSCode 主题集成 | ✅ MutationObserver 监听 | ❌ 无 |
| 子菜单 | ✅ 支持 | ❌ 不支持 |
| Danger 状态 | ✅ 红色文本 | ❌ 无 |
| 键盘导航 | ✅ Escape | ✅ Escape |
| 视口边界重定位 | ✅ | ✅ |
| 快捷键显示 | ✅ | ✅ |
| 分隔符 | ✅ | ✅ 判别联合类型 |
| 图标 | ReactNode | string（emoji） |

核心逻辑（定位算法/键盘导航/点击外关闭）完全重复，差异仅在菜单项数据构建。

#### TimelineRuler 对比

| 特性 | neko-cut (101 LOC) | neko-audio (106 LOC) |
|------|-------------------|---------------------|
| 自适应刻度 | ✅ 1s→30s 基于 zoom | ✅ 0.5s→30s 基于 pxPerSec |
| 点击寻位 | ✅ | ✅ |
| 滚动同步 | ✅ ref 驱动 | ✅ ref 驱动 |
| 样式 | Tailwind | 内联 + VSCode 变量 |

算法几乎相同，可参数化为共享组件。

### 6.2 三层策略

#### 第一层：提取到 `@neko/shared` 的跨包共享组件（3 个）

| 组件 | 理由 | 预估 LOC | 基础版本 |
|------|------|---------|---------|
| ContextMenu | 2 包 719 行重复，核心逻辑相同 | ~300 | 以 neko-cut 版为基础（更完善） |
| CollapsibleSection | 3+ 处内联重写，面板类组件的基础构建块 | ~60 | 新建 |
| TimelineRuler | 2 包自适应刻度算法几乎相同 | ~120 | 合并两版本 |

放置位置：

```
@neko/shared (neko-types)
  └── src/components/   ← L2 React 层，新增
      ├── ContextMenu.tsx       — 右键菜单（定位/键盘/子菜单/主题）
      ├── CollapsibleSection.tsx — 折叠面板区域
      └── TimelineRuler.tsx     — 参数化时间标尺
```

通过 `@neko/shared/components` 子路径导出，仅 webview 包可引用。

#### 第二层：包内提取，不跨包共享（3 个）

| 组件 | 位置 | 理由 |
|------|------|------|
| VolumeControl | neko-preview `shared/` | 仅 audio/video 两处使用 |
| SpeedButton | neko-preview `shared/` | 仅 audio/video 两处使用 |
| useMediaKeyboard | neko-preview `shared/` | 仅 audio/video 两处使用 |

#### 第三层：不适合共享

| 组件 | 理由 |
|------|------|
| Toolbar | 7 个实现的按钮/布局/功能完全不同，共享壳子无实际价值 |
| Timeline | 领域差异太大（视频多轨 vs 音频波形 vs 帧条 vs diff），强行抽象过度工程化 |
| Panel 容器 | 每个面板内容和交互完全不同，共享 CollapsibleSection 已足够 |
| LayerPanel | 数据模型差异大（canvas 节点 vs sketch 图层），UI 相似但绑定逻辑不同 |
| Playhead | 仅 2 处，视觉风格有意不同（钻石 vs 简单线） |
| Toast | 仅 2 处，LOC 很少，提取维护成本 > 收益 |

### 6.3 关键判断：不建立大型共享 UI 组件库

理由：
1. 真正高重复度的组件只有 3 个，不足以支撑独立 `@neko/ui` 包
2. 各包视觉风格有意差异化（Apple Music 音频 vs YouTube 视频 vs 专业编辑器），强制统一损害体验
3. Toolbar / Timeline / Panel 看似相似，实际领域逻辑完全不同，抽象层会变成"万能组件"反模式
4. 当前 monorepo 构建链路已复杂，新增共享 UI 包增加依赖管理负担

### 6.4 实施时机

当满足以下条件之一时启动：
- 第三个包需要 ContextMenu（当前 neko-cut + neko-canvas，若 neko-audio/neko-model 也需要则触发）
- neko-audio Timeline 需要与 neko-cut 共享 Ruler 组件（如统一时间标尺交互）
- CollapsibleSection 在新增面板中再次被内联实现

---

## 实施顺序

```
Phase 0    neko-preview Tailwind 基础设施接入                    [0.5d] ✅
Phase 1    macOS Design Token 体系 + CSS 变量统一 + 主题覆盖     [1d]   ✅
Phase 2    macOS 风格组件重构 + 共享控件提取                      [2d]   ✅
Phase 3    视频播放器 macOS 化 + useMediaKeyboard                [0.5d]
Phase 4    neko-audio Tailwind 接入 + macOS 化                   [1d]
Phase 5    neko-story VSCode 主题接入                             [0.5d]
Phase 5.5  macOS VSCode 主题配色（Dark + Light）                  [1d]
Phase 5.6  SVG 图标统一 + File Icon Theme                         [2d]
Phase 6    跨包共享组件 (ContextMenu/CollapsibleSection/Ruler)    [1.5d, 按需触发]
```

**依赖关系**：
```
Phase 0 → Phase 1（Tailwind 可用后才能定义 token）
Phase 1 → Phase 2（token 确定后才能重构组件）
Phase 2 → Phase 3（组件模式从 Phase 2 实践中提炼）
Phase 4 / 5 / 5.5 独立，可并行
Phase 6 按需触发
```

---

## 风险与约束

| 风险 | 缓解 |
|------|------|
| neko-preview Tailwind 接入影响现有样式 | `@tailwind` 指令与现有 CSS 共存，渐进迁移不一次性重写 |
| CSS 变量重命名遗漏 | 全局搜索 `--neko-audio-` 确保无残留；构建后视觉回归测试 |
| macOS 毛玻璃效果性能 | `backdrop-filter: blur()` 在 webview 中 GPU 加速，实测无性能问题；高对比度模式下 blur=0 |
| 浅色主题 `color-mix()` 效果不佳 | 单独的 `body.vscode-light` 覆盖层，可独立调整 |
| Tailwind 类名过长影响可读性 | 高频组合提取为 `@apply` 组件类或 React 组件 |
| neko-story 硬编码颜色遗漏 | 逐行审查 `screenplay.css`，建立替换映射表 |

## 验证清单

- [ ] neko-preview Tailwind 构建正常（`pnpm build` 通过）
- [ ] 深色主题：毛玻璃/渐变/阴影效果正确
- [ ] 浅色主题：背景/文本/控件颜色正确，毛玻璃不过暗
- [ ] 高对比度：去掉透明/模糊，所有交互元素有可见边框
- [ ] Canvas 组件（波形/频谱）颜色跟随主题切换
- [ ] 音频/视频播放器控件视觉一致（共享 VolumeControl/SpeedButton）
- [ ] 键盘快捷键在 audio/video 中行为一致
- [ ] macOS 动效流畅（hover/active/transition 无卡顿）
- [ ] `pnpm build` 全量通过
- [ ] `pnpm check` 无新增违规
