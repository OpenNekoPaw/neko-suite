# TODO

> **Lang:** [English](./TODO.md) | 中文

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP_CN.md](./ROADMAP_CN.md)。
> 服务端任务在 [neko-hub](../neko-hub) 仓库，本文件仅跟踪客户端（VSCode 插件）。

---

## 🔵 一期 — 核心功能 + 基础设施

> 目标：稳定性 + 核心体验 + AI 能力补全

### ✅ Sprint 1 已完成（2026-04-06）
- [x] **neko-agent**: `puppetFaceTools.ts` `readFileSync` → `fs.promises.readFile`
- [x] **neko-engine**: HTTP 全局准入 `Semaphore(8)` + codec `Semaphore(4)` + GPU `Semaphore(2)` + `ServiceOverloaded` 503 错误码
- [x] **neko-assets**: 搜索 L0 持久化索引（`.neko/.cache/search-index.json` + FileSystemWatcher 增量更新）+ QuickPick 类型筛选按钮（5 类）+ MAX_RESULTS 50→200
- [x] **neko-preview**: EPUB 大纲 TreeView（`EpubOutlineProvider` depth→层级树 + Explorer 侧边栏 + `neko.epubEditorActive` context 控制显隐）
- [x] **neko-cut**: AI action `ai-background-remove` + `ai-smart-crop`（委托 neko-agent 云端 AI，复用 `generateForNode` 模式）
- [x] **跨模块**: DragDropBroker（Agent `dnd:start` → Extension payload 暂存 → Canvas/Cut `dnd:drop` → `importAsset`/`importGeneratedClip`；`ImageGridCard` draggable）

### ✅ Sprint 2 已完成（2026-04-09）
- [x] **neko-canvas**: P0-1~P0-5 全部收敛 — `nodes.update`/`nodes.create` 协议统一 + 消息通道封装 + 结果审查闭环（`generationHistory.selected`）+ `SceneGroupNode` 升级为语义容器（镜头纳管/排序/自动布局/批量生成）+ 创作入口覆盖（script/document/model/canvas-embed picker + 拖入）
- [x] **neko-canvas**: P1-1 `CanvasEmbedNode` 最小落地（类型 + outline + webview 渲染 + picker 入口）
- [x] **neko-canvas**: P1-4 `NodeRendererRegistry` 首轮落地（替代核心渲染分发硬编码，新节点可通过注册表扩展）
- [x] **neko-canvas**: asset 代理边界收敛（受限代理实现 + `timelineSync` 最小回流契约）
- [x] **neko-story**: 场景工作流状态持久化（`StorySceneStateStore` + `workspaceState` 跨会话）+ 语义分镜流水线入口 `neko.story.startVideoCreation` + 场景/镜头规划工具 + canvas 移交
- [x] **neko-agent**: Fountain 流水线接入场景规划 + 语义分镜导入 canvas 管道

### 待做

### neko-cut（视频编辑）— P0-1：字段一致性
> [ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md) — 评分：基础编辑 8/10，完整创作 6.5/10。
- [x] **Transition 字段命名统一**：`transitionIn/transitionOut` 为主字段，保留 `inTransition/outTransition` legacy 兼容读取
- [x] **Effects 导出链**：`effects / colorCorrection / masks` 已补齐导出转换（EffectInstance→EffectParams + 蒙版形状验证 + 动画 baseValue fallback）
- [x] **编辑/预览/导出字段一致性**：元素 `speed/reverse/timeRemap` 在暂停态/播放态/导出态一致；全局 `playbackSpeed` 与元素级 `speed` 分层明确
- [ ] 导出往返测试套件：编辑 → 预览 → 导出 → 重新导入一致性验证

### neko-canvas（故事板）— 收敛增强
> [ADR](./docs/architecture/canvas-role-boundary.md) — P0 全部收敛，进入 P1 增强阶段。
- [ ] 继续收敛周边桥接接口（保持 `nodes.update/create` 统一契约不分叉）
- [ ] 消息语义细化（新增消息类型优先扩展工具层，而非直接访问全局对象）
- [ ] 批量候选对比器 + 更强的审阅 UI 体验
- [ ] `NodeRendererRegistry` 扩展：metadata、图标、默认尺寸、属性面板 schema 收敛到注册表
- [ ] `asset` 命名空间边界清理：推动 `neko-assets` 提供正式扩展 API，替代 command 级代理

