# ADR: Viewport 视频流与控制流边界

## 状态

Accepted (2026-05-23)

## 背景

neko-model、neko-puppet 和 neko-live 正在统一到 engine-rendered viewport：引擎负责渲染画面，Webview 负责显示、输入捕获、工具栏和叠加层。近期调试 3D 模型输出与控制按钮失效时，暴露出一个容易混淆的问题：如果 viewport 被理解成“纯视频流”，那么选中对象、拖拽调整、角色捏脸、视角切换、动作展示和语音包展示都没有可靠的语义通道。

H.264 画面只包含像素。像素可以告诉用户“看见了什么”，但不能稳定表达“哪个节点被选中”“哪个骨骼正在被拖拽”“当前 preview mode 是面部展示还是动作展示”。这些语义必须通过控制协议、查询接口和引擎权威状态闭环完成。

本 ADR 独立记录 Viewport 的视频流、帧元数据和控制流职责边界，供统一 Viewport、2D Bone+BlendShape、3D model、live compositor 和后续 AI 捏脸提案引用。

## 决策

Viewport 不采用纯视频流架构，而采用 **H.264 视频流 + 帧元数据 sideband + 独立 scene-control WebSocket**：

| 链路 | 职责 | 当前实现状态 |
|------|------|--------------|
| H.264 视频流 WebSocket | 承载引擎渲染后的像素帧 | 已实现；前端 `H264StreamClient` 解码并绘制到 Viewport canvas |
| `renderFrameMeta` sideband | 承载 `sceneId`、`revision`、`frameTimestamp`、`viewTransform` 等帧级元数据 | 已实现；用于 overlay 坐标对齐、stale metadata 检测和诊断 |
| `/v1/scenes/control` WebSocket | 承载 `select`、`transform`、`query`、`camera`、preview mode、playback 等语义命令与 ack/delta/snapshot 回流 | 已实现首版；命令和查询不应依赖视频帧本身 |
| `ViewportShell` / `ISceneController` | 捕获输入、委托领域 controller、渲染 overlay 与 toolbar 扩展 | 已实现首版；model/puppet/live 已接入不同程度的 controller |

核心边界：

> **视频流负责“看见什么”，控制流负责“对什么做什么”。**

因此，选中、拖拽、捏脸、视角切换、动作展示、语音包展示等操作不能从纯 H.264 帧中恢复语义，必须通过 scene-control 查询和命令闭环完成。

## 当前实现状态

### 已具备

- 视频显示链路：引擎输出 H.264，前端解码并显示。
- 帧元数据对齐：`renderFrameMeta` 随视频流到达前端，作为 overlay 与视频画面对齐的依据。
- 点击选中链路首版：Viewport pointer down 可发送 `viewport:select`，引擎通过 hit test 返回选中结果；该链路依赖有效的 scene snapshot、world bounds 与相机参数。
- 变换命令入口：`viewport:transform` 和领域 `scene:*` 命令可以通过 scene-control 进入 ActionRouter。
- 角色预览控制入口：面部展示、全身展示、动作展示、语音包展示等可以表达为 preview mode、camera preset、playback 和 asset slot selection 命令。

### 未闭环

- 3D model 的可视化编辑交互尚未完全闭环：`transform` 命令入口存在，但 viewport gizmo、拖拽状态、pointer move/up 到 transform commit 的 UI 路径仍需补齐。
- `projectedBounds` / `gizmoAnchor` 等查询已定义首版，但查询结果需要进入 controller/store 状态，并驱动 overlay 渲染与命中测试。
- `InteractionLayer` 类 overlay 不能长期停留在 non-interactive 显示层；默认实现路线是把交互职责收敛到 `ViewportShell` + `ISceneController`。只有当某类领域编辑确实需要独立 DOM 命中树时，才能把 `InteractionLayer` 升级为唯一交互层，并且必须禁止同一事件同时被 shell 与 layer 双重消费。
- 视频 WebSocket 上的 frame meta 与二进制帧复用同一连接；控制命令已经拆到独立 scene-control WebSocket，但 frame meta 仍可能受视频背压影响。高频编辑反馈应优先依赖 scene-control ack/delta 与本地 overlay prediction，不应等待下一帧视频。首版不立即拆分 frame meta 通道，但必须持续度量 meta 延迟；若视频降帧或 GPU/encoder 繁忙导致 overlay 对齐元数据超过交互预算，则将 frame meta 拆到 scene-control 或独立低带宽 metadata WebSocket。

### 各编辑器差异

同一边界问题在 model、puppet、live 中表现不同，不能用同一条“视频能显示”验收标准覆盖：

