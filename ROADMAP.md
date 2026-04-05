# Neko Suite Roadmap

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。
> 具体任务清单见 [TODO.md](./TODO.md)。服务端任务在 [neko-hub](../neko-hub) 仓库。

---

## 开发状态总览

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-types** | Alpha | 92% | 共享类型 + 横切关注点统一 + Operations 类型安全 |
| **neko-engine** | Alpha | 98% | GPU 渲染 + 编解码 + 导出 + HTTP/WS + 设备代理 + ONNX ML 推理（macOS CoreML）+ 完整色彩校正管线（Curves/ColorWheels/HSL/LUT/Sharpen）+ 完整抠像管线（ChromaKey/LumaKey）+ Shape 元素渲染（tiny-skia 6 种形状）+ **关键帧 CRUD + 动画混合**（puppet/scene 双端）+ **角色编辑 API**（Visible/Opacity/MorphWeights/Material/DeleteNode）|
| **neko-cut** | Alpha | 89% | 时间线 + 预览 + 导出预设 + EditOperation 29 操作 + 色彩校正全功能贯通 + AI Action Handler（12 action 含 remove-silence） |
| **neko-agent** | Alpha | 99% | Agent 引擎 + LLM 平台 + CLI + 媒体工具 + Pipeline + AI 字幕 + 自动配乐 + **fal.ai/DashScope/Kling 适配器** + **Coordinator 多阶段编排** + **6 种创作专家 SubAgent**（含 quality-checker）+ **JSONL Session 持久化** + **Creative Memory** + **媒体质量评估系统**（VisionEvaluator/VideoFrameEvaluator/AudioEvaluator/ConsistencyEvaluator + RemediationPlanner 15 category + qualityGate 管线）；剩余：MCP 重连 |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-preview** | Alpha | 92% | Video/Audio Provider + WebCodecs + Apple Music 风格音频 + UI 现代化；**文档预览 P0 ✅**（PDF/CBZ/EPUB/DOCX 自建预览器 + 选区→AI 桥接）— [ADR](./docs/architecture/document-preview.md) |
| **neko-story** | Alpha | 90% | Fountain 解析器 + LSP + 预览 + 时间线生成；**分镜系统 ✅**：ScriptTableView + CreativeGridView + ShotNode 数据类型 + 分镜→Cut 导出 + Agent 协同（[架构](./docs/architecture/2d-capability-analysis.md)） |
| **neko-assets** | Alpha | 93% | 本地资产管理 + 外部媒体库 + Document + PathVariable 全格式 + IStorageLayout 三级布局 |
| **neko-market** | Alpha | 97% | **客户端完全完成** ✅（Phase 6.5.1-6.5.6）；Registry Server 在 neko-hub |
| **neko-auth** | Alpha | 80% | OAuth 2.0 + PKCE SSO（auth-core 43 tests + SecretStorage）；后端待接入 |
| **neko-tools** | WIP | 68% | 媒体 Diff + 静音检测 UI（琥珀色叠加层）+ 并行优化 + 协议增强 |
| **neko-canvas** | Alpha | 93% | 无限画布 + 9 种节点（ShotNode/SceneGroupNode/GalleryNode/ScriptNode/DocumentNode/ModelNode）+ 分组 + 画板导出 + GenerationPromptPanel + BatchGenerationScheduler + 7 MCP Tools；CanvasEmbedNode P3 规划中 |
| **neko-proto** | Stable | 100% | timeline.proto + diff.proto 完整 IDL |
| **neko-model** | Alpha | 78% | Phase 3.1-3.3 ✅（PBR + 粒子 + CSG + 骨骼表情）+ **关键帧编辑 Rust 后端 ✅** + **模板创建 + 角色编辑 P0/P1 API ✅** |
| **neko-sketch** | Alpha | 95% | S.1-S.4 全部完成（绘画 + 骨骼动画 + 高级 2D + Inpaint/StyleTransfer/AutoLayer + sketch.generate + 跨模块工作流 Timeline/Canvas）|
| **neko-audio** | Alpha | 95% | 完整音频工作站 + 12 种效果链 + Engine 麦克风 + 78 测试 |
| **neko-live** | Alpha | 55% | Phase 5.1 ✅（VMC+VRM 预览 + 2D Puppet 联动 + Canvas 录制 + 麦克风音频 + i18n） |
| **neko-suite** | Stable | 90% | Extension Pack + Release workflow |