### neko-agent（AI 助手）— P0-2：Webview 架构
> [ADR](./docs/architecture/neko-agent-webview-optimization.md) — 评分 7.5/10。顶层控制器膨胀 + 消息契约薄弱。
- [ ] **拆分 `AIAssistant` 组件**（~589 行）→ `AppShell` + `ConversationController` + `ChatWorkspace`
- [ ] **统一出站消息网关**：所有 Webview→Extension 通过 `VSCodeMessages` 构建器；禁止组件直接 `vscode?.postMessage(...)`；改造 `SendToMenu.tsx`、`TaskCard.tsx` 等
- [ ] **强化入站消息类型**：定义 `ExtensionToWebviewMessage` 区分联合类型；更新 `MessageHandler`/`MessageHandlerRegistry` 签名实现编译时安全

### neko-engine（引擎）
- [ ] 新增 action：`documents:text-extract` / `models:clip-embed` / `text:stats`（action registry 中不存在）
- [ ] 将 `effects:register` / `models:register` 集成到统一插件生命周期（PluginManager P1 后续）

### neko-assets（资产管理）
- [ ] 搜索增强后续：
  - [ ] P0：项目目录资源搜索
  - *L1-L3 缓存 + P1/P2 搜索功能依赖 Engine 新 action，随 engine 完成后推进*

### 跨模块
- [ ] **跨域链接**：剧本→媒体引用 / 资产路径补全
- [ ] `neko://` 协议（仅 ADR 设计，依赖服务端）
- [ ] Git LFS 集成
- [ ] **从 neko-story 移除 `CreativeGridView`**（ADR-1：图片生成完全归属 canvas）

### 等后端就绪
- [ ] neko-market：Registry Server 对接（客户端 UI 100% 就绪）
- [ ] neko-auth：端到端验证（客户端代码 100% 就绪）

---

## 🟡 二期 — 创作工具 + UX 增强

### neko-preview（文档格式扩展）
- [ ] XLSX 预览（x-data-spreadsheet）
- [ ] PPTX 预览（LibreOffice headless）
- [ ] FDX 预览（XML 解析 + Fountain 风格渲染）
- [ ] 缩略图缓存

### neko-canvas
- [ ] 安装 jsPDF + JSZip 解锁 PDF/ZIP 分镜导出
- [ ] 模板系统基础版（需从零实现，命令未注册）
- [x] ~~**强化 `SceneGroupNode` 语义**~~：已升级为语义容器（镜头纳管/排序/自动布局/场景级批量生成）
- [x] ~~**一等公民输入节点**~~：script/document/model/canvas-embed picker + Explorer 拖入已完成
- [x] ~~**节点渲染器注册表**~~：`NodeRendererRegistry` 已替代核心渲染分发硬编码（首轮，metadata/schema 扩展见一期 P1）
- [x] ~~**CanvasEmbedNode**~~：类型 + outline + webview 渲染 + picker 入口已完成
- [ ] 角色一致性 — IP-Adapter reference 注入
- [ ] 场景背景一致性 — ControlNet 注入

### neko-cut
- [ ] AI action `ai-auto-edit`（需定义"自动剪辑"语义）
- [ ] AI action `ai-match-music`（需节奏检测 + 场景匹配）
- [x] **字幕系统整合**：subtitle 轨/元素统一数据模型；PropertyPanel + 内联 SubtitlePanel 双入口；.srt/.vtt/.ass 拖入创建 subtitle 轨
- [x] **暂停帧合成扩展**：text/subtitle/shape 通过 Webview overlay 补齐；scene3d 保留引擎 seek 帧
- [x] **资产库集成**：主工作区左侧 dock 面板（Assets + Subtitles 标签）
- [x] **涟漪编辑完善**：ripple 已覆盖删除/插入/粘贴/裁剪(trimToPlayhead)/分割/同轨拖动；剩余：跨多选组合 + insert/overwrite 模式切换 + 左 trim/跨轨拖动边界规则
- [ ] **高级时间编辑**：可视化 speed curve / time remap UI / slip-slide-roll edit

