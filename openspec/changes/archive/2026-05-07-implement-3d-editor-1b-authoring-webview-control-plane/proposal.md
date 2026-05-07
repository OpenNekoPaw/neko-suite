## Why

`implement-3d-editor-wysiwyg-rendering` 已把阶段 1A 收敛到 Engine 视频流视觉真值、共享场景契约、AssetDatabase 和控制 WebSocket。`docs/architecture/adr-3d-editor-rendering-architecture.md` 的阶段 1B 需要在这条基线上补齐完整角色 authoring、自由建模和 Webview 控制面收口，避免 morph、笔刷、IK、动画和旧 R3F 预览重新制造第二套事实源。

## What Changes

- 实现 `LayeredCharacterDescription` 作为角色 authoring 真值，覆盖 `.nkc` / `.nkcdata` 双文件模型、Descriptor / Definition / Behavior / Geometry / Override 层、模板 override 合并和版本迁移入口。
- 增加阶段 1A runtime hardening 闸门：FrameScheduler 降级必须接入生产路径，RenderGraph 必须驱动 PBR / post-process / color convert / encoder copy，hit-test / projected bounds / gizmo anchor 必须基于视口相机和真实几何，多视口必须共享同一 scene revision 的 sim/extract。
- 将角色参数编辑纳入 `CharacterCommand`：morph slider、材质 layer、Library Override、骨骼/IK 控制和表情 preset 均通过 `/v1/scenes/control` 发送命令，写入 `.nkc` authoring 数据，再投影到 Engine ECS。
- 建立 `CharacterBakingSystem`，让 GLB / VRM / FBX 导出读取 `.nkc` + AssetDatabase + Engine 当前姿态，烘焙 morph、skin、材质 layer 和 override；导出器仍不得读取 GPU cache 或 Webview 预测状态。
- 实现自由建模会话：`ModelingSession`、`VertexBrushPatch` 二进制副通道、`TopologyChangeEvent`、拓扑版本、op log、mesh dirty region 上传和 `MeshTopologyMigrationService`。
- 将 Webview 收敛为 Engine 渲染结果播放器和控制面：Route A 下可见 3D 内容只来自 `VideoViewport` 的 Engine 帧，R3F/Three.js 仅允许作为短生命周期预测层或开发 fallback，不再加载模型作为主视觉预览。
- 把 Webview 旧面板迁移到命令化控制面：Face/Expression/Bone/Shape/CSG/Text/Animation/Keyframe/Inspector 面板要么编译为 SceneCommand / CharacterCommand / ModelingSession command，要么在 Route A 下隐藏或标记不可用。
- 扩展 `OverlayCanvas` / `InteractionLayer` / `LocalPredictionLayer`，支持 morph slider、IK handle、笔刷、套索选择、snap、projected bounds 和 topology preview 的本地预测；预测结果必须由 ack、SceneDelta、TopologyChangeEvent 和 RenderFrameMeta 校正。
- 补齐阶段 1B 验收：基于 neko-market 模板创建角色、实时 morph/材质/IK authoring、自由雕刻并提交拓扑变更、`.nkc` + `.nkcdata` 可 diff/可迁移、导出结果与 Engine 视频流一致。

## Capabilities

### New Capabilities

- `character-authoring-contracts`: `.nkc` / `.nkcdata`、LayeredCharacterDescription、CharacterCommand、Library Override、角色 schema 和版本迁移契约。
- `route-a-runtime-hardening`: 阶段 1A 的 RenderGraph、FrameScheduler、视口查询、多视口 extract 和动画导出姿态硬化闸门。
- `character-authoring-workflows`: 角色 morph、材质 layer、表情 preset、骨骼/IK、Inspector schema 自动生成和模板 override 编辑工作流。
- `free-modeling-sessions`: ModelingSession、VertexBrushPatch、TopologyChangeEvent、拓扑版本、mesh dirty region、笔刷/拓扑操作和迁移语义。
- `webview-engine-control-surface`: Webview 作为 Engine 视频播放器和控制面的边界，旧 R3F 面板迁移、LocalPredictionLayer、OverlayCanvas、InteractionLayer 和 Route A 降级行为。
- `character-export-baking`: CharacterBakingSystem、GLB/VRM/FBX 角色导出、morph/skin/material override 烘焙和导出一致性验收。

### Modified Capabilities

- 无。当前 `openspec/specs/` 尚无已归档能力；本变更以新增阶段 1B 能力建立基线，并依赖 active change `implement-3d-editor-wysiwyg-rendering` 的阶段 1A 契约。

## Impact

- Engine/Rust：`packages/neko-engine` 的 `runtime-scene`、AssetDatabase、SceneCommandQueue、character authoring、mesh modeling、topology migration、RenderGraph dirty region、exporter、stream registry 和 host-http 控制/二进制通道。
- TypeScript contracts/client：`packages/neko-proto` / `@neko/shared` 的 CharacterCommand、LayeredCharacterDescription、ModelingSession、VertexBrushPatch、TopologyChangeEvent、Inspector schema、二进制 patch 客户端和 `SceneControlSocket` 扩展。
- Webview：`packages/neko-model` 的 `VideoViewport`、`OverlayCanvas`、`InteractionLayer`、`LocalPredictionLayer`、Face/Expression/Bone/Shape/CSG/Text/Animation/Keyframe/Inspector 面板和 R3F fallback 边界。
- Extension Host：继续只代理 VSCode 能力、资源 URI、导入导出、市场模板解析和低频文件操作；不得重新中转视频帧、高频笔刷 patch、SceneDelta 或角色 slider 事件。
- 文件/API：新增 `.nkc` / `.nkcdata` 项目资产、角色模板 URI、拓扑变更事件、笔刷二进制副通道和 FBX 导出路径。
- 测试：需要契约 roundtrip、`.nkc` merge/migration、CharacterCommand ack/resync、morph/IK/材质 overlay 预测回滚、笔刷 patch 带宽、拓扑迁移、导出一致性、Webview R3F 边界和端到端 Route A 验收。