---

## Phase 1: 核心剪辑能力 ✅

> 完成时间：2026-03-05

Engine GPU 渲染 + 编解码 + 导出。Cut 时间线 + 预览 + EditOperation。Client 流媒体。Types 50+ 共享类型。

---

## Phase 2: AI 驱动创作 ✅ (~95%)

> 剩余：MCP 客户端重连退避（低优先级）

<details>
<summary>已完成清单</summary>

- Phase 3 架构重构（AgentExecutor 统一循环 + SessionInitializer + IPermissionManager + SkillInjection rollback）
- 媒体工具贯通（GenerateImage/Video/Music/TTS 4 工具）
- AI SDK 迁移（@ai-sdk/openai,google,anthropic v3）
- Pipeline Hook Registry + 分镜→批量视频→时间线（6 种 Flow）
- 对话持久化 CLI `--resume` / `/resume`
- AI 字幕生成（Whisper 时间戳 + TranscribeAudio + NekoCutAPI subtitle）
- 自动配乐（sceneToMusicSkill）
- SSO 接入 + AccountBar + OnboardingFlow
</details>

### AI 媒体编辑能力（E1-E4 + E2.5 + E6 ✅，E5 待做）
> [ADR](./docs/architecture/ai-media-editing.md)

- ✅ E1：媒体类型扩展（ControlMode/IPAdapterReference/image-edit/video-edit + ImageRequest 5 字段 + VideoRequest 8 字段）
- ✅ E2：fal.ai ControlNet Adapter（queue-based API, Flux + ControlNet/IP-Adapter, composite taskId）
- ✅ E2.5：Cut AI Action Handler（12 action 路由 + remove-silence 接通 EngineClient.detectSilence）
- ✅ E3：DashScope Adapter（Qwen-Image 2.0 + Wan 2.7 统一适配器，Camera Code 运镜 + 首尾帧 + 指令编辑）
- ✅ E4：OpenAICompat Kling 增强（generateVideo +8 运镜参数，generateImage +5 ControlNet 参数）
- ⏳ E5：Engine 感知模块（depth/pose/edge 本地 ONNX）
- ✅ E6：Canvas 编辑 UI（GenerationPromptPanel + ControlNet/Video 参数 + 右键菜单扩展）

### 媒体质量评估系统 ✅
> [ADR](./docs/architecture/media-quality-assessment.md)

- ✅ 图片/视频/音频质量评估（VisionEvaluator + VideoFrameEvaluator + AudioEvaluator）
- ✅ 跨场景一致性（ConsistencyEvaluator：CLIP 快筛 + Vision LLM 精评 + 角色追踪）
- ✅ 确定性修复映射（RemediationPlanner 15 category → ToolSet 工具调用）
- ✅ quality-checker SubAgent + qualityGate Pipeline 阶段 + `/quality-check` Skill
- ⏳ 增强：VMAF / FFT / 长视频分段 / 语义音频评估（需 Engine Rust 扩展）

### Agent 工具/技能/MCP 增强 ✅
> [ADR](./docs/architecture/agent-tool-skill-enhancement.md)

- ✅ Tool 并发安全 + Schema 校验 + Shell 替换 + Paths 条件触发
- ✅ Auto-Compact + Progress Streaming + MCP 健壮性
- ✅ Coordinator 多阶段编排 + Creative Memory + JSONL 持久化 + Prompt Cache

