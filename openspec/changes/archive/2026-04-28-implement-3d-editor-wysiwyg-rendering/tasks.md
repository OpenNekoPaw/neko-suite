## 1. 共享契约与类型收敛

- [x] 1.1 确定 3D 场景共享契约落点：`packages/neko-proto` 或现有共享 TS 类型包，并记录选择原因
- [x] 1.2 定义 `SceneCommand`、`SceneCommandEnvelope`、`SceneCommandAck`、`SceneSnapshot`、`SceneDelta`、`ViewportDescriptor`、`RenderStreamDescriptor`、`AudioStreamDescriptor`、`RenderFrameMeta`
- [x] 1.3 为 `SceneDelta` 补齐 patch 语义字段：transform、morph、hierarchy、visibility、materials、asset refs、lights、cameras、overlay、topology/modeling 预留位
- [x] 1.4 添加 Rust/TypeScript 契约 roundtrip 测试，覆盖 omitted field 不重置、revision、node id、viewport id 和 render frame meta
- [x] 1.5 将 `EngineClient.getSceneSnapshot()` 从 `Record<string, unknown>` 迁移为共享 `SceneSnapshot`
- [x] 1.6 移除或适配 neko-model Webview 局部 3D snapshot/delta 类型，使 Webview 使用共享契约

## 2. AssetDatabase 与导出一致性

- [x] 2.1 在 runtime-scene authoring 层建立最小 `AssetDatabase` module，包含 `AssetHandle`、metadata、import settings、version 和 descriptor 注册表
- [x] 2.2 定义 `MaterialDescriptor`、`MeshDescriptor`、`TextureDescriptor` 的最小字段，并让 ECS 组件通过 handle 引用资产
- [x] 2.3 将 GPU `AssetCache` 标记为从 AssetDatabase 派生的缓存，阻止 authoring ECS 组件持有 `wgpu` 对象
- [x] 2.4 将材质参数更新路径改为命令驱动写入 `MaterialDescriptor`，再触发 dirty 和 GPU cache 更新
- [x] 2.5 修改 GLB/VRM exporter，使 PBR 材质、纹理引用、自发光、AO、法线等字段从 AssetDatabase/ECS authoring 数据读取
- [x] 2.6 为 exporter 增加 `KHR_lights_punctual` 灯光写入和相机节点写入
- [x] 2.7 实现 `ExportOptions.visibility` 三档策略：`prune`、`extras-flag`、`preserve-all`
- [x] 2.8 将动画播放状态、clip、时间游标和导出姿态来源迁移到 Engine ECS 状态
- [x] 2.9 添加导出一致性测试，覆盖材质、纹理、灯光、相机、可见性三档和当前动画姿态

## 3. SceneCommand 与控制 WebSocket

- [x] 3.1 在 runtime-scene 中新增或补齐 `SceneRevision`、`NodeIndex`、`DirtyTracker`、`SceneCommandEvent` 和 `CommandApplySystem`
- [x] 3.2 实现 `SceneCommandEnvelope` 校验：单调 `seq`、`baseRevision`、transaction phase、coalesce key 和 stale command 拒绝
- [x] 3.3 实现 `SceneDelta` 提取系统，从 dirty set 生成 patch 并带上 `revision` 和 `appliedSeq`
- [x] 3.4 在 host-http 新增 `/v1/scenes/control` WebSocket route，支持 hello、subscribe、command、query、resync、requestKeyframe、heartbeat
- [x] 3.5 在 engine-kernel 建立 `SceneCommandQueue`，串行应用 command 并返回 applied/rejected/superseded ack
- [x] 3.6 在 packages/neko-client 新增 `SceneControlSocket`，管理连接、pending ack、重连 resync、requestKeyframe 和错误回调
- [x] 3.7 将 neko-model transform 更新从 Extension HTTP dispatch 迁移到 `SceneControlSocket`
- [x] 3.8 添加控制通道测试，覆盖 ack、rejected、乱序 seq、断线 resync、旧 revision delta 丢弃和 snapshot fallback

## 4. 渲染运行时骨架

