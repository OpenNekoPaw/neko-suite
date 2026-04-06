# UI 现代化优化 — 设计方案

> Based on UI modernization analysis

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

### 技术架构：Tailwind 筑基 + CSS 变量桥接 + 原生 CSS 攻坚

针对多媒体播放器与编辑器场景，采用三层协作模型：

**第一层：Tailwind 筑基 — "快"和"稳"**

| 维度 | 说明 |
|------|------|
| 应用场景 | 响应式布局、间距、标准色阶、交互反馈（hover/active）、基础毛玻璃卡片 |
| 核心优势 | 极速构建 UI 框架，保证多端视觉一致性 |
| 代码位置 | 业务组件的 `className` 中 |
| neko-suite 实例 | `flex flex-col items-center px-8`、`hover:scale-110 active:scale-95`、`transition-opacity duration-300` |

**第二层：CSS 变量桥接 — 语义化连接**

不在 JSX 中写长串方括号（`bg-[#1a2b3c]`），而是建立语义化变量系统：

```
定义层（CSS）：
  :root { --neko-preview-primary: #0A84FF; }        ← color-mix/gradient 等复杂逻辑

桥接层（tokens.ts）：
  'neko-preview-primary': 'var(--neko-preview-primary, #0A84FF)'  ← 注册为 Tailwind token

消费层（JSX）：
  className="bg-neko-preview-primary"                ← 简洁，IDE 自动补全
  className="bg-[var(--neko-preview-surface)]"       ← 备选，偶尔使用的变量
```

**第三层：原生 CSS 攻坚 — "美"和"深"**

| 维度 | 说明 |
|------|------|
| 应用场景 | 复杂滤镜、`mask-image` 渐隐、`color-mix()` 动态着色、伪元素（滑块/滚动条）、高性能动画帧 |
| 核心优势 | 突破原子化限制，实现 1px 级精细视觉渲染与运行时逻辑 |
| 代码位置 | `player.css` 的 `@layer components` 中 |
| neko-suite 实例 | `.neko-audio-bg`（color-mix 渐变）、`.neko-slider`（slider-thumb 伪元素）、`.neko-fade-mask`（mask-image）、`@keyframes neko-cover-pulse` |

**多媒体组件适用指南**：

| 组件类型 | 推荐方案 | 原因 |
|---------|---------|------|
| 播放控制栏 | 100% Tailwind | 响应式断点处理按钮隐藏/显示极具优势 |
| 封面/卡片 | Tailwind + CSS 工具类 | 布局用 Tailwind，`color-mix()` 渐变/`blur()` 背景用 CSS |
| 歌词滚动视图 | Tailwind + `.neko-fade-mask` | 布局用 Tailwind，`mask-image` 渐隐用 CSS |
| 音视频轨道/刻度线 | 100% 原生 CSS / Canvas | `background-repeat` 绘制重复刻度 + `will-change: transform` 优化滚动 |
| 波形/频谱可视化 | Canvas + CSS 变量 | Canvas 绘制 + `getCssVar()` 读取主题色 |
| 进度条/滑块 | Tailwind + `.neko-slider` | 布局/hover 用 Tailwind，`::-webkit-slider-thumb` 伪元素用 CSS |
| 主题适配 | Tailwind `dark:` + CSS 变量 | 基础深浅模式用 Tailwind 变体，VSCode 高级主题覆盖用 CSS 变量 |

**核心原则**：Tailwind 负责"快"和"稳"，原生 CSS 负责"美"和"深"。在多媒体领域，放弃任何一方都会导致开发效率或视觉表现的短板。

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
| **Tailwind `/20` 透明度修饰符** | **CSS 变量颜色已含 alpha 通道，Tailwind 的 `bg-token/20` 输出 `rgba(0,0,0,0)` 透明** | **`.neko-progress-track-bg` / `.neko-tabs-bg` / `.neko-speed-border`** |

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
├── ProgressBar.tsx     — 进度条（variant: default/video，Tailwind group-hover 膨胀）
├── types.ts            — 消息协议类型
└── useVscodeMessage.ts — postMessage 通信 hook