### neko-story
> [ADR](./docs/architecture/story-agent-canvas-boundary.md) — Story-Agent-Canvas 流水线
- [x] **ScriptIndex 升级**：稳定 `sceneId` + `sceneTitle`/`location`/`timeOfDay` + `sceneCharacters[]` + `actionSummary` + `estimatedDuration`
- [x] **轻量分镜表**：`ScriptTableView` 含 Agent/Canvas 状态列 + 场景级操作按钮
- [x] **双代码路径**：路径 A 机械式 + 路径 B 语义式（story→agent→canvas ShotPlan）；`flowF` 标准入口 `neko.story.startVideoCreation`
- [x] Agent 工具：`GetScriptIndex` + `SearchScriptIndex` + `GenerateScenePlan` / `GenerateShotPlan`
- [x] 升级 `import_script_to_canvas`：通过 `createStoryboardPayload` / `applyStoryboardPayloadToCanvas` 支持语义 ShotPlan 导入
- [x] **场景工作流状态持久化**：`StorySceneStateStore` 统一事实源 + `workspaceState` 跨会话持久化 + 管道事件回写场景状态
- [ ] 将 `canvasStatus = opened` 从按钮驱动升级为 canvas 实时事件回写

### neko-agent
- [ ] MCP 重连退避（指数退避 + 熔断）
- [ ] **P1-1：Pipeline 媒体落地统一** — `MediaGeneratorAdapter` 返回远程 URL；聊天主路径本地保存 + 索引资产。需共享 `MediaPersistenceService` 或适配器层对齐
- [x] **CapabilityProvider 上下文扩展** — `AgentCapabilityContext` 已扩展 `mediaService`/`configManager`/`embedFn`；所有子包已迁移
- [ ] **4 个 TODO(P1) 生成工具** — 剩余新模型能力：`GenerateCharacter` / `TransferStyle` / `EnhanceVideo` / `OptimizeAudio`
- [ ] **Zustand 状态管理迁移**：用 Zustand stores 替换 hook/ref 架构（conversation、UI、config、resources、skills、context）；与 neko-cut/canvas/model Webview 模式对齐
- [ ] **拆分 `InputAreaContext`** → `ModelContext` + `MentionContext` + `GenerationContext` 减少重渲染范围
- [ ] **RichContentBlock 注册表**（[ADR §6.2](./docs/architecture/agent-media-architecture.md)）：定义 `RichContentBlock` 类型 + `RichContentRegistry`（kind→组件映射）+ `ContentBlockRenderer` 集成；实现 storyboard / media_card / comparison / form / data_table kinds
- [ ] **`mediaPreprocessor.ts`**（[ADR-7](./docs/architecture/agent-media-architecture.md)）：图片超 1568px/4MB 自动缩放；视频通过 EngineClient 提取关键帧（最多 8 帧）；存储到 `.neko/preprocessed/`
- [ ] **修复 Context Chip 消费**：`InputArea.tsx` 中区分文件级 vs 内容级 chip
- [ ] **统一 Explorer "发送到 Agent"**：4 个现有实现合并为统一 `sendFileChip(uri, intent, typeOverride?)`
- [ ] **`parse_script_to_shots` 重构**（ADR-2）：提取为 agent 内部步骤（零 canvas 依赖），与 `create_canvas_storyboard` 分离

### neko-tools
- [ ] Whisper ASR Diff + Demucs 音源分离
- [ ] 细节打磨 + 主题完善

### neko-audio（音频工作站）
- [ ] 测试覆盖增强（当前 78 测试，核心功能已完成）

### neko-sketch（2D 绘画）
- [ ] **变换工具实现**：旋转/缩放/倾斜（当前仅 UI 壳）
- [ ] S.4 P2：`style_transfer` / 跨模块集成增强

---

## 🔴 三期 — 专业编辑能力

### neko-puppet（2D 骨骼动画）
- [ ] 导出功能：INP 写入器（当前只读编辑器）
- [ ] 高级物理：布料约束 + 碰撞检测
- [ ] × neko-live 深度集成：Puppet 作为 VTuber 虚拟形象实时驱动

### neko-model（3D 编辑）
- [ ] IK UI 暴露：后端 482 行 FABRIK 已完成，需前端 TransformGizmo 交互
- [ ] Undo/Redo 状态机
- [ ] AI MCP Tools：`face.generate_params` / `face.from_image` / `face.adjust`
- [ ] Phase 3.5：Blender MCP 桥接 / 3DGS 加载器 / rapier3d 物理