| 编辑器 | 当前能力 | 主要缺口 | 风险判断 |
|--------|----------|----------|----------|
| `neko-model` | H.264 显示、frame meta 对齐、`viewport:select`、`viewport:transform` 命令入口和 character preview mode 命令已有首版 | viewport gizmo、drag state、`projectedBounds` / `gizmoAnchor` 查询结果入 store、pointer move/up -> transform commit 还未闭环 | 高。模型能显示不代表能选中、调整或切换预览状态 |
| `neko-puppet` | 预览流、骨骼 overlay、选骨本地命中、`scene:puppet:drag-bone`、`scene:puppet:set-blendshape`、prediction overlay、ack/rollback 已有首版 | viewport 内骨骼拖拽尚未闭环，pointer move/up 仍未驱动 drag command；选骨命中目前更偏本地近似，需与 viewTransform / 引擎权威状态对齐 | 中。右侧参数/BlendShape 控制可用性高于画面内拖拽编辑 |
| `neko-live` | Live compositor 视频流、toolbar preset、tracking overlay、output route、context menu layer toggle 已接入 controller 命令 | live 不需要 model/puppet 那类对象级 gizmo 拖拽；风险集中在控制按钮是否收到 scene-control ack、是否更新 compositor scene、是否正确区分 authoritative compositor output 与 local fallback recording | 中。视频继续播放时，按钮仍可能因控制流或 ack 回流问题失效 |

Puppet 与 model 都需要“画面内编辑”闭环；live 需要“场景控制按钮”闭环。三者共享同一原则：视频流不能替代语义控制流。

## 进一步决策

### 1. 帧元数据通道

`renderFrameMeta` 首版继续作为视频流 sideband 发送，避免过早增加连接数和同步复杂度。但这只是当前实现选择，不是不变量。迁移方向明确为：**默认保持 video sideband；触发背压问题后优先迁移到 scene-control metadata event；只有当 scene-control metadata event 仍无法满足频率或隔离要求时，才新增独立 metadata WebSocket。**

拆分触发条件：

- `renderFrameMeta` 到达延迟持续超过本地交互预算，导致 overlay 与视频画面明显错位。
- H.264 降帧、GPU 繁忙、encoder backpressure 或浏览器解码阻塞会连带推迟 frame meta。
- controller 已经通过 scene-control 收到 ack/delta，但 overlay 仍因等待下一帧 meta 无法进入正确 revision。
- QA 能复现“控制流已完成、视频仍播放、overlay 对齐状态滞后”的问题。

迁移路线按以下优先级执行：

| 优先级 | 路线 | 说明 | 使用时机 |
|--------|------|------|----------|
| P0 | 保持 video sideband | 继续随视频帧发送 meta，并补齐延迟指标、stale 诊断和 prediction fallback | 延迟指标稳定，overlay 不依赖高频 meta |
| P1 | scene-control metadata event | 将 revision、viewTransform、frameTimestamp 作为低频或按需事件随 scene-control 回流 | 需要与 command ack/delta 紧密同步，或视频背压开始影响 overlay 对齐 |
| P2 | 独立 metadata WebSocket | H.264 只发二进制帧，metadata 独立低带宽通道发送 | scene-control metadata event 频率不足，或需要把 metadata 与控制 ack 隔离 |

无论采用哪条路线，控制语义仍以 scene-control 为准；frame meta 只解决画面与 overlay 的时间/坐标对齐。

实现备注：

- P0 默认 metadata 延迟预算为 100ms，由 `H264StreamClient.metadataDelayBudgetMs` 配置覆盖；超过预算时必须产生 `render-frame-meta-delayed`，但不得中断 H.264 decode。
- scene-control ack 先于兼容 frame metadata 到达时，客户端必须暴露 `*-ack-before-frame` 或等价诊断；prediction 可以继续保持 pending，但不能被标记为权威。
- frame metadata 的 `revision` / `appliedSeq` 落后于最新 ack 时，客户端必须暴露 stale metadata 诊断；这代表 overlay 对齐数据落后，不代表命令失败。
- P1 的首个契约目标是 scene-control metadata event，字段至少镜像 `sceneId`、`viewportId`、`streamId`、`revision`、`appliedSeq`、`frameTimestamp`、`viewTransform`。事件 cadence 优先采用“ack/delta 后按需 + active viewport 低频心跳”，避免把高频视频节奏搬进控制通道。
- 当前实现已定义 P1 `ViewportMetadataEvent` 契约，并在 scene-control `requestKeyframe` 路径暴露按需事件；常态渲染仍走 P0 video sideband。P1 后续扩展只应增加 ack/delta 后按需或低频 active viewport 心跳，不应把视频帧率搬进控制通道。
- P2 独立 metadata WebSocket 只有在 P1 无法满足频率或隔离要求时才启用；启用后仍不得把 semantic authority 从 scene-control 转移到 metadata channel。

### 2. 交互入口

默认选择 `ViewportShell + ISceneController` 作为唯一输入入口：

1. `ViewportShell` 负责 DOM 事件捕获、pointer capture、toolbar/context menu chrome 过滤和本地 pan/zoom。
2. `ISceneController` 负责领域命中、selection、drag state、prediction、命令构造和 ack/error 处理。
3. Overlay 默认只渲染状态，不直接持有领域交互状态。

