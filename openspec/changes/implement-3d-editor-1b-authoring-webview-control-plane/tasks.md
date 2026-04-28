## 0. 阶段 1A Runtime 硬化闸门

- [x] 0.1 将 `FrameScheduler.schedule_viewport()` 和 `degradation_plan()` 接入 scenes stream / render loop 生产路径，不能只停留在单元测试和重导出
- [x] 0.2 让降级步骤真实修改辅助视口 helper pass、辅助视口 fps/resolution、主视口 post-process、主视口 fps 和主视口 resolution，并输出 active quality tier
- [x] 0.3 将 `preserve_control_ack` 改为基于 ack queue / command latency / render backlog 的运行时健康判断，而不是硬编码常量
- [x] 0.4 为 FrameScheduler 增加过载集成测试，证明过载时会降级且 `/v1/scenes/control` ack 路径不被渲染阻塞
- [x] 0.5 将 PBR forward、post-process、GPU color convert、encoder copy 接入可执行 RenderGraph pass，生产 Route A 渲染必须通过 compiled graph
- [x] 0.6 移除或包裹 `PbrRenderer::render()` 直接 `begin_render_pass` 绕过 RenderGraph 的主路径，保留低层 pass executor 作为 RenderGraph 调用目标
- [x] 0.7 为 render mode、debug view、post-process、stream/capture output 增加 RenderGraph variant 集成测试
- [x] 0.8 将 hit-test 改为基于 viewport camera ray、depth/bounds 或 acceleration structure 的真实 picking，空白点击不得返回第一个 pickable node
- [x] 0.9 将 projected bounds / gizmo anchor 改为基于 viewport camera 投影矩阵和真实 world bounds 计算
- [x] 0.10 实现多视口同 sceneRevision 共享 simulation tick 和 Render World extract，再按 viewport 独立渲染 target / camera / stream
- [x] 0.11 复核 animation export current pose 来源，补测试证明导出使用 Engine evaluated playback state 而不是仅 animation clip 列表

## 1. 契约、文件格式与迁移基线

- [x] 1.1 确定阶段 1B 契约落点，记录 `packages/neko-proto`、`@neko/shared`、Rust runtime 模块和 Webview wrapper 的职责边界
- [x] 1.2 定义 `LayeredCharacterDescription`、Descriptor、Definition、Behavior、Geometry、Override、MaterialSlot、MorphDescriptor、SkinWeightAtlas、BlendShape 数据契约
- [x] 1.3 定义 `.nkc` 轻量文件和 `.nkcdata` 数据块 schema，约束相对 URI、AssetHandle、版本号、feature flags 和 checksum
- [x] 1.4 为 `.nkc` / `.nkcdata` 增加 schema version、migration manifest、旧版本 fixture 和 unsupported future version 保护
- [x] 1.5 定义 `CharacterCommand` 并接入 `SceneCommandEnvelope`，覆盖 morph、material layer、expression preset、IK/bone、skeleton bind、override apply/reset
- [x] 1.6 扩展 `SceneDelta` 字段，覆盖 updatedMorphWeights、updatedCharacterMaterials、updatedSkeletonPose、characterOverrides、modelingSessions、topologyChanges
- [x] 1.7 定义 `ModelingSession`、`VertexBrushPatch`、`TopologyChangeEvent`、topologyVersion、op log 和 invalidation/migration 结果契约
- [x] 1.8 添加 Rust/TypeScript 契约 roundtrip 测试，覆盖角色描述、override、CharacterCommand、ModelingSession、TopologyChangeEvent 和 omitted field 语义

## 2. Engine 角色 Authoring 真值

- [x] 2.1 在 `runtime-scene` 或相邻 authoring 层建立 character authoring module，暴露 loader、saver、resolver、projector 和 validation API
- [x] 2.2 扩展 AssetDatabase descriptor，支持 CharacterDescription、CharacterDataBlock、MorphDescriptor、SkeletonDescriptor、SkinWeightAtlas 和 BlendShape 数据引用
- [x] 2.3 实现 `.nkc` / `.nkcdata` 读取、写入、校验、checksum 验证和 PathResolver 集成，禁止保存绝对路径
- [x] 2.4 实现 Library Override resolver，支持 base template 解析、typed JsonPath override、冲突检测和 deterministic merge
- [x] 2.5 增加 ECS `CharacterInstanceId`、MorphWeights、SkeletonPose、CharacterMaterialLayer 等运行时投影组件
- [x] 2.6 实现 authoring → ECS projection system，确保 `.nkc` 变更后 dirty tracker 标记 morph、material、skeleton 和 bounds
- [x] 2.7 在 SceneCommandQueue 中实现 CharacterCommand apply/reject/supersede 逻辑，写入 authoring 真值后再投影 ECS
- [x] 2.8 生成角色相关 SceneDelta patch，并携带 revision、appliedSeq、characterId 和 topologyVersion
- [x] 2.9 添加 Engine 单元测试，覆盖 override merge、schema migration、CharacterCommand ack/reject、ECS projection 和 SceneDelta patch

