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
4. 剩余旧代码主要集中在 API 不等价的 timeline、context menu、toolbar、keyframe timeline、collapsible shell 和 media progress 组件。
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

## 当前残留总览

### `@neko/shared/components`

剩余 `@neko/shared/components` imports 均应出现在 `legacy-shared-components-imports.test.ts` 的 allowlist 中。新增或修改 Webview UI 时不应再新增未登记的 legacy import。

| 包 | 残留文件 | Legacy 能力 | 保留原因 | 建议清理阶段 |
|----|----------|-------------|----------|--------------|
| Agent | `components/ChatView/DropZone.tsx` | `useFileDrop`, `FileDropResult` | Agent Header/Input 与信息架构在本 ADR 中明确隔离；Agent package 当前不引入 `@neko/ui` | 单独 Agent-safe primitive pass |
| Audio | `Toolbar.tsx` | `VerticalToolbar`, `ToolbarButton`, `ToolbarSeparator` | DAW toolbar 行为与布局未纳入低风险 primitive slice | Toolbar contract pass |
| Audio | `Timeline/AudioClip.tsx`, `Timeline/TrackLane.tsx`, `EditableWaveform.tsx` | `ContextMenu`, `MenuItem` | Timeline / waveform 菜单有包内交互语义，需要先收敛 menu contract | Timeline/menu pass |
| Audio | `Timeline/TimelineRuler.tsx` | `TimelineRuler` | 时间标尺是 timeline 专用组件，不等价于 primitive | Timeline component pass |
| Canvas | `components/common/ContextMenu.tsx` | `ContextMenu`, `MenuItem`, `buildAIMenuSection` | Canvas node/edge/AI 菜单语义复杂，需保持 package-owned 行为 | Canvas menu pass |
| Canvas | `components/media/InlineAudioPlayer.tsx`, `InlineVideoPlayer.tsx` | `ProgressBar` | Inline media playback 需要 seek / progress 行为契约，不能直接换成 generic `Progress` | Media transport pass |
| Canvas | `components/toolbar/CanvasToolbar.tsx` | `ToolbarButton`, `ToolbarSeparator` | Canvas toolbar 涉及 mode、upload、undo/redo 与后续 top toolbar 收敛 | Canvas toolbar pass |
| Cut | `components/ContextMenu.tsx` | `ContextMenu`, `MenuItem` | NLE context menu 行为未纳入 PropertyPanel migration | Cut menu pass |
| Cut | `hooks/useTimelineContextMenu.ts` | `MenuItem`, `buildAIMenuSection` | AI menu section 与 timeline action 需要专用 contract | Timeline/menu pass |
| Cut | `components/Timeline/TimelineRuler.tsx` | `TimelineRuler` | Timeline ruler 需要 timeline contract | Timeline component pass |
| Cut | `components/PropertyPanel/PropertyPanel.tsx` | `CollapsibleSection` | Core rows 已迁移，外层 legacy collapsible shell 尚未替换 | PropertyPanel shell cleanup |
| Model | `components/ModelKeyframeTimeline.tsx` | `KeyframeTimeline` | Keyframe timeline 尚无 `@neko/ui` creative contract | Keyframe timeline pass |
| Model | `components/Toolbar.tsx` | `VerticalToolbar`, `ToolbarButton`, `ToolbarSeparator`, `ToolbarSpacer` | 3D toolbar 工具语义与图标收敛未纳入 Transform / SceneTree slice | Toolbar contract pass |
| Puppet | `components/PuppetKeyframeTimeline.tsx` | `KeyframeTimeline` | Puppet keyframe UI 需要与 Model/Cut 一起统一 | Keyframe timeline pass |
| Sketch | `components/CollapsiblePanel.tsx` | `CollapsibleSection` | Sketch panel shell 保留包内样式；BrushPanel/LayerPanel 控件已迁移 | Panel shell pass |
| Sketch | `components/Toolbar.tsx` | `VerticalToolbar`, `ToolbarButton`, `ToolbarSeparator`, `ToolbarSpacer` | 主绘画工具栏含 tool-specific 行为和图标，未纳入 Brush/Layer slice | Sketch toolbar pass |
| Sketch | `components/SketchCanvas.tsx` | `ContextMenu`, `MenuItem` | Canvas context menu 与绘图交互耦合，需要专门迁移 | Sketch canvas menu pass |

### `@neko/shared/icons`

