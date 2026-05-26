# Webview UI Legacy Code Audit

Updated: 2026-05-26

本文是 `unify-webview-ui-design-system` 之后的旧代码审计快照，独立于主 ADR 记录当前 Webview UI 旧入口的清理状态、残留原因与后续迁移顺序。

相关文档：

- [adr-webview-ui-design-system.md](./adr-webview-ui-design-system.md)
- [webview-ui-design-system-migration.md](./webview-ui-design-system-migration.md)
- 自动守卫：`packages/neko-ui/src/__tests__/legacy-shared-components-imports.test.ts`

## 结论

本轮迁移已经完成 ADR / OpenSpec 定义的触达面，但没有把所有旧 React UI 代码一次性删除。

当前状态是：

1. `@neko/ui` 是新的 canonical Webview React UI 入口。
2. `@neko/shared/components` 仍作为 legacy compatibility surface 存在。
3. 低风险 hooks / resize 入口已从业务包迁到 `@neko/ui/hooks` 和 `@neko/ui/primitives`。
4. 非 Agent 业务包已经没有 `@neko/shared/components` 直连残留；剩余旧入口只在 Agent 隔离面和 `@neko/ui` bridge 内。
5. Agent Webview 保持隔离；`DropZone` 的 file-drop hook 仍是显式豁免，避免给 Agent package 引入 `@neko/ui` 依赖。

## 已清理项

以下旧代码或旧写法已经无残留：

| 项 | 当前状态 | 说明 |
|----|----------|------|
| `data-neko-slider-proxy` | Cleared | `NumberSlider` 不再渲染隐藏 range proxy；相关测试已改用公开 number input 行为 |
| `FaceParameterSection` | Cleared | Puppet face / parameter controls 已合并到 shared `PropertyPanel` adapter 路径 |
| `as CutPropertyPatch` | Cleared | Cut adapter 改为白名单 patch builder，避免动态对象强断言绕过结构检查 |
| 业务包 raw `codicon codicon-*` 控制图标 | Cleared for touched surfaces | 触达面改用 `@neko/ui/icons` 的 `toCodiconClassName()`；`codicon-modifier-spin` 仍作为 VSCode codicon 修饰类使用 |
| `useDrag` / `useFileDrop` / `useResizable` / `usePersistedResize` / `readPersistedResizeState` / `ResizeHandle` 直接从业务包导入 `@neko/shared/components` | Cleared except Agent `DropZone` | 业务包已切到 `@neko/ui/hooks` / `@neko/ui/primitives`；Agent 保持隔离豁免 |
| Canvas gesture / drop hooks legacy imports | Cleared | `useDragDrop.ts` 使用 `@neko/ui/hooks` 的 `useFileDrop`；`useNodeDrag.ts`、`useNodeResize.ts`、`useNodeRotate.ts` 使用 `@neko/ui/hooks` 的 `useDrag` |
| Cut / Sketch collapsible shell legacy imports | Cleared | Cut `PropertyPanel.tsx` 和 Sketch `CollapsiblePanel.tsx` 已用 `@neko/ui/primitives` 的 `Collapsible` 包装，并保留 legacy shell CSS 类名 |
| Canvas / Cut / Model `@neko/shared/icons` imports | Cleared | 非 Agent 图标入口已收敛到 `@neko/ui/icons`；Agent 仍保持隔离豁免 |
| Audio / Canvas / Model / Sketch toolbar legacy imports | Cleared | `VerticalToolbar`、`ToolbarButton`、`ToolbarSeparator`、`ToolbarSpacer` 已迁到 `@neko/ui/primitives`，保留 `.neko-vtoolbar` / `.neko-toolbar-btn` / `.neko-toolbar-sep` 类名 |
| Cut / Audio timeline ruler legacy imports | Cleared | `TimelineRuler` 已迁到 `@neko/ui/creative`，业务包 adapter 继续保留各自布局、tempo label 和 seek 语义 |
| Model / Puppet keyframe timeline legacy imports | Cleared | `KeyframeTimeline` 与 `KeyframeDiamond` 已迁到 `@neko/ui/creative`，业务包只保留 controller/store adapter |
| Canvas inline media progress legacy imports | Cleared | Canvas `InlineAudioPlayer` / `InlineVideoPlayer` 改用 `@neko/ui/creative` 的 `ProgressBar` / `SeekBar`，保留 preview/commit seek 分离 |
| Audio / Canvas / Cut / Sketch menu legacy imports | Cleared | `PositionedContextMenu` 和 `buildAIMenuSection` 已迁到 `@neko/ui/primitives`，保留 manual x/y 定位、submenu、danger、shortcut 与 AI section 行为 |