packages/neko-preview/packages/webview/src/audio/
└── ViewTabs.tsx        — 视图模式切换（封面/歌词/波形/频谱），独立于 AudioControls
```

### 2.4 音频播放器布局（Apple Music 风格）

```
┌─────────────────────────────────┐
│         视觉区域（flex-1）         │  封面/歌词/波形/频谱
│                                   │
├─────────────────────────────────┤
│       [⊙] [♪] [≋] [≡]          │  ViewTabs — 视图切换
├─────────────────────────────────┤
│         标题 / 艺术家              │  Metadata
├─────────────────────────────────┤
│  🔊 ━━━━━━━        1x          │  音量 + 速度（进度条上方）
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │  进度条
│  0:00                    3:46   │  时间
│         ⟲10   ▶   10⟳          │  播放控件
└─────────────────────────────────┘
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

## Phase 4：neko-audio Tailwind 迁移 + macOS 化（P1）✅

### 4.1 实施结果

删除 46 个 BEM 类名引用，504 行旧代码替换为 363 行 Tailwind + macOS 组件代码（净减 141 行）。CSS 从 401 行精简为 ~140 行（`@layer base` 主题变量 + `@layer components` 工具类）。构建产出 CSS 18.9KB。

### 4.2 实施步骤

**Step 1-2：基础设施 + CSS 精简**（`28dff7a`）
1. 添加 `tailwindcss` / `postcss` / `autoprefixer` devDependencies
2. 创建 `tailwind.config.js`（引用 `nekoTailwindPreset`）+ `postcss.config.js`
3. `editor.css` 精简为 @layer 分层架构：
   - `@layer base`：CSS 变量（dark/light/high-contrast 三套）+ 全局重置
   - `@layer components`：不可 Tailwind 化的工具类（`.neko-toolbar-indicator` / `.neko-resize-handle` / `.neko-slider` / `.neko-drop-overlay-bg` / `.neko-drag-over-bg`）
   - `@keyframes neko-toast-slide-in`

**Step 3：全量组件迁移**（`d0caf61`）

迁移 20 个 TSX 文件（16 组件 + 2 共享按钮 + 2 Canvas 容器）：

| 组件 | 改动 |
|------|------|
| AudioEditor.tsx | BEM `audio-editor__*` 6 个类 → Tailwind flex 布局 |
| Toolbar.tsx | BEM `audio-toolbar` / `toolbar-btn*` 6 个类 → Tailwind + `.neko-toolbar-indicator` |
| TransportBar.tsx | BEM `btn` / `slider` / `divider` 5 个类 → MacIconButton + `.neko-slider` |
| SidePanel.tsx | BEM `audio-side-panel__*` 5 个类 → Tailwind flex + MacIconButton |
| EmptyProject.tsx | BEM `audio-editor__empty*` 4 个类 → Tailwind + MacButton |
| Toast.tsx | 全内联样式 → Tailwind fixed/flex + `neko-toast-slide-in` |
| ExportPanel.tsx | BEM `form-group` / `form-label` / `form-select` → Tailwind select + MacButton |
| LoudnessPanel.tsx | BEM `audio-loudness__*` 5 个类 → Tailwind inline-flex + font-mono |
| EffectsPanel.tsx | BEM `btn` + 内联样式 → Tailwind + MacButton + dropdown menu |
| EffectEditor.tsx | BEM `effect-editor*` + `btn--icon` → Tailwind + MacIconButton |
| RecordingPanel.tsx | BEM `btn` + 内联样式 → Tailwind + MacButton |
| AudioProperties.tsx | BEM `slider` + 内联样式 → Tailwind + `.neko-slider` |
| SpectrumAnalyzer.tsx | 内联样式 → Tailwind `w-full h-20 relative` |
| EditableWaveform.tsx | BEM `audio-editor__waveform` → Tailwind `w-full h-full relative` |
| AudioTimeline.tsx | BEM `audio-timeline` + 内联样式 → Tailwind flex 布局 |
| TimelineRuler.tsx | 全内联样式 → Tailwind absolute + bg 工具类 |
| TrackLane.tsx | 全内联样式 → Tailwind flex + conditional classes |
| AudioClip.tsx | 全内联样式 → Tailwind absolute + rounded + border |

### 4.3 新建的 macOS 风格共享组件