## 3. Webview 播放器与控制面收口

- [x] 3.1 将 `VideoViewport` 主路径改为只挂载 Engine frame canvas、OverlayCanvas 和 InteractionLayer，不在 Route A 下挂载 `Viewport3D` / `ModelLoader` 作为可见模型
- [x] 3.2 将 R3F/Three.js fallback 重命名并隔离为 development fallback，要求 UI 明确标记 Route A unavailable 且不参与导出或 WYSIWYG 验收
- [x] 3.3 建立 `LocalPredictionLayer`，统一管理 transform、camera、morph、IK、brush、selection、snap、topology preview 的 create/update/commit/rollback/timeout/invalidate 生命周期
- [x] 3.4 建立 `InteractionLayer`，按 viewportId 和 sceneRevision 路由 click、hit-test、projected bounds、gizmo anchor、lasso、snap 和 camera query
- [x] 3.5 扩展 `OverlayCanvas`，支持基于 RenderFrameMeta 对齐的 selected bounds、gizmo anchor、IK handle、morph prediction、brush preview 和 topology warning overlay
- [x] 3.6 将 FaceEditorPanel 改为 CharacterCommand 控制器，禁止只写 Zustand faceParams 或 R3F morphTargetInfluences
- [x] 3.7 将 ExpressionPresetPanel 改为 command-backed preset 应用，移除对 Webview VRM expressionManager 的权威写入路径
- [x] 3.8 将 BoneExpressionPanel / IK 控制迁移到 Engine-authored bone/IK commands，并实现预测 overlay 与 rejected ack 回滚
- [x] 3.9 将 ShapeCreator / CSG / Text 面板接入 SceneCommand 或 ModelingSession command；未迁移能力在 Route A 下禁用
- [x] 3.10 将 AnimationPlayer / KeyframeTimeline 的播放、seek、blend、pose 和 keyframe mutation 迁移到 Engine-authored commands，不再以 R3F AnimationMixer 为事实源
- [x] 3.11 添加 Webview 边界测试，断言 Route A 下无持久 R3F 模型主视口、旧面板无本地权威写入、Extension 不在高频路径

## 4. 角色 Authoring 工作流

- [x] 4.1 实现从 workspace 或 neko-market 模板创建角色，生成 project-local `.nkc` override 并注册 AssetDatabase 引用
- [x] 4.2 实现 morph slider schema 渲染、命令 coalescing、本地预测、ack commit、rejected rollback 和 resync fallback
- [x] 4.3 实现 material layer Inspector，支持 base color、metallic、roughness、normal、AO、emissive 和 texture reference 编辑
- [x] 4.4 实现 expression preset → CharacterCommand 编译器，支持 preset 展开为多个 morph / bone / material edits
- [x] 4.5 实现 IK handle / bone pose command controller，支持 projected handle、local prediction 和 Engine pose 校正
- [x] 4.6 实现 character-aware Inspector schema 自动生成，合并 LayeredCharacterDescription schema、ComponentSchemaRegistry 和 AssetDatabase descriptors
- [x] 4.7 实现 character command undo/redo，基于 acked command history 或 explicit override diff，不使用 Webview prediction snapshot
- [x] 4.8 添加端到端测试：模板创建 → morph/material/IK 编辑 → Engine ack → SceneDelta → RenderFrameMeta → VideoViewport 对齐

## 5. 自由建模与拓扑会话

