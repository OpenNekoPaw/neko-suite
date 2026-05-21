# ADR: Webview UI 设计体系 — 共享组件层 + shadcn/Radix 引入策略

## 状态

Proposed (2026-05-19)

## 关联 ADR

| 关联文档 | 关系 |
|---|---|
| [adr-capability-protocol.md](./adr-capability-protocol.md) | Webview 安全边界参考 — `@neko/ui` 同样遵循零 vscode 依赖，但属于 React/DOM UI 层 |
| [adr-asset-federation.md](./adr-asset-federation.md) | AssetBrowser 统一组件的需求来源 — assets / preview / market 三包共享 |
| [vscode-constraints.md](./vscode-constraints.md) | Webview 安全沙盒约束 — CSP / 无动态加载 / 资源路径限制 |
| [adr-device-management.md](./adr-device-management.md) | 原生 VSCode UI（TreeView/QuickPick）与 Webview UI 的边界划分 |

---

## 背景

### 1.1 当前技术栈一致性

Neko Suite 13 个 webview 子包已在底层框架上高度统一：

| 维度 | 选型 | 一致性 |
|------|------|--------|
| UI 框架 | React 18.2.0 | 100% |
| 构建工具 | Vite 6.4.2 | 100% |
| 样式方案 | Tailwind 3.3.6 + `nekoTailwindPreset` | 100% |
| 主题 | `@neko/shared/theme` → VSCode CSS 变量自动同步 | 100% |
| 状态管理 | Zustand 4.4.x（7 包）/ React built-in（6 包） | 统一 |
| i18n | `@neko/shared/i18n` + 各包自管翻译文件 | 100% |
| 滚动条 | 7px macOS 风格 webkit-scrollbar | 100% |
| 布局 | Flexbox-first (75-96%), gap 优于 margin | 统一 |

### 1.2 当前设计基建

**Design Tokens（质量高）**:

```
--neko-surface / --neko-elevated / --neko-glass-bg    颜色
--neko-accent / --neko-danger / --neko-hover           交互
--neko-border / --neko-divider                         分隔
--neko-shadow-sm/md/lg/xl                              阴影四级
--neko-radius-sm(6px)/md(8px)/lg(12px)/xl(16px)       圆角
--neko-glass-blur / --neko-glass-border                毛玻璃
```

三主题支持：Dark（默认）/ Light / High Contrast，自动跟随 VSCode。

**共享组件库（@neko/shared/components）**:

| 类别 | 组件 |
|------|------|
| Layout | VerticalToolbar, ToolbarButton, ToolbarSeparator, ToolbarSpacer, Panel, PanelSection, CollapsibleSection, ResizeHandle |
| Overlay | ContextMenu, buildAIMenuSection |
| Media | TimelineRuler, ProgressBar |
| Keyframe | KeyframeDiamond, KeyframeTimeline |
| Primitives | MacButton, MacIconButton, MacSlider, MacTabs |
| Hooks | useDrag, useResizable, useFileDrop |
| Icons | 28+ SVG 组件 (Play, Pause, Chevron, Copy, Search...) |

### 1.3 各子包 UI 复用 vs 自建现状

| 能力 | cut | canvas | sketch | agent | model | puppet | market | preview |
|------|:---:|:------:|:------:|:-----:|:-----:|:------:|:------:|:-------:|
| 属性面板 | 自建 | 自建(registry) | 多面板 | — | 多面板 | 自建 | — | — |
| 右键菜单 | 包装共享 | 包装共享 | 包装共享 | — | — | — | — | 自建 |
| 颜色选择 | HTML5 | — | — | — | — | — | — | — |
| 滑块 | — | — | — | — | 自建 | — | — | MacSlider |
| 工具栏 | 自建 | 共享 | 共享 | — | 共享 | — | — | — |
| 拖放 | 自建 | hook | 自建 | hook | — | — | — | — |
| 时间轴 | 自建(4500LOC) | 自建(节点) | 自建(帧) | — | 包装共享 | 包装共享 | — | — |
| 图层/树 | — | 节点树 | 图层树 | — | 场景树 | 骨骼树 | — | — |