## 当前残留总览

### `@neko/shared/components`

剩余 `@neko/shared/components` imports 均应出现在 `legacy-shared-components-imports.test.ts` 的 allowlist 中。新增或修改 Webview UI 时不应再新增未登记的 legacy import。

| 包 | 残留文件 | Legacy 能力 | 保留原因 | 建议清理阶段 |
|----|----------|-------------|----------|--------------|
| Agent | `components/ChatView/DropZone.tsx` | `useFileDrop`, `FileDropResult` | Agent Header/Input 与信息架构在本 ADR 中明确隔离；Agent package 当前不引入 `@neko/ui` | 单独 Agent-safe primitive pass |
| `@neko/ui` | `hooks/index.ts`, `primitives/resize-handle.ts`, `hooks/hooks-compat.test.ts` | hooks / resize compatibility re-export | Bridge required while deleting or redirecting legacy shared React exports is deferred | Final bridge removal / redirect pass |

### `@neko/shared/icons`

`@neko/shared/icons` 只剩 Agent 隔离面使用。当前扫描命中 14 行、11 个文件。触达面应继续优先使用 `@neko/ui/icons` 或 `toCodiconClassName()`。

| 包 | 文件 | 残留能力 / 区域 | 保留原因 | 建议清理阶段 |
|----|------|-----------------|----------|--------------|
| Agent | `components/Header/TabBar.tsx` | `CloseIcon` | Agent UI 隔离；Header 不在本次 migration 中重构 | Agent dedicated redesign / primitive pass |
| Agent | `components/AccountBar/index.tsx` | `ChevronDownIcon` | Agent UI 隔离；account flow 不在本次 migration 中重构 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/InputArea/InputArea.tsx` | `SendIcon`, `StopIcon`, `PlusIcon` | Agent Input 明确隔离 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/InputArea/DropdownMenu.tsx` | `ChevronDownIcon` re-export | Agent Input 明确隔离 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/PlanReview.tsx` | `ChevronRightIcon`, `CheckIcon`, `CloseIcon`, `EditIcon` | Agent review UI 未触达 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/MessageActions.tsx` | `CopyIcon`, `CheckIcon`, `EditIcon`, `RefreshIcon` | Agent message controls 未触达 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/MessageContent/icons.tsx` | `CopyIcon`, `CheckIcon`, `DownloadIcon`, `RefreshIcon`, `CodeIcon` re-export | Agent rich content 未触达 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/ToolCallDisplay/DocumentImageThumbnails.tsx` | `CopyIcon`, `FileIcon` | Agent tool-call UI 未触达 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/ToolCallDisplay/ToolCallDisplay.tsx` | `CopyIcon` | Agent tool-call UI 未触达 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/ToolCallDisplay/icons.tsx` | `FileIcon`, `WarningIcon`, `ChevronDownIcon`, `CheckIcon` re-export | Agent tool-call UI 未触达 | Agent dedicated redesign / primitive pass |
| Agent | `components/ChatView/TaskCard/TaskSteps.tsx` | `ChevronRightIcon` import / re-export | Agent task UI 未触达 | Agent dedicated redesign / primitive pass |

## 包级迁移状态

