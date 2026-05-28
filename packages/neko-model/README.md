# neko-model Route A 与角色 Authoring 开发说明

## Route A 边界

neko-model 的实时 3D 视口是 Engine-only Route A：Webview 通过 `EngineClient.startSceneRenderStream()` 获取 `RenderStreamDescriptor`，再由 `VideoViewport` 使用 `H264StreamClient` 和 WebCodecs 解码 raw H.264 帧。可见 3D 内容只来自 Engine 帧，`OverlayCanvas` 和 `InteractionLayer` 负责选中框、gizmo、hit-test、projected bounds、本地预测和诊断信息。

布局上，Model Webview 使用 Creative Workbench Shell，不再渲染 `WorkbenchTopBar` 或 viewport 横向工具条。左侧工具栏承接保存、导出、建模面板入口、网格开关、重置相机等常用命令，并通过底部显隐组控制三类区域：主面板 viewport HUD、主面板下侧动画/timeline controls、右侧 Dock；viewport 与 timeline 展示表面保持长显。右侧 Dock 承接 Outliner/Properties 和选中对象属性编辑。选中节点、对象数量和 Engine 状态投射到 VSCode 原生 StatusBar，右侧 Dock、Outliner/Properties 分割线以及 Timeline 高度由 Webview 内 ResizeHandle 调整，并通过 Webview state 恢复上次尺寸。

Webview 不再内置 R3F/Three.js 可见模型 fallback。`R3FDevelopmentFallback`、`Viewport3D`、`ModelLoader` 和 R3F `TransformGizmo` 已从 Route A webview 移除；`@react-three/*`、`three`、`@pixiv/three-vrm` 不能作为 `@neko-model/webview` 依赖重新引入。WebCodecs 或 Engine stream 不可用时，UI 必须进入明确的 Route A unavailable 状态；`scenes:capture` 只能作为非交互质量预览 overlay，不得替代实时 Engine stream。

短生命周期预测或辅助 overlay 必须以 2D overlay / gizmo anchor / projected bounds 形式表达，携带 viewportId、sceneRevision、seq，以及必要的 sessionId/topologyVersion，并在 ack、SceneDelta、TopologyChangeEvent 或 RenderFrameMeta 对齐后清除。预测层不得解析源 glTF、不得运行第二套 PBR/材质/动画渲染器，也不得覆盖 Engine 视频流持续显示。

原始 `.glb` / `.gltf` / `.vrm` 文件直接打开、导入 `.nkm` 项目、或从项目引用模型时，都必须先进入 Engine 加载路径，再由 Route A 视频流显示。Webview 不直接解析或渲染源模型文件，只显示 Engine 帧并把选择、平移、旋转、缩放、动画和 authoring 控制输入发送给 Engine。

Extension Host 只处理 VSCode API、资源 URI、Engine discovery、导入导出对话框和文件操作。高频 transform、character slider、brush patch、SceneDelta、视频帧和 PCM 帧不得经 Extension 转发。

## 角色 Authoring 真值

可编辑角色以 `.nkc` + `.nkcdata` 表达：

- `.nkc` 保存轻量 descriptor、schemaVersion、featureFlags、template override、material slot、morph 控件和资源引用。
- `.nkcdata` 或 AssetDatabase data block 保存 morph sparse delta、skin weight atlas、blend shape 和大块几何数据。
- `LayeredCharacterDescription` 是 authoring 真值；Engine 将它投影到 ECS，Webview 不持久化可导出的角色状态。

Face、Expression、Bone/IK、Material layer、Inspector、Animation/Keyframe 等面板必须把用户操作编译为 `SceneCommand`、`CharacterCommand` 或 `ModelingSession` 命令，经 `/v1/scenes/control` 发送给 Engine。Webview 预测只用于交互反馈，不能写入导出或 undo/redo 真值。

## 自由建模

雕刻、顶点编辑、Boolean、Subdivide、Decimate 和 Dynamic Topology 必须在 `ModelingSession` 中执行。笔刷高频数据通过 `VertexBrushPatch` 二进制通道发送，`SceneDelta.modelingSessions` 同步会话状态，`TopologyChangeEvent` 同步拓扑版本和 migration/invalidation 结果。

本地预测副本必须带 `sessionId + topologyVersion + seq`。收到 topology event、session commit/cancel、ack rejected 或超时后，Webview 必须丢弃旧预测并请求 resync。

## 旧资产迁移策略

`.nkm` 仍然是场景文件：它保存节点、变换、资产引用和编辑器状态，不自动升级为角色 authoring 文件。打开旧 `.nkm` 时，已有 GLB/VRM 节点按普通 mesh 场景加载，除非用户显式执行“创建可编辑角色”流程。

GLB/VRM 导入有两条路径：

- 普通模型加载：保留为 mesh/scene asset，可变换、摆放、导出，但不承诺可编辑 morph library、skin weight atlas 或 Library Override。
- 可编辑角色创建：模板或导入器生成 project-local `.nkc` override，注册 `.nkcdata`/AssetDatabase 引用，并由 Engine 实例化角色。只有这条路径启用 morph slider、material layer、IK、拓扑迁移和 `CharacterBakingSystem` 导出一致性。

无法从任意烘焙 GLB/VRM 可靠反推出完整 `.nkc` 参数描述。缺少稳定 morph、skeleton、skin 或 topology descriptor 的文件应保持普通 mesh，不应伪造可编辑角色。

## 验证入口

- Webview 边界：`node scripts/check-3d-route-a-boundaries.mjs packages/neko-model/packages/webview/src`
- Extension 高频边界：`node scripts/check-3d-route-a-boundaries.mjs packages/neko-model/packages/extension/src`
- Webview 测试：`pnpm --filter @neko-model/webview test -- RouteABoundary InteractionLayer LocalPredictionLayer CharacterAuthoringWorkflow AuthoringPerformanceMetrics modelStore SceneDocument`
- Webview 构建：`pnpm --filter @neko-model/webview build`
- Engine 场景加载与渲染抽取：`cd packages/neko-engine && cargo test -p neko-runtime-scene -p neko-engine-scene-renderer route_a`