---

## 问题分析

### 2.1 组件层缺口

| 问题 | 严重度 | 受影响包 | 说明 |
|------|:------:|---------|------|
| 无 PropertyPanel 抽象 | P0 | cut, canvas, sketch, model, puppet, puppet | 6 包各自实现属性检查器，模式相似但代码不复用 |
| 无颜色选择器 | P0 | cut(HTML5 原生), sketch, canvas, model | 创作软件核心控件缺失 |
| 无数值输入(NumberInput) | P0 | cut, sketch, model, puppet | 缺少带拖拽调节的数值输入（Blender/Figma 标配） |
| 图标碎片化 | P1 | 全部 | agent 有组件封装，其他包直接 inline SVG，无统一管理 |
| 树组件重复 | P1 | canvas, sketch, model, puppet | 图层树/场景树/骨骼树/节点树各自实现 |
| 无 Dialog/Popover | P1 | 全部 | 弹窗、浮层无统一组件，各包 ad-hoc 实现 |
| 无 Tooltip | P1 | 全部 | 仅靠 HTML title 属性 |
| 交互状态不齐 | P2 | model, market, sketch | cut 有完整 hover/focus/active/disabled，其他包不齐 |
| 硬编码颜色 | P2 | canvas(81), agent(96), sketch(89) | 应使用 `--neko-*` tokens |
| a11y 薄弱 | P2 | 全部 | 仅全局 focus-visible，无系统性 ARIA / 键盘导航 |

### 2.2 创作场景的共性需求

```
视频剪辑 (cut)     ─┐
2D 绘画 (sketch)   ─┤── 属性面板 / 颜色选择器 / 数值输入 / 工具栏
2D 骨骼 (puppet)   ─┤── 图层/树视图 / 拖拽排序 / 右键菜单
3D 建模 (model)    ─┤── 缩放平移画布 / 对齐辅助线
画布编排 (canvas)   ─┤── 素材浏览器 / 弹窗+浮层 / Tooltip
剧本 (story)       ─┘── i18n / a11y / 键盘快捷键
```

### 2.3 约束条件

| 约束 | 影响 |
|------|------|
| **VSCode CSP** | 禁止 eval / 无动态 import / 无外部 CDN → 排除运行时重量级 UI 框架 |
| **独立打包** | 每个 webview 独立 bundle → 组件必须 tree-shakable |
| **主题跟随** | 必须消费 VSCode CSS 变量 → 排除自带样式系统的 UI 库 |
| **Webview UI 层** | UI 组件包不可依赖 `vscode` API → 纯 React + CSS；因依赖 React/DOM，不归入 L0 |
| **渐进迁移** | 13 个 webview 不可能一次性重写 → 必须支持新旧组件共存 |

---

## 第三方 UI 库评估

### 3.1 候选方案

| 方案 | 包大小 | VSCode CSP 兼容 | 主题适配 | 创作控件覆盖 | 风险 |
|------|--------|:--------------:|---------|:-----------:|------|
| **Radix UI Primitives** | ~50KB (按需) | ✅ 无样式原语 | ✅ 完全自定义 | 低 | 低 |
| **shadcn/ui** | 0KB (源码复制) | ✅ Tailwind 原生 | ✅ CSS 变量驱动 | 中 | 极低 |
| **Ark UI** | ~40KB (按需) | ✅ headless | ✅ 完全自定义 | 低 | 低 |
| **Mantine** | ~200KB | ⚠️ 自带样式系统 | ⚠️ 需大量覆盖 | 高 | 中 |
| **Ant Design** | ~1MB | ❌ 体积大、样式侵入 | ❌ 主题系统冲突 | 高 | 高 |
| **完全自建** | 0 | ✅ | ✅ | 按需 | 维护成本高 |

### 3.2 排除理由

