## Context

阶段 1A 已把 3D 编辑器的视觉真值收敛到 Engine Route A：Webview 通过 `VideoViewport` 消费 raw H.264 + WebCodecs，并通过 `/v1/scenes/control` 发送命令、接收 ack / delta / frame meta。阶段 1B 要继续沿用这条边界，把此前明确推迟的角色 authoring、自由建模和旧 Webview 面板迁移补齐。

当前主要风险不是缺少单个 UI 控件，而是角色参数、morph、IK、笔刷、动画和 R3F fallback 仍可能绕开 Engine authoring 真值。阶段 1B 必须把这些能力收束到 `.nkc` / `.nkcdata`、AssetDatabase、SceneCommandQueue、ModelingSession 和 Engine 视频帧。

## Goals / Non-Goals

**Goals:**

- 先补齐阶段 1A runtime hardening 闸门，使 RenderGraph、FrameScheduler、真实视口查询和多视口 extract 在生产路径生效。
- 建立 `LayeredCharacterDescription`，让角色参数、morph library、skin weights、blend shapes、material layer 和 Library Override 拥有 authoring 真值。
- 实现 `.nkc` / `.nkcdata` 双文件模型，并通过 AssetDatabase 管理模板、数据块和版本迁移。
- 将 Face / Expression / Bone / Shape / CSG / Text / Animation / Inspector 面板迁移为命令化控制面。
- 实现自由建模会话，支持笔刷 patch、拓扑变更、op log、拓扑版本和迁移/失效告警。
- 保证 Webview Route A 主路径只显示 Engine 渲染帧，R3F/Three.js 仅作为短生命周期预测层或开发 fallback。
- 建立 CharacterBakingSystem，使 GLB / VRM / FBX 导出与 Engine 视频流和 authoring 数据一致。

**Non-Goals:**

- 不实现阶段 2 的 Timeline / EventGraph / Gameplay Framework / 物理 / Play Mode。
- 不把 R3F 恢复为材质、光照、morph 或动画的视觉真值。
- 不让 Extension Host 中转 slider、笔刷、SceneDelta、视频包或高频拓扑 patch。
- 不在 Webview 持久化 authoring mesh、skin weights、UV、morph library 或导出数据。
- 不把自由建模的预测结果写入 Undo、序列化或导出路径。

## Decisions

### Decision 1: `.nkc` 是角色 authoring 真值，ECS 是运行时投影

`LayeredCharacterDescription` 按 Descriptor / Definition / Behavior / Geometry / Override 分层建模。`.nkc` 保存轻量 descriptor、schema、override 和引用，`.nkcdata` 保存 morph sparse delta、skin weight atlas、blend shape 数据等大块数据。Engine 加载角色时把 `.nkc` 实例化为 ECS 组件，Render World 继续只从 ECS / AssetDatabase extract。

替代方案是让 ECS 直接保存 morph library 和 override。它会让导出、模板更新、市场复用和 git diff 都依赖运行时状态，难以审计和迁移。

### Decision 0: 1B 实施前先关闭 1A runtime 硬化缺口

阶段 1B 依赖真实可用的 Engine Viewport，而不只是协议和测试骨架。实现 1B 前必须先让 FrameScheduler 的降级决策被 scene stream / render loop 消费；让 PBR、post-process、color convert、encoder copy 作为 RenderGraph pass 执行；让 hit-test、projected bounds、gizmo anchor 基于 viewport camera、depth/ray 和真实 bounds；让多视口共享同一 scene revision 的 sim/extract 输入。

替代方案是直接进入角色 authoring。该方案会把 morph、IK、笔刷和 topology preview 建在不稳定的视口治理层上，后续很难判断问题来自 authoring 还是 Route A runtime。

### Decision 2: 角色编辑全部通过 CharacterCommand

Morph slider、material layer、expression preset、IK/bone control 和 Library Override 都编译为 `CharacterCommand`，再装入 `SceneCommandEnvelope` 经 `/v1/scenes/control` 发送。Engine 应用命令后先更新 `.nkc` authoring 层，再投影到 ECS，并通过 `SceneDelta` 返回 `updatedMorphWeights`、`updatedMaterials`、`updatedSkeletonPose` 或 override patch。

替代方案是让 Webview 面板直接更新本地 VRM/R3F 对象。它能得到即时反馈，但会让 Engine 视频流、导出和 Inspector 状态分叉，违背阶段 1A 的 WYSIWYG 约束。

### Decision 3: 自由建模必须进入 ModelingSession

所有雕刻、顶点编辑、Boolean、Subdivide、Decimate 和 Dynamic Topology 都在 `ModelingSession` 中执行。会话携带 `sessionId`、`topologyVersion`、`topologyMutable`、op log、before hash 和 affected flags。仅顶点位置变化可保留 morph / skin / UV；拓扑变更必须由 `MeshTopologyMigrationService` 迁移或显式标记失效。

替代方案是把每个笔刷或拓扑操作当作普通 SceneCommand。该方案无法表达会话边界、拓扑版本和失效语义，也无法在 Webview 丢弃旧预测副本。

### Decision 4: 高频笔刷走二进制副通道，语义事件走 SceneDelta

`VertexBrushPatch` 通过控制 socket 关联的二进制副通道或明确的 brush patch WebSocket 发送，包含 session id、mesh id、topology version、affected range 和压缩 delta。`TopologyChangeEvent`、session 状态和迁移结果走 `SceneDelta` 主通道。

替代方案是把顶点 patch 放进 JSON SceneDelta。它会放大序列化成本，并让高频笔刷阻塞命令 ack 和语义 delta。

### Decision 5: Webview 是播放器和控制面，不是第二渲染器

