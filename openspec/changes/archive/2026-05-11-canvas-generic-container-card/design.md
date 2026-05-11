## Context

`adr-canvas-generic-container-card.md` refines the existing Block + Container primitive architecture. The current Canvas webview already has a declarative `ContainerPolicy` layer for Scene, Gallery, Table, Artboard, and Group-like organization, but child-node summaries still flow through a monolithic `ChildNodeCard` branch in the renderer registry.

This creates an asymmetry: container behavior is policy-driven, while card rendering, preview construction, and child action handling are still type-branch driven. The new design keeps the first implementation scoped to `packages/neko-canvas/packages/webview/` and leaves shared package or protobuf promotion as a later step.

Before implementation:

- 是否符合现有架构：符合。它延续 composable content、container policy、preview resolver、store action 和 webview/extension postMessage 边界。
- 如何进一步降低耦合：把 child card 的 preview、metadata、badge、action 解析移动到纯 policy，运行时 URL 与副作用留在 slot 和 dispatcher。
- 是否易于扩展与测试：是。新增节点类型只注册 policy，固定 preview render form 和枚举 action condition 可被 focused unit tests 覆盖。

五层分析：

- 职责：`NodeCardPolicy` 只产出同步 view model；`NodeCard` 组合 slot；`CardPreviewSlot` 拥有异步资源解析；dispatcher 执行动作副作用。
- 依赖：Phase 1 仅依赖 canvas webview 内已有类型、stores、preview resolver 和 postMessage 协议，不引入 extension、React 外的新跨层依赖。
- 接口：预览使用 `CardPreviewSource` 判别联合；动作使用 `NodeCardActionId`、`ContainerActionId`、`ActionCondition` 与 typed context。
- 扩展：model、panoramic、annotation、text 等节点复用固定 render forms，不需要修改 preview slot switch。
- 测试：以 policy purity、preview descriptor、safe URL fast path、condition evaluator、action dispatcher 和 rendering parity 为主。

## Goals / Non-Goals

**Goals:**

- 用 generic `NodeCard` 替代 child-node slot 中的 monolithic `ChildNodeCard` 分支。
- 引入 webview-local `NodeCardPolicy` registry，为核心节点提供 preview、metadata、badge 和 action view model。
- 让 compact card preview 复用 `PreviewSourceDescriptor`、`CanvasPreviewRole`、role-matched `variants[].sourcePath` 和 `WebviewPreviewResolver`。
- 用固定的 6 种 `CardPreviewSource.renderForm` 表达视觉渲染形态：`asset-thumbnail`、`media-poster`、`waveform`、`text`、`icon`、`none`。
- 把 card/container actions 收敛为 typed descriptor + enum condition + dispatcher context。
- 将 Scene/Gallery/Table 的 container action 声明移动到 preset 或 registry 描述中，渲染层只消费 descriptors。

**Non-Goals:**

- 不修改 `.nkc` 持久化格式、protobuf schema 或 `@neko/shared` 类型契约。
- 不新增 extension host message handler；只复用现有 `openMediaPreview`、`openDocument`、`preview:resolveVariant` 和 `sendToAgent` 协议。
- 不把 `PreviewSourceDescriptor` 立即提升到共享包；本轮只记录未来 promotion path。
- 不重写完整 Canvas preview runtime、3D/全景交互、视频编辑或音频混音能力。
- 不改变 container membership、layout、delete behavior 的权威数据模型。

## Decisions

### Decision 1: `NodeCardPolicy` 保持纯函数和 webview-local

Policy 只接收 `CanvasNode`/parent node 并返回 preview、metadata、badge、action descriptors。它不得创建 React element、访问 runtime URL、调用 store、调用 postMessage 或执行异步解析。

替代方案是让每个 policy 直接返回 React component 或 callback。拒绝原因：这会重新把渲染、副作用和类型分支揉在一起，也会阻碍后续把 policy metadata 提升到共享层。

### Decision 2: `CardPreviewSource` 使用固定 render form 判别联合

`renderForm` 是视觉渲染形态，而 `CanvasPreviewRole` 表达语义角色。新增节点类型必须复用 `asset-thumbnail`、`media-poster`、`waveform`、`text`、`icon`、`none` 中的一种，不得为了节点类型扩展 `CardPreviewSlot` 分支。

替代方案是为 model、panoramic、shot、annotation 分别新增 preview component 分支。拒绝原因：这会让 compact preview 再次随节点类型线性增长，违背 summary descriptor 的目标。