```
packages/neko-audio/packages/webview/src/shared/
├── MacButton.tsx       — 4 种变体（primary/secondary/ghost/icon）+ 3 种尺寸
├── MacIconButton.tsx   — 圆形图标按钮（default/primary 变体 + 4 种尺寸）
├── types.ts            — 消息协议类型（已有）
└── useVscodeMessage.ts — postMessage 通信 hook（已有）
```

注意：MacButton / MacIconButton 是 neko-preview 同名组件的本地副本，避免 `no-cross-extension-deps` 规则冲突。未来 Phase 6 可考虑提取到 `@neko/shared/components`。

### 4.4 CSS 工具类清单（`@layer components`）

| 工具类 | 用途 | 不可 Tailwind 原因 |
|--------|------|-------------------|
| `.neko-toolbar-indicator` | 工具栏激活指示条（左侧 2px 蓝条） | 复合定位 + transform + pseudo-element 风格 |
| `.neko-resize-handle` | 面板拖拽调整大小手柄 | `cursor: ew-resize` + hover 渐变 |
| `.neko-slider` | range input 滑块样式 | `::-webkit-slider-thumb` / `::-moz-range-thumb` 伪元素 |
| `.neko-drop-overlay-bg` | 拖放覆盖层半透明背景 | `color-mix()` 运行时函数 |
| `.neko-drag-over-bg` | 拖入目标高亮背景 | `color-mix()` 运行时函数 |
| `@keyframes neko-toast-slide-in` | Toast 滑入动画 | 自定义 keyframes |

### 4.5 editor.css 分层结构

```
editor.css (~140 行):
├── @tailwind base/components/utilities      — Tailwind 指令
├── @layer base {                            — CSS 变量定义
│   ├── :root { --editor-bg/fg/border, --toolbar-bg, --activity-bg/fg }
│   ├── :root { --waveform-played/unplayed/cursor, --selection-bg/border }
│   ├── :root { --neko-glass/preview-primary/text }
│   ├── body.vscode-light { 浅色主题覆盖 }
│   ├── body.vscode-high-contrast { 高对比度覆盖 }
│   └── html/body/#root 全局重置
│ }
├── @layer components {                      — 工具类
│   ├── .neko-toolbar-indicator
│   ├── .neko-resize-handle
│   ├── .neko-drop-overlay-bg / .neko-drag-over-bg
│   └── .neko-slider (含 thumb 伪元素)
│ }
└── @keyframes neko-toast-slide-in
```

### 4.6 Bug 修复：`--neko-surface` 命名冲突（事后补丁）

**问题根因**：初始迁移时，`MacButton.tsx` 的 ghost/icon 变体使用了 `hover:bg-neko-surface` Tailwind 类来实现悬停半透明效果，导致 `editor.css` 在三套主题的 `@layer base` 中将共享设计 token `--neko-surface` 覆写为透明值（`rgba(255,255,255,0.05)` 等）。

**影响**：共享 Tailwind preset 的 `addComponents` 为 `.neko-vtoolbar`（垂直工具栏容器）注入了 `background: var(--neko-surface)`，期望获得不透明侧边栏背景色 `var(--vscode-sideBar-background)`。被 editor.css 覆写后，左侧工具栏和右侧面板的背景变为透明，与 TransportBar 颜色不一致，造成视觉割裂。

**修复内容**：

| 文件 | 修改 |
|------|------|
| `shared/MacButton.tsx` | ghost/icon 变体的 hover/active 状态改用语义正确的 `neko-glass` / `neko-glass-active` token |
| `styles/editor.css` | 删除三套主题中 `--neko-surface` 和 `--neko-surface-hover` 的本地覆写；删除迁移后遗留的死代码（`.audio-toolbar*` / `.audio-panel-*` 共 ~70 行） |
| `components/TransportBar.tsx` | range slider 轨道背景从 `bg-[var(--neko-surface)]` 改为 `bg-[var(--btn-bg)]` |

**经验教训**：`--neko-surface` 在共享设计 token 体系（`nekoDesignTokens`）中语义为"不透明表面背景"，不可本地覆写为透明值。需要半透明叠加效果时应使用 `--neko-glass` / `--neko-glass-hover` / `--neko-glass-active` 系列变量。

---

## Phase 5：neko-story 主题接入（P1）✅

### 5.1 实施结果

`screenplay.css` 完成 VSCode 主题接入，现在响应 dark / light / high-contrast 三套主题切换。保留 Fountain 剧本排版领域 CSS 不变，不引入 Tailwind。