| 排除 | 原因 |
|------|------|
| Ant Design / Arco Design | 体积 >1MB，自带样式系统与 Tailwind + VSCode CSS 变量冲突，CSP 风险 |
| Mantine | 200KB+，虽然质量高但自有 CSS-in-JS 主题系统需要大量覆盖层，增加维护负担 |
| Material UI | Google 风格与 macOS 设计语言冲突，Emotion 依赖 |
| 完全自建 | a11y（ARIA / 焦点管理 / 键盘导航）从零实现成本极高且容易遗漏 |

### 3.3 决策：shadcn/ui 模式 + Radix Primitives

**选型理由**：

1. **shadcn/ui 不是 npm 依赖，是源码模式** — 组件源码复制到 `@neko/ui`，完全可控，不存在版本升级风险
2. **Radix Primitives 补齐 a11y** — ARIA 属性、焦点管理、键盘导航均由 Radix 处理，经过 WAI-ARIA 规范验证
3. **Tailwind 原生** — shadcn/ui 所有样式通过 Tailwind class + CSS 变量，与现有 `nekoTailwindPreset` 无缝集成
4. **按需引入** — 只复制需要的组件，不引入整个库，tree-shaking 天然满足
5. **渐进迁移** — 新旧组件可共存，不需要一次性重写

**从 shadcn/ui 可直接获取的组件**：

| shadcn 组件 | 解决的问题 | Radix 原语 | 估计大小 |
|------------|-----------|-----------|---------|
| Dialog | 无统一弹窗 | `@radix-ui/react-dialog` | ~8KB |
| Popover | 无浮层 | `@radix-ui/react-popover` | ~12KB |
| Select | 各包自建下拉 | `@radix-ui/react-select` | ~15KB |
| Context Menu | 增强现有实现 | `@radix-ui/react-context-menu` | ~12KB |
| Slider | 补齐数值拖拽 | `@radix-ui/react-slider` | ~6KB |
| Tooltip | 无统一 Tooltip | `@radix-ui/react-tooltip` | ~6KB |
| Collapsible | 增强 CollapsibleSection | `@radix-ui/react-collapsible` | ~3KB |
| ScrollArea | 统一滚动容器 | `@radix-ui/react-scroll-area` | ~5KB |
| Toggle / ToggleGroup | 工具栏单选/多选 | `@radix-ui/react-toggle` | ~3KB |
| Tabs | 增强 MacTabs | `@radix-ui/react-tabs` | ~4KB |

**需要自建的创作领域组件**（shadcn 不覆盖）：

| 组件 | 说明 | 参考 |
|------|------|------|
| ColorPicker | HSL/HEX/Alpha + 吸色器接口 | Figma / Photoshop 颜色面板 |
| NumberInput | 拖拽调节 + 步进 + 表达式输入 | Blender / After Effects 数值控件 |
| PropertyPanel | 可折叠属性检查器框架 + 属性行布局 | VSCode Properties Panel / Unity Inspector |
| TreeView | 拖拽排序树 + 多选 + 重命名 | 图层/场景/骨骼树统一 |
| AssetBrowser | 网格/列表/瀑布流 + 搜索过滤 | Finder / Adobe Bridge |
| Canvas2DContainer | 缩放平移画布壳 + 辅助线 | Figma 无限画布 |

---

## 方案设计

### 4.1 `@neko/ui` 包结构