`InteractionLayer` 只能作为渲染层或单一领域交互层二选一：

- 作为渲染层时，不处理 pointer/key 事件。
- 作为领域交互层时，必须由 `ViewportShell` 显式委托，并保证事件不会再走第二条 controller 路径。

该选择与统一 Viewport ADR 的方向一致，可避免 model、puppet、live 各自发明独立事件系统。

## 不变量

1. H.264 视频帧不是交互语义的事实来源。
2. 引擎 scene snapshot / runtime state 是 selection、transform、preview mode 和 playback state 的事实来源。
3. `renderFrameMeta` 只承载帧对齐、revision 和诊断，不承载用户意图。
4. Engine-mediated 写操作必须通过 scene-control 命令进入引擎，并返回 ack/error/delta。
5. 前端 overlay 可以做 prediction，但 prediction 必须能被 ack commit、error rollback 或 revision conflict invalidation。
6. Webview 不直接访问 Node.js、VSCode API 或引擎内部状态；所有跨层操作走既有协议和 Extension Host 授权通道。

## 后续闭环要求

1. controller 维护 selection、projected bounds、gizmo anchor、active drag、prediction revision 等状态。
2. selection 后自动查询 bounds / anchor，并把结果写入 store 或 controller 内部状态。
3. overlay renderer 根据 controller 状态绘制选框、gizmo、预览姿态和 stale/prediction 状态。
4. pointer drag 期间先更新本地 prediction，再通过 scene-control 发送 `viewport:transform` 或领域命令；ack 后 commit，error 或 revision conflict 后 rollback。
5. preview mode 拆分为 camera preset、framing target、playback state、asset slot selection，不以“按钮直接改视频画面”为接口。
6. 控制按钮的验收应检查 scene-control connect、command ack、delta/snapshot 回流和 UI store 更新，而不是只检查视频帧变化。

## 验收标准

### 控制流验收

所有涉及选择、变换、预览模式、preset、output route、tracking overlay、BlendShape 或骨骼编辑的 PR，必须证明以下链路完整：

1. 控制通道已连接，并能在断线后进入明确的 degraded 状态。
2. UI action 会产生预期的 `ViewportCommand` 或领域命令，包含 sceneId、viewportId、seq、correlationId、baseRevision 和 source。
3. 引擎返回 ack/error；失败时 UI 有可见诊断，prediction 能 rollback。
4. ack/delta/snapshot 回流会更新 controller/store 状态。
5. overlay、toolbar、inspector 或 timeline 反映新的权威状态。
6. 测试不能只断言视频帧发生变化；必须断言控制语义状态发生变化。

评审清单见 [viewport-semantic-control-review-checklist.md](./viewport-semantic-control-review-checklist.md)。

### 帧元数据验收

涉及 overlay 对齐或 prediction reconcile 的 PR，必须覆盖：

1. frame meta 延迟、缺失或旧 revision 时，overlay 不误标为权威状态。
2. scene-control ack 已到但新视频帧未到时，本地 prediction 仍可见。
3. 新 frame meta 到达后，prediction 能 commit、hide 或 invalidation。
4. 当 metadata 延迟超过预算时，诊断能暴露是 video sideband 背压，而不是控制命令失败。

## 影响范围

| 模块 | 影响 |
|------|------|
| `packages/neko-client` | 继续保持 H.264 client 与 SceneControlSocket 分离；可共享 wire reader 和 envelope guard |
| `packages/neko-ui` | `ViewportShell` 负责输入捕获、overlay 渲染和 toolbar 扩展，但不持有领域语义 |
| `packages/neko-model` | 需要补齐 selection -> bounds/anchor query -> gizmo overlay -> transform command 的闭环 |
| `packages/neko-puppet` | 骨骼拖拽、BlendShape 捏脸、表情/动作/语音包预览必须走 scene-control 命令与 overlay prediction |
| `packages/neko-live` | live 视图接收 compositor 视频流；场景切换、输出路由和预览模式走控制命令 |
| `packages/neko-engine` | ActionRouter / scene-control 是交互语义权威入口；streaming route 只输出画面和帧元数据 |

## 关联 ADR

- [adr-unified-viewport-protocol.md](./adr-unified-viewport-protocol.md) — 定义 ViewportShell、ViewportProtocol 和 `ISceneController`
- [adr-2d-bone-blendshape-animation.md](./adr-2d-bone-blendshape-animation.md) — 2D puppet 骨骼、BlendShape 和 ControlDriver 编辑语义
- [adr-3d-editor-rendering-architecture.md](./adr-3d-editor-rendering-architecture.md) — 3D model engine-rendered viewport
- [adr-2d3d-unified-engine.md](./adr-2d3d-unified-engine.md) — 引擎共壳分核架构
