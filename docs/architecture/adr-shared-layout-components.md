# ADR: Shared Webview Layout Resize Primitives

- **Status**: Accepted / Implemented
- **Date**: 2026-05-13
- **Scope**: All webview sub-packages

## Context

Neko Suite has 13 webview sub-packages. `@neko/shared/components` (Layer 2) already provides a set of shared React components and hooks:

| Category | Existing Components |
|----------|-------------------|
| Layout / Structure | `VerticalToolbar`, `ToolbarButton`, `ToolbarSeparator`, `ToolbarSpacer`, `CollapsibleSection`, `Panel`, `PanelSection` |
| Media | `TimelineRuler`, `ProgressBar` |
| Keyframe | `KeyframeDiamond`, `KeyframeTimeline` |
| Primitives | `MacButton`, `MacIconButton`, `MacSlider`, `MacTabs` |
| Overlay | `ContextMenu`, `buildAIMenuSection` |
| Hooks | `useDrag` (mouse-drag lifecycle), `useFileDrop` |

What is **missing** is a set of **layout resize primitives** — specifically, pointer-capture-based resize handles for draggable splits and panel edges. Each webview that needs resizable splits currently implements its own `PointerEvent` + `setPointerCapture` logic inline. Collapsible panels (fixed-height toggle) are already covered by the existing `CollapsibleSection`.

## Current State: Layout Structure by Package

| Package | Layout Pattern | Key Components |
|---------|----------------|----------------|
| **neko-cut** | Preview + Timeline (top/bottom ratio split) + right property panel (pixel width) | Header + Main (preview/timeline) + Right Sidebar |
| **neko-model** | 4-pane layout | Left Toolbar + Scene Tree + 3D Viewport + Right Panels + Bottom Keyframe (fixed h-48, collapsible) |
| **neko-sketch** | Horizontal split | Left Toolbar + Canvas + Collapsible Right Sidebar (pixel resize) + Bottom Frame Timeline (fixed, collapsible) |
| **neko-puppet** | Split layout | Main Viewport + Right Sidebar (collapsible) + Bottom Keyframe Editor (fixed 180px, collapsible) |
| **neko-canvas** | Toolbar + infinite canvas | Left Toolbar + Canvas (flex-1) + Bottom-left Controls (MiniMap + Zoom). No resize handles |
| **neko-story** | Tab-based | Tab Navigation + Content Area |
| **neko-agent** | Vertical flexbox | AppShell + Header + Chat View + Onboarding Flow |
| **neko-live** | Vertical flexbox | Viewport Container + Bottom Tracking Panel |
| **neko-dashboard** | Table-based | Header + Content Sections |
| **neko-market** | TBD | MarketplaceApp component |
| **neko-audio** | TBD | Audio-specific layout |
| **neko-preview** | Content-specific | Multiple format viewers (PDF, video, audio, panoramic) |
| **neko-tools** | Diff viewer | Format-specific viewers (asset diff, media diff) |

## Actual Resize / Collapse Inventory

Precise inventory of what each package does today:

### Pointer-capture resize (the target duplication)

| Package | Target | Mode | Implementation |
|---------|--------|------|----------------|
| **neko-cut** | Preview / Timeline vertical split | **Ratio** (0.2–0.8) | `handlePointerDown/Move/Up`, `setPointerCapture`, ratio = pointerY / containerHeight |
| **neko-cut** | Right property panel width | **Pixel** | `handleHResizeStart/Move/End`, `setPointerCapture`, width = rootRect.right - clientX |
| **neko-sketch** | Right sidebar width | **Pixel** | Same pattern as neko-cut right panel |

Only **neko-cut** (2 instances) and **neko-sketch** (1 instance) implement pointer-capture resize handles today. **3 instances total**, not 4+.

### Fixed-height collapsible panels (no resize)

| Package | Target | Height | Mechanism |
|---------|--------|--------|-----------|
| **neko-model** | Bottom keyframe editor | Fixed `h-48` (192px) | Boolean `isKeyframeEditorOpen` toggle |
| **neko-puppet** | Bottom keyframe editor | Fixed `180px` inline style | Boolean toggle + chevron button |
| **neko-sketch** | Bottom frame timeline | Fixed height | Boolean toggle |
| **neko-cut** | Bottom timeline | Part of ratio split | Ratio-based (not a simple collapse) |

These are **collapsible** but **not resizable** — they toggle between visible (fixed height) and hidden. `CollapsibleSection` in `@neko/shared` already serves this pattern.

### No resize handles

**neko-canvas**, **neko-agent**, **neko-story**, **neko-live**, **neko-dashboard**, **neko-preview**, **neko-tools**: no user-initiated resize handles.