**颜色变量替换**：

| 原值 | 替换为 |
|------|--------|
| `#1e1e1e` | `var(--vscode-editor-background, #1e1e1e)` |
| `#d4d4d4` | `var(--vscode-editor-foreground, #d4d4d4)` |
| `#569cd6` | `var(--vscode-button-background, #569cd6)` |

**额外优化**（超出最小替换范围）：

原文件中 4 处硬编码的 `rgba(255,255,255, ...)` 在浅色主题下会显示为白色透明（不可见），因此提取为命名变量并加入主题覆盖：

```
:root {
  --hover-bg:         rgba(255, 255, 255, 0.05)  /* dark */
  --divider-color:    rgba(255, 255, 255, 0.1)
  --page-break-color: rgba(255, 255, 255, 0.3)
  --empty-state-color: rgba(255, 255, 255, 0.5)
}
body.vscode-light {
  --hover-bg:         rgba(0, 0, 0, 0.04)        /* light 覆盖 */
  --divider-color:    rgba(0, 0, 0, 0.1)
  ...
}
body.vscode-high-contrast {
  --hover-bg:         var(--vscode-list-hoverBackground)   /* 高对比度：纯色 */
  --divider-color:    var(--vscode-contrastBorder)
  ...
}
```

`.note` 背景从 `rgba(106, 153, 85, 0.1)` 改为 `color-mix(in srgb, #6a9955 12%, transparent)`，保持 Fountain 语法高亮色的固定绿色，同时兼容 `color-mix()`。

**Fountain 语法高亮色**（7 个）保留为固定值，不跟随主题：`--character-color` / `--parenthetical-color` / `--transition-color` 等，并加注释说明为有意不跟随主题的领域色。

---

## Phase 5.5：macOS 风格 VSCode 主题配色（P1）✅

### 5.5.1 实施结果

在 `neko-tools` 中新增两套完整 VSCode 颜色主题，通过 `contributes.themes` 注册：

```
packages/neko-tools/
└── themes/
    ├── neko-macos-dark-color-theme.json   — 暖灰色阶 + #0A84FF
    └── neko-macos-light-color-theme.json  — 冷灰色阶 + #007AFF
```

同时在 `contributes` 中一并注册了 `iconThemes`（见 Phase 5.6）。

### 5.5.2 配色方案

| 区域 | 暗色 | 浅色 |
|------|------|------|
| 编辑器背景 | `#1C1C1E`（systemGray6） | `#FFFFFF` |
| 侧边栏背景 | `#2C2C2E`（systemGray5） | `#F2F2F7`（systemGray6 Light） |
| 强调色 | `#0A84FF`（Apple 蓝，暗色） | `#007AFF`（Apple 蓝，浅色） |
| 错误色 | `#FF453A`（Apple 红，暗色） | `#FF3B30`（Apple 红，浅色） |
| 成功色 | `#30D158`（Apple 绿，暗色） | `#34C759`（Apple 绿，浅色） |

完整颜色定义见 `themes/neko-macos-*-color-theme.json`。

**与设计方案的差异**：
- `editorIndentGuide.background` → `editorIndentGuide.background1`（VSCode 1.85+ 弃用旧键名）
- 浅色主题补全了暗色主题已有的全部 key（设计稿浅色部分为精简版本）
- 新增 `statusBarItem.remoteBackground/Foreground`、`tab.hoverBackground` 等设计稿未列出的补充 key

### 5.5.3 配色来源

暗色：Apple 暗色系统色（`#0A84FF` / `#FF453A` / `#30D158`），灰阶基于 `systemGray6`（`#1C1C1E`）→ `systemGray2`（`#636366`）。

浅色：Apple 浅色系统色（`#007AFF` / `#FF3B30` / `#34C759`），灰阶基于 `systemGray6`（`#F2F2F7`）→ `systemGray2`（`#AEAEB2`）。

