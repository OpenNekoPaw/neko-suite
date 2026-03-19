# UI 现代化优化 — 设计方案

> 基于 [ui-modernization.md](./ui-modernization.md) 分析结论

---

## 目标

将 neko-preview（P0）、neko-audio（P1）、neko-story（P1）三个遗留包的 UI 主题系统对齐到现代方案，同时提取共享 UI 组件消除重复代码，补全高对比度主题支持。

---

## Phase 1：neko-preview CSS 变量统一 + 高对比度

### 1.1 变量重命名：`--neko-audio-*` → `--neko-preview-*`

**现状**：`player.css` 在 `.audio-player` 作用域内定义 9 个 `--neko-audio-*` 变量，仅音频播放器使用。视频播放器直接引用 `var(--vscode-*)` 裸变量。

**方案**：将语义变量提升到 `:root` 级别，统一命名为 `--neko-preview-*`，audio 和 video 共享。

```css
/* player.css — :root 级别定义 */
:root {
  /* Surface */
  --neko-preview-bg: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 85%, #000);
  --neko-preview-surface: color-mix(in srgb, var(--vscode-editor-background, #1e1e1e) 70%, #fff 5%);

  /* Accent */
  --neko-preview-accent: var(--vscode-button-background, #0e639c);
  --neko-preview-accent-hover: var(--vscode-button-hoverBackground, #1177bb);

  /* Text */
  --neko-preview-text-primary: var(--vscode-editor-foreground, #cccccc);
  --neko-preview-text-secondary: var(--vscode-descriptionForeground, #999);

  /* Border */
  --neko-preview-border: var(--vscode-panel-border, #333);

  /* Gradient (audio-specific, but harmless at :root) */
  --neko-preview-gradient-start: color-mix(in srgb, var(--vscode-button-background, #0e639c) 25%, var(--vscode-editor-background, #1e1e1e));
  --neko-preview-gradient-end: var(--neko-preview-bg);
}
```

**迁移步骤**：
1. 在 `player.css` `:root` 添加 `--neko-preview-*` 定义
2. 全局替换 CSS 中 `--neko-audio-*` → `--neko-preview-*`（约 40 处）
3. 更新 `WaveformCanvas.tsx` 和 `SpectrumCanvas.tsx` 中 `getCssVar()` 调用的变量名
4. 删除 `.audio-player` 作用域内的旧变量定义
5. 视频控件 CSS 中的裸 `var(--vscode-*)` 替换为 `var(--neko-preview-*)`（统一语义层）

**影响范围**：
- `player.css`：~40 处替换
- `WaveformCanvas.tsx`：4 处 `getCssVar` 调用
- `SpectrumCanvas.tsx`：3 处 `getCssVar` 调用
- 无接口变更，纯样式重命名

### 1.2 高对比度主题支持

**现状**：所有 Canvas 组件通过 `getCssVar()` 读取 CSS 变量获取颜色。VSCode 高对比度主题会注入不同的 `--vscode-*` 变量值，但 `color-mix()` 派生的中间色可能对比度不足。

**方案**：在 `player.css` 中添加高对比度覆盖层。

```css
/* High Contrast overrides */
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
}

/* Ensure controls have visible borders in high contrast */
body.vscode-high-contrast .controls__btn,
body.vscode-high-contrast-light .controls__btn {
  border: 1px solid var(--vscode-contrastBorder);
}

body.vscode-high-contrast .controls__progress-track,
body.vscode-high-contrast-light .controls__progress-track {
  border: 1px solid var(--vscode-contrastBorder);
}
```

**关键点**：
- 高对比度模式下去掉 `color-mix()` 派生，直接使用 VSCode 原始变量
- 去掉渐变背景，使用纯色
- 为交互元素添加 `contrastBorder`
- `--neko-preview-text-secondary` 提升为 `foreground`（高对比度不应有低对比度文本）

### 1.3 深色/浅色主题验证

**现状**：`color-mix(in srgb, ... 85%, #000)` 在浅色主题下会产生偏暗的背景。

**方案**：利用 VSCode 注入的 `body.vscode-light` class 添加浅色覆盖。

```css
/* Light theme adjustments */
body.vscode-light :root {
  --neko-preview-bg: color-mix(in srgb, var(--vscode-editor-background) 90%, #fff);
  --neko-preview-surface: color-mix(in srgb, var(--vscode-editor-background) 85%, #000 3%);
  --neko-preview-gradient-start: color-mix(in srgb, var(--vscode-button-background) 15%, var(--vscode-editor-background));
}
```

