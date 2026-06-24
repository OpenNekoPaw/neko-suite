# ADR: Canvas 预览路线与 Cut 剪辑时间线边界

状态：Accepted
日期：2026-06-24
范围：`neko-canvas`、`neko-cut`、`neko-preview`、`neko-agent`、共享类型契约、`.nkc` / `.nkv` 项目文件关系。

本文记录 Canvas 播放顺序、预览路线、Cut 时间线和 Agent 操作能力之间的稳定边界。它补充 [`package-boundaries.md`](package-boundaries.md)、[`proto-and-wire-contracts.md`](proto-and-wire-contracts.md)、[`adr-ui-domain-panels-and-shared-primitives.md`](adr-ui-domain-panels-and-shared-primitives.md) 和视频领域架构 [`../domains/video/architecture.md`](../domains/video/architecture.md)。

## 背景

Canvas 已经通过容器、节点、连线和 playback metadata 表达一组播放顺序。Cut 则拥有真正的视频编辑 timeline、轨道、clip、效果、字幕、音频和导出能力。两者都可能出现“时间线形态”的 UI：

- Canvas 需要让用户看懂 scene / shot / media 的播放路线、当前段、分支和缺失素材。
- Cut 需要让用户进行剪辑、编排、调时长、加转场、做字幕音频和导出。
- Agent 需要读取和展示顺序，并在用户确认后把 Canvas 的当前路线发送到 Cut 形成可继续剪辑的初稿。

如果 Canvas 直接复用 Cut timeline 组件或 Cut 编辑协议，会产生几个问题：

1. Canvas 会被拉向视频剪辑器职责，重复 Cut 的领域模型。
2. Canvas 播放顺序和 Cut timeline 顺序会形成双事实源。
3. Extension Host 可能退化成高频 UI 事件代理，破坏 Webview 边界。
4. Agent 会面对不清晰的能力入口：它是在改 Canvas 顺序、改 Cut timeline，还是改自己的临时顺序。

因此需要明确“Canvas 的时间线形态”只是预览路线，不是 Cut 剪辑时间线。

## 相关边界

本 ADR 与以下系统和领域边界保持一致：

- Canvas 的节点、容器、连接、route 和 preview session 归 `interactive` 领域；播放路线是 Canvas 子系统，不是新的 Canvas kind。
- 分支叙事和互动 route 在 Canvas 内统一投影为 `CanvasPlaybackPlan.routeCandidates`；实现不得为 narrative 分支另建独立播放路线模型。
- 素材、缩略图、媒体引用和生成产物必须通过 Asset / ResourceRef / ContentAccess 路径进入 `CanvasCutDraftPayload`，不得把任意 host 绝对路径写成长期事实。
- Cut 导出仍走视频领域导出与交付管线；本 ADR 只规定 Canvas 到 Cut 的剪辑初稿交接，不改变导出权威。

## 决策

Neko Suite 采用以下边界：

```text
Canvas 管故事顺序和预览路线
Cut 管视频剪辑时间线
Agent 通过共享协议读取、展示、确认和触发高层操作
```

Canvas 不实现 Cut 式剪辑 timeline。Canvas 可提供 `Playback Route Strip` / 预览路线条，用于展示和导航 `CanvasPlaybackPlan`。Cut 继续拥有 `.nkv` 的剪辑 timeline 权威。Agent 可以感知顺序，但不拥有自己的 timeline 模型。

## 顺序权威

Canvas 的播放顺序权威来自 `.nkc` 中的 Canvas 模型：

```text
.nkc CanvasData
  容器 child 顺序
  nodeOverrides.order
  edgeOverrides.order / priority
  节点坐标 fallback
        │
        ▼
CanvasPlaybackPlan
        │
        ├─ Canvas 预览播放
        ├─ Canvas 预览路线条
        ├─ Agent 顺序摘要和确认
        └─ Canvas -> Cut 剪辑初稿快照
```

时间线形态的 Canvas UI 不得保存第二套 `timelineOrder`。若未来允许在 Canvas 预览路线条里拖拽重排，必须调用 Canvas command 更新容器、节点或连线顺序，再重新生成 `CanvasPlaybackPlan`。路线条自身只保存折叠状态、当前 route、hover、选择、playhead 等运行态 UI 状态。

### 生成与缓存策略

`CanvasPlaybackPlan` 是派生投影，不是持久项目事实。实现应按需生成，并可用 dirty flag 或 revision/hash 做短期缓存：

