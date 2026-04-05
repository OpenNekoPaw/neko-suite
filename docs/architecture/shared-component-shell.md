# 通用组件 Shell 架构

> 日期: 2026-03-22（更新: 2026-04-05）
> 状态: P1 macOS primitives 已完成；P4 StatusBarGroup/useFileDrop/useDrag 已完成

---

## 背景

neko-suite 包含 9 个 webview 包（neko-cut、neko-agent、neko-audio、neko-sketch、neko-canvas、neko-model、neko-preview、neko-story、neko-tools），各自独立开发导致 UI 组件出现重复实现和风格漂移。

---

## 当前状态诊断

### @neko/shared/components（现有 Shell 基础）

```
packages/neko-types/src/components/
├── VerticalToolbar + ToolbarButton + ToolbarSeparator + ToolbarSpacer  ✅ 已共享
├── CollapsibleSection                                                   ✅ 已共享
├── Panel + PanelSection                                                 ✅ 已共享
├── ContextMenu（含子菜单、毛玻璃风格）                                   ✅ 已共享
├── TimelineRuler（Canvas 刻度尺）                                       ✅ 已共享（adapter 模式范本）
├── KeyframeTimeline + KeyframeDiamond                                   ✅ 已共享（puppet/model adapter）
├── ProgressBar（seek-safe 进度条）                                       ✅ 已共享
├── MacButton / MacIconButton / MacSlider / MacTabs                      ✅ 已共享
├── buildAIMenuSection（AI 右键菜单构建器）                                ✅ 已共享
├── useFileDrop（HTML5 文件拖入）                                         ✅ 已共享（2026-04-05）
└── useDrag<T>（鼠标拖拽 Shell）                                         ✅ 已共享（2026-04-05）
```

### @neko/shared/vscode/extension（Extension Host 工具类）

```
packages/neko-types/src/vscode/extension/
├── StatusBarGroup（状态栏批量管理）                                       ✅ 已共享（2026-04-05）
├── BaseOutlineProvider                                                  ✅ 已共享
├── OutputChannelTransport + createVSCodeLogger                          ✅ 已共享
├── VSCodeErrorHandler                                                   ✅ 已共享
├── getVSCodeLocale + injectLocaleAttribute                              ✅ 已共享
└── createNewFile + templates                                            ✅ 已共享
```

### neko-preview/shared（应成为 Shell 一部分，当前被孤立）

```
packages/neko-preview/packages/webview/src/shared/
├── MacButton       ← 源文件，neko-audio 直接复制 ❌
├── MacIconButton   ← 源文件，neko-audio 直接复制 ❌
├── MacSlider       ← 未共享，neko-model 自行实现 ❌
├── MacTabs         ← 未共享 ❌
└── ProgressBar     ← 未共享（seek-safe 实现）❌
```

### 重复问题汇总

| 问题 | 文件 | 严重程度 |
|------|------|---------|
| MacButton 副本 | `neko-audio/shared/MacButton.tsx` | 中（双路维护） |
| MacIconButton 副本 | `neko-audio/shared/MacIconButton.tsx` | 中（双路维护） |
| ContextMenu 副本 | `neko-canvas/common/ContextMenu.tsx` | 低（需审计） |
| FaceParameterSlider 孤立 | `neko-model/.../FaceParameterSlider.tsx` | 低（领域特定） |

---

## 核心判断

> **Shell 已存在，但边界不清。问题不是"要不要建"，而是 Shell 只覆盖了结构型组件，交互型原子控件各包自行生长。**

### 当前 Shell 职责缺口

| 类别 | 现有 | 缺失 |
|------|------|------|
| **结构型**（布局/容器） | Panel, CollapsibleSection, Toolbar | — |
| **交互型**（原子控件） | MacButton, MacIconButton, MacSlider, MacTabs | Input, Select |
| **叠加型**（浮层/菜单） | ContextMenu, buildAIMenuSection | Dialog |
| **媒体专用** | TimelineRuler, ProgressBar, KeyframeTimeline | — |
| **行为 Hook** | useFileDrop, useDrag\<T\> | — |
| **Extension 工具类** | StatusBarGroup, BaseOutlineProvider, Logger | — |

---

## 目标架构

```
packages/neko-types/src/components/
├── primitives/          ← 原子控件（新增分组）
│   ├── Button.tsx       ← 从 neko-preview/MacButton 迁移，variants: primary/secondary/ghost/icon
│   ├── IconButton.tsx   ← 从 neko-preview/MacIconButton 迁移，sizes: sm/md/lg/xl
│   ├── Slider.tsx       ← 从 neko-preview/MacSlider 迁移，seek-safe 设计
│   ├── Tabs.tsx         ← 从 neko-preview/MacTabs 迁移，毛玻璃 segmented control
│   └── ProgressBar.tsx  ← 从 neko-preview/ProgressBar 迁移，seek-safe + hover tooltip
├── layout/              ← 布局容器（现有整理）
│   ├── Panel.tsx
│   ├── CollapsibleSection.tsx
│   └── Toolbar.tsx
├── overlay/             ← 浮层（现有整理）
│   └── ContextMenu.tsx
├── media/               ← 媒体专用（现有整理）
│   └── TimelineRuler.tsx
└── index.ts             ← 统一导出
```