- [x] 4.1 为 Simulation systems 与 Render extract/render systems 增加明确 system label 或 module 边界
- [x] 4.2 建立 Render World 数据结构，保存 render-only SoA 数据、GPU handle、draw list、camera/light/material render data
- [x] 4.3 实现单向 extract phase，从 Simulation ECS + AssetDatabase 生成 Render World 输入
- [x] 4.4 建立最小 RenderGraph：pass 声明、resource 描述、依赖排序、dead pass pruning、执行入口
- [x] 4.5 将现有 PBR forward、post-process/tone mapping、GPU color convert、encoder copy 接入 RenderGraph
- [x] 4.6 让 `ViewportDescriptor` 控制 render mode、debug view、post-process 和 render graph variant
- [x] 4.7 建立 FrameScheduler，按 `workMode + fps` 管理 sim、extract、render、encode budget
- [x] 4.8 实现五级降级策略，确保过载时不阻塞 `/v1/scenes/control` ack 路径
- [x] 4.9 添加 RenderGraph、extract phase、FrameScheduler 和 exporter 不依赖 Render World 的单元/集成测试

## 5. Engine 视口流与 Webview 展示

- [x] 5.1 补齐 `scenes:capture` 可显示质量帧输出，并在 Webview 以整屏切换方式展示
- [x] 5.2 实现 `scenes:stream` 接收 `ViewportDescriptor` 并返回 `RenderStreamDescriptor`
- [x] 5.3 确保 3D 实时视频 wire 协议固定为 raw H.264 + `frameHeader='neko-h264-v1'`，不返回 fMP4 init/media segment
- [x] 5.4 修改 `H264StreamClient`，从 `RenderStreamDescriptor` 读取 `codecString`、`container`、`frameHeader`、`initData`，移除 3D 路径硬编码 `avc1.*`
- [x] 5.5 新增 `/v1/audio/:stream_id` route 和 `EngineClient.getAudioWsUrl()`，并让 `AudioStreamClient` 校验 `AudioStreamDescriptor`
- [x] 5.6 实现 neko-model `VideoViewport`，用 canvas/`VideoFrame` 呈现 Engine H.264 解码帧
- [x] 5.7 实现独立 `OverlayCanvas`，按 `RenderFrameMeta.viewportId`、`frameId`、`sceneRevision`、`appliedSeq` 对齐绘制
- [x] 5.8 支持同 sceneId 下多个 viewport stream，并确保每个 viewport 独立 camera、render target、stream 和诊断元数据
- [x] 5.9 添加视频/音频 descriptor、WebCodecs 初始化、fMP4 拒绝、多视口路由和 RenderFrameMeta 对齐测试

## 6. 可编辑视频视口与 Inspector

- [x] 6.1 实现按 `viewportId` 路由的 hit-test query，返回 node id、depth、world position、normal 和 revision
- [x] 6.2 实现 projected bounds、gizmo anchor、active camera、overlay state 查询
- [x] 6.3 实现 transform/gizmo 本地预测层，预测只写 overlay/pending state，ack 或匹配帧到达后提交或回滚
- [x] 6.4 建立 `SceneDocument`、`SceneNodeHandle`、`MaterialHandle`、`CameraHandle`、`SceneTransaction` Webview object model
- [x] 6.5 将 object handle 方法统一编译为 `SceneCommandEnvelope` 或 query，禁止直接写 authoritative store
- [x] 6.6 建立最小 `ComponentSchemaRegistry`，覆盖 transform、material params、light intensity、camera fov 等阶段 1A 字段
- [x] 6.7 将 Inspector 数值编辑改为 schema-driven command 写入，并处理 rejected ack 回滚
- [x] 6.8 添加 Webview store、object handle、overlay、hit-test、prediction rollback 和 Inspector command 测试

## 7. 验证、文档与迁移收尾

- [x] 7.1 添加端到端测试：Webview transform command → Engine ack → SceneDelta → RenderFrameMeta → 视频帧 revision 对齐
- [x] 7.2 添加性能基线测试或诊断脚本，输出 ack p50/p95/p99、GPU frame time、encode time、dropped frames 和 quality tier
- [x] 7.3 校验 Extension Host 不承载 60fps SceneDelta、视频包或高频 transform dispatch
- [x] 7.4 为 WebCodecs 不可用环境提供明确降级：Route C 静态质量预览或开发 fallback，不切换到 fMP4/MSE
- [x] 7.5 更新相关 README/架构文档，说明 3D Webview 实时链路只支持 raw H.264 + WebCodecs 和独立 PCM 音频流
- [x] 7.6 运行最小质量门禁：相关 Vitest、Rust 单元测试、契约 roundtrip 测试和目标模块 build/check