- 预览打开、预览刷新、Agent 查询、发送 Cut 前创建 draft 时，基于当前 `CanvasData` 快照生成 plan。
- Canvas 数据、playback metadata、选中节点、adapter/mode 或资源投影变化后，相关缓存必须失效。
- 如果 plan 或 preview-enriched plan 包含已解析的媒体 metadata（duration、thumbnail、poster frame、availability、probe result 等），外部素材、ResourceRef resolver、Asset index 或 ContentAccess revision 变化也必须使缓存失效。若 plan 只保存 durable resource reference，则这些媒体解析结果应留在 preview enrichment 层，不进入基础 `CanvasPlaybackPlan` 缓存键。
- 跨 Webview、Agent 或 Cut draft 传递时，应带上 source canvas uri、route id 和 canvas revision/hash；消费者必须能发现 stale plan，而不是继续把旧 route 当成当前事实。
- 缓存只能优化投影成本，不能成为顺序权威；命中缓存与重新生成应得到等价的 units、transitions 和 route candidates。

### Route 选择持久化

应区分 durable playback intent 和 runtime route session：

- `.nkc` 的 `playback.entryIds`、`nodeOverrides`、`edgeOverrides` 表达持久播放入口、排序和分支优先级。
- 当前 route id、current unit、playhead、hover、折叠状态默认属于 `PlaybackSession` 运行态，关闭预览后可以丢弃。
- 如果产品需要记住“默认播放路线”，应写入 Canvas playback metadata 中的明确字段或通过 entry/edge order 表达；不得把路线条私有 UI 状态当作持久排序。
- 多分支导入 Cut 前必须明确选择一条 route；自动入口或自动 route 可以作为默认建议，但导入确认中应显示其来源和潜在歧义。

## Canvas 职责

Canvas 可以提供轻量播放路线能力：

- 展示 `CanvasPlaybackPlan` 的 scene / shot / media 单元。
- 当前段高亮、点击跳转、上一段、下一段、播放/暂停。
- 显示总时长、单段时长、分支点、缺失素材和 diagnostics。
- 选择 route，并把选定 route 发送到 Cut。
- 在编辑态中高亮当前播放节点，但播放高亮不得等同于选择状态。

Canvas 不负责：

- clip 入点/出点裁剪。
- 多轨叠加。
- 转场、效果、字幕、音频轨编辑。
- 导出参数。
- `.nkv` timeline 结构维护。
- Cut Webview 内部 store 或 timeline 组件复用。

## Cut 职责

Cut 继续拥有真正的视频剪辑 timeline：

- `.nkv` 项目权威。
- tracks / clips。
- trim、speed、transition、effects、subtitle、audio、keyframes。
- preview render、export 和质量诊断。
- basic mode / 快剪，以及 professional mode / 精修剪辑。

Canvas 发送给 Cut 的内容是一次有序剪辑初稿快照。导入之后，`.nkv` 内部顺序和剪辑状态由 Cut 管理。Cut 不应默认反向改写 Canvas 顺序。

## 预览 UI 形态

Canvas 编辑与预览必须合并在同一个 Canvas Editor Webview 中，不再维护独立 Canvas Preview Webview。预览能力作为 Canvas Editor Webview 内的 `PlaybackWorkspace` 子工作区存在，并分为可组合组件：

```text
PlaybackWorkspace
  ├─ CanvasViewportPane   画布区，可隐藏
  ├─ PlaybackStage        预览播放区，可隐藏
  ├─ PlaybackRouteStrip   预览路线条，可隐藏
  └─ PlaybackSession      route/currentUnit/playhead/isPlaying
```

Canvas Editor Webview 采用以下布局：

```text
Canvas Editor Webview
┌────────────────────────────────────┐
│ 上方：画布区 可隐藏 + 预览播放区 可隐藏 │
├────────────────────────────────────┤
│ 下方：Canvas 预览路线条 可隐藏         │
└────────────────────────────────────┘
```

Canvas 左侧工具栏只提供一个“预览/播放工作区”入口。该入口显示或聚焦同一 Webview 内的 `PlaybackWorkspace`，不得打开第二个 Canvas Preview Webview。画布区、播放区和路线条的显示隐藏由预览工作区内部控制，不在左侧工具栏拆成多个互相竞争的按钮。

该合并不改变职责边界：Canvas Editor Webview 可以同时承载编辑画布、播放界面和预览路线条，但播放路线仍来自 `CanvasPlaybackPlan`，路线条仍不得保存私有排序，媒体资源授权仍由 Extension Host / `neko-preview` / Engine 按 intent 提供。