### 导出规范

```typescript
// @neko/shared/components（index.ts）

// primitives
export { Button } from './primitives/Button';
export { IconButton } from './primitives/IconButton';
export { Slider } from './primitives/Slider';
export { Tabs } from './primitives/Tabs';
export { ProgressBar } from './primitives/ProgressBar';

// layout
export { Panel, PanelSection } from './layout/Panel';
export { CollapsibleSection } from './layout/CollapsibleSection';
export { VerticalToolbar, ToolbarButton, ToolbarSeparator, ToolbarSpacer } from './layout/Toolbar';

// overlay
export { ContextMenu } from './overlay/ContextMenu';

// media
export { TimelineRuler } from './media/TimelineRuler';
```

---

## 组件迁移详情

### P1 — 直接迁移（消除重复）

#### Button（从 MacButton 迁移）

```typescript
// 现有 API（neko-preview/shared/MacButton.tsx）
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}
```

受益包：neko-audio（删除副本）、neko-model、neko-canvas、neko-cut、neko-agent

#### IconButton（从 MacIconButton 迁移）

```typescript
interface IconButtonProps {
  variant?: 'default' | 'primary';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  active?: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}
```

受益包：neko-audio（删除副本）、neko-cut、neko-sketch

#### Slider（从 MacSlider 迁移）

```typescript
interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
  onCommit?: (value: number) => void;  // seek-safe: 只在 mouseup 提交
  formatTooltip?: (value: number) => string;
  className?: string;
}
```

受益包：neko-audio、neko-model（FaceParameterSlider 可基于此封装）

#### Tabs（从 MacTabs 迁移）

```typescript
interface TabsProps {
  items: Array<{ id: string; label: string; icon?: React.ReactNode }>;
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}
```

受益包：neko-preview、neko-audio、neko-agent

#### ProgressBar（从 ProgressBar 迁移）

```typescript
interface ProgressBarProps {
  value: number;          // 0-1，实际进度
  duration?: number;      // 总时长（秒），用于 tooltip
  onSeek?: (time: number) => void;  // seek-safe，仅 mouseup 触发
  variant?: 'default' | 'video';
  className?: string;
}
```

受益包：neko-preview、neko-audio

---

### P2 — 统一现有（消除本地副本）

| 操作 | 文件 |
|------|------|
| 删除 | `packages/neko-audio/packages/webview/src/shared/MacButton.tsx` |
| 删除 | `packages/neko-audio/packages/webview/src/shared/MacIconButton.tsx` |
| 更新 import | neko-audio 所有使用处改为 `@neko/shared/components` |
| 审计删除 | `packages/neko-canvas/packages/webview/src/components/common/ContextMenu.tsx` |

---

### P3 — 补全空缺（持续补充）

以下组件各包均有散装实现，建议在使用需求出现时再提取，避免过早抽象：

| 组件 | 优先级 | 触发条件 |
|------|--------|---------|
| `Input` / `TextField` | P3 | 第 3 个包出现同样实现时 |
| `Select` / `Dropdown` | P3 | 第 3 个包出现同样实现时 |
| `Dialog` / `Modal` | P3 | 第 3 个包出现同样实现时 |
| `Badge` / `Chip` | P3 | 第 3 个包出现同样实现时 |
| `Toast` / `Notification` | P3 | 第 3 个包出现同样实现时 |

---

## 关键设计原则

### 1. 不改名，仅迁移

`MacButton` 在文件内部名称保持不变，对外导出时提供友好名称：

```typescript
// primitives/Button.tsx
const Button = MacButton;  // 内部实现保留原名
export { Button };
export type { ButtonProps };
```

### 2. Adapter 模式继续有效

领域特定组件基于 Shell 原子组件封装，而非替换：

```typescript
// neko-model 的 FaceParameterSlider.tsx
import { Slider } from '@neko/shared/components';

interface FaceParameterSliderProps {
  parameter: FaceParameter;
  value: number;
  onChange: (value: number) => void;
}

export function FaceParameterSlider({ parameter, value, onChange }: FaceParameterSliderProps) {
  return (
    <div className="face-param-slider">
      <label>{parameter.label}</label>
      <Slider
        value={value}
        min={parameter.min}
        max={parameter.max}
        onChange={onChange}
        formatTooltip={(v) => v.toFixed(2)}
      />
    </div>
  );
}
```

### 3. 样式 Token 统一是前提

Phase 1 的 macOS Token（`neko-glass`, `neko-surface-*` 等）需先就位，
组件才能使用 Tailwind 类而非硬编码颜色。详见 [ui-modernization-design.md](./ui-modernization-design.md)。

### 4. 不新建包

`@neko/shared`（`neko-types`）是唯一落地位置，避免引入新的依赖关系和循环依赖风险。