---

## Phase 2：共享控件提取

### 2.1 现状对比

| 控件 | AudioControls | VideoControls | 差异 |
|------|--------------|---------------|------|
| ProgressBar | ✅ 已共享 `shared/ProgressBar.tsx` | ✅ 已共享 | 无差异 |
| 音量滑块 | `.audio-player__volume-*`（自定义样式） | `.controls__volume-*`（不同样式） | CSS 类名不同，行为相同 |
| 速度按钮 | `.audio-player__speed-btn`（点击循环） | `.controls__speed`（点击循环） | 逻辑完全相同，选项略不同 |
| 播放按钮 | `.audio-player__ctrl-btn--play`（圆形 52px） | `.controls__btn--play`（圆形 40px） | 尺寸/风格不同（Apple vs YouTube） |
| 键盘快捷键 | `handleKeyDown`（空格/方向键/m/上下） | `handleKeyDown`（空格/方向键/m/f/d） | 大部分重叠 |

### 2.2 提取策略

**不提取到 `@neko/shared`**。原因：
- 这些控件仅在 neko-preview 内部使用（audio + video）
- 音频和视频的视觉风格有意不同（Apple Music vs YouTube）
- 提取到 monorepo 共享包会增加构建依赖和维护成本

**在 neko-preview 内部提取到 `shared/`**：

```
packages/neko-preview/packages/webview/src/shared/
├── ProgressBar.tsx      ← 已存在，无需改动
├── VolumeControl.tsx    ← 新增：音量图标 + 滑块
├── SpeedButton.tsx      ← 新增：速度循环按钮
├── useMediaKeyboard.ts  ← 新增：共享键盘快捷键 hook
├── types.ts             ← 已存在
└── useVscodeMessage.ts  ← 已存在
```

### 2.3 VolumeControl 组件

```typescript
// shared/VolumeControl.tsx
interface VolumeControlProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  /** CSS class prefix for styling variants */
  className?: string;
}
```

**CSS 统一**：将 `.audio-player__volume-*` 和 `.controls__volume-*` 合并为 `.preview-volume-*`，通过 CSS 变量控制尺寸差异。

### 2.4 SpeedButton 组件

```typescript
// shared/SpeedButton.tsx
interface SpeedButtonProps {
  speed: number;
  options?: number[];
  onSpeedChange: (speed: number) => void;
  className?: string;
}
```

**默认选项**：`[0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]`（视频的超集，音频子集自动适配）。

### 2.5 useMediaKeyboard Hook

```typescript
// shared/useMediaKeyboard.ts
interface MediaKeyboardOptions {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  speed: number;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onSpeedChange: (speed: number) => void;
  /** Extra key handlers (e.g. 'f' for fullscreen, 'd' for stats) */
  extraKeys?: Record<string, (e: KeyboardEvent) => void>;
}

function useMediaKeyboard(options: MediaKeyboardOptions): (e: React.KeyboardEvent) => void;
```

**共享快捷键**：空格/k（播放）、←/→（±5s）、↑/↓（音量）、m（静音）、</>（速度）
**扩展点**：`extraKeys` 允许视频添加 f（全屏）、d（统计）、p（PiP）

---

## Phase 3：视频控件样式对齐

### 3.1 目标

视频控件保持 YouTube 风格布局（底部渐变叠加层），但控件的视觉细节（圆角、颜色、hover 效果）对齐音频播放器的精致度。

### 3.2 具体改动

| 项目 | 现状 | 目标 |
|------|------|------|
| 进度条 thumb | 12px 圆形，`--vscode-button-background` | 14px 圆形，`--neko-preview-text-primary`（与音频一致） |
| 进度条 hover | 高度 4→6px | 高度 4→8px（与音频一致） |
| 音量滑块 | 60px 宽，10px thumb | 64px 宽，12px thumb（与音频一致） |
| 速度按钮 | 无 hover 背景 | 添加 `--neko-preview-surface` hover 背景 |
| 按钮 hover | `rgba(255,255,255,0.1)` 硬编码 | `var(--neko-preview-surface)` |

### 3.3 CSS 变量替换

视频控件区域（`.controls__*`）中的裸 `var(--vscode-*)` 引用替换为 `var(--neko-preview-*)`：