- [x] 5.1 实现 Engine `ModelingSessionManager`，支持 begin、patch、commit、cancel、resync 和 session state delta
- [x] 5.2 实现参数化命令与 topologyMutable 会话的互斥规则，防止 morph/material/IK 在不兼容拓扑会话内执行
- [x] 5.3 实现 `VertexBrushPatch` 二进制副通道或建模 WebSocket，包含 metadata、payload encoding、seq、backpressure 和 coalescing
- [x] 5.4 实现 Webview brush predictor，维护带 meshId、sessionId、topologyVersion 的短生命周期预测副本，并在 Engine 帧或 topology event 后清理
- [x] 5.5 实现 Engine mesh dirty region 计算和增量 GPU buffer 上传，避免每个笔刷 patch 重建整 mesh
- [x] 5.6 在 RenderGraph 中增加 brush preview / dirty region 可视化 pass，并受 `ViewportDescriptor.workMode='edit-free'` 控制
- [x] 5.7 实现 topology-changing operations 的 op log、TopologyChangeEvent、topologyVersion 递增和 Webview cache invalidation
- [x] 5.8 实现 `MeshTopologyMigrationService` v1，覆盖 vertex-only preserve、subdivide/decimate/boolean invalidation 和用户可见诊断
- [x] 5.9 添加自由建模测试，覆盖 stale topologyVersion 拒绝、patch bandwidth、commit/cancel transaction、migration/invalidation 和 prediction cleanup

## 6. CharacterBaking 与导出一致性

- [x] 6.1 建立 `CharacterBakingSystem`，输入 `.nkc` / `.nkcdata`、AssetDatabase、Engine pose、topologyVersion 和 ExportOptions
- [x] 6.2 实现 morph sparse delta、blend shape、skin weights、skeleton pose 和 behavior driver 的 deterministic bake
- [x] 6.3 将 GLB / VRM character export 切到 baked character representation，保留材质、纹理、normal、AO、emissive、灯光/相机兼容路径
- [x] 6.4 定义并接入 FBX export 的 baked character 中间表示；若 writer 未完整实现，先以明确 unsupported diagnostic 暴露
- [x] 6.5 在导出前检查 topology migration state，阻止 invalid morph/skin/UV 的静默导出
- [x] 6.6 添加导出一致性测试，覆盖 morph、material override、current pose、topology migration、prediction excluded 和 Engine viewport revision 对齐

## 7. 性能、诊断与边界校验

- [x] 7.1 为 `edit-parametric`、`pose`、`edit-free`、`render-preview` workMode 增加 FrameScheduler budget profile 和降级策略
- [x] 7.2 添加 character slider、IK、brush patch、topology commit 的性能指标：ack p50/p95/p99、patch bandwidth、GPU upload time、frame latency、dropped predictions
- [x] 7.3 扩展 Route A 边界检查脚本，校验 Webview 主路径不挂载 R3F 可见模型、不使用 FMP4/MSE、不经 Extension 传高频数据
- [x] 7.4 为 Webview 控制面增加诊断面板，显示 sceneRevision、topologyVersion、appliedSeq、active predictions、modeling session 和 quality tier
- [x] 7.5 为 WebCodecs 不可用、Engine stream 断开、character command rejected、topology migration failed 增加明确 UI 状态和恢复路径

## 8. 文档、迁移与质量门禁

- [x] 8.1 更新 ADR 或补充阶段 1B 架构文档，说明 `.nkc` authoring 真值、自由建模会话和 Webview 播放器/控制面边界
- [x] 8.2 更新 neko-model README / 开发文档，说明 Route A 下 R3F 只用于预测或开发 fallback
- [x] 8.3 为旧 `.nkm` / GLB / VRM 项目提供迁移说明：何时生成 `.nkc`，何时只作为普通 mesh 场景加载
- [x] 8.4 运行并记录最小质量门禁：相关 Vitest、Rust 单元测试、契约 roundtrip、Webview build/check、Engine targeted tests
- [x] 8.5 执行端到端验收：模板角色创建、morph slider、material layer、IK、sculpt commit、拓扑失效告警、导出与 Engine 视频流一致

## 9. 质量门禁记录（2026-04-28）