## 共享协议

需要统一协议，但不统一为一个大 timeline 协议。稳定契约分为三层：

```text
CanvasPlaybackPlan
  Canvas 内部/共享播放投影

CanvasCutDraftPayload
  Canvas -> Cut 的剪辑初稿快照

CanvasTimelineSyncPayload
  Cut -> Canvas 的轻量回流
```

### CanvasPlaybackPlan

`CanvasPlaybackPlan` 是 Canvas 顺序的规范投影。Canvas 预览、内嵌路线条、Agent 顺序摘要和导入 Cut 的输入都应从它派生。它可以包含 Canvas 的 adapter、behavior mode、units、transitions、route candidates 和 diagnostics。

Cut 不应直接把完整 `CanvasPlaybackPlan` 当作 timeline 编辑模型。Cut 只消费经过投影后的剪辑初稿 payload。

### CanvasCutDraftPayload

`CanvasCutDraftPayload` 是 Canvas 发送给 Cut 的窄协议，用于生成 `.nkv` 初稿。它应包含：

- source canvas uri / revision。
- route id。
- project name。
- ordered units。
- sourceNodeId / sourceSceneId / sourceShotId。
- duration。
- label / description。
- media resourceRef / assetPath / thumbnail。
- dialogue / voiceOver / soundCue / text cues。
- source mapping metadata。

该 payload 表示一次快照，不表示 Canvas 与 Cut 之间的持续双向同步。

cue 字段的来源应是 Canvas 当前已接受的节点 metadata、关联 Story 文档投影或 Agent 产物投影。Draft 只保存“导入 Cut 所需的快照值”和 source mapping；它不反向成为 Story 剧本文本、Canvas 节点内容或 Cut 字幕轨的长期权威。若不同来源出现冲突，生成 draft 的投影层必须 fail-visible 或产生 diagnostic，不能静默挑一个默认值。

协议可以保留受命名空间约束的 extension bag，例如 `extensions["neko.<package>"]`，用于携带低风险、可忽略的附加 metadata。extension key 必须匹配 Neko package namespace（如 `neko.canvas`、`neko.cut`、`neko.preview` 或 `neko.<packageName>`），裸 key、第三方未声明前缀和重复抢占他包 namespace 应 fail-visible。extension bag 不能承载排序、轨道、clip、效果、导出设置、文件路径授权或审批状态；这些必须进入明确字段或对应领域协议。

### CanvasTimelineSyncPayload

`CanvasTimelineSyncPayload` 是 Cut 回流给 Canvas 的最小状态。允许回流：

- `.nkv` 路径或 projectName。
- importedAt。
- duration。
- thumbnail。
- selectedInTimeline。
- source shot/node mapping。

不得通过该协议回流 Cut 的完整 timeline、clip 结构、效果参数或导出状态，也不得让 Cut 成为 Canvas 顺序权威。

## Agent 集成

Agent 需要感知并可展示 Canvas 顺序，但不拥有自己的 timeline，也不实现独立视频播放器。Agent 的分工是理解、展示、诊断、确认和调度；Canvas Editor Webview 内的 `PlaybackWorkspace`、Cut 和 `neko-preview` / Engine 负责实际播放与媒体运行时。

Agent 可以：

- 读取当前 `CanvasPlaybackPlan`。
- 展示 route 摘要、有序清单、导入 Cut 前确认和轻量预览卡片。
- 诊断缺失素材、入口不明确、分支歧义和时长异常。
- 在用户确认后调用 Canvas/Cut capability 发送当前 route 到 Cut。
- 通过高层 command 请求 Canvas 调整顺序。
- 显示或聚焦 Canvas Editor Webview 内的 `PlaybackWorkspace`、Cut Preview / Timeline 或资源预览，并传递 route、unit、sequence 或 clip 的定位意图。
- 通过 Engine、Preview、Media LSP 或领域工具读取 probe、关键帧、缩略图、字幕、音频峰值、质量诊断等可分析数据。

Agent 不得：

- 维护 `agentOrder` 作为独立事实源。
- 维护独立 playhead、route timeline、播放器状态或视频流生命周期。
- 在 Agent Chat 内复制 Canvas `PlaybackWorkspace` / Cut Preview 的完整播放器。
- 直接操作 Canvas 或 Cut Webview store。
- 直接修改 `.nkv` 私有结构。
- 绕过确认执行中高风险剪辑或导入操作。