```
packages/neko-ui/                          ← 新建 L2 Webview UI 包
├── package.json                           ← @neko/ui, peerDep: react 18
├── tsconfig.json
├── tailwind.config.ts                     ← extends nekoTailwindPreset
├── vitest.config.ts
│
├── src/
│   ├── primitives/                        ← shadcn/ui 源码复制 + neko 主题定制
│   │   ├── dialog.tsx                     ← Radix Dialog + neko glass 样式
│   │   ├── popover.tsx
│   │   ├── select.tsx
│   │   ├── context-menu.tsx               ← 替换 @neko/shared ContextMenu
│   │   ├── slider.tsx                     ← Radix Slider + neko accent
│   │   ├── tooltip.tsx
│   │   ├── toggle-group.tsx               ← 工具栏选择
│   │   ├── scroll-area.tsx
│   │   ├── collapsible.tsx
│   │   ├── tabs.tsx
│   │   └── index.ts
│   │
│   ├── creative/                          ← 创作领域自建
│   │   ├── color-picker/
│   │   │   ├── color-picker.tsx           ← HSL wheel + HEX input + Alpha
│   │   │   ├── color-swatch.tsx           ← 色板
│   │   │   └── index.ts
│   │   ├── number-input/
│   │   │   ├── number-input.tsx           ← 拖拽调节 + 步进 + 键盘
│   │   │   └── index.ts
│   │   ├── property-panel/
│   │   │   ├── property-panel.tsx         ← 面板框架
│   │   │   ├── property-row.tsx           ← label:control 行布局
│   │   │   ├── property-group.tsx         ← 可折叠属性组
│   │   │   └── index.ts
│   │   ├── tree-view/
│   │   │   ├── tree-view.tsx              ← 虚拟滚动树
│   │   │   ├── tree-item.tsx              ← 拖拽排序节点
│   │   │   └── index.ts
│   │   ├── asset-browser/
│   │   │   ├── asset-browser.tsx          ← 视图切换容器
│   │   │   ├── asset-grid.tsx             ← 网格/瀑布流
│   │   │   ├── asset-list.tsx             ← 列表
│   │   │   └── index.ts
│   │   └── canvas-container/
│   │       ├── canvas-container.tsx        ← 缩放平移壳
│   │       ├── use-pan-zoom.ts            ← 手势 hook
│   │       └── index.ts
│   │
│   ├── hooks/                             ← 从 @neko/shared 迁移 + 新增
│   │   ├── use-drag.ts                    ← 迁移自 @neko/shared
│   │   ├── use-resizable.ts               ← 迁移自 @neko/shared
│   │   ├── use-file-drop.ts               ← 迁移自 @neko/shared
│   │   ├── use-hotkeys.ts                 ← 新增：键盘快捷键
│   │   └── index.ts
│   │
│   ├── icons/                             ← 从 @neko/shared/icons 迁移
│   │   ├── media.tsx                      ← Play, Pause, Stop, Volume...
│   │   ├── navigation.tsx                 ← Chevron, Arrow...
│   │   ├── action.tsx                     ← Copy, Download, Edit, Send...
│   │   ├── status.tsx                     ← Error, Warning, Success, Loading...
│   │   ├── editor.tsx                     ← Code, File, Zoom, Undo, Redo...
│   │   └── index.ts
│   │
│   ├── utils/
│   │   └── cn.ts                          ← clsx + tailwind-merge
│   │
│   └── index.ts                           ← 公共 API
│
├── src/i18n/
│   └── locales/
│       ├── en/common.ts                   ← "Cancel" / "Confirm" / "Delete" / "Undo"
│       └── zh-cn/common.ts               ← "取消" / "确认" / "删除" / "撤销"
│
└── __tests__/
```

### 4.2 Layer 约束

```
Layer 2:  @neko/ui (无 vscode 依赖，纯 React + Tailwind)
              │
              ├── peerDependencies: react, react-dom
              ├── dependencies: @radix-ui/react-* (按需)
              └── devDependencies: @neko/shared/theme (Tailwind preset)

消费方:   各 webview 子包 → import { ... } from '@neko/ui'
```

**不变量**：
- `@neko/ui` 不可 import `vscode`
- `@neko/ui` 不可 import 任何 `@neko/*` 运行时包（`@neko/shared/theme` 仅用于 Tailwind 编译时）
- `@neko/ui` 依赖 React/DOM，属于 L2 Webview UI 层；纯 DTO、协议和跨层类型仍放在 `@neko/shared` L0
- 所有组件通过 CSS 变量消费主题，不硬编码颜色

### 4.3 shadcn 组件定制规范

从 shadcn/ui 复制的每个组件需做以下适配：