`@neko/shared/icons` 仍在部分未触达或 Agent 隔离面中使用。当前扫描命中 24 行、21 个文件。触达面应继续优先使用 `@neko/ui/icons` 或 `toCodiconClassName()`。

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
| Canvas | `subsystems/narrative/NarrativePlaybackController.tsx` | `SkipBackIcon`, `SkipForwardIcon`, `PlayIcon` | Narrative playback controls 未触达 | Canvas icon convergence pass |
| Canvas | `subsystems/storyboard/icons.tsx` | `IconProps` type | Storyboard local icon adapter 未触达 | Canvas icon convergence pass |
| Canvas | `components/media/InlineVideoPlayer.tsx` | `PlayIcon`, `PauseIcon`, `VolumeIcon`, `VolumeOffIcon` | Inline media transport 未触达 | Canvas media transport pass |
| Canvas | `components/media/InlineAudioPlayer.tsx` | `PlayIcon`, `PauseIcon`, `VolumeIcon`, `VolumeOffIcon` | Inline media transport 未触达 | Canvas media transport pass |
| Canvas | `components/toolbar/CanvasToolbar.tsx` | `PlusIcon`, `UploadIcon`, `UndoIcon`, `RedoIcon` | Canvas toolbar 未触达 | Canvas toolbar pass |
| Canvas | `components/toolbar/CanvasTopToolbar.tsx` | Toolbar icons | Top toolbar 未触达 | Canvas toolbar pass |
| Canvas | `components/panels/FloatingPanelHost.tsx` | `CloseIcon` | Floating panel shell 未触达 | Canvas shell/icon convergence pass |
| Cut | `components/Toolbar.tsx` | Toolbar icons | NLE toolbar 未做 shared toolbar contract | Cut toolbar pass |
| Cut | `components/PreviewControls.tsx` | Preview transport icons | Preview transport 尚未做 shared transport/control contract | Cut transport pass |
| Model | `components/ViewportNavigationControls.tsx` | Viewport navigation icons | Viewport navigation controls 未纳入 Transform / SceneTree slice | Model viewport controls pass |

## 包级迁移状态

| 包 | 本轮触达面 | 旧代码清理状态 | 下一步 |
|----|------------|----------------|--------|
| Cut | Core PropertyPanel rows、preview/commit、adapter、resize hook import cleanup | Partial legacy remains | 先迁 `CollapsibleSection` shell，再做 timeline/menu/ruler |
| Sketch | BrushPanel、LayerPanel、TreeView、icons、resize hook import cleanup | Partial legacy remains | 先迁 `CollapsiblePanel`，再迁 Toolbar 和 SketchCanvas ContextMenu |
| Puppet | ParameterPanel、PuppetNodeTree、resize hook import cleanup | Partial legacy remains | 与 Model 合并设计 KeyframeTimeline contract |
| Model | TransformPanel、Face sliders、SceneTree、resize hook import cleanup | Partial legacy remains | Toolbar、ViewportNavigationControls、KeyframeTimeline 分批迁 |
| Live | TrackingPanel controls、recording badge；`index.css` 新增 Tailwind base/components/utilities 以支持首次引入 `@neko/ui` primitives | No current shared-components/icon residue found in scan; Tailwind infra change is migration plumbing, not legacy residue | 后续只做 token / visual audit |
| Audio | Transport/effects/export/recording/preset/side controls | Partial legacy remains | Timeline/menu/toolbar pass |
| Canvas | PropertyPanel technical fields、NodeLibrary rows、node gesture hooks import cleanup | Partial legacy remains | Menu/media/toolbar/icon convergence |
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
| L2 Primitives | `@neko/ui/primitives` 已覆盖低风险 UI primitives | 旧 `ContextMenu` / `Toolbar` API 与新 primitive 不等价 | 先定义 compatibility adapters，再替换调用点 |
| L2 Creative | PropertyPanel、TreeView、NumberSlider 等已覆盖主要 creative controls | KeyframeTimeline、TimelineRuler、MediaTransportControls 仍缺 canonical contract | 新增 creative/timeline contracts 后迁移 |
| Package adapters | Cut/Puppet/Model/Sketch/Canvas 等已建立 adapter 模式 | 包内旧 shell、timeline、menu 与 adapter 交错 | 每个包按 owner-owned adapter 小步替换 |

## 建议清理顺序

1. **P0: 保持守卫**
   - `legacy-shared-components-imports.test.ts` 必须继续通过。
   - 每清理一个 legacy import，同步从 allowlist 删除。
   - Agent guardrail 不变：critical Header/Input path 不引入 `@neko/ui`。

2. **P1: Shell / hook 类低风险收口**
   - 已完成 hooks / resize import cleanup。
   - 下一步可替换 Cut `PropertyPanel` 和 Sketch `CollapsiblePanel` 中的 `CollapsibleSection`，前提是视觉和 collapse 默认行为有测试。

3. **P1: Toolbar contract**
   - 覆盖 Audio、Canvas、Model、Sketch toolbar。
   - 不建议直接把 `ToolbarButton` 替换成 `Button`，应先定义 toolbar-specific props、orientation、active state、tooltip、separator 和 icon policy。

4. **P1: Menu contract**
   - 覆盖 Cut、Canvas、Sketch、Audio menus。
   - 需要处理 manual-position menu 与 Radix trigger menu 的差异，以及 AI menu section 的 DTO。

5. **P1: Timeline / Keyframe contract**
   - 覆盖 `TimelineRuler` 和 `KeyframeTimeline`。
   - 这是 Cut、Audio、Model、Puppet 的共性残留，应先设计 `@neko/ui/creative` timeline DTO，再迁对应包。

6. **P2: Media transport contract**
   - 覆盖 Canvas inline media players、Audio transport 与后续 `MediaTransportControls`。
   - 该方向涉及 seek / progress / playback authority 差异，优先级低于 TimelineRuler / KeyframeTimeline contract。

7. **P2: Icon convergence**
   - Canvas / Cut / Model 非触达面继续从 `@neko/shared/icons` 迁到 `@neko/ui/icons`。
   - Agent icon migration 必须等 Agent-specific proposal。

8. **Final: 删除 `@neko/shared/components` React exports**
   - 只有当 allowlist 降到 `@neko/ui` bridge 自身，且所有业务包无 legacy import 后，才能删除或重定向 legacy React exports。

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