## Relationship to Existing `useDrag`

`@neko/shared/components/useDrag` handles the `mousedown → document mousemove/mouseup` lifecycle with threshold support. The resize patterns in neko-cut/neko-sketch use a different mechanism: **PointerEvent with pointer capture** (`setPointerCapture` / `releasePointerCapture`), which is superior for resize handles because:

- Pointer capture continues to receive events even when the cursor leaves the handle element or container boundary
- Works with touch and pen input
- No document-level listener cleanup needed

`useResizable` should be a **new, independent hook** using the Pointer Events API. It must not break or modify `useDrag`.

## Decision

### Scope: `useResizable` + `ResizeHandle` in `@neko/shared` Layer 2

Add resize primitives to `@neko/shared/components`. **Do not build `CollapsiblePanel`** — the existing `CollapsibleSection` already covers the toggle pattern, and the fixed-height panels in model/puppet/sketch are too simple to warrant another abstraction.

**Location**: `packages/neko-types/src/components/`

```
packages/neko-types/src/components/
├── useResizable.ts         # Hook: pointer-capture resize state management
├── ResizeHandle.tsx         # Thin presentational component
└── index.ts                # (updated: add exports)
```

Exports via `@neko/shared/components` (existing subpath). Must NOT leak into L0/L1 consumers — the components index already isolates React dependencies to L2.

### What to build

| Priority | Component | Justification |
|----------|-----------|---------------|
| **P0** | `useResizable` + `ResizeHandle` | 3 duplicate instances (neko-cut ×2, neko-sketch ×1); will grow as neko-puppet/model add resizable panels |

### What NOT to build

| Component | Reason |
|-----------|--------|
| **CollapsiblePanel** | `CollapsibleSection` already exists; fixed-height toggle is a `{isOpen && <div>}` one-liner |
| **LayoutContainer / EditorShell** | A `div` with Tailwind classes; abstraction adds indirection without constraint |
| **Header / Toolbar** | Content is domain-specific; `VerticalToolbar` already exists for the toolbar strip |
| **TabBar** | Only 2 consumers (story, agent) |
| **Timeline** | Data models differ fundamentally (video frames vs keyframes vs frame-by-frame) |

## Design Constraints

### useResizable

行为层 hook，基于 Pointer Events API（`setPointerCapture` / `releasePointerCapture`）。

**必须满足的约束：**

| 约束 | 说明 |
|------|------|
| **`edge` 而非 `direction`** | 用 `left / right / top / bottom` 表达 handle 所在边缘，同时决定轴向和计算方向。neko-cut 右面板从右边缘量 (`rootRect.right - clientX`)，垂直分割从顶部量 (`clientY - containerRect.top`)，二者不能用同一个 `horizontal` 表达 |
| **`mode: pixel / ratio`** | 必须同时支持绝对像素值（侧边栏宽度）和 0..1 比例值（上下分割）。neko-cut 同时使用两种模式 |
| **受控 / 非受控** | 受控模式：外部 store 持有 size，hook 不维护内部状态，仅通过回调通知变更。非受控模式：hook 内部管理状态，接受 initialSize |
| **`calculateSize` 逃逸口** | 允许调用方完全自定义尺寸计算（反转轴向、吸附网格等），此时 `edge` 和 `mode` 仅用于 cursor 样式 |
| **捕获丢失处理** | 必须同时处理 `pointercancel`（输入源取消）和 `lostpointercapture`（捕获被系统或其他元素抢占）。两者均须重置 `isResizing` 并停止后续更新。结束处理必须按 active `pointerId` 过滤并保持幂等，因为 `pointerup`、`pointercancel`、`lostpointercapture` 可能在同一次交互中组合触发。注意：resize 在每次 pointermove 时实时生效（受控模式通过回调、非受控模式更新内部状态），捕获丢失时不提供自动回滚——已发出的尺寸变更保持原样，调用方如需回滚应自行在回调中实现 |
| **ARIA 可访问性** | P0 仅要求 `role="separator"` + `aria-orientation`（不可调的静态分隔符）。若后续增加键盘方向键 resize 支持，再升级为可调分隔符（补充 `aria-valuenow/min/max` + `tabIndex`），避免形成"看起来可调但键盘不可操作"的无障碍契约 |
| **容器 ref** | 所有内置 `edge` + `mode` 计算都需要容器 rect（pixel 模式的 `edge: right` 需要 `containerRect.right`，ratio 模式需要容器总尺寸）。hook 应提供容器 ref 供调用方绑定。仅在调用方提供 `calculateSize` 逃逸口时可省略 |