> 参考 [Apple HIG - Color](https://developer.apple.com/design/human-interface-guidelines/color)

---

## Phase 5.6：Webview SVG 图标统一 + File Icon Theme（P1）✅

### 5.6.1 Webview SVG 图标现状（分析）

完整盘点发现 **60+ 个内联 SVG 图标**，分布在 5 个包中，存在严重的风格不一致：

| 包 | 图标数 | 风格 | viewBox | currentColor |
|---|---|---|---|---|
| neko-agent | ~35 | stroke 描边，strokeWidth=2（Lucide 风格） | 24×24 | ✅ |
| neko-preview | ~15 | fill 填充（Material Design 风格） | 24×24 | 部分缺失 |
| neko-cut | ~13 | fill 填充（Material Design 风格） | 20×20 | ✅ |
| neko-canvas | ~4 | stroke 描边（线条风格） | 24×24 | ✅ |
| neko-sketch | 1 | fill 填充 | 24×24 | ✅ |

**重复图标**：ChevronIcon 6 处重复，CheckIcon/ErrorIcon 各 3-4 处，PlayIcon/PauseIcon/VolumeIcon 跨 3-5 个组件重复定义。

### 5.6.2 实施结果：`@neko/shared/icons` 图标模块

在 `@neko/shared` L2 React 层新建统一图标模块，共 **33 个图标**，通过 `@neko/shared/icons` 子路径导出（`package.json` 的 `"./*": "./src/*"` 通配符已覆盖，无需新增 exports 条目）：

```
packages/neko-types/src/icons/
├── types.ts        — IconProps { size=16, className, strokeWidth=2 }
├── media.tsx       — Play, Pause, Stop, SkipBack, SkipForward, Volume, VolumeOff, VolumeLow
├── navigation.tsx  — ChevronRight/Down/Left/Up, ArrowLeft, ArrowRight
├── action.tsx      — Copy, Check, Download, Refresh, Edit, Send, Plus, Upload, Trash, Search, Close
├── status.tsx      — Error, Warning, Success, Loading, Info
├── editor.tsx      — Code, File, ZoomIn, ZoomOut, Undo, Redo, Scissors, Layers, Settings
└── index.ts        — 统一再导出
```

**统一风格**：stroke 描边 + `currentColor`、圆角端点（`strokeLinecap="round"`）、24×24 viewBox、默认尺寸 16px。

**迁移状态**：图标库已就绪，各包内联 SVG 的迁移替换为**下一阶段按需进行**，优先级：neko-agent（已是 stroke 风格，改动最小）→ neko-preview / neko-cut（需从 fill 转 stroke）。

### 5.6.3 实施结果：File Icon Theme

neko-suite 的 13 个自定义扩展名在 VSCode 文件树中现在有专属图标：

```
packages/neko-tools/themes/
├── neko-file-icon-theme.json     — File Icon Theme 定义
└── icons/
    ├── file-timeline.svg  (.nkv) — 紫色 #6366F1，胶片条 + 刻度点
    ├── file-canvas.svg    (.nkc) — 橙色 #F97316，画板 + 中心圆
    ├── file-audio.svg     (.nka) — 绿色 #22C55E，7 根波形竖线
    ├── file-sketch.svg    (.nks) — 粉色 #EC4899，铅笔
    ├── file-puppet.svg  (.nkp/.inp) — 黄色 #EAB308，关节人偶
    ├── file-model.svg     (.nkm) — 青色 #06B6D4，等轴测立方体
    ├── file-3d.svg    (.gltf/.glb) — 蓝色 #3B82F6，开口六面体
    ├── file-avatar.svg    (.vrm) — 紫色 #A855F7，人物剪影
    ├── file-diff.svg  (.asset-diff) — 橙红 #F97316，双矩形 diff
    └── file-story.svg (.story/.fountain) — 青色 #14B8A6，剧本文档
```

SVG 设计风格：stroke 描边、16×16 viewBox、各文件类型专属主题色（非 currentColor，文件图标需固定色）。

### 5.6.4 字体

**不需要自定义字体**：
- `var(--vscode-font-family)` 自动跟随用户设置（macOS 即 SF Pro）
- macOS 风格核心是颜色/透明度/动效，不在字体

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
Phase 3    视频播放器 macOS 化                                    [0.5d] ✅
Phase 4    neko-audio Tailwind 接入 + macOS 化                   [1d]   ✅
Phase 5    neko-story VSCode 主题接入                             [0.5d] ✅
Phase 5.5  macOS VSCode 主题配色（Dark + Light）                  [1d]   ✅
Phase 5.6  SVG 图标统一 + File Icon Theme                         [2d]   ✅
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