```typescript
// 1. 样式替换：shadcn 默认色 → neko design tokens
// Before (shadcn default):
"bg-background text-foreground border-border"
// After (neko adapted):
"bg-[var(--neko-surface)] text-[var(--neko-fg)] border-[var(--neko-border)]"

// 2. 毛玻璃：浮层组件统一使用 glass 效果
// Dialog / Popover / ContextMenu / Select overlay:
"backdrop-blur-[var(--neko-glass-blur)] bg-[var(--neko-glass-bg)] border-[var(--neko-glass-border)]"

// 3. 阴影：使用 neko 四级阴影
// Tooltip: shadow-[var(--neko-shadow-sm)]
// Popover: shadow-[var(--neko-shadow-md)]
// Dialog:  shadow-[var(--neko-shadow-xl)]

// 4. 圆角：使用 neko 统一尺度
// 小控件: rounded-[var(--neko-radius-sm)]   (6px)
// 面板:   rounded-[var(--neko-radius-md)]   (8px)
// 弹窗:   rounded-[var(--neko-radius-lg)]   (12px)
// 卡片:   rounded-[var(--neko-radius-xl)]   (16px)

// 5. 动画：保持 CSS transition 风格
"transition-colors duration-150"  // 颜色变化
"transition-opacity duration-200" // 显隐
```

### 4.4 与现有 @neko/shared/components 的关系

```
Phase 1: 共存期
  @neko/shared/components  ← 现有组件继续使用
  @neko/ui                 ← 新组件 + shadcn 基础组件
  各子包同时消费两者

Phase 2: 迁移期
  @neko/shared/components  ← 逐步标记 @deprecated
  @neko/ui                 ← 吸收共享组件
  各子包逐包迁移

Phase 3: 完成
  @neko/shared/components  ← 仅保留非 UI 导出（types, hooks 等非 React 部分）
  @neko/ui                 ← 统一 UI 组件层
```

**迁移映射**：

| @neko/shared/components | → @neko/ui | 变化 |
|------------------------|-----------|------|
| ContextMenu | primitives/context-menu | Radix 重写，增强键盘导航 + a11y |
| CollapsibleSection | primitives/collapsible | Radix 重写，动画增强 |
| MacTabs | primitives/tabs | Radix 重写，保持视觉风格 |
| MacSlider | primitives/slider | Radix 重写，增强 a11y |
| MacButton, MacIconButton | 保留于 @neko/shared | 足够简单，无需 Radix |
| Panel, PanelSection | creative/property-panel | 升级为通用属性面板 |
| VerticalToolbar, ToolbarButton | 迁移至 @neko/ui + ToggleGroup | Radix ToggleGroup 增强 |
| TimelineRuler, KeyframeTimeline | 迁移至 @neko/ui/creative | 保持现有实现 |
| ProgressBar, KeyframeDiamond | 迁移至 @neko/ui/creative | 保持现有实现 |
| useDrag, useResizable, useFileDrop | hooks/ | 直接迁移 |
| Icons (28+) | icons/ | 按类别分文件组织 |

### 4.5 视觉一致性修复

| 问题 | 修复方案 | 涉及包 |
|------|---------|--------|
| 硬编码颜色 (266 处) | 批量替换为 `--neko-*` tokens | canvas, agent, sketch |
| 交互状态不齐 | `@neko/ui` 组件统一内置 hover/focus/active/disabled | 所有包 |
| 图标 inline SVG | 迁移到 `@neko/ui/icons` 统一组件 | 除 agent 外 |
| focus 环不一致 | 全局 `focus-visible` + Radix 焦点管理 | 所有包 |

---

## 实施计划

### Phase 0: 基础设施（~2d）

| PR | 内容 |
|----|------|
| PR0-1 | 创建 `@neko/ui` 包骨架：package.json, tsconfig, tailwind.config, vitest.config, cn.ts |
| PR0-2 | 从 @neko/shared 迁移 hooks (useDrag, useResizable, useFileDrop) + icons 到 @neko/ui，@neko/shared 侧 re-export 保持兼容 |

### Phase 1: Primitives — shadcn/Radix 引入（~3d）

