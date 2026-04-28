## Context

`docs/architecture/adr-3d-editor-rendering-architecture.md` 将 3D 编辑器的近期目标收敛为阶段 1A：以 Engine wgpu 输出作为编辑器 Viewport 的视觉真值，同时补齐场景契约、资产 authoring 真值、导出一致性和最小交互闭环。当前系统的主要问题不是单个渲染 bug，而是事实源分裂：Webview R3F 预览、Engine ECS、GPU AssetCache、GLB exporter 和局部 TS 类型各自持有不完整状态。

现有架构硬约束仍然成立：Webview 不能直接访问 Node.js 或 VSCode API；Extension 不应成为高频数据总线；Rust Engine 是计算逻辑和数据模型权威来源；Protobuf 或共享类型是跨层契约的单一事实来源；GPU cache 是派生缓存，不是 authoring 数据。

## Goals / Non-Goals

**Goals:**

- 建立 3D 场景共享契约，替换裸 `Record<string, unknown>` 和 Webview 局部类型。
- 让所有高频编辑命令走 `/v1/scenes/control`，具备 `seq`、ack、revision、delta、query 和 resync 语义。
- 让 `scenes:stream` 输出 Engine 渲染帧，Webview 使用 raw H.264 + WebCodecs 显示，不再以 R3F 作为视觉真值。
- 建立最小 `AssetDatabase`，使导出器读取 authoring metadata，而不是 GPU cache 或硬编码默认值。
- 建立 RenderGraph、Simulation/Render World 隔离和 FrameScheduler 骨架，为阴影、IBL、多视口和降级策略提供承载点。
- 保留阶段 1B/2/3 的协议扩展位，但不扩大本次实现范围。

**Non-Goals:**

- 不实现 `.nkc` / `.nkcdata` 文件、LayeredCharacterDescription 可执行加载、角色 morph slider 或 Library Override。
- 不实现自由建模笔刷、拓扑变更、VertexBrushPatch 二进制副通道或 MeshTopologyMigrationService。
- 不实现蓝图、物理、Gameplay Framework、Play Mode、WebRTC 远程传输或高级烘焙系统。
- 不让 fMP4/MSE/FMP4StreamClient 成为 3D Webview 实时视口路径。

## Decisions

### Decision 1: 视觉真值归 Engine 视频流，Webview 只做展示和交互辅助

`scenes:stream` 接收 `ViewportDescriptor`，返回 `RenderStreamDescriptor`。Webview 使用 `H264StreamClient` + WebCodecs + canvas/VideoFrame 呈现 Engine 帧，并用独立 `OverlayCanvas` 绘制选择框、gizmo、bbox、预测层和诊断信息。

替代方案是继续让 R3F 渲染日常视口，再用 Engine 单帧作为质量参考。该方案能短期保留低延迟编辑，但无法解决材质、tone mapping、法线、阴影、动画状态和导出路径的长期漂移，因此只能作为开发 fallback 或 Route C 过渡，不作为最终主路径。

### Decision 2: 控制流、场景语义流、视频流分离

`/v1/scenes/control` 只承载 JSON/MessagePack 级别的命令、ack、delta、query、snapshot、renderFrameMeta 和 error；`/v1/streams/:stream_id` 只承载 raw H.264 视频包；`/v1/audio/:stream_id` 只承载 PCM f32le 音频包。三条通道通过 `seq`、`revision`、`frameId`、`viewportId` 和 `appliedSeq` 对齐。

替代方案是让 Extension Host 或同一个 WebSocket 中转所有数据。该方案会把视频包、场景 patch 和 VSCode 能力代理耦合在一起，增加进程 hop、背压和序列化成本，也会让 Extension 违反低频控制面的职责边界。

### Decision 3: OOP object model 表达 authoring 语义，ECS 保存组件事实

`SceneDocument`、`SceneNodeHandle`、`MaterialHandle`、`CameraHandle` 和 `SceneTransaction` 提供对象式 API，但这些 API 只编译成 `SceneCommandEnvelope`。ECS 中的 `Transform`、`MaterialRef`、`Visible`、`Light`、`Camera`、`PlaybackState` 等组件仍是运行时事实源。

替代方案是让 Webview object model 持有一份可变场景树。该方案会重新制造双写问题，导致 Undo、导出、Engine 渲染和属性面板分叉。允许的缓存必须带 `revision`，过期后丢弃或 resync。