| 包 | 本轮触达面 | 旧代码清理状态 | 下一步 |
|----|------------|----------------|--------|
| Cut | Core PropertyPanel rows、preview/commit、adapter、resize hook import cleanup、collapsible shell cleanup、icon import convergence、TimelineRuler import cleanup、ContextMenu import cleanup | No current non-Agent shared-components/icon residue found in scan | 后续只做 token / visual audit |
| Sketch | BrushPanel、LayerPanel、TreeView、icons、resize hook import cleanup、CollapsiblePanel shell cleanup、Toolbar import cleanup、SketchCanvas ContextMenu import cleanup | No current non-Agent shared-components/icon residue found in scan | 后续只做 token / visual audit |
| Puppet | ParameterPanel、PuppetNodeTree、resize hook import cleanup、KeyframeTimeline import cleanup | No current non-Agent shared-components/icon residue found in scan | 后续只做 token / visual audit |
| Model | TransformPanel、Face sliders、SceneTree、resize hook import cleanup、ViewportNavigationControls icon import convergence、Toolbar import cleanup、KeyframeTimeline import cleanup | No current shared-components/icon residue found in scan | 后续只做 token / visual audit |
| Live | TrackingPanel controls、recording badge；`index.css` 新增 Tailwind base/components/utilities 以支持首次引入 `@neko/ui` primitives | No current shared-components/icon residue found in scan; Tailwind infra change is migration plumbing, not legacy residue | 后续只做 token / visual audit |
| Audio | Transport/effects/export/recording/preset/side controls、Toolbar import cleanup、TimelineRuler import cleanup、ContextMenu import cleanup | No current non-Agent shared-components/icon residue found in scan | 后续只做 token / visual audit |
| Canvas | PropertyPanel technical fields、NodeLibrary rows、node gesture hooks import cleanup、non-Agent icon import convergence、Toolbar import cleanup、media ProgressBar import cleanup、ContextMenu import cleanup | No current non-Agent shared-components/icon residue found in scan | 后续只做 token / visual audit |
| Preview | Viewer controls and local `Mac*` wrappers adapted to `@neko/ui` | Compatibility wrapper names remain | 可后续重命名 wrapper 或逐步内联 `@neko/ui` imports |
| Tools | Diff controls and media seek controls | No current shared-components residue found in scan | TimelineDiff / waveform SVG can be separate visual cleanup |
| Dashboard | Cards, filters, tables, actions | No current shared-components residue found in scan | Shell/table structure stays package-owned |
| Market | Search, tabs, filters, asset cards, detail picker actions | No current shared-components residue found in scan | Installed/Owned/Updates management list pass |
| Story | Tabs, row menus, scene/character actions | No current shared-components residue found in scan | Table layout / hover preview stay document-owned |
| Agent | Guarded; no Header/Input migration | Explicit legacy + shared-icons residue remains | Separate Agent proposal only |

## 五层分析

| 层 | 当前状态 | 风险 | 清理策略 |
|----|----------|------|----------|
| L0 Contracts | DTO、hooks 类型和 shared compatibility exports 仍在 `@neko/shared/components` / `@neko/ui/hooks` 之间桥接 | 过早删除 shared exports 会破坏未迁移包 | 保持 bridge，先迁业务 imports，再删除 shared React exports |
| L1 Host integration | 无直接变化 | 误把 Agent / Extension 侧流程引入 `@neko/ui` 会破坏边界 | Agent 单独 proposal；Extension 侧不引 React |
| L2 Primitives | `@neko/ui/primitives` 已覆盖低风险 UI primitives、toolbar compatibility API、manual-position menu 与 AI menu section | `@neko/shared/components` bridge 仍存在 | 等 Agent 单独方案或 final bridge pass 后删除/重定向 legacy exports |
| L2 Creative | PropertyPanel、TreeView、NumberSlider、TimelineRuler、KeyframeTimeline、SeekBar 等已覆盖主要 creative controls | 后续风险主要是视觉/token audit，不是 import 残留 | 保持业务 adapter owner-owned |
| Package adapters | Cut/Puppet/Model/Sketch/Canvas 等已建立 adapter 模式 | 包内旧 shell、timeline、menu 与 adapter 交错 | 每个包按 owner-owned adapter 小步替换 |

## 建议清理顺序