**不应做的事：**
- 不管理面板内容、toolbar、timeline 等领域概念
- 不修改或依赖现有 `useDrag`（二者独立共存）
- 不在 hook 内部耦合 CSS class 或 Tailwind 工具类

### ResizeHandle

表现层组件，职责仅为：接收 hook 返回的 handle 属性并渲染为可交互的 DOM 元素。消费方也可以跳过此组件，直接将 handle 属性展开到自己的元素上。不应包含任何尺寸计算逻辑。

## Test Requirements

Hook unit tests (Vitest + `@testing-library/react` `renderHook`) must cover:

| Scenario | Assertion |
|----------|-----------|
| **Clamp to min/max** (pixel mode) | Size never goes below `minSize` or above `maxSize` |
| **Clamp to min/max** (ratio mode) | Ratio stays within [minSize, maxSize] (e.g. 0.2–0.8) |
| **Edge calculation** | `edge: 'right'` measures from right edge; `edge: 'bottom'` from bottom |
| **Controlled mode** | `onSizeChange` fires on drag; hook does not hold internal state |
| **Uncontrolled mode** | `size` reflects dragged value without external state |
| **pointercancel** | `isResizing` resets to false; no further size updates |
| **lostpointercapture** | `isResizing` resets to false; no further size updates（与 pointercancel 独立触发） |
| **Active pointer filtering** | `pointermove` / `pointerup` / `pointercancel` / `lostpointercapture` from stale pointer IDs are ignored; duplicate end events are safe |
| **Unmount during drag** | No leaked listeners or state updates after unmount |
| **ARIA attributes** | handle 元素包含 `role="separator"` + 正确的 `aria-orientation` |
| **Custom `calculateSize`** | Overrides default edge/mode calculation |

## Migration Path

1. Implement `useResizable` + `ResizeHandle` in `@neko/shared/components`
2. Migrate **neko-cut** first — it has both ratio (vertical split) and pixel (right sidebar) patterns, covering the full API surface
3. Migrate **neko-sketch** right sidebar
4. Future: neko-model/neko-puppet may adopt resize handles for their bottom panels (currently fixed height)

## Alternatives Considered

### 1. Extend existing `useDrag` to support pointer capture

**Rejected**: `useDrag` uses `mousedown/mousemove/mouseup` on `document`, which is a different paradigm from pointer capture. Merging them would complicate `useDrag`'s API for all existing consumers. Better to keep them independent.

### 2. New `@neko/layout` package

**Rejected**: 2 components do not justify a new package. `@neko/shared/components` L2 subpath already exists.

### 3. Full layout framework (slots-based EditorShell)

**Rejected**: Each editor has fundamentally different layout needs. A generic `<EditorShell header={…} sidebar={…} timeline={…}>` would be too rigid or too permissive, adding indirection without real constraint.

### 4. Do nothing

**Acceptable**: 3 instances is low duplication. However, the pointer capture + edge calculation + clamp logic is subtle enough that a single correct implementation is preferable to 3 ad-hoc copies that may diverge on cancel handling, ARIA, or touch behavior.

## Consequences

### Positive

- Single implementation for pointer-capture resize: cancel handling, ARIA, touch support are correct once
- Controlled/uncontrolled API fits both store-driven (neko-cut) and local-state patterns
- `edge` + `mode` API covers the two observed patterns (ratio split, pixel sidebar) without overdesign

### Negative

- Adds a shared behavioral contract; changes to `handleProps` shape affect all consumers
- Low risk, not zero risk: pointer capture, CSS cursor, `touch-action`, ARIA behavior become cross-package concerns

### Neutral

- Does not touch domain-specific content or layout structure
- Does not replace `useDrag` — both hooks coexist for different use cases
- Does not force adoption — packages can continue using inline handlers if their pattern doesn't fit

## Implementation Notes

- Implemented by OpenSpec change `add-shared-layout-resize-primitives` on 2026-05-13.
- Added `useResizable` and `ResizeHandle` under `packages/neko-types/src/components/`, exported only through `@neko/shared/components`.
- `useResizable` stores the latest options in a ref so inline caller option objects do not rebuild pointer handlers on every render.
- `ResizeHandle` remains presentational and supports caller `className` plus inline `style` merging.
- `neko-cut` now uses ratio mode for the preview/timeline split and pixel controlled mode for the property panel. The preview split preserves the prior 4px handle-height adjustment.
- `neko-sketch` now uses pixel controlled mode for the right sidebar while preserving the existing store action and visual handle styling.
- Validation completed:
  - `pnpm --filter @neko/shared test -- --runInBand`
  - `pnpm --filter @neko/webview build`
  - `pnpm --filter @neko-sketch/webview build`