```
var(--vscode-button-background)      → var(--neko-preview-accent)
var(--vscode-descriptionForeground)  → var(--neko-preview-text-secondary)
var(--vscode-editor-foreground)      → var(--neko-preview-text-primary)
var(--vscode-scrollbarSlider-background) → color-mix(in srgb, var(--neko-preview-text-secondary) 20%, transparent)
var(--vscode-panel-border)           → var(--neko-preview-border)
```

---

## Phase 4：neko-audio 主题接入（P1）

### 4.1 现状

`editor.css`（401 行）使用 21 个 `--neko-audio-editor-*` CSS 变量，已映射到 `var(--vscode-*)`。未使用 Tailwind。

### 4.2 方案：渐进式迁移

**不做全面 Tailwind 迁移**（成本高、风险大）。改为：

1. 将 `editor.css` 中的 `--neko-audio-editor-*` 变量对齐到 `var(--vscode-*)` 命名规范
2. 添加高对比度覆盖（同 Phase 1.2 模式）
3. 添加浅色主题调整（同 Phase 1.3 模式）
4. 未来如果 neko-audio 有大功能迭代，再考虑 Tailwind 迁移

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
/* ... 逐个替换 */
```

保留 Fountain 剧本排版的领域特殊 CSS（字体、间距、页面布局），仅替换颜色值。`print.css` 不改（打印始终白底黑字）。

---

## Phase 6：共享 UI 组件库（P2，远期）

### 6.1 时机

当满足以下条件之一时启动：
- 第三个包需要相同的控件（如 neko-audio 编辑器需要波形进度条）
- neko-model / neko-sketch 的面板组件重复度超过 3 处

### 6.2 候选组件

| 组件 | 当前位置 | 复用需求 |
|------|---------|---------|
| Panel 容器 | neko-model/neko-sketch/neko-canvas 各自实现 | 3 包重复 |
| IconButton | neko-preview/neko-cut 各自实现 | 2 包重复 |
| Slider | neko-preview/neko-sketch 各自实现 | 2 包重复 |

### 6.3 放置位置

```
@neko/shared (neko-types)
  └── src/components/   ← L2 React 层，新增
      ├── Panel.tsx
      ├── IconButton.tsx
      └── Slider.tsx
```

通过 `@neko/shared/components` 子路径导出，仅 webview 包可引用。

---

## 实施顺序

```
Phase 1.1  变量重命名 --neko-audio-* → --neko-preview-*     [1d]
Phase 1.2  高对比度主题覆盖                                   [0.5d]
Phase 1.3  浅色主题调整                                       [0.5d]
Phase 2    共享控件提取 (VolumeControl/SpeedButton/hook)       [1d]
Phase 3    视频控件样式对齐                                    [0.5d]
Phase 4    neko-audio 主题对齐                                 [0.5d]
Phase 5    neko-story 颜色替换                                 [0.5d]
Phase 6    共享组件库（远期，按需触发）                          [TBD]
```

**依赖关系**：
```
Phase 1.1 → Phase 1.2 / 1.3（变量名确定后才能写覆盖）
Phase 1.1 → Phase 2（共享控件使用新变量名）
Phase 2   → Phase 3（视频控件使用共享组件）
Phase 4 / 5 独立，可并行
```

---

## 风险与约束

| 风险 | 缓解 |
|------|------|
| CSS 变量重命名遗漏 | 全局搜索 `--neko-audio-` 确保无残留；构建后视觉回归测试 |
| 高对比度模式下 Canvas 颜色不可见 | `getCssVar()` 读取的是计算后的值，高对比度覆盖会自动生效 |
| 浅色主题 `color-mix()` 效果不佳 | 单独的 `body.vscode-light` 覆盖层，可独立调整 |
| 共享控件提取破坏现有布局 | 保持 CSS 类名兼容，逐步迁移 |
| neko-story 硬编码颜色遗漏 | 逐行审查 `screenplay.css`，建立替换映射表 |

## 验证清单

- [ ] 深色主题：audio/video 播放器视觉一致
- [ ] 浅色主题：背景/文本/控件颜色正确
- [ ] 高对比度：所有交互元素有可见边框，文本对比度达标
- [ ] Canvas 组件（波形/频谱）颜色跟随主题切换
- [ ] 键盘快捷键在 audio/video 中行为一致
- [ ] `pnpm build` 通过
- [ ] `pnpm check` 无新增违规