### Agent 交互形态

Agent 展示的顺序是解释和确认层，不是播放层。推荐交互形态：

```text
Agent message card
  当前路线：Shot 1 · 20 units · 约 1:00
  诊断：2 个镜头缺预览图，入口为自动推断
  操作：
    [在 Canvas 中播放]
    [发送到 Cut]
    [查看完整顺序]
```

Agent 可展示的轻量预览内容包括缩略图、poster frame、当前 shot 图片、时长、素材状态、diagnostic 和 source mapping。它不得承载解码、seek、流控、frame clock、音频同步或 Canvas/Cut 的播放会话状态。

播放交互应通过 reveal/open intent 转交给 owning surface：

```text
Agent
  -> revealCanvasPlaybackWorkspace(sourceCanvasUri, routeId, unitId?)
      -> Canvas Editor Webview shows PlaybackWorkspace and owns playback session

Agent
  -> revealCutTimeline(projectUri, sequenceId?, clipId?)
      -> Cut owns timeline and playback session

Agent
  -> revealResourcePreview(resourceRef, intent)
      -> neko-preview / Engine owns media playback
```

这些 intent 是宿主动作，不是文件系统授权本身；Extension Host 仍负责资源授权、Webview 生命周期和 stale session 诊断。

推荐能力入口：

```text
canvas.getPlaybackPlan
canvas.getPlaybackRoutes
canvas.revealPlaybackWorkspace
canvas.createCutDraftFromRoute
canvas.reorderPlaybackUnits
cut.importCanvasDraft
cut.revealTimeline
cut.getTimelineInfo
```

读操作应标记为 read-only。导入、重排、生成 `.nkv` 或覆盖已有 Cut 项目属于确认门控操作。

Agent 相关门控由 capability policy、permission mode、approval gate 和用户确认 UI 共同决定。Feedback/arbiter 可以提供诊断、修复建议和是否需要用户确认的信号，但不能替代权限判断。

推荐粒度：

| capability | 风险 | 门控 |
| ---------- | ---- | ---- |
| `canvas.getPlaybackPlan` / `canvas.getPlaybackRoutes` | 低 | read-only，无需确认 |
| `canvas.revealPlaybackWorkspace` | 低 | 显示/聚焦同一 Canvas Editor Webview 内的预览工作区可无需确认；若触发资源授权或长任务，按宿主 policy 处理 |
| `canvas.createCutDraftFromRoute` | 中 | 创建临时 draft 可 read-only；若写文件、创建项目或发送 Cut，则需要确认 |
| `canvas.reorderPlaybackUnits` | 中 | 修改 `.nkc` 顺序，需要确认；若同一 Agent turn 中存在明确、具体的用户重排指令，可以按 capability policy 降为 auto-approve |
| `cut.importCanvasDraft` | 中/高 | 创建或更新 `.nkv`，必须确认；覆盖已有项目或批量生成时提高风险 |
| `cut.revealTimeline` | 低 | 打开/聚焦 Cut 项目或定位 clip 可无需确认；不得隐式修改 timeline |
| `cut.getTimelineInfo` | 低 | read-only，无需确认 |

“明确、具体的用户重排指令”必须包含可解析目标和顺序意图，例如“把 scene 3 移到 scene 1 前面”。Agent 自主推断、笼统优化请求、批量重排或会覆盖既有用户排序的操作仍需确认。

## 文件关系

`.nkc` 与 `.nkv` 保持分离：

```text
.nkc
  Canvas 语义、节点、容器、连线、播放入口、顺序 metadata

.nkv
  Cut 剪辑项目、轨道、clip、效果、导出设置
```

两者通过 `linkedProject`、source mapping 或轻量 sync metadata 关联。不得合并文件格式，也不得让任一文件隐式承担另一方的完整事实。

## Extension Host 边界

Extension Host 负责协调命令、文件创建、资源授权和低频状态同步：

```text
Canvas Webview
   │ typed message / command
   ▼
Extension Host
   ├─ 生成/读取 CanvasPlaybackPlan
   ├─ 显示/聚焦 Canvas Editor Webview 内的 PlaybackWorkspace
   ├─ 创建 CanvasCutDraftPayload
   ├─ 调用 Cut 导入命令
   └─ 投递 CanvasTimelineSyncPayload

Cut Webview
   └─ 管理 .nkv 和剪辑 timeline
```