### neko-engine（引擎插件扩展）
> [ADR](./docs/architecture/engine-plugin-rfc.md) + [Runtime 分层](./docs/architecture/engine-runtime-layering.md)
- [ ] 提取 `runtime-format` crate（将文件格式探测从 engine-kernel 解耦）
- [ ] 创建 FormatRegistry / DeviceRegistry / ExporterRegistry / PreviewRegistry（插件可扩展注册表）
- [ ] Connector 插件支持（外部 sidecar/远程 runtime 声明 + 健康检查 + 状态同步）

### neko-live（VTuber 直播）
- [ ] Phase 5.1.3：摄像头 + MediaPipe（需 nokhwa crate）
- [ ] Phase 5.2：标定系统 + 音视频合并 + 导入 neko-cut 时间线
- [ ] Phase 5.3：直播推流（RTMP/SRT → OBS）

---

## 🟤 Phase 3.6 — 跨扩展语义层

> 目标：统一实体身份 + 多模态版本管理。独立于核心编辑，构建在一期至三期基础之上。

### 统一实体身份系统
> [ADR](./docs/architecture/adr-character-unified-index.md) — 角色 → 场景 → 物品渐进式实体绑定
- [ ] **P1：结构闭环** — `characters.json` 契约 + 读写服务 + JSON Schema；`GalleryNode`/`ShotCharacter`/`GeneratedAsset` 添加 `characterId`；`CharacterWorkspaceIndex` 服务；剧本名称→characterId 解析
- [ ] **P1：生成血统** — 从已标注 ShotNode/GalleryNode 生成时自动继承 `characterId`；Asset Entity 添加 `registryId` 字段；更新 `import_script_to_canvas` 填充角色绑定
- [ ] **P2：CreativeEntityGraph + OccurrenceIndex** — entity/occurrence/asset/canvas-node/script-range/timeline-element/media-segment 节点类型；confirmed/inferred 边 + provenance；统一 Definition/References/Hover 查询
- [ ] **P2：场景与物品扩展** — `sceneId` 绑定模型（SceneGroupNode↔剧本场景）；`objectId` 用于道具/物品；复制角色绑定模式
- [ ] **P3：规则匹配 + 文本向量** — 文件名/别名/标签匹配；`CharacterMatchSuggestion` 含置信度；描述/提示词文本嵌入索引
- [ ] **P3：多模态向量增强** — 图像/人脸/视频关键帧/说话人嵌入；多模态候选召回；向量结果默认 `inferred`

### 多模态 Git 集成
> [ADR](./docs/architecture/adr-multimodal-git-integration.md) — Git + 多模态版本管理 6 阶段计划
- [ ] **P1：Git 集成基线** — 媒体文件 `.gitattributes` 模板；连接 `MediaDiff` 查看器到 SCM 面板；显示基本媒体变更摘要
- [ ] **P2：CLI diff driver** — `neko-diff` CLI 工具；格式特定摘要替代 `Binary files differ`
- [ ] **P3：JSON 语义 diff** — `characters.json`/`library.json` 语义 diff schema；`JsonSemanticDiff` 分析器；Webview 审阅面板
- [ ] **P3：实体影响分析** — 连接 JSON diff 到 CreativeEntityGraph；"受影响角色/场景/物品"视图；回跳到 Definition/References
- [ ] **P4：提交级语义审阅** — 跨多文件提交的聚合实体变更；confirmed vs inferred 变更区分

---

## 🟣 远期

- [ ] VR/AR 沉浸式创作（Phase 7）
- [ ] 交互视频创作（Phase 8）

---

## ✅ Bug / 严重问题（审计 2026-04-06 发现，已全部修复）

### P0 — 功能失效（已修复）
- [x] **neko-cut**: `commands/index.ts` 补 `import * as path from 'path'`
- [x] **neko-cut**: `resolveElementSourcePath()` 实现 `ctx.params.sourcePath` 优先 + `_documentUri` fallback，6 处调用点更新

### P1 — 测试失败（已修复）
- [x] **neko-engine**: `router.rs:385` 更新 MODELS actions 断言为 11 项 → **132/132 通过**
- [x] **neko-preview**: `extension.test.ts` 补 EventEmitter + languages + createTreeView + onDidChangeActiveTextEditor mock；`StatusBarManager.test.ts` 补 ID 参数 → **115/115 通过**

---

## 📋 技术债务

### 死代码 / 占位
- [ ] neko-engine: CanvasController 3 个 action（composite/capture/export）返回 "not implemented"
- [ ] neko-engine: 10+ unused imports + 9 unused functions/structs（编译 warning）
- [ ] neko-canvas: `neko.template.apply/save` 注册在 package.json 但无实现代码（空命令）
- [ ] neko-cut: 7 个 package.json 命令无对应实现