1. **P0: 保持守卫**
   - `legacy-shared-components-imports.test.ts` 必须继续通过。
   - 每清理一个 legacy import，同步从 allowlist 删除。
   - Agent guardrail 不变：critical Header/Input path 不引入 `@neko/ui`。

2. **P1: Shell / hook 类低风险收口**
   - 已完成 hooks / resize import cleanup。
   - 已完成 Cut `PropertyPanel` 和 Sketch `CollapsiblePanel` 中的 `CollapsibleSection` 迁移，视觉类名和 collapse 默认行为有测试覆盖。

3. **P1: Toolbar contract**
   - 已完成 Audio、Canvas、Model、Sketch toolbar import cleanup。
   - `@neko/ui/primitives` 提供 toolbar-specific props、active state、separator 和 spacer 兼容组件，后续可再扩展 orientation、tooltip 和 icon policy。

4. **P1: Menu contract**
   - 已完成 Cut、Canvas、Sketch、Audio menu import cleanup。
   - `@neko/ui/primitives` 现在提供 `PositionedContextMenu` 与 `buildAIMenuSection`，保留 manual-position menu 与 Radix trigger menu 两条路径。

5. **P1: Timeline / Keyframe contract**
   - 已完成 `TimelineRuler` 和 `KeyframeTimeline` import cleanup。
   - `@neko/ui/creative` 现在提供 `TimelineRuler`、`KeyframeDiamond`、`KeyframeTimeline`，Cut / Audio / Model / Puppet 保留各自 owning adapter。

6. **P2: Media transport contract**
   - Canvas inline media players 已迁到 `@neko/ui/creative` `SeekBar` / `ProgressBar`，保留 drag preview 与 commit seek 分离。
   - Audio transport 与后续 `MediaTransportControls` 仍需单独 contract，因为 playback authority 差异较大。

7. **P2: Icon convergence**
   - Canvas / Cut / Model 非 Agent 图标入口已从 `@neko/shared/icons` 迁到 `@neko/ui/icons`。
   - Agent icon migration 必须等 Agent-specific proposal。

8. **Final: 删除 `@neko/shared/components` React exports**
   - 非 Agent 业务包已经无 legacy import；allowlist 现在只剩 Agent `DropZone` 和 `@neko/ui` bridge。
   - 删除或重定向 legacy React exports 前，需要先决定 Agent-safe file-drop/icon 迁移策略。

## 验证命令

当前审计使用以下扫描：

```bash
rg -n "@neko/shared/components" packages/neko-cut packages/neko-sketch packages/neko-puppet packages/neko-model packages/neko-live packages/neko-audio packages/neko-canvas packages/neko-preview packages/neko-tools packages/neko-dashboard packages/neko-market packages/neko-story packages/neko-agent -g '*.ts' -g '*.tsx'
rg -n "@neko/shared/icons" packages/neko-cut packages/neko-sketch packages/neko-puppet packages/neko-model packages/neko-live packages/neko-audio packages/neko-canvas packages/neko-preview packages/neko-tools packages/neko-dashboard packages/neko-market packages/neko-story packages/neko-agent -g '*.ts' -g '*.tsx'
rg -n "data-neko-slider-proxy|FaceParameterSection|as CutPropertyPatch|codicon codicon-" packages/neko-cut packages/neko-sketch packages/neko-puppet packages/neko-model packages/neko-live packages/neko-audio packages/neko-canvas packages/neko-preview packages/neko-tools packages/neko-dashboard packages/neko-market packages/neko-story packages/neko-agent -g '*.ts' -g '*.tsx'
pnpm --filter @neko/ui exec vitest run src/__tests__/legacy-shared-components-imports.test.ts src/__tests__/agent-ui-isolation.test.ts
```

## 更新规则

修改旧代码清理状态时，请同步更新：

1. 本文的残留表和包级状态。
2. `docs/architecture/webview-ui-design-system-migration.md` 的 exemption table。
3. `packages/neko-ui/src/__tests__/legacy-shared-components-imports.test.ts` 的 allowlist。
4. 对应包的 targeted typecheck / adapter tests。