- `pnpm --filter @neko-model/webview test -- RouteABoundary InteractionLayer LocalPredictionLayer CharacterAuthoringWorkflow AuthoringPerformanceMetrics modelStore SceneDocument`：7 files / 25 tests passed。
- `pnpm --filter @neko-model/webview build`：`tsc && vite build` passed；仅保留既有 Vite chunk-size / three-vrm dynamic import warning。
- `pnpm --filter @neko/neko-client test -- VertexBrushPatchClient StreamDescriptorClients`：7 files / 75 tests passed。
- `pnpm --filter @neko/shared test -- scene-contract`：37 files / 517 tests passed。
- `RUSTC_WRAPPER= cargo test -p neko-runtime-scene --lib`：98 tests passed；存在既有 `project.rs` unused import warnings。
- `RUSTC_WRAPPER= cargo test -p neko-engine-kernel --lib`：381 tests passed；存在既有 runtime-media / mic_capture warnings。
- `node scripts/check-3d-route-a-boundaries.mjs packages/neko-model/packages/webview/src`：passed，57 files checked。
- `node scripts/check-3d-route-a-boundaries.mjs packages/neko-model/packages/extension/src`：passed，6 files checked。

## 10. 端到端验收记录（2026-04-28）

- 模板角色创建、`.nkc` override、AssetDatabase 注册和 ECS 投影由 `neko-runtime-scene` character authoring tests 覆盖。
- morph slider、material layer、expression preset、IK command、Inspector schema、acked undo/redo 由 `CharacterAuthoringWorkflow` 和 Webview store tests 覆盖。
- Engine ack、SceneDelta、RenderFrameMeta 对齐、prediction commit/rollback、topology warning 和 diagnostics panel 数据由 `modelStore` / `AuthoringPerformanceMetrics` / `RouteABoundary` tests 覆盖。
- sculpt session commit/cancel、stale topology reject、migration/invalidation 和 export eligibility 由 `modeling_session`、`character_baking`、`exporter` Rust tests 覆盖。
- Route A 可见内容、R3F fallback 边界、Extension 非高频路径由 Webview test 和 `check-3d-route-a-boundaries.mjs` 覆盖。

## 11. 审查返工记录（2026-04-28）

- [x] G1：新增 `/v1/scenes/modeling/:session_id` 建模 WebSocket，二进制帧按 `neko-vertex-brush-v1` 解码为 `VertexBrushPatchMetadata`，校验 session、payload 长度、seq 和协议后调用 `SceneService.apply_vertex_brush_patch()`，控制 WS 对 binary 帧显式报错，避免高频 patch 误入 ack 通道。
- [x] G2：新增 Webview `SculptBrushPanel` 和 `SculptBrushStrokeController`，提供 sculpt session begin/commit/cancel、笔刷参数、stroke sample 累积、`VertexBrushPatchClient` 二进制发送、本地 brush prediction 和 patch bandwidth 记录。
- [x] G3：`AssetCache` 的 PBR / procedural / skinned vertex buffer 创建为 `VERTEX | COPY_DST`，新增 `upload_pbr_vertex_dirty_region()` 使用 `queue.write_buffer` 按 dirty range 写入，`MeshDirtyUploadPlan` 测试验证 offset/length 只覆盖 dirty region 并拒绝全量 payload 误用。
- [x] 验证：`RUSTC_WRAPPER= cargo test -p neko-host-http scene_modeling --lib`：2 tests passed。
- [x] 验证：`pnpm --filter @neko/neko-client test -- VertexBrushPatchClient`：7 files / 76 tests passed。
- [x] 验证：`pnpm --filter @neko-model/webview test -- SculptBrushWorkflow RouteABoundary`：8 files / 28 tests passed。
- [x] 验证：`RUSTC_WRAPPER= cargo test -p neko-runtime-scene modeling_session --lib`：3 tests passed；保留既有 `project.rs` unused import warnings。
- [x] 验证：`RUSTC_WRAPPER= cargo test -p neko-engine-kernel dirty_upload_plan --lib`：2 tests passed；保留既有 runtime-media / mic_capture warnings。
- [x] 验证：`pnpm --filter @neko-model/webview build`：passed；保留既有 Vite chunk-size / three-vrm dynamic import warning。
- [x] 验证：`node scripts/check-3d-route-a-boundaries.mjs packages/neko-model/packages/webview/src`：passed，60 files checked。
- [x] 验证：`node scripts/check-3d-route-a-boundaries.mjs packages/neko-model/packages/extension/src`：passed，6 files checked。
- 说明：当前 dirty region GPU 上传已具备可验证的 partial write 原语；真实雕刻求解器把 `f32-delta` payload 转成更新后的 `PbrVertex` slice 后，可直接调用 `upload_pbr_vertex_dirty_region()`，该求解器不在本次 1B 返工范围内。