### 阻塞 I/O（已修复 3 处高风险，剩余低风险保留）
- [x] neko-agent: `extensionTools.ts:771` `writeFileSync` ZIP → `fsp.writeFile`（20-500ms 阻塞消除）✅
- [x] neko-agent: `system-prompt-builder.ts:210` `existsSync+readFileSync` → `fsp.readFile`（2-5ms 阻塞消除）✅
- [x] neko-agent: `generatedAssetIndex.ts:58` `load()` → async + timer flush → `flushAsync()`（dispose 保留 sync 原子写入，VSCode 生命周期要求）✅
- [ ] neko-agent: `generatedAssetIndex.ts` `flushSync()` dispose 路径保留 sync（VSCode 生命周期要求，无法 async）
- [ ] neko-types: `config-reader.ts` writeConfigFile/readConfigFile sync（公共 API，需新增 async 变体，低优先级）

### 类型安全
- [ ] neko-types: 54 处 `any` 类型残留

### 基础设施一致性（审计 2026-04-06，大部分已修复）

**i18n**（5/10 → 7/10）：
- [x] neko-preview 补 `package.nls.json`（EN + ZH-CN，19 keys）+ package.json `%key%` 引用 ✅
- [x] neko-auth 补 `package.nls.json`（EN + ZH-CN，6 keys）✅
- [ ] Extension Host 统一采用 `vscode.l10n.t()`（仍有 9/14 未用，非阻塞——nls 文件已覆盖 package.json 字符串）

**共享组件重复**（4/10 → 5/10）：
- [x] useDragDrop / useVSCodeMessaging / useKeyboardShortcuts 重复已 TODO 标注 ✅（实际提取延后，风险高收益低）

**错误处理**（7/10 → 9/10）：
- [x] audio / preview / live / story 4 个扩展接入 VSCodeErrorHandler ✅（新建 `utils/errorHandler.ts` + `activate()` 调用）

**右键菜单**（6/10 → 9/10）：
- [x] neko-agent `package.json` 补 editor/context .fountain 菜单（summarizeDocument + chatWithDocument）✅

**测试覆盖**（5/10 → 7/10）：
- [x] neko-audio: `console.error()` → `logger.error()`（audioProjectStore.ts 4 处）✅
- [x] neko-tools: vscode mock 补 `extensions.getExtension` ✅
- [ ] 4 个扩展零 TS 测试：puppet / engine(TS) / live / model(TS)（低优先级）

### neko-engine 架构（2026-04-08 重构完成）

**已完成**：R0（8 crate 语义化重命名）→ R1（runtime-device）→ R2（runtime-ml）→ R3（runtime-media）→ P1（PluginManager MVP）→ 清理（删除重复 device/ml 代码，移除 midir/gilrs/ort 依赖）→ P0 修复（video_diff ffmpeg-next）→ P1 修复（runtime-media 独立）。11 个 crate，758 个测试。零外部 CLI 依赖。

**已解决**：
- [x] **P0: video_diff.rs ffmpeg CLI** — 重写为 ffmpeg-next filter graph API（filter::Graph + buffer/buffersink 实现 ssim/psnr）。无外部二进制依赖。
- [x] **P1: media_service 循环依赖** — runtime-media 完全自包含（自定义 MediaError + ffmpeg-next 直接解码音频），engine-kernel 单向依赖 runtime-media
- [x] **PluginManager semver** — semver crate VersionReq 匹配（^, ~, >=, =, 范围）
- [x] **PluginManager activation handler** — PluginActivationHandler trait，enable/disable 生命周期回调
- [x] **RuntimeDescriptor trait** — RuntimeRegistry 动态 runtime 发现
- [x] **ServiceContainer 删除** — EngineApi 已接管服务装配

**剩余技术债**：
- [ ] media_service/ 在 engine-kernel 和 runtime-media 中仍有副本（后续可委托给 runtime-media）
- [ ] generate_diff_video (blend) 为 stub（需 encode+mux pipeline，使用频率低）

### 其他
- [ ] Probe 缓存合并：MediaProbeCache（neko-tools）+ MediaMetadataCache（neko-assets）→ 统一
- [ ] Linux/Windows NV12 导出零拷贝
- [ ] `apply_custom_tex_fallback()` CPU round-trip → GPU compute
- [ ] E5 Engine 感知模块：depth/normal/pose/edge 本地 ONNX 提取
- [ ] 质量评估增强：VMAF / FFT / 长视频分段 / 语义音频
- [ ] neko-types: 54 处 `any` 类型残留

