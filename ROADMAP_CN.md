# Neko Suite Roadmap

> **Lang:** [English](./ROADMAP.md) | 中文

> 项目当前处于 **Alpha 阶段**，核心三角（Engine + Cut + Agent）已可运行，快速迭代中。
> 具体任务清单见 [TODO_CN.md](./TODO_CN.md)。服务端任务在 [neko-hub](../neko-hub) 仓库。

---

## 开发状态总览

> **开发分期策略**：一期聚焦核心功能 + 基础设施，确保 AIGC 视频创作主路径可用；二期补全创作工具；三期扩展专业编辑能力。

### 一期：核心功能 + 基础设施（当前重点）

> 目标：AIGC 视频创作完整闭环（剧本→分镜→剪辑→导出）+ AI 驱动 + 资产管理 + 市场生态

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-engine** | Alpha | 98% | GPU 渲染 + 编解码 + 导出 + HTTP/WS + 设备代理 + ONNX ML 推理 + 完整色彩/抠像管线 + 关键帧/动画混合 + 角色编辑 API + **并发保护 Semaphore(8/4/2) ✅** |
| **neko-agent** | Alpha | 99% | **0 TODO**，108 测试，300+ 文件；7 LLM + 10 媒体适配器 + MCP + Coordinator + SubAgent + Creative Memory + 质量评估 + **Webview P0 完成** ✅（AppShell/ConversationController/ChatWorkspace 三层拆分 + 类型化消息协议 + 统一出站网关）；剩余：MCP 重连退避 + P1 Zustand 迁移（[ADR](./docs/architecture/neko-agent-webview-optimization.md)） |
| **neko-cut** | Alpha | 95% | **~65K LOC**，50+ 命令；AI Handler 14/16 action；**P0 已关闭**；字幕/波纹编辑/播放倍率/效果导出已完成；剩余：导出往返测试 + ai-auto-edit/ai-match-music + 高级时间编辑（[ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md)） |
| **neko-story** | Alpha | 95% | **0 TODO(P0)**，155+ 测试；8 LSP Provider + Fountain 解析器 + 3 种预览视图 + ScenePlan/ShotPlan 规划器 + StorySceneStateStore 跨会话持久化；Story→Agent→Canvas 语义流水线已贯通（[ADR](./docs/architecture/story-agent-canvas-boundary.md)） |
| **neko-canvas** | Alpha | 92% | 13 种节点 + BatchGenerationScheduler + 7 MCP Tools；**P0 已全部收敛** ✅ + P1-1 CanvasEmbedNode + P1-4 NodeRendererRegistry + **NodeTypeDescriptor 注册表** ✅（标签/图标/默认尺寸收敛；属性面板因循环依赖仍独立）；剩余 P1 增强（[ADR](./docs/architecture/canvas-role-boundary.md)） |
| **neko-preview** | Alpha | 86% | 6 种编辑器 + 瀑布流 + Content→Agent + **EPUB 大纲 TreeView ✅**；一期剩余：FDX；二期：XLSX/PPTX |
| **neko-assets** | Alpha | 88% | 纯 TreeView 架构 + ThumbnailService + **搜索 L0 持久化索引 + 类型筛选 + 200 上限 ✅**；剩余：L1-L3 缓存（依赖 Engine 新 action） |
| **neko-market** | Alpha | 88% | **~4.4K LOC**；React Webview 完整实现（Browse/Installed/Updates + Zustand + i18n）+ market-core 58 tests；剩余：Registry Server 对接（neko-hub） |
| **neko-auth** | Alpha | 90% | OAuth 2.0 + PKCE 全链路实现（OAuthClient + TokenManager + NekoAuthService + VscodeTokenStorage），0 TODO，43 tests；剩余：后端对接端到端验证 |
| **neko-tools** | Alpha | 72% | **~15K LOC**；图片/视频/音频 Diff + 静音检测 + 元数据查看；剩余：细节打磨 |
| **neko-types** | Alpha | 92% | 共享类型 + 横切关注点统一 + Operations 类型安全 |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM 流客户端 + EngineClient HTTP dispatch |
| **neko-proto** | Stable | 100% | timeline.proto + diff.proto 完整 IDL |

### 二期：创作工具补全

> 目标：音频工作站 + 2D 绘画能力完善，扩展创作场景覆盖

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-audio** | Alpha | 92% | **0 TODO**，~9.1K LOC，78 测试；波形 + 频谱 + 12 种效果链 + 多轨 + 麦克风；基本完成 |
| **neko-sketch** | Alpha | 78% | **~13.5K LOC**，7 测试；笔刷引擎 + 压感 + 图层 + 选区 + AI 工具 + 跨模块工作流；**缺失**：变换工具（旋转/缩放） |

### 三期：专业编辑能力