| PR | 内容 | 优先级 |
|----|------|:------:|
| PR1-1 | Tooltip + Popover (最常需、最简单) | P0 |
| PR1-2 | Dialog (替换各包 ad-hoc 弹窗) | P0 |
| PR1-3 | Select + Combobox | P0 |
| PR1-4 | ContextMenu (Radix 重写，保持 glass 风格 + AI menu builder) | P1 |
| PR1-5 | Slider + Tabs + Collapsible + ScrollArea + ToggleGroup | P1 |

### Phase 2: Creative 组件 — 自建（~5d）

| PR | 内容 | 优先级 |
|----|------|:------:|
| PR2-1 | ColorPicker (HSL/HEX/Alpha) | P0 |
| PR2-2 | NumberInput (拖拽调节 + 步进 + 键盘输入) | P0 |
| PR2-3 | PropertyPanel + PropertyRow + PropertyGroup | P1 |
| PR2-4 | TreeView (虚拟滚动 + 拖拽排序 + 多选) | P1 |
| PR2-5 | AssetBrowser (网格/列表/瀑布流) | P2 |
| PR2-6 | Canvas2DContainer + usePanZoom | P2 |

### Phase 3: 子包迁移（~4d）

| PR | 内容 |
|----|------|
| PR3-1 | neko-cut: 属性面板 → PropertyPanel, ColorInput → ColorPicker, ContextMenu 迁移 |
| PR3-2 | neko-canvas: PropertyPanel + ContextMenu + TreeView 迁移 |
| PR3-3 | neko-sketch: 面板组件 + LayerPanel → TreeView |
| PR3-4 | neko-model: 面板组件 + SceneTree → TreeView + FaceSlider → NumberInput |
| PR3-5 | neko-puppet: ParameterPanel + BoneTree → TreeView |
| PR3-6 | neko-market + neko-preview: Dialog + Select + AssetBrowser |

### Phase 4: 清理 + a11y（~2d）

| PR | 内容 |
|----|------|
| PR4-1 | 硬编码颜色批量替换 (canvas/agent/sketch) |
| PR4-2 | @neko/shared/components deprecated 标记 + 文档更新 |
| PR4-3 | a11y 审计 + ARIA 补全 |

**总工期估算**：~16 eng-days，可并行（Phase 1 + Phase 2 部分可同时推进）

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| Radix 运行时与 VSCode CSP 冲突 | 组件无法渲染 | Phase 0 末做 PoC：在真实 webview 中验证 Dialog + Popover + ContextMenu |
| bundle 体积增长 | webview 加载变慢 | 按需引入 Radix 原语，每个 webview 只打包使用的组件；Phase 1 后测量 |
| 迁移期两套组件共存 | 维护成本暂时增加 | @neko/shared 侧 re-export @neko/ui 保持 import 路径不变，逐包迁移 |
| 创作组件自建质量 | ColorPicker 等复杂控件 bug | 参考成熟实现（react-colorful 等），重点测试边界值 |

---

## Kill Switches

| 开关 | 作用 | 默认 |
|------|------|------|
| 回退到 @neko/shared | @neko/shared re-export 层可随时切回旧实现 | 否 |
| Radix 单组件禁用 | 每个 Radix 组件独立引入，可单独移除 | 否 |

---

## 决策总结

1. **不换底层框架** — React + Tailwind + Vite + Design Tokens 体系保持不变
2. **新建 `@neko/ui` L2 Webview UI 包** — 统一组件层，不修改现有 `@neko/shared` 非 UI 部分
3. **shadcn/ui 源码模式 + Radix Primitives** — 基础控件（Dialog/Popover/Select/Tooltip/ContextMenu/Slider 等）
4. **创作领域自建** — ColorPicker / NumberInput / PropertyPanel / TreeView / AssetBrowser / Canvas2DContainer
5. **渐进迁移** — Phase 0-4 分阶段，@neko/shared re-export 保持向后兼容
6. **i18n 不变** — 共享组件自带通用文案，各子包继续自管领域翻译