### Decision 3: Inline shot preview 通过 role-matched safe variant 表达

Shot 生成候选的 data URL 作为 `PreviewSourceDescriptor.variants[].sourcePath` 存放，并使用 `role: 'generation-candidate'`。`CardPreviewSlot` 先查找 role-matched 且 `isSafeWebviewUrl` 通过的 URL，命中后直接渲染；否则才走 `WebviewPreviewResolver`。

替代方案是在 `CardPreviewSource` 上增加独立 `inlineDataUrl` 字段。拒绝原因：它会形成第二套 preview source contract，并让 asset preview 与 inline preview 的运行时边界不一致。

### Decision 4: Actions 使用枚举 ID、枚举条件和 typed dispatcher

Card action IDs 固定为 `remove`、`generate`、`open-media-preview`、`open-content-overlay`、`edit`、`duplicate`、`open-in-editor`。Container action IDs 固定为 `assign-selected-children`、`auto-layout`、`batch-generate`、`add-row`、`add-column`、`remove-row`、`remove-column`。`ActionCondition` 使用 `always`、`has-selection`、`has-preview`、`not-generating`、`has-asset`，由 evaluator 结合 scope context 判断。

替代方案是在 descriptor 中放函数谓词或直接传 action callbacks。拒绝原因：函数不可序列化，不利于 preset metadata、测试和未来共享化。

### Decision 5: Duplicate action 复用现有三 store flow

`duplicate` 不新增 store API。dispatcher 复用 `clipboardStore.duplicate`、`historyStore.pushState`、`canvasStore.setCanvasData`、`selectNodes` 的现有顺序，保证 undo checkpoint、节点/连接追加和选区更新行为一致。

替代方案是只克隆单个节点并直接写入 canvas store。拒绝原因：会绕过 clipboard/remap 逻辑，并增加与现有 duplicate 行为不一致的风险。

### Decision 6: Container actions 由 preset descriptor 声明

Scene/Gallery/Table action button 不再硬编码在 content dispatcher 或 preset createContent JSX 中。preset 或 registry 暴露 `ContainerActionDescriptor[]`，generic action bar 评估 visibility/condition，再调用 typed dispatcher。

替代方案是继续在 `NodeContentDispatcher` 为每个 container type 分支。拒绝原因：这会保留 container 侧的 hardcoded Scene/Gallery/Table 分支，和已有 `ContainerPolicy` 架构不一致。

## Risks / Trade-offs

- Policy 与 slot 边界切分后间接性上升 -> 通过小接口、固定 render forms 和 focused tests 保持可读性。
- Preview safe URL fast path 漏掉非 inline asset -> fast path 仅用于 role-matched safe variant；未命中时继续走 resolver。
- Action dispatcher context 过宽 -> card 和 container 分别定义 context，只注入执行动作所需 stores、selection、child nodes 和 postMessage。
- 容器 action 迁移影响现有 Scene 按钮行为 -> 先保持视觉和 payload 兼容，再删除旧硬编码路径。
- Unknown node 类型显示退化 -> `fallbackCardPolicy` 提供 icon/title/remove，保证新增类型没有 policy 时仍可渲染。

## Migration Plan

1. 添加 node-card 类型、policy registry、fallback policy、condition evaluator 和 dispatcher 类型骨架。
2. 实现核心 policies：media、shot、annotation、text，以及 Scene/Gallery/Group 等 fallback-friendly summary policy。
3. 实现 `NodeCard`、`CardPreviewSlot`、`CardMetadataSlot`、`CardActionSlot`，并接入 child-node slot。
4. 把 Scene/Gallery/Table container action 声明迁移到 preset/registry descriptor，接入 generic action bar 和 dispatcher。
5. 删除或收敛 `ChildNodeCard`、`resolveChildDisplayTitle`、`getMediaTypeIcon`、`getChildInlinePreview`、`getChildAssetPath` 等旧 helper 的重复职责。
6. 补充 policy、preview、condition、dispatcher、rendering parity 测试，并运行 canvas webview 相关检查。

Rollback 策略：保留旧 child-card 渲染入口直到 `NodeCard` parity 测试通过；若某个节点 policy 存在风险，可临时让该类型回退到旧 renderer while keeping new policy infrastructure for other types。

## Open Questions

- `PreviewSourceDescriptor` 何时提升到 shared 层，需要等 card policy metadata 被 extension/agent 共同消费后再决定。
- container action descriptor 是否应作为 preset contract 的一等字段，还是先放在 webview-local registry 中以降低迁移范围。