### Decision 4: AssetDatabase 是 authoring 资产真值，AssetCache 只是 GPU 派生缓存

最小 `AssetDatabase` 归属 runtime-scene authoring 层，持有 `AssetHandle(GUID)`、metadata、`MaterialDescriptor`、`MeshDescriptor`、`TextureDescriptor` 等数据。ECS 组件只保存 handle；engine-kernel 从 descriptor 派生 GPU buffers/textures/bind groups；导出器读取 AssetDatabase + ECS authoring 组件。

替代方案是导出器从 GPU `AssetCache` 反读材质或纹理状态。该方案会引入 GPU 到 CPU 读回、后端对象泄漏和不可测试的导出行为，也违背 Render World 与 authoring world 隔离。

### Decision 5: RenderGraph 与 FrameScheduler 作为 P1 骨架提前建立

RenderGraph 先承载现有 PBR forward、post-process、GPU color convert 和 encoder copy，再为阴影、IBL、SSAO、debug view 留 pass 插槽。FrameScheduler 按 `ViewportDescriptor.workMode + fps` 选择预算 profile，并拥有降级策略和性能指标产出。

替代方案是在单条 PBR 管线里继续手写 pass 顺序和资源生命周期。该方案在加入阴影、多视口和自适应质量时会迅速不可维护，且无法产生统一的延迟和预算指标。

## Risks / Trade-offs

- [实现面过大] → 按阶段 1A 收敛，只落地 WYSIWYG、共享契约、AssetDatabase、导出一致性、控制 WS、RenderGraph/FrameScheduler 骨架；角色 authoring 和自由建模仅预留协议位。
- [视频流接入后交互延迟增加] → 相机控制、本地预测和 overlay 保持 Webview 本地；Engine 帧到达后用 revision/appliedSeq 校正。
- [多视口增加 GPU 压力] → FrameScheduler 统一管理预算，过载时先降辅助视口 FPS/分辨率，再降主视口后处理和分辨率。
- [WebCodecs 兼容性不足] → 不切换到 fMP4/MSE；实时 Route A 不可用时降级到 `scenes:capture` 静态质量预览或开发 fallback。
- [控制 WS 与未来 engine-feedback-bus 重叠] → `/v1/scenes/control` 长期只保留域内 command/ack/delta/renderFrameMeta；跨域质量和性能信号在 `engine-feedback-bus` 就位后迁出。

## Migration Plan

1. 先落地共享契约和最小 AssetDatabase，替换 `EngineClient.getSceneSnapshot()` 的裸 `Record<string, unknown>`。
2. 修复 exporter，使材质、纹理、灯光、相机、可见性和动画状态从 AssetDatabase/ECS authoring 数据导出；glTF 导入必须先登记可导出的 image/texture/sampler descriptor，避免 exporter 生成无法被其他 DCC/引擎解析的伪纹理引用。
3. 引入 `/v1/scenes/control` 最小切片，只支持 hello、subscribe、transform command、snapshot/resync、ack、SceneDelta。
4. Webview 新增 `SceneControlSocket` 和 `SceneDocument`，把 transform 更新从 Extension HTTP 路径迁移到控制 WS，旧路径保留为短期 fallback。
5. 建立 RenderGraph/Render World/FrameScheduler 骨架，并接入现有 PBR forward、post-process 和编码路径。
6. 实现 `scenes:capture` 可显示帧作为 Route C，再实现 `scenes:stream` + `VideoViewport` 作为 Route A。
7. 补齐 hit-test、projected bounds、overlay、RenderFrameMeta 对齐和多视口预算测试。

## Open Questions

- 已决：共享契约优先落在 `packages/neko-proto/scene.proto`，因为 `@neko/proto` 已定义为跨语言 IDL 唯一权威来源，且现有生成器会自动发现 `.proto` 并生成 `@neko/shared/src/generated/*.engine.ts` 供 TypeScript 消费。`@neko/shared` 只导出生成结果和必要的 TS 包装，不手写第二份契约。
- `SceneControlSocket` 首版使用 JSON 还是 MessagePack/Protobuf，需要按调试便利性和带宽压力取舍；阶段 1A 可以先 JSON。
- 硬件编码器不可用时的软件 H.264 profile/level 默认值，需要由实际平台探测结果决定，不能在客户端硬编码。