> 目标：3D/2D 角色编辑 + VTuber 直播，面向专业用户扩展

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
| **neko-puppet** | Alpha | 92% | **8.5K LOC** + 104 Rust tests；**MOC3 加载**（clean-room 解析器/变形器/表情/动作/物理）+ INP 遗留只读 + 参数变形 + 动画混合 + 60fps 流 + Canvas 渲染；剩余：AI 工具(Phase 6) / VTS API(Phase 7) / MOC3 导出 |
| **neko-model** | Alpha | 85% | **12.6K LOC** + 49 Rust tests；glTF/VRM + PBR/IBL + CSG + 捏脸 + 粒子 + 关键帧；剩余：IK UI / Undo / Blender 桥接 |
| **neko-live** | Alpha | 55% | **2.6K LOC** + 0 tests；VMC+VRM + Puppet 联动 + 录制；**阻塞**：nokhwa crate / MediaPipe / 推流 |

### 元包

| 模块 | 状态 | 进度 | 说明 |
|------|------|------|------|
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
> 见 [ARCHITECTURE_CN.md](./ARCHITECTURE_CN.md#跨扩展-ai-联动)

- ✅ `neko.agent.generateForNode` / `reportGenerationProgress` / `registerSlashCommands` / `internalChat` 命令注册
- ✅ `ISkillProvider`（neko-canvas 3 skills + neko-cut 2 skills）+ `ListPluginSkills` Agent Tool
- ✅ Agent Context Protocol（`neko.agent.sendContext` + story-selection / canvas-selection payload + AgentContextChip UI）
- ✅ `NekoCutAPI.ai.generateVideoForClip` + 跨扩展 story/canvas/cut 数据流

### 延后项
- MCP 桥接专业软件（Blender / ComfyUI / Photoshop → Phase 3.4）
- SubAgent Skills（Seed_Manager / Audio_Mixer / 镜头语言）
- 智能素材推荐 + 场景描写辅助

---

## Phase 3: 视觉增强 + 3D 能力 (~88%)

### neko-engine GPU 效果管线 ✅
> 完成时间：2026-03-27（Phase 3 GPU 零拷贝重构）

- 零拷贝纹理到纹理效果链（ping-pong Rgba8Unorm，macOS 全链路零拷贝）
- 色彩校正完整管线：基础调整 + Curves（5×256 LUT）+ Color Wheels（3 向色轮）+ HSL（8 色域独立调整）+ 3D LUT（.cube）
- Sharpen / Blur / Vignette / Film Grain / Glow / Chromatic Aberration
- Chroma Key（色度抠像）✅ + Luma Key（亮度抠像）✅
- Shape 元素渲染 ✅（tiny-skia CPU 光栅化 → GPU upload；6 种形状 + 填充/描边/阴影/渐变）

### neko-story — 分镜系统 ✅
- ✅ 脚本视图（ScriptTableView）：动态角色列组 + 景别/运镜/情绪/场景标签全字段表格编辑
- ✅ 创意视图（CreativeGridView）：卡片网格 + 生图状态 + 点击触发 GenerationPromptPanel
- ✅ ShotNode 数据类型（@neko/shared）：`ShotScale` / `ShotCharacter[]` / `GeneratedImageVersion[]` / `CameraMovement`
- ✅ 分镜导出到 neko-cut 时间线（`neko.cut.importStoryboard` postMessage→webview）
- ✅ neko-story → Agent 协同（右键 "→ Agent" context 注入 + `neko.story.applyInlineDiff`）

### neko-canvas — 分镜 + AI 协同 ✅（P0 全部收敛）
> [角色边界 ADR](./docs/architecture/canvas-role-boundary.md) — canvas 作为语义编排层
- ✅ ShotNode + SceneGroupNode（场景横向容器）
- ✅ GenerationPromptPanel（内嵌生图对话框，委托 neko-agent.generateForNode，ADR-2D-007）
- ✅ GalleryNode（5 种 layout + 单格/批量生图 + costumeLabel + @引用）
- ✅ AutoPrompt（`neko.agent.buildPrompt`：场景上下文 → 结构化英文 prompt + 预览编辑）
- ✅ BatchGenerationScheduler（maxConcurrent=2 + 指数退避 + AbortController + 进度回传）
- ✅ 7 Canvas MCP Tools（`canvas_list/get/update/create_node` + `generate_image/batch` + `set_project_generation_config`）
- ✅ ScriptNode（TOC 目录 + getScriptIndex 跳转）/ DocumentNode（PDF/DOCX/EPUB 封面缩略图）/ ModelNode（reference/workflow 双模式）
- ✅ `import_script_to_canvas` MCP Tool（screenplay → SceneGroupNode + ShotNode 链）
- ✅ Agent Context Protocol（`neko.agent.sendContext` + AgentContextChip + canvasAmbientContext 系统注入）
- ✅ **P0-1：协议一致性** — `nodes.update`/`nodes.create` 统一契约（update `{ nodeId, data }`、create `{ type, position, data }`）
- ✅ **P0-2：消息通道封装** — webview 内 VSCode API 收敛到统一工具层；`operationApplied` + dirty 标记稳定
- ✅ **P0-3：结果审查闭环** — `generationHistory.selected` 作为统一事实源；ShotNode/GalleryNode 候选切换 UI
- ✅ **P0-4：SceneGroupNode 语义容器** — 镜头纳管/排序/自动布局/场景级批量生成
- ✅ **P0-5：创作入口覆盖** — script/document/model/canvas-embed picker + Explorer 拖入
- ✅ **P1-1：CanvasEmbedNode** — 类型 + outline + webview 渲染 + picker 入口
- ✅ **P1-4：NodeRendererRegistry** — 替代核心渲染分发硬编码，新节点通过注册表扩展
- ✅ **P1：asset 代理边界** — 收敛为 `neko-assets` 受限代理 + `timelineSync` 最小回流契约
- ✅ `.nkc-ops` 操作历史持久化 + AI 来源过滤
- ✅ **P1：`NodeTypeDescriptor` 统一注册表** — 标签/图标/默认尺寸收敛为每节点类型单一描述符；PropertyPanel 标签 + nodeFactory 尺寸已迁移；属性面板渲染器因循环依赖约束仍留在 PropertyPanel
- [ ] P1：`asset` 命名空间清理（推动 `neko-assets` 提供正式扩展 API）
- [ ] P2：批量候选对比器 + 更强审阅 UI
- [ ] P2：角色一致性（@引用素材 → IP-Adapter reference 注入）
- [ ] 节点性能优化（按需，当前 DOM/SVG 方案足够）

### neko-cut — 时间线编辑能力（P0/P1/P2 基础已关闭）
> [评估 ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md) — 评分：基础编辑 8/10，完整创作 6.5/10
- ✅ **P0：Transition 字段命名** — `transitionIn/transitionOut` 为主字段，保留 legacy 兼容读取
- ✅ **P0：Effects 导出链** — effects/colorCorrection/masks 已补齐导出转换
- ✅ **P0：编辑/预览/导出一致性** — 元素 speed/reverse/timeRemap + 全局 playbackSpeed 分层明确
- ✅ P1：暂停帧合成扩展（text/subtitle/shape Webview overlay + scene3d 引擎 seek 帧）
- ✅ P1：字幕系统整合（subtitle 轨/元素统一模型 + PropertyPanel/内联面板双入口 + .srt/.vtt/.ass 拖入）
- ✅ P1：资产库集成（主工作区左侧 dock 面板）
- ✅ P1：播放倍率控制（0.1x-4x + PreviewControls UI + stream speed 消息契约）
- ✅ P1：元素级速度/倒放/复制/分割保留左右（正式操作链 + 右键菜单）
- ✅ P2：涟漪编辑基础闭环（删除/插入/粘贴/裁剪/分割/同轨拖动）
- [ ] P2：涟漪编辑完善（跨多选组合 + insert/overwrite 模式 + 左 trim/跨轨边界规则）
- [ ] P2：高级时间编辑（slip/slide/roll edit + 可视化 speed curve/time remap UI）
- [ ] P2：导出往返测试套件
- [ ] 底层原生 composite 协议扩展（当前 text/subtitle/shape 走 Webview overlay）

### neko-agent — Webview 架构优化（P0 完成 ✅）
> [ADR](./docs/architecture/neko-agent-webview-optimization.md) — 评分 7.5/10 → P0 已解决
- ✅ **P0：拆分 `AIAssistant`**（~589 LOC）→ `AppShell` + `ConversationController` + `ChatWorkspace`
- ✅ **P0：统一出站消息网关** — 所有 Webview→Extension 通过 `VSCodeMessages` 构建器；9 个文件已迁移，组件零直接 postMessage
- ✅ **P0：强化入站类型** — `ExtensionToWebviewMessage` 判别联合（38 种类型）+ 10 个领域文件类型化处理器
- [ ] P1：Zustand 状态管理迁移（对齐 cut/canvas/model Webview 模式）
- [ ] P1：拆分 `InputAreaContext` → `ModelContext` + `MentionContext` + `GenerationContext`
- [ ] P2：消息追踪（trace ID 注入 + 结构化审计链路）

### neko-story — Story-Agent-Canvas 流水线 ✅（语义流水线贯通）
> [ADR](./docs/architecture/story-agent-canvas-boundary.md) — 明确 story/agent/canvas 责任边界
- ✅ ScriptIndex 升级（稳定 `sceneId` + sceneTitle/location/timeOfDay + sceneCharacters[] + actionSummary + estimatedDuration）
- ✅ 轻量分镜表（Agent/Canvas 状态列 + 场景级操作按钮）
- ✅ 双代码路径 — 路径 A 机械式 + 路径 B 语义式（story→agent→canvas ShotPlan）；`flowF` 标准入口 `neko.story.startVideoCreation`
- ✅ Agent 工具（`GetScriptIndex` + `SearchScriptIndex` + `GenerateScenePlan` / `GenerateShotPlan`）
- ✅ `import_script_to_canvas` 升级为语义 ShotPlan 导入；共享 `createStoryboardPayload` / `applyStoryboardPayloadToCanvas`
- ✅ `NekoCanvasAPI.storyboard.import()` + `neko.canvas.importStoryboard` 命令
- ✅ `StorySceneStateStore` + `workspaceState` 跨会话持久化 + pipeline 事件回写场景状态
- ✅ Fountain 流水线接入场景规划（Agent 路由 + 语义分镜导入 canvas）
- [ ] P2：将 `canvasStatus = opened` 从按钮驱动升级为 canvas 实时事件回写

### neko-agent — 富媒体架构待做
> [ADR](./docs/architecture/agent-media-architecture.md)
- [ ] P1：RichContentBlock 注册表（类型 + kind→组件映射 + ContentBlockRenderer 集成）
- [ ] P1：预定义 kinds（storyboard / media_card / comparison / form / data_table）
- [ ] P1：`mediaPreprocessor.ts`（图片缩放 + 视频关键帧提取）
- [ ] P1：`parse_script_to_shots` 重构（agent 内部，零 canvas 依赖）
- [ ] P1：Pipeline 媒体落地统一（`MediaGeneratorAdapter` → 本地保存 + 资产索引）
- [ ] P2：Extension Host DragDropBroker 增强（~100 行）

### neko-model (3D) + neko-puppet (2D) — 角色编辑 Rust 引擎 ✅

- Phase 3.1-3.3 ✅（基础 3D + AI 捏脸 + CSG + PBR + 粒子 + 时间线集成）
- Phase 2 Rust 引擎 ✅（关键帧 CRUD + 动画混合 + EasingType 30+ variants + 项目 v2）：
  - runtime-puppet: 51 tests（Keyframe CRUD + blend_tick + 8 API actions）
  - runtime-scene: 49 tests（SceneKeyframe + AnimationChannel CRUD + 5 API actions + NkmProject v2）
- **Phase 2.5 角色编辑能力 P0+P1 ✅**：
  - 模板创建功能（编辑器内空白状态 UI：导入/模板/拖拽 + INP/GLB 程序化人形模板）
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
- **Phase 2.5 编辑器 UI ✅**：
  - neko-model：左侧 VerticalToolbar（共享组件）+ i18n 接入 + CSP 修复 + locale 注入
  - neko-puppet：Canvas 2D 渲染器（纹理三角形 affine mapping + blend modes + zoom/pan）
  - INP TEX_SECT 纹理解析（webview 端 PNG 提取 → ImageBitmap）
- Phase 3.2 遗留：AI MCP Tools（face.generate_params / face.from_image / face.adjust）
- Phase 3.4：AI 辅助 3D + 3DGS + MCP 桥接

### neko-sketch (2D) — S.1-S.4 全部完成 ✅
- ✅ Phase S.1-S.3（绘画 + 骨骼动画 + 高级 2D）
- ✅ Phase S.4 P1：`sketch.generate`（SketchGenerate MCP tool → MediaGenerationService → canvas layer）
- ✅ Phase S.4 P1：Inpaint / StyleTransfer / AutoLayer AI 工具（getSelectionMask/getCanvasImageData → generate → 新图层）
- ✅ Phase S.4：跨模块工作流（editImage → SketchEditorProvider → pendingImport；sendToTimeline / sendToCanvas 命令）
- [ ] Phase S.4 P2：`style_transfer` 跨模块集成增强（依赖 NekoCanvasAPI 图像节点支持）

### neko-engine — 插件架构扩展
> [插件 RFC](./docs/architecture/engine-plugin-rfc.md) + [Runtime 分层](./docs/architecture/engine-runtime-layering.md)
- ✅ P1：PluginManager MVP（manifest 扫描 + 版本验证 + enable/disable/reload + PluginsController 5 actions + 12 tests）
- [ ] P1 遗留：将 `effects:register` / `models:register` 集成到统一插件生命周期
- [ ] P2：创建 FormatRegistry / DeviceRegistry / ExporterRegistry / PreviewRegistry（插件可扩展注册表）
- [ ] P2：提取 `runtime-format` crate（将文件格式探测从 engine-kernel 解耦）
- [ ] P3：Connector 插件支持（外部 sidecar/远程 runtime 声明 + 健康检查）

### AI 视频参考系统
> [ADR](./docs/architecture/ai-video-reference-system.md) — 运镜/机位/光影 + 2D/3D 参考 + 角色一致性的统一框架，含显式运镜翻译管道

**动机**：AI 视频生成的参考处理散落多处（IP-Adapter 仅单镜头 / 无跨镜头角色绑定 / 无自动化 3D→2D 参考渲染 / 各 provider 适配器中的运镜词汇不一致）。2026-04 商业模型（Seedance 2.0 / Veo 3.1 / Sora 2 / Runway Gen-4 / Kling O3）已原生支持 L1-L2 参考 + 运镜控制，本系统是**适配层收敛**而非重造能力。**所有 provider 无原生 3D input**，3D 相机轨迹必须经三路径产物转换（提示词 / 首末帧 / 深度序列）。

**分期推进**：
- [ ] **P1 类型 + Resolver + Path A**：`ReferenceStrategy`（L0-L5）+ `CameraKeyframe` + `CameraMotionAnalysis` 类型 + `ReferenceStrategyResolver`（**双轴能力矩阵**：参考层次 × 运镜通道）+ Agent MCP 工具 + Seedance/Veo 适配器 + **`CameraMotionAnalyzer`**（Path A：3D → 电影语言提示词，L1 语法层感知，每次生成）
- [ ] **P2 3D→2D Turnaround + Path B + ControlNet Producer**：runtime-scene `render_views` 离屏 action + GalleryNode "从 3D 模型填充" 自动填充 + turnaround 缓存 + 适配器层 L4 → L2 降级 + **`KeyframeRenderer` + `CameraPayloadBuilder`**（Path B：3D → 首/末帧，L2 构图层感知）+ **`ControlNetAssetProducer` 接口 + `Image2DControlProducer`**（@neko/shared 源无关 ControlNet 产物接口，收编 controlnet-pipeline.md §E5）
- [ ] **P3 跨镜头一致性 + Path C + 3D/Puppet Producers**：`CharacterBundle.referenceSet` 持久化绑定 + 通过 characterId 查找自动注入 `ImageGenerationRequest.characterBindings[]` + **`MotionSequenceRenderer`**（Path C：depth/normal/低分 RGB 序列供 Kling O3 + ControlNet-video 使用，L3 空间层感知，可选）+ **`Scene3DControlProducer`**（wgpu 深度/法线/骨骼投影 — 真值控制图）+ **`PuppetControlProducer`**（可选；Live2D/INP 2D 骨骼 + 轮廓）+ PayloadBuilder 补齐 Provider ControlNet 能力矩阵
- [ ] **P4 质量门禁**：CLIP 身份一致性 + 机位 LLM 评分 + HSV 光影连续性 + 轨迹与 3D 真值保真度指标

**感知决策**：L1 提示词规范化默认每次生成都执行（成本低，受益普适）。L2 首末帧渲染推荐给多镜头制作（跨镜头一致性是核心痛点）。L3 深度/运动序列仅当绑定 3D 场景时启用（避免概念镜头的过度工程）。

**ControlNet 源头决策**：统一 `ControlNetAssetProducer` 接口；有 3D 场景时首选 3D 渲染路径（真值 depth/normal/骨骼）；无 3D 场景或仅图片参考时回退 2D ONNX 路径（Depth Anything v2 / OpenPose / Canny）。对外输出始终为 PNG（provider 通用兼容）；raw float buffer 仅引擎内部保留供质量门禁使用。

**交叉引用**：构建在 [controlnet-pipeline.md](./docs/architecture/controlnet-pipeline.md)（预处理器）+ [ai-technology-landscape.md](./docs/architecture/ai-technology-landscape.md)（HMR2 / Depth Anything ONNX）+ [canvas-agent-integration.md](./docs/architecture/canvas-agent-integration.md)（GenerationPromptPanel）+ [adr-character-unified-index.md](./docs/architecture/adr-character-unified-index.md)（characters.json 契约）+ [media-quality-assessment.md](./docs/architecture/media-quality-assessment.md)（验证）之上；依赖 **Camera Keyframe Track**（TODO.md line 136，neko-cut P2）作为相机轨迹数据源

---

## Phase 3.6：跨扩展语义层

> 目标：统一实体身份 + 多模态版本管理。构建在一期至三期基础之上，实现深度跨模块语义集成。

### 统一实体身份系统
> [ADR](./docs/architecture/adr-character-unified-index.md) — 角色 → 场景 → 物品渐进式实体绑定

**Phase 1：结构闭环**
- [ ] `characters.json` 契约（JSON Schema + TypeScript 接口 + 读写服务）
- [ ] `GalleryNode`、`ShotCharacter`、`GeneratedAsset` 添加 `characterId` 字段
- [ ] `CharacterWorkspaceIndex` 服务 + 剧本名称→characterId 解析
- [ ] LSP：从剧本名称跳转定义 → characters.json；跨层查找引用；悬停显示元数据

**Phase 2：生成血统**
- [ ] 从已标注 ShotNode/GalleryNode 生成时自动继承 `characterId`
- [ ] Asset Entity 添加 `registryId` 字段并支持显式绑定
- [ ] 更新 `import_script_to_canvas` 从注册表填充角色绑定

**Phase 3：CreativeEntityGraph + OccurrenceIndex**
- [ ] 图节点类型：entity、occurrence、asset、canvas-node、script-range、timeline-element、media-segment、generated-asset
- [ ] 关系类型含强度（confirmed/inferred）和来源（user/lineage/rule/ai/import）
- [ ] `OccurrenceIndex` 实现跨层精确导航（剧本行、canvas 节点、时间线元素、媒体片段）

**Phase 4：场景与物品扩展**
- [ ] `sceneId` 绑定（SceneGroupNode↔剧本场景）
- [ ] `objectId` 用于道具/物品/载具；复制角色绑定模式

**Phase 5：规则匹配 + 向量**
- [ ] 文件名/别名/标签规则匹配 + `CharacterMatchSuggestion` 含置信度
- [ ] 文本嵌入索引（描述、提示词、动作短语）
- [ ] 多模态：图像/人脸/视频关键帧/说话人嵌入（结果默认 `inferred`）

### 多模态 Git 集成
> [ADR](./docs/architecture/adr-multimodal-git-integration.md) — Git + 多模态版本管理 6 阶段计划

- [ ] Phase 1：`.gitattributes` 模板 + MediaDiff SCM 面板入口 + 基本媒体变更摘要
- [ ] Phase 2：`neko-diff` CLI 工具（格式特定摘要替代 `Binary files differ`）
- [ ] Phase 3：`characters.json`/`library.json` JSON 语义 diff + Webview 审阅面板
- [ ] Phase 4：实体影响分析（连接 CreativeEntityGraph；受影响角色/场景视图）
- [ ] Phase 5：提交级语义审阅（跨多文件提交的聚合实体变更；confirmed vs inferred）
- [ ] Phase 6：远端协作（Git LFS 锁评估 + PR/patch 导出 + 托管平台桥接）

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

### Phase 5.1.2 ✅ 2D Puppet 联动 + 录制 + i18n + 项目文件
- ✅ PuppetViewer（Canvas 2D 渲染 inochi2d 变形网格 + z_order 排序 + 自动缩放）
- ✅ puppetMapping（ARKit → inochi2d 参数：眼/口/眉/头部角度四元数→欧拉角）
- ✅ LivePanelProvider puppet 管理（fs → loadPuppet → openPuppetStream → PuppetDelta 转发）
- ✅ Avatar 选择器支持 7 种格式：`.nkm`/`.nkp`（项目文件自动解析 `model.src`/`puppet.src`）+ `.vrm`/`.glb`/`.gltf` + `.inp`/`.inx`
- ✅ CanvasRecorder（canvas.captureStream + MediaRecorder → WebM VP9 → base64 → 磁盘保存）
- ✅ 麦克风录制（EngineClient.recordStart → cpal → WAV）
- ✅ 录制 UI（红色边框 + REC 闪烁徽章 + 计时器 + 保存路径显示）
- ✅ EmptyState 引导页（三步引导 + VMC 连接后打勾 + 实时追踪数据可视化：blend shape 柱状图 + 头部方向圆盘）
- ✅ 三层 i18n：`package.nls.json`（16 条）+ `vscode.l10n.t`（21 条）+ `I18nService`（20 条 webview）

### Phase 5.1.3（待做）：摄像头 + MediaPipe
- [ ] Rust `ICameraService` 实现（nokhwa/FFmpeg avdevice → H.264 → WebSocket）
- [ ] CameraPreview 组件（H264StreamClient 解码 + Canvas 渲染）
- [ ] @mediapipe/tasks-vision WASM（FaceLandmarker + PoseLandmarker）
- [ ] ITrackingProvider 抽象（MediaPipe / VMC / Hybrid 切换）

**里程碑**：
- ~~5.1：核心追踪 + 2D/3D 联动 + 录制~~  ✅
- 5.2：标定系统 + 音视频合并 + 导入 neko-cut 时间线 — 2-3 周
- 5.3：直播推流（RTMP/SRT → OBS）— 2-3 周

### neko-model 长期路线图（Phase 3.4+）


**当前状态**：Phase 1-3 完成，12,615 行生产代码（4,490 TS + 8,125 Rust），49 Rust 测试。

| 已完成能力 | 代码量 | 质量 |
|-----------|--------|------|
| glTF/VRM 加载器（双 pass 骨骼解析） | 385 行 Rust | 生产级 |
| bevy_ecs 场景图（20+ 组件） | 922+388 行 Rust | 生产级 |
| 动画播放 + 混合 + 关键帧 CRUD | 814+85 行 Rust | 生产级 |
| CSG 布尔运算（BSP 树） | 798 行 Rust | 生产级 |
| 程序化几何（6 种基元） | 602 行 Rust | 生产级 |
| PBR 渲染（Cook-Torrance + IBL + 后处理） | 2,917 行 Rust GPU | 生产级 |
| GPU 粒子系统（Compute Shader） | 449 行 Rust | 生产级 |
| 参数化捏脸（22 参数 + 骨骼表情 + VRM 17 表情） | 632 行 TS | 生产级 |
| IK 求解器（FABRIK，12 测试） | 482 行 Rust | 后端完成，无 UI |

**Phase 3.4：AI 辅助 3D（长期）**
- [ ] AI MCP Tools：`face.generate_params` / `face.from_image` / `face.adjust`（基础设施已就绪，需连接 neko-agent）
- [ ] IK UI 暴露：将后端 482 行 IK 求解器接入前端（TransformGizmo 拖拽 → IK 链反向解算）
- [ ] 面部直接拖拽编辑（Raycasting → Morph Target 映射，高工作量）
- [ ] Undo/Redo 状态机（命令已注册，Zustand store 就绪，需实现历史栈）

**Phase 3.5：高级 3D（长期）**
- [ ] MCP Blender 桥接（复杂建模/修改器/UV 展开 → 外部专业工具）
- [ ] MCP ComfyUI 集成（AI 图像管线 + ControlNet → 纹理生成）
- [ ] 3DGS 高斯泼溅（Compute Shader 骨架已有，需加载器/UI）
- [ ] rapier3d 物理引擎（碰撞/布料/刚体）
- [ ] neko-live 集成（面部捕捉 → 骨骼映射，跨模块）

**TS 前端测试缺口**：0 测试文件（vitest 已配置，框架就绪）。

---

### neko-puppet 长期路线图


**当前状态**：核心功能完整，6,534 行生产代码（570 extension + 2,771 webview + 3,193 Rust），38 Rust 测试。

| 已完成能力 | 代码量 | 质量 |
|-----------|--------|------|
| INP 二进制解析（JSON + TEX_SECT 纹理提取） | 704 行 Rust + 65 行 TS | 生产级 |
| bevy_ecs 骨骼世界（参数驱动变形） | 840+226 行 Rust | 生产级 |
| 动画系统（11 种缓动 + 混合 + 关键帧 CRUD） | 401+84 行 Rust | 生产级 |
| 物理模拟（spring/rigid pendulum） | 系统 815 行含物理 tick | 生产级 |
| WebSocket 60fps 流推送 | Controller 层 | 生产级 |
| Canvas 2D 纹理渲染（affine UV + blend modes + zoom/pan） | 346 行 TS | 生产级 |
| 参数面板 + 面部参数分类 + 动画面板 + 节点树 + 关键帧时间线 | ~800 行 TS | 生产级 |

**Phase P.1：增强编辑（中期）**
- [ ] Puppet 导出（MOC3 写入器 → 允许保存修改后的 puppet，当前只读；INP 已弃用）
- [ ] Puppet 从零创建（绘图工具 → 网格 → 参数绑定，高工作量，可委托 neko-sketch 协作）
- [ ] 高级物理（布料约束 + 碰撞检测，当前仅 spring/pendulum）
- [ ] 视频导出（当前仅 WebSocket 流，缺少 H.264 录制到文件）
- [ ] inox2d MeshGroup 支持（特定模型可能崩溃，需 load-time 检测 + skip）

**Phase P.2：跨模块集成（长期）**
- [ ] neko-live 深度集成（Puppet 作为 VTuber 虚拟形象，追踪数据 → 参数实时映射）
- [ ] neko-cut 时间线集成（Puppet 动画片段 → 视频元素）
- [ ] Spine/Live2D 格式支持评估（当前 ADR-2D-004 仅 inox2d，Spine 许可证受限）

**TS 前端测试缺口**：0 测试文件。

**已知设计约束**：
- inox2d 上游不支持动画加载 → bevy_animation ParameterCurve 桥接（已完成）
- Composite-as-mask 特定模型 panic → load-time 检测 + skip warning
- 无 wgpu renderer → 前端 Canvas 2D 渲染 + Rust 数据（当前方案）

---

### neko-live 长期路线图
> [设备代理 ADR](./docs/architecture/device-access.md)

**当前状态**：Phase 5.1.1-5.1.2 完成，2,600 行生产代码（1,032 extension + 1,580 webview），0 测试。

| 已完成能力 | 代码量 | 质量 |
|-----------|--------|------|
| VMC/OSC 协议接收器（UDP 帧累积 + FPS 测量） | 375 行 TS | 生产级，零外部依赖 |
| VRM 实时驱动（Three.js + @pixiv/three-vrm） | 108 行 TS | 生产级 |
| ARKit 52 → VRM 17 表情映射 | 106 行 TS | 生产级 |
| ARKit → Inochi2D 参数映射 | 118 行 TS | 80%（头部转换待完善） |
| 2D Puppet 渲染器 | 132 行 TS | 80%（缺纹理渲染） |
| Canvas 视频录制（WebM VP9 → base64 → 磁盘） | 111 行 TS | 生产级 |
| 麦克风录制（EngineClient → cpal → WAV） | 131 行 TS | 生产级 |
| Avatar 选择器（7 种格式 + 项目文件解析） | LivePanelProvider 485 行 | 生产级 |

**Phase 5.1.3：摄像头 + MediaPipe（近期，阻塞项）**
- [ ] Rust `ICameraService`（nokhwa/FFmpeg avdevice → H.264 → WebSocket）— **需先在 Cargo.toml 添加 nokhwa**
- [ ] CameraPreview 组件（H264StreamClient 解码 + Canvas 渲染）
- [ ] @mediapipe/tasks-vision WASM（FaceLandmarker + PoseLandmarker ~10MB）
- [ ] ITrackingProvider 抽象层（MediaPipe / VMC / Hybrid 统一切换）
- [ ] PuppetViewer 纹理渲染补全（texture_index → image data 映射）
- [ ] Puppet 头部骨骼旋转补全（Quaternion → Euler angle 转换）

**Phase 5.2：标定 + 音视频合并（中期，2-3 周）**
- [ ] 标定系统 UI（当前 `calibrate` 命令仅显示硬编码消息）
- [ ] 音视频合并（Canvas WebM + EngineClient WAV → MP4 mux）
- [ ] 录制导入 neko-cut 时间线（`neko.cut.importGeneratedClip` 已就绪）
- [ ] 录制回放/预览

**Phase 5.3：直播推流（长期，2-3 周）**
- [ ] RTMP/SRT 推流（~500 行 Rust，OS 特定：macOS ReplayKit / Win DirectShow / Linux v4l2loopback）
- [ ] 虚拟摄像头输出（OBS 集成）
- [ ] 直播控制面板（场景切换 / 特效触发 / 弹幕显示）

**Phase 5.4：高级功能（远期）**
- [ ] 多角色同台（多 Avatar 实例 + 独立追踪源）
- [ ] 场景/背景系统（虚拟场景 + 绿幕抠像）
- [ ] 动作录制重放（pose → keyframe 序列化 → 可编辑时间线）
- [ ] MIDI 控制器映射（表情/动作快捷触发，需 midir crate）
- [ ] Gamepad 控制（角色移动/表情，需 gilrs crate）

**关键阻塞项**：`nokhwa` crate 未在 Cargo.toml 中，需添加后才能实现摄像头捕获。

**测试缺口**：0 测试文件（vitest 已配置但未使用）。优先补充 VmcReceiver + osc-parser 单测。

---

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
- Project Memory ✅

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

14 个扩展按场景拆分为可叠加的子包，**构建顺序与开发分期对齐**：

| 构建期 | 子包 | 包含扩展 | 目标用户 |
|--------|------|---------|---------|
| **一期** | **neko-suite-core** | engine + tools + preview + assets + auth + agent + market | 基础设施 + AI（自动依赖） |
| **一期** | **neko-suite-video** | core + cut + canvas + story | AIGC 视频制作者 |
| **二期** | **neko-suite-audio** | core + audio | 音频创作者 |
| **二期** | **neko-suite-2d** | core + sketch | 2D 插画/动画创作者 |
| **三期** | **neko-suite** | 全部 14 个（含 puppet + model + live） | 全栈创作者 |

```
构建优先级：
一期 → neko-suite-core + neko-suite-video  （核心创作闭环）
二期 → neko-suite-audio + neko-suite-2d    （创作工具扩展）
三期 → neko-suite 全包                     （专业编辑 + VTuber）
```

agent/market 已包含在 core 中，场景子包叠加时零重复：
```bash
./install.sh --pack video            # 一期：AIGC 视频全流程
./install.sh --pack video --pack 2d  # 二期：视频 + 2D
./install.sh --all                   # 三期：全部 release-ready
```

---

## 贡献指南

- [CLAUDE_CN.md](./CLAUDE_CN.md) - 开发规范和架构指南
- [README_CN.md](./README_CN.md) - 项目概述和快速开始

**优先贡献领域**：neko-engine 渲染优化 · neko-agent Skills 开发 · neko-cut 交互优化 · 测试覆盖

---

*最后更新：2026-04-17（AI 视频参考系统：L0-L5 分层 + 双轴 Provider 能力矩阵（参考 × 运镜）+ 3D→2D turnaround 自动化 + `CharacterBundle.referenceSet` 跨镜头绑定 + 运镜翻译 §11 Path A/B/C（L1-L3 感知）+ 统一 §12 ControlNet 产物 producer 接口（2D ONNX / 3D 渲染 / Puppet）收编 controlnet-pipeline.md E5；详见 [ai-video-reference-system.md](./docs/architecture/ai-video-reference-system.md)）*