### 跨扩展 AI 联动 ✅
> 见 [ARCHITECTURE.md](./ARCHITECTURE.md#跨扩展-ai-联动)

- ✅ `neko.agent.generateForNode` / `reportGenerationProgress` / `registerSlashCommands` / `internalChat` 命令注册
- ✅ `ISkillProvider`（neko-canvas 3 skills + neko-cut 2 skills）+ `ListPluginSkills` Agent Tool
- ✅ Agent Context Protocol（`neko.agent.sendContext` + story-selection / canvas-selection payload + AgentContextChip UI）
- ✅ `NekoCutAPI.ai.generateVideoForClip` + 跨扩展 story/canvas/cut 数据流

### 延后项
- MCP 桥接专业软件（Blender / ComfyUI / Photoshop → Phase 3.4）
- SubAgent Skills（Seed_Manager / Audio_Mixer / 镜头语言）
- 智能素材推荐 + 场景描写辅助

---

## Phase 3: 视觉增强 + 3D 能力 (~82%)

### neko-engine GPU 效果管线 ✅
> 完成时间：2026-03-27（Phase 3 GPU 零拷贝重构）

- 零拷贝纹理到纹理效果链（ping-pong Rgba8Unorm，macOS 全链路零拷贝）
- 色彩校正完整管线：基础调整 + Curves（5×256 LUT）+ Color Wheels（3 向色轮）+ HSL（8 色域独立调整）+ 3D LUT（.cube）
- Sharpen / Blur / Vignette / Film Grain / Glow / Chromatic Aberration
- Chroma Key（色度抠像）✅ + Luma Key（亮度抠像）✅
- Shape 元素渲染 ✅（tiny-skia CPU 光栅化 → GPU upload；6 种形状 + 填充/描边/阴影/渐变）

### neko-story — 分镜系统 ✅
> [ADR §12](./docs/architecture/2d-capability-analysis.md)
- ✅ 脚本视图（ScriptTableView）：动态角色列组 + 景别/运镜/情绪/场景标签全字段表格编辑
- ✅ 创意视图（CreativeGridView）：卡片网格 + 生图状态 + 点击触发 GenerationPromptPanel
- ✅ ShotNode 数据类型（@neko/shared）：`ShotScale` / `ShotCharacter[]` / `GeneratedImageVersion[]` / `CameraMovement`
- ✅ 分镜导出到 neko-cut 时间线（`neko.cut.importStoryboard` postMessage→webview）
- ✅ neko-story → Agent 协同（右键 "→ Agent" context 注入 + `neko.story.applyInlineDiff`）

### neko-canvas — 分镜 + AI 协同 ✅
- ✅ ShotNode + SceneGroupNode（场景横向容器）
- ✅ GenerationPromptPanel（内嵌生图对话框，委托 neko-agent.generateForNode，ADR-2D-007）
- ✅ GalleryNode（5 种 layout + 单格/批量生图 + costumeLabel + @引用）
- ✅ AutoPrompt（`neko.agent.buildPrompt`：场景上下文 → 结构化英文 prompt + 预览编辑）
- ✅ BatchGenerationScheduler（maxConcurrent=2 + 指数退避 + AbortController + 进度回传）
- ✅ 7 Canvas MCP Tools（`canvas_list/get/update/create_node` + `generate_image/batch` + `set_project_generation_config`）
- ✅ ScriptNode（TOC 目录 + getScriptIndex 跳转）/ DocumentNode（PDF/DOCX/EPUB 封面缩略图）/ ModelNode（reference/workflow 双模式）
- ✅ `import_script_to_canvas` MCP Tool（screenplay → SceneGroupNode + ShotNode 链）
- ✅ Agent Context Protocol（`neko.agent.sendContext` + AgentContextChip + canvasAmbientContext 系统注入）
- [ ] 候选选择 UI P2（GeneratedImageVersion[] ◀ N/M ▶；单次生成 1-4 张）
- [ ] 角色一致性 P2（@引用素材 → IP-Adapter reference 注入）
- [ ] CanvasEmbedNode P3（.nkc 缩略图 + 双击打开）
- [ ] 节点性能优化（按需，当前 DOM/SVG 方案足够）

### neko-model (3D) + neko-puppet (2D) — 角色编辑 Rust 引擎 ✅
> [ADR](./docs/architecture/character-editing-analysis.md) | [3D ADR](./docs/architecture/3d-capability-analysis.md) | [能力差距分析](./docs/architecture/character-editing-gaps.md)
- Phase 3.1-3.3 ✅（基础 3D + AI 捏脸 + CSG + PBR + 粒子 + 时间线集成）
- Phase 2 Rust 引擎 ✅（关键帧 CRUD + 动画混合 + EasingType 30+ variants + 项目 v2）：
  - native-puppet: 51 tests（Keyframe CRUD + blend_tick + 8 API actions）
  - native-scene: 49 tests（SceneKeyframe + AnimationChannel CRUD + 5 API actions + NkmProject v2）
- **Phase 2.5 角色编辑能力 P0+P1 ✅**：
  - 模板创建功能（`createNewFile` + TemplateChoice QuickPick + INP/GLB 二进制生成器）
  - 3D `Visible` 组件 + `set_visible` API + GPU 渲染过滤
  - 2D `set_node_opacity` API（Opacity 运行时修改）
  - 3D `set_morph_weights` API（Morph Target 交互式设置）
  - 3D `update_material` API（PBR 材质参数运行时编辑）
  - 3D `delete_node` API（节点及子孙递归删除）
  - SCENES +4 actions / PUPPETS +1 action
- **Phase 2.5 角色编辑 P2 ✅**：
  - 2D 纹理热替换（`puppets:set_texture` API）
  - 2D 物理模拟（SimplePhysics + PhysicsState 组件 + INP 解析 + rigid/spring pendulum 求解器）
  - 3D 材质扩展（emissive_factor + occlusion_strength + emissive/AO 纹理 + WGSL shader 更新）
- Phase 3.2 遗留：AI MCP Tools（face.generate_params / face.from_image / face.adjust）
- Phase 3.4：AI 辅助 3D + 3DGS + MCP 桥接

### neko-sketch (2D) — S.1-S.4 全部完成 ✅
> [ADR](./docs/architecture/2d-capability-analysis.md)
- ✅ Phase S.1-S.3（绘画 + 骨骼动画 + 高级 2D）
- ✅ Phase S.4 P1：`sketch.generate`（SketchGenerate MCP tool → MediaGenerationService → canvas layer）
- ✅ Phase S.4 P1：Inpaint / StyleTransfer / AutoLayer AI 工具（getSelectionMask/getCanvasImageData → generate → 新图层）
- ✅ Phase S.4：跨模块工作流（editImage → SketchEditorProvider → pendingImport；sendToTimeline / sendToCanvas 命令）
- [ ] Phase S.4 P2：`style_transfer` 跨模块集成增强（依赖 NekoCanvasAPI 图像节点支持）

---

## Phase 4: 音频工作站 ✅ (~95%)

neko-audio Phase A-J 全部完成（波形 + 播放 + 频谱 + 效果链 + 麦克风 + AI 降噪 + 导出 + 78 测试）。

---

## Phase 4.5: UI 现代化 ✅ (~95%)

Phase 0-5.6 全部完成（Tailwind + macOS Token + 共享组件 + VSCode 主题 + File Icon Theme）。
> [ADR](./docs/architecture/ui-modernization-design.md)

### 设备代理 ✅
- 麦克风 ✅ | MIDI ✅ | Gamepad ✅ | 摄像头 ⚠️ 框架就绪（capture TODO，neko-live 前置）
> [ADR](./docs/architecture/device-access.md)

---

## Phase 5: 虚拟制片 (~55%)

> 前置：Phase 4 ✅

**可复用基础** (~80%)：VRM 17 表情 + 口型同步（neko-model）、2D 骨骼 ECS 60fps（neko-sketch）、H.264 硬件编码（neko-engine）

**需新建**：~~VMC 协议（~200 行 TS）~~ ✅ + MediaPipe（~300 行 TS）+ RTMP/SRT 推流（~500 行 Rust）

### Phase 5.1.1 ✅ VMC + VRM 实时预览 MVP
- ✅ 项目重组为 `packages/extension/` + `packages/webview/` 双包结构
- ✅ OSC 二进制解析器（内联实现，零外部依赖）
- ✅ VmcReceiver（Node.js `dgram` UDP 监听 + 帧累积 + FPS 测量）
- ✅ LivePanelProvider（WebviewViewProvider + CSP + WASM-ready）
- ✅ Three.js + @pixiv/three-vrm VRM 加载与实时驱动
- ✅ ARKit 52 blend shapes → VRM 17 表情映射（vmcMapping）
- ✅ Zustand 状态管理 + inline styles 控制面板
- ✅ postMessage 双向桥接（Extension Host ↔ Webview）

### Phase 5.1.2 ✅ 2D Puppet 联动 + 录制 + i18n
- ✅ PuppetViewer（Canvas 2D 渲染 inochi2d 变形网格 + z_order 排序 + 自动缩放）
- ✅ puppetMapping（ARKit → inochi2d 参数：眼/口/眉/头部角度四元数→欧拉角）
- ✅ LivePanelProvider puppet 管理（fs → loadPuppet → openPuppetStream → PuppetDelta 转发）
- ✅ Avatar 选择器支持 .vrm/.glb/.gltf + .inp/.inx，自动切换 3D/2D 视口
- ✅ CanvasRecorder（canvas.captureStream + MediaRecorder → WebM VP9 → base64 → 磁盘保存）
- ✅ 麦克风录制（EngineClient.recordStart → cpal → WAV）
- ✅ 录制 UI（红色边框 + REC 闪烁徽章 + 计时器 + 保存路径显示）
- ✅ i18n（vscode.l10n.t 中英双语 18 条 + ILogger 结构化日志）

### Phase 5.1.3（待做）：摄像头 + MediaPipe
- [ ] Rust `ICameraService` 实现（nokhwa/FFmpeg avdevice → H.264 → WebSocket）
- [ ] CameraPreview 组件（H264StreamClient 解码 + Canvas 渲染）
- [ ] @mediapipe/tasks-vision WASM（FaceLandmarker + PoseLandmarker）
- [ ] ITrackingProvider 抽象（MediaPipe / VMC / Hybrid 切换）

**里程碑**：
- ~~5.1：核心追踪 + 2D/3D 联动 + 录制~~  ✅
- 5.2：标定系统 + 音视频合并 + 导入 neko-cut 时间线 — 2-3 周
- 5.3：直播推流（RTMP/SRT → OBS）— 2-3 周

---

## Phase 6: 资产管理与协作 (客户端 ~90%)

> 服务端（Registry Server / Storage Service）在 [neko-hub](../neko-hub)

### Phase 6.1-6.5.6 ✅ 本地资产 + 市场客户端

<details>
<summary>已完成清单</summary>

- 6.1-6.3.5：本地资产管理核心 + AI 分类 + 跨扩展集成
- 6.4：Document + Ownership + 外部媒体库 + PathVariable 全格式
- 6.5.1：market-core Layer 0（MarketClient + InstallManager + 58 tests）
- 6.5.2：Skill 市场 MVP（安装/热加载/Webview）
- 6.5.3：独立 Marketplace 面板 + CLI TUI
- 6.5.4：多品类 InstallTarget（Shader/Model/Preset，9 种类型）
- 6.5.5：消费端集成（启停 toggle + 热加载 + 64 + 468 tests）
- 6.5.6：neko-agent 消费端打通 + 本地模型部署 Phase M1-M2 ✅
</details>

### Phase 6.5.7 ✅ 本地存储策略
> [ADR](./docs/architecture/local-storage-strategy.md)
- ✅ `IStorageLayout` + `resolveStorageLayout()` + `resolveGlobalStorageLayout()`（三级布局：L0 全局 / L1 项目 / L2 缓存）
- ✅ `migrateStorageLayout()` 一次性迁移（proxies/generated/thumbnails → `.neko/.cache/`）
- ✅ 消费者迁移（neko-assets / neko-cut / neko-agent / neko-market 共 6 个文件）
- ✅ `neko.engine.extractThumbnail` 命令注册（打通 Rust GPU 缩略图管线）
- ✅ ThumbnailService preheat + onDidGenerateThumbnail 事件机制
- ✅ 三个 TreeProvider 缩略图 Tooltip 基础设施（MarkdownString + `<img>`）

### Phase 6.5.8（延后）：本地存储增强
> 以下功能已有 ADR 设计，暂无用户场景驱动，延后实施：
- [ ] 缩略图实际生效：epub 封面提取（纯 TS，zip 解包 cover）+ 图片缩放 — 当前素材全是 epub，VSCode Explorer 不支持自定义 tooltip，媒体库面板缩略图无触发场景
- [ ] `LibraryDescriptor`（`.neko-library.json`）+ AssetRegistry 多源合并 — 等多项目共享需求出现
- [ ] `IAssetGraph` 资产关系图 + 被动写入 — 等项目文件变多需要"谁在用这个文件"时
- [ ] `IVectorStore` 向量持久化 — 等用户反馈"搜索剧本太慢"时
- [ ] `ICacheStats` 缓存监控 — 等性能问题出现时
- [ ] 历史面板升级为"使用轨迹" — 依赖 IAssetGraph

### Phase 6.5.9 ✅ 文档预览增强 + 路径体系
- ✅ PDF/CBZ/EPUB 瀑布流（IntersectionObserver 虚拟滚动，默认连续滚动模式）
- ✅ EPUB 真瀑布流（绕过 epubjs rendition，自行管理 DOM + section.url 资源 URL 改写）
- ✅ 文档预览直连 neko-engine HTTP（移除 postMessage base64 中继，消除 33% 数据膨胀）
- ✅ CSP 全格式放行 `http://127.0.0.1:*`（connect/img/style/font）
- ✅ PathResolver 提取到 @neko/shared（L0 零依赖，支持 `${VAR}/path` + 相对路径 + URL）
- ✅ Rust ProjectContext（resolve/validate + 9 个单元测试）
- ✅ EngineClient.dispatch 自动展开路径变量
- ✅ PreviewFileServer 自动调 `neko.assets.resolvePath` 展开变量
- ✅ 未解析路径变量友好错误页面（显示缺失的变量名 + 修复步骤）
- ✅ 素材库健康检查修复（health check 在路径变量注入后运行）
- ✅ 统一右键菜单（所有格式 "发送到 AI"）
- ✅ 文档状态栏（格式图标 | 文件名 | 页数 | 文件大小）
- ✅ PathResolver regex 兼容 macOS fsPath 前导 `/`
- ✅ 三态模式切换（scroll/dual/single）+ modeEpoch 防竞态 + rAF 等 DOM 挂载
- ✅ 双栏并排预览（PDF/CBZ 双页展开）
- ✅ 单栏/双栏内容居中显示

### Phase 6.6（待开发）：远程存储客户端集成
> 服务端在 [neko-hub](../neko-hub)。[ADR](./docs/architecture/remote-storage.md)
- 6.6.1：`neko://` 协议 + MediaResolver（代理/原始自动切换）+ `AssetFile.proxy` + `IFileTransport`
- 6.6.4：导出优化（预览用代理 720p + 最终导出增量拉取原始文件）

### Phase 6.7（待开发）：项目协作基础设施
- Git LFS 集成 — [ADR](./docs/architecture/project-data-management.md)
- Project Memory ✅ — [ADR](./docs/architecture/project-memory.md)

### 本地模型运行时
> [ADR](./docs/architecture/model-runtime.md)
- Phase M1-M2 ✅（neko-market ModelInstallTarget + neko-engine ONNX 推理 macOS）
- 待做：ONNX 跨平台打包（Win/Linux） · Phase M3 candle SD/SDXL（待评估）

---

## Phase 7: VR/AR 沉浸式创作（远期）

> 前置：Phase 3 + Phase 5

混合策略：VSCode 内编辑/导出 + Electron 外部 App 沉浸式预览 + MCP 桥接 Unity/Unreal。

- 7.1：立体渲染 + XR 端点 — 2-3 周
- 7.2：Electron WebXR App + 手部追踪 — 3-4 周
- 7.3：AR（平面检测 + 光照估计）— 4-6 周
- 7.4：AI 辅助 XR — 后续

---

## Phase 8: 交互视频创作（远期）

> 前置：Phase 1-3

B 站互动视频 / YouTube 交互内容。复用 neko-cut 时间线 + neko-canvas 节点图 + neko-story 剧本。

- 8.1：分支编辑（canvas ChoicePointNode + cut ChoiceMarker）— 2-3 周
- 8.2：交互预览器 — 2-3 周
- 8.3：分支验证 + AI 辅助 — 1-2 周
- 8.4：平台导出（B 站 IVG / YouTube / Web HTML5）— 2-3 周

---

## Extension Pack 分层安装
> [ADR](./docs/architecture/extension-pack-strategy.md)

14 个扩展按场景拆分为可叠加的子包，降低用户安装和认知负担：

| 子包 | 包含扩展 | 目标用户 |
|------|---------|---------|
| **neko-suite-core** | engine + tools + preview + assets + auth + agent + market | 基础设施 + AI（自动依赖） |
| **neko-suite-video** | core + cut + canvas + story | AIGC 视频制作者 |
| **neko-suite-2d** | core + sketch | 2D 插画/动画创作者 |
| **neko-suite-audio** | core + audio | 音频创作者 |
| **neko-suite** | 全部 14 个 | 全栈创作者 |

agent/market 已包含在 core 中，场景子包叠加时零重复：
```bash
./install.sh --pack video            # AIGC 视频全流程
./install.sh --pack video --pack 2d  # 视频 + 2D（agent/market 共享）
./install.sh --all                   # 全部 release-ready
```

---

## 贡献指南

- [CLAUDE.md](./CLAUDE.md) - 开发规范和架构指南
- [README.md](./README.md) - 项目概述和快速开始

**优先贡献领域**：neko-engine 渲染优化 · neko-agent Skills 开发 · neko-cut 交互优化 · 测试覆盖

---

*最后更新: 2026-04-05（Phase 5.1 neko-live：VMC/VRM + 2D Puppet 联动 + Canvas 录制 + i18n）*