Extension Host 不应代理高频 timeline UI 操作、playhead 拖拽或 Cut Webview 内部编辑事件。

## PlaybackStage 与 Viewport 边界

`PlaybackStage` 是 Canvas 预览播放区。它可以使用 `ViewportShell` / ViewportProtocol，但不是所有预览都必须进入统一 Viewport 控制协议。

适用规则：

- 当 stage 承载 Engine/Scene/Live/Video 等需要 command envelope、frame metadata、overlay 或 ack/resync 的可控视口时，应通过 ViewportProtocol 或 owning runtime controller 接入。
- 当 stage 只是显示静态图、文档缩略图、shot card 或普通 media element 时，可以使用普通预览 renderer，不需要制造 viewport command。
- `PlaybackSession` 只管理 route、current unit、playhead 和播放状态；ViewportProtocol 管 scene/control 命令、seq、correlationId、revision 和 frame metadata。两者通过当前 unit 的 source mapping 关联，不共享状态机。
- playhead、route 切换和 segment click 不应被包装成 ViewportProtocol command，除非它们确实控制了一个 Engine/Scene viewport。

## 共享 UI 原语

Canvas 预览路线条和 Cut timeline 不能直接复用领域组件。但可在满足以下条件后抽取中立 UI primitive：

- primitive 不依赖 Canvas/Cut 文件格式。
- primitive 不包含 clip、track、node、shot 等领域语义。
- primitive 只表达 segment strip、ruler、transport controls、route selector、diagnostic marker 等低语义视觉与交互。

适合进入共享层的候选：

- `PlaybackTransportControls`
- `PlaybackRouteStrip`
- `SegmentedPlaybackTimeline`
- `TimelineRuler`
- `PlaybackClock`

Canvas 和 Cut 分别通过 adapter 投影自己的领域模型，不让共享 UI 理解 `.nkc` 或 `.nkv`。

## 后果

正面后果：

- Canvas 顺序、预览、Agent 和 Cut 导入使用同一顺序来源。
- Cut 的剪辑 timeline 职责保持清晰。
- Agent 能以可审计、高层能力操作，而不是操纵 Webview 内部状态。
- Canvas 编辑、播放和预览路线共用同一 Webview 生命周期，编辑与预览互操作更直接。

成本：

- 需要新增或收敛 `CanvasCutDraftPayload` 投影层。
- Canvas 预览组件需要收敛到 Canvas Editor Webview，并拆出 `PlaybackStage`、`PlaybackRouteStrip` 和 `PlaybackSession`。
- Agent capability 需要显式区分 read-only 查询和 confirmation-gated 导入/重排。
- 同一 Webview 内需要更严格处理编辑快捷键、播放快捷键、焦点、资源释放和媒体授权生命周期。

## 验证要求

涉及该边界的实现应覆盖：

- `CanvasPlaybackPlan` 由 Canvas 顺序生成，路线条不保存私有排序。
- Plan 生成缓存必须由 Canvas revision/hash 失效；stale plan 不能继续成功导入 Cut。
- 若 plan enrichment 包含媒体解析结果，外部素材、Asset index、ResourceRef 或 ContentAccess revision 变化必须使相关缓存失效。
- 持久 route intent 与 `PlaybackSession` 运行态分离；关闭和重开预览不会写入私有 timeline 顺序。
- 预览播放、Agent 摘要和 Cut 导入使用同一 route。
- Canvas -> Cut 导入能保留 source node / scene / shot mapping。
- Cut -> Canvas 回流只更新允许的轻量 metadata。
- Draft cue 字段必须带 source mapping 或 diagnostic，不能静默覆盖 Story、Canvas 或 Cut 的权威事实。
- Draft extension bag 必须校验 Neko package namespace，非法 key 应 fail-visible。
- PlaybackStage 只有在承载可控 viewport runtime 时才走 ViewportProtocol；播放路线交互不冒充 viewport command。
- Canvas Editor Webview 内编辑模式和播放模式的快捷键不得冲突；焦点切换到 `PlaybackWorkspace` 时编辑快捷键应 passthrough 或 suppress，反向切回画布编辑时播放快捷键也应解除占用；`PlaybackWorkspace` 隐藏、Webview 失焦或 session stale 后，媒体资源应及时释放、暂停或降级。
- Webview 运行态验证应使用 Extension Development Host / `vscode-extension-debugger`，不能只用普通浏览器替代。
- Agent 导入或重排能力应有确认门控测试，读操作应保持 read-only。
