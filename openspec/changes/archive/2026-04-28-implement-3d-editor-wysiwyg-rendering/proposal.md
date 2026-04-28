## Why

`neko-model` 当前由 Webview 侧 R3F 预览和 Rust Engine 侧 wgpu 渲染共同承担 3D 显示，材质、动画、灯光、相机、可见性和导出路径存在事实源分裂，无法兑现 WYSIWYG。`docs/architecture/adr-3d-editor-rendering-architecture.md` 已将规范收敛到阶段 1A：先补齐 3D 建模与渲染一致性闭环，再进入角色 authoring、自由建模和游戏化运行时。

## What Changes

- 引入共享 3D 场景契约：`SceneCommand`、`SceneCommandAck`、`SceneSnapshot`、`SceneDelta`、`ViewportDescriptor`、`RenderStreamDescriptor`、`AudioStreamDescriptor`、`RenderFrameMeta`，替换裸 `Record<string, unknown>` 和 Webview 局部类型。
- 新增 `/v1/scenes/control` 控制 WebSocket，Webview 直连 Engine，所有高频场景编辑命令带 `seq`、`baseRevision`、ack、delta 和 resync 语义。
- 实现 Engine 视觉真值路径：`scenes:stream` 接收 `ViewportDescriptor`，返回 raw H.264 + WebCodecs 描述符；3D Webview 实时视口不使用 fMP4/MSE，也不在视频流里夹带音频。
- 建立最小 `AssetDatabase`，让材质、纹理、mesh、灯光、相机和可见性拥有 authoring 真值；GLB/VRM 导出读取 AssetDatabase + ECS authoring 数据，不读取 GPU cache。
- 建立渲染运行时骨架：Simulation/Render World 隔离、最小 RenderGraph、FrameScheduler、多视口预算与降级策略。
- Webview 视口拆分为 `VideoViewport` + `OverlayCanvas` + 交互控制层；R3F/Three.js 降级为预测与开发 fallback，不再作为视觉真值。
- 预留后续阶段协议位：CharacterCommand、ModelingSession、VertexBrushPatch、TopologyChangeEvent，但本变更不实现 `.nkc`、角色 morph slider、自由建模笔刷、蓝图、物理或 Gameplay Framework。

## Capabilities

### New Capabilities

- `scene-authoring-contracts`: 共享场景命令、快照、增量、revision、事务和控制 WebSocket 行为。
- `engine-render-viewport`: Engine 视口流、视频/音频实时播放约束、多视口描述符、Webview 视频视口和 overlay 对齐行为。
- `asset-export-consistency`: AssetDatabase authoring 真值、GLB/VRM 导出材质/灯光/相机/可见性一致性。
- `render-runtime-governance`: Simulation/Render World 隔离、RenderGraph、FrameScheduler、预算指标和降级策略。

### Modified Capabilities

- 无。当前 `openspec/specs/` 尚无已归档能力，本次以新增能力建立基线。

## Impact

- Engine/Rust：`packages/neko-engine` 下的 `runtime-scene`、`engine-kernel`、`host-api`、`host-http`、stream registry、exporter、PBR shader 和 RenderGraph/FrameScheduler 相关模块。
- TypeScript contracts/client：`packages/neko-proto` 或共享类型包、`packages/neko-client` 的 `EngineClient`、`H264StreamClient`、`AudioStreamClient`、新增 `SceneControlSocket`。
- Webview/Extension：`packages/neko-model` 的 extension bridge、webview scene store、viewport、overlay、gizmo/selection/inspector 控制器。
- API/协议：新增 `/v1/scenes/control`，扩展 `scenes:stream`，新增 `/v1/audio/:stream_id` 作为 PCM 音频实时通道目标路径。
- 测试：需要补齐 TS/Rust 契约 roundtrip、WS ack/resync、SceneDelta patch、导出一致性、视频 descriptor 初始化、RenderFrameMeta 对齐和性能预算测试。