**扫描基线**：`pnpm build` ✅ 28/28 | `pnpm test` pre-existing failures | `pnpm lint` 0 error ✅ | **0 循环依赖** ✅

---

<details>
<summary>📦 已完成任务归档（点击展开）</summary>

### ✅ P0 — GPU 管线零拷贝
- macOS 全链路零拷贝（GpuProcessor/GpuPipeline 死代码已删除）

### ✅ P1 — Shader 补齐
- Curves / Color Wheels / HSL / Sharpen / Chroma Key / Luma Key 全部实现

### ✅ P2 — 增强功能
- Shapes（tiny-skia 6 种形状）+ 音频静音检测 UI

### ✅ P2.5 — AI 媒体编辑能力（E1-E4 + E2.5 + E6）
- 类型扩展 + fal.ai/DashScope/Kling 适配器 + Cut AI Handler + Canvas 编辑 UI

### ✅ P2.5b — AI 媒体质量评估系统
- VisionEvaluator + VideoFrameEvaluator + AudioEvaluator + ConsistencyEvaluator + quality-checker SubAgent

### ✅ P2.5c — Agent 工具/技能/MCP 增强
- Tool 并发安全 + Coordinator + Creative Memory + JSONL 持久化

### ✅ P2.5d — 分镜创作流水线 + 跨扩展协同
- ShotNode/SceneGroupNode/GalleryNode + GenerationPromptPanel + BatchScheduler + 7 MCP Tools + Agent Context Protocol

### ✅ P2.5e — 角色编辑 Rust 引擎 Phase 2
- Puppet/Scene 关键帧 CRUD + 动画混合 + EasingType 30+ variants（91 tests）

### ✅ P2.5f — 角色编辑模板创建 + P0/P1/P2 引擎 API
- 模板创建 + Visible/Opacity/MorphWeights/Material/DeleteNode API + 纹理热替换 + 物理模拟 + 编辑器 UI（231 tests）

### ✅ 技术债务（已解决）
- ESLint 升级 + 国际化扩展 + neko-agent 类型/Logger 去重 + ONNX 跨平台打包

### ✅ 一期 Sprint 1（2026-04-06）
- puppetFaceTools `readFileSync` → async + Engine Semaphore(8/4/2) + Assets 搜索 L0 持久化索引 + 类型筛选 + EPUB 大纲 TreeView + Cut AI background-remove/smart-crop + DragDropBroker

### ✅ P0+P1 Agent 架构（2026-04-08）
- **P0-1**: AgentCapabilityProvider 协议（接口 + CapabilityDiscoveryService 混合 manifest/command 发现 + neko-cut 示范迁移）
- **P0-2**: TOOL_NAMES 常量（44 工具，11 分类）+ Builtin Skill 命名漂移修复（31 个不存在 Tool 移除）+ SkillService 运行时校验
- **P0-3**: toolBootstrap.ts 提取 + capabilityBootstrap.ts + index.ts 简化为编排层
- **P1-2**: 质检音频/视频依赖注入（EngineAudioAnalyzerAdapter + EngineFrameExtractorAdapter 接入 pipeline-bootstrap）
- **P1-3**: 默认媒体模型（DALL-E 3 / Sora / TTS-1 / Jukebox）+ defaultMediaModels 配置实现开箱即用媒体生成

### ✅ Sprint 2 — Canvas 收敛 + Story 流水线（2026-04-09）
- **neko-canvas**: P0-1~P0-5 全部收敛（协议统一 + 消息封装 + 审查闭环 + SceneGroupNode 语义容器 + 创作入口覆盖）+ P1-1 CanvasEmbedNode + P1-4 NodeRendererRegistry + asset 代理边界 + timelineSync 回流契约
- **neko-story**: 场景工作流状态持久化（StorySceneStateStore + workspaceState）+ 语义分镜入口 + 场景/镜头规划工具 + canvas 移交
- **neko-agent**: Fountain 流水线接入场景规划 + 语义分镜 canvas 导入管道

</details>

---

*最后更新：2026-04-09（Sprint 2 收敛：canvas P0 全部闭环 + story 状态持久化 + 语义分镜流水线贯通）*