Route A 下可见 3D 内容只来自 `VideoViewport` 的 Engine 帧。Webview 可维护短生命周期预测副本，但预测层必须带 `sessionId + topologyVersion + seq`，只渲染 overlay、unlit ghost、brush preview 或 morph preview；收到 ack、SceneDelta、TopologyChangeEvent 或匹配 `RenderFrameMeta` 后必须清除或校正。

替代方案是继续把 `Viewport3D + ModelLoader` 作为主视口，Engine stream 只做质量参考。该方案会重新引入 R3F/Engine 双事实源。

### Decision 6: 导出由 CharacterBakingSystem 负责

GLB / VRM / FBX 导出读取 `.nkc`、`.nkcdata`、AssetDatabase 和 Engine 当前 pose，经过 `CharacterBakingSystem` 烘焙 morph、skin、material override 和拓扑迁移结果。导出器不得读取 GPU cache、Render World 或 Webview 预测副本。

替代方案是复用 Webview 的 VRM/R3F 结果或从 GPU cache 反读。它不可测试，也会破坏 authoring / render / export 三路径一致性。

## Contract Placement

阶段 1B 的契约落点按“IDL → 共享类型 → Engine 权威实现 → Webview wrapper”分层：

- `packages/neko-proto` 是跨层 IDL 唯一权威，定义 `LayeredCharacterDescription`、`.nkc` / `.nkcdata` 引用、`CharacterCommand`、`ModelingSession`、`VertexBrushPatch`、`TopologyChangeEvent`、`SceneDelta` 扩展和 render/frame diagnostics 字段。
- `@neko/shared` 只承载由 proto 生成或薄封装的 TypeScript 类型、schema helper 和 roundtrip fixture，不实现 morph、IK、拓扑迁移、导出烘焙或路径解析的业务真值。
- Rust runtime 负责权威状态与生产行为：`runtime-scene` / 相邻 authoring module 保存 `.nkc` authoring 真值、AssetDatabase descriptor、override merge、schema migration、SceneCommandQueue apply/reject、ECS projection、ModelingSession、topology migration 和 CharacterBakingSystem。
- `packages/neko-client` 只负责 Engine 通信 wrapper：`SceneControlSocket`、H.264/PCM stream client、render frame metadata 对齐、command envelope 构造和 resync/ack 边界，不保存可导出的角色状态。
- `packages/neko-model` Webview 是播放器和控制面：`VideoViewport` 消费 Engine 帧，`InteractionLayer` 发送 viewport-scoped query，`LocalPredictionLayer` 管理短生命周期预测，Inspector/Face/IK/Modeling 面板把 UI 操作编译为 Engine command；Webview 不持久化 `.nkcdata`、不成为导出源，也不让 Extension Host 进入高频路径。
- Extension Host 只处理 VSCode 能力边界：资源 URI、workspace 文件、导入导出对话框、模板解析和 Engine discovery；不得中转视频帧、SceneDelta、笔刷 patch 或 slider 高频事件。

## Risks / Trade-offs

- [范围过大] → 拆成角色契约、角色工作流、自由建模、Webview 控制面、导出烘焙五个 capability；实现时按最小可验收切片推进。
- [1A 骨架空转] → 先设置 hardening 闸门；没有生产消费者的 RenderGraph / FrameScheduler 不作为 1B 可用前置。
- [Webview 交互延迟] → morph、IK、笔刷使用 LocalPredictionLayer；预测只在短窗口显示，并由 Engine 帧覆盖。
- [拓扑迁移复杂] → 首版对无法安全迁移的 morph / skin / UV 明确失效并提示，而不是静默保留错误数据。
- [二进制副通道与控制 WS 背压] → 笔刷 patch 独立限流和 coalesce，ack / resync / topology event 保持优先。
- [旧 R3F 面板体验退化] → Route A 下命令化前的面板隐藏或标记不可用，避免用户误以为本地 R3F 预览是最终结果。
- [文件格式过早固化] → `.nkc` schema 带 version、feature flags 和 migration manifest；归档前用 roundtrip 和旧版本 fixture 约束。

## Migration Plan

1. 先定义 `.nkc` / `.nkcdata`、CharacterCommand、ModelingSession、VertexBrushPatch、TopologyChangeEvent 和 Inspector schema 契约。
2. 建立 Engine character authoring module、AssetDatabase descriptor、`.nkc` loader / saver、override resolver 和版本迁移骨架。
3. 将 Webview 旧 R3F 面板逐个改成命令控制器；未迁移的面板在 Route A 下禁用或转为开发 fallback。
4. 实现 morph / material / expression / IK 的 CharacterCommand 应用、ECS 投影、SceneDelta patch 和本地预测回滚。
5. 实现 ModelingSession v1、笔刷 patch 二进制通道、拓扑变更事件、dirty region 上传和迁移/失效策略。
6. 接入 CharacterBakingSystem 与 GLB / VRM / FBX 导出一致性测试。
7. 清理 Webview 主路径中的 `Viewport3D` / `ModelLoader` 视觉依赖，保留明确命名的开发 fallback。

## Open Questions

- `.nkc` 首版使用 JSON + 外部二进制 `.nkcdata`，还是 Protobuf/MessagePack；建议先 JSON schema + 二进制数据块，利于 diff 和调试。
- `VertexBrushPatch` 二进制副通道复用 `/v1/scenes/control` 的 binary frame，还是新增 `/v1/scenes/modeling/:session_id`；需要按背压和调试便利性选择。
- FBX writer 是在阶段 1B 首版直接落地，还是先定义导出接口并以 GLB / VRM 为验收主路径；proposal 将 FBX 纳入影响面，但实现可分批。
- neko-market 模板解析是否走现有 market registry，还是先支持 workspace/local template URI；首版应避免阻塞 authoring 核心链路。