---

## 实施路径

```
Step 1（1 天）：整理目录结构
  ├─ 在 neko-types/src/components/ 创建 primitives/ layout/ overlay/ media/ 子目录
  ├─ 将现有组件移入对应子目录
  └─ 更新 index.ts 统一导出

Step 2（1 天）：迁移 macOS primitives
  ├─ Button.tsx   ← neko-preview/shared/MacButton
  ├─ IconButton.tsx ← neko-preview/shared/MacIconButton
  ├─ Slider.tsx   ← neko-preview/shared/MacSlider
  ├─ Tabs.tsx     ← neko-preview/shared/MacTabs
  └─ ProgressBar.tsx ← neko-preview/shared/ProgressBar

Step 3（0.5 天）：消除重复
  ├─ 删除 neko-audio/shared/MacButton.tsx + MacIconButton.tsx
  ├─ 更新 neko-audio 的 import 路径
  └─ 审计 neko-canvas/common/ContextMenu.tsx

Step 4（持续）：规范
  └─ 新功能开发时优先使用 @neko/shared/components，按"三包规则"决定是否提取
```

---

## 与 UI 现代化的关系

本文档与 [ui-modernization-design.md](./ui-modernization-design.md) 协同：

| 阶段 | 内容 | 关联 |
|------|------|------|
| Phase 1 | macOS Token 体系 | 为 primitives 组件提供设计 Token |
| Phase 4.5 | neko-audio Tailwind 迁移 | 迁移完成后删除 MacButton/MacIconButton 副本 |
| **本文档** | 组件 Shell 架构 | 先建好 Shell，再推进各包迁移 |

---

## P4 — 行为抽象（2026-04-05，已完成）

### StatusBarGroup（Extension Host 工具类）

统一 VSCode StatusBarItem 的批量生命周期管理。

```typescript
import { StatusBarGroup } from '@neko/shared/vscode/extension';

const bar = new StatusBarGroup([
  { id: 'neko.audio.duration', alignment: Left, priority: 100, name: 'Duration' },
  { id: 'neko.audio.codec',    alignment: Left, priority: 99,  name: 'Codec' },
  { id: 'neko.audio.selection', alignment: Left, priority: 98,  visible: 'conditional' },
]);
bar.show();                                     // show all 'always' items
bar.update('neko.audio.duration', '$(clock) 3:45');
bar.setVisible('neko.audio.selection', true);    // show/hide conditional items
bar.dispose();                                   // clean up all items
```

**已迁移**: neko-audio, neko-canvas, neko-sketch, neko-cut, neko-preview
**不迁移**: neko-agent（工厂函数 + watcher，单 item）

### useFileDrop（Webview Hook）

统一 HTML5 DnD 文件拖入逻辑，处理三种来源：`text/uri-list`（VSCode explorer）、`application/json`（Asset Library）、`File`（原生文件）。

```typescript
import { useFileDrop } from '@neko/shared/components';

const { isDragOver, dropProps } = useFileDrop((result) => {
  if (result.type === 'uri-list') postMessage({ type: 'drop', uris: result.uris });
  if (result.type === 'native-file') handleFiles(result.files!);
}, { accept: ['mp3', 'wav'], maxSize: 50 * 1024 * 1024 });

return <div {...dropProps} className={isDragOver ? 'highlight' : ''} />;
```

**已迁移**: neko-audio/useDragDrop, neko-canvas/useDragDrop, neko-agent/DropZone
**不迁移**: neko-cut/useAssetDragDrop（内部排序协议，语义不同）

### useDrag\<T\>（Webview Hook）

鼠标拖拽骨架 hook，封装 mousedown → document mousemove/mouseup → cleanup 生命周期。泛型 `T` 在 onStart 捕获初始状态，自动传递给 onMove/onEnd。

```typescript
import { useDrag } from '@neko/shared/components';

interface Ctx { startX: number; startY: number; zoom: number; }
const { isDragging, bindDrag } = useDrag<Ctx>({
  onStart: (e) => ({ startX: e.clientX, startY: e.clientY, zoom: viewport.zoom }),
  onMove:  (e, ctx) => { /* delta calc using ctx */ },
  onEnd:   (e, ctx) => { /* commit final position */ },
}, { threshold: 5 });

return <div {...bindDrag} />;
```

**已迁移**: useNodeDrag, useNodeResize, useNodeRotate, Playhead
**不迁移**: useMarqueeSelect（React-level 事件 + 中间 marqueeRect 状态）、useTimelineSelection（复杂 getElementsInSelectionBox 回调）、useMinimapInteraction（双入口不匹配）

---

## 参考

- [ui-modernization-design.md](./ui-modernization-design.md) — macOS Token 设计方案
- [ui-modernization.md](./ui-modernization.md) — 现代化分析
- `packages/neko-types/src/components/` — 现有共享组件源码
- `packages/neko-preview/packages/webview/src/shared/` — 待迁移的 macOS 组件源码
