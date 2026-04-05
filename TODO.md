# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。
> 服务端任务在 [neko-hub](../neko-hub) 仓库，本文件仅跟踪客户端（VSCode 插件）。

---

## ✅ P0 — GPU 管线零拷贝（已完成）

- [x] ~~消除 `processor.rs` readback~~ → 分析发现 `GpuProcessor` 是死代码（无调用者），导出管线已使用 `GpuStyleProcessor` texture-to-texture 路径。已删除。
- [x] ~~激活 `gpu_pipeline.rs` Phase 2~~ → 分析发现 `GpuPipeline` 是纯接口定义（无处理逻辑），macOS 已通过 `RgbaToNv12TextureConverter` + IOSurface 实现全链路零拷贝。已删除死代码。

**结论**：macOS 已完全零拷贝；Linux/Windows NV12 导出 readback 降级为 P2。
详见 [Property Panel GPU 管线分析](./docs/architecture/property-panel-pipeline.md#6-gpu-管线分析零拷贝状态)

---

## ✅ P1 — 缺失 Shader 补齐（已完成）

> 经代码核查（2026-03-28）：Curves / Color Wheels / HSL / Sharpen 已在 Phase 3 GPU 零拷贝重构中完整实现（WGSL + Rust EffectDispatcher + TS composite-helpers 三端贯通）。真正缺失的仅剩抠像类 shader。

- [x] ~~Curves 曲线调色 GPU shader~~ ✅ Phase 3 已实现（`build_curves_data` + WGSL `apply_curves`）
- [x] ~~Color Wheels 三向色轮 GPU shader~~ ✅ Phase 3 已实现（WGSL `cc_color_wheel` + Rust `cw_*` 参数读取）
- [x] ~~HSL 选择性调色 GPU shader~~ ✅ Phase 3 已实现（WGSL `cc_hsl_range` + Rust `hsl_N_*` 参数读取）
- [x] ~~Sharpen 锐化 GPU shader~~ ✅ 已实现（`SHARPEN_TEX_SHADER` + `apply_sharpen_tex`）
- [x] Chroma Key 色度抠像 GPU shader ✅（WGSL BT.601 CbCr 距离 + spill suppression + TS BUILT_IN_EFFECTS 已就绪）
- [x] Luma Key 亮度抠像 GPU shader ✅（WGSL Rec.709 亮度 + smoothstep + 可反转 + TS BUILT_IN_EFFECTS 已就绪）

---

## ✅ P2 — 增强功能（已完成）

- [x] neko-engine 渲染补齐：shapes ✅（tiny-skia CPU 光栅化 → GPU upload；6 种形状 + 填充/描边/阴影/渐变）；keyframes 已由 neko-sketch puppet 动画处理
- [x] neko-tools 音频静音检测 UI ✅（DiffRegionOverlay 加颜色 props；ThreeTrackWaveform 接收 silenceRegions，Previous/Current 轨显示琥珀色叠加层；AudioDiffViewer 传递 silenceRegions）
- [ ] Linux/Windows NV12 导出零拷贝（激活 DMA-BUF/DXGI export 路径，消除 `rgba_to_nv12.rs` readback）—— 降为 P3，依赖跨平台 GPU 栈，暂无 Linux/Windows 测试环境
- [ ] `apply_custom_tex_fallback()` CPU round-trip 迁移到 GPU compute —— 降为 P3，自定义 shader 使用率低，收益有限

---

## ✅ P2.5 — AI 媒体编辑能力（已完成 E1-E4 + E2.5 + E6）

> [ADR](./docs/architecture/ai-media-editing.md)

- [x] **E1 类型扩展**：MediaGenerationType +`image-edit`/`video-edit`；`ControlMode`（8 种）+ `IPAdapterReference`；ImageGenerationRequest +5 字段（controlImage/controlMode/controlStrength/ipAdapterRefs/editInstruction）；VideoGenerationRequest +8 字段（cameraMovement/cameraAngle/shotScale/startFrame/endFrame/sourceVideo/referenceImages/editInstruction）
- [x] **E2.5 Cut AI Action Handler**：AIActionHandler 服务路由 12 个 AI action（P0 本地 ONNX: upscale/denoise/enhance/whisper/remove-silence；P1 跨扩展 neko-agent: style-transfer/color-grade；P2 stub: 4 个 action）；messageHandler.ts `executeAIAction` case 补全；message.ts `trackIds` 字段补全
- [x] **E2 fal.ai ControlNet Adapter**：FalMediaAdapter（queue-based API，Flux + ControlNet depth/canny/pose + IP-Adapter，composite taskId 多模型路由）
- [x] **E3 DashScope Adapter**：DashScopeMediaAdapter 统一 Qwen-Image 2.0（2K 原生 + 指令编辑 + ControlNet）+ Wan 2.7（text/image-to-video + Camera Code 运镜 + 首尾帧）
- [x] **E4 OpenAICompat Kling 增强**：generateVideo +8 运镜/编辑参数（cameraMovement/cameraAngle/shotScale/startFrame/endFrame/sourceVideo/editInstruction/motionStrength）；generateImage +5 ControlNet/编辑参数
- [ ] **E5 Engine 感知模块**：depth/normal/pose/edge 本地 ONNX 提取（<1s）
- [x] **E6 Canvas 编辑 UI**：GenerationPromptPanel 集成到 CanvasApp + ControlMode/Strength/EditInstruction/GenerateVideo 高级参数 + 右键菜单 "ControlNet Edit"/"Generate Video" + canvasStore 扩展

---

## ✅ P2.5d — 分镜创作流水线 + 跨扩展协同（已完成）

> 完整的 Script → Canvas → Cut 创作流水线及跨扩展 AI 协同机制。

- [x] **ShotNode 数据类型**（@neko/shared）：`ShotScale` / `ShotCharacter[]` / `CameraMovement` / `GeneratedImageVersion[]` ✅
- [x] **neko-story 脚本视图**（ScriptTableView）：动态角色列组 + 景别/运镜/情绪/场景标签全字段 ✅
- [x] **neko-story 创意视图**（CreativeGridView）：卡片网格 + 16:9 生图占位 + 角色 badge ✅
- [x] **neko-story → Agent P1**：右键 "→ Agent" 注入 story-selection payload；`neko.story.applyInlineDiff` 命令 ✅
- [x] **ShotNode + SceneGroupNode**：neko-canvas 分镜节点 + 场景横向容器（generationHistory 候选导航）✅
- [x] **GalleryNode**：多视图画廊节点（5 种 layout + 单格/批量生图 + costumeLabel + @引用）✅
- [x] **GenerationPromptPanel**：内嵌生图对话框（canvasStore.generationPanelState + overlay UI）✅
- [x] **AutoPrompt P1**：`neko.agent.buildPrompt`（中文描述 + 角色/景别/情绪 → 结构化英文 prompt）✅
- [x] **BatchGenerationScheduler P1**：批量分镜生图队列（maxConcurrent=2 + 指数退避 + AbortController + 进度回传）✅
- [x] **Canvas × Agent MCP Tools P1**：7 工具（`canvas_list/get/update/create_node` + `generate_image/batch` + `set_project_generation_config`）+ canvasAmbientContext 环境注入 ✅
- [x] **Agent Context Protocol P1**：`neko.agent.sendContext` + `AgentContextPayload` + `AgentContextChip` UI ✅
- [x] **import_script_to_canvas MCP Tool P1**：screenplay → SceneGroupNode + ShotNode 链（每场景 1 SceneGroupNode + ~lineSpan/10 ShotNodes）✅
- [x] **分镜导出 P1**：`neko.cut.importStoryboard` postMessage→webview；storyboardExport.ts buildTimelineShots ✅
- [x] **ScriptNode / DocumentNode / ModelNode P2**：剧本 TOC 目录节点 / PDF 封面缩略图节点 / AI 模型参考节点 ✅
- [x] **neko-cut importGeneratedClip P1**：`neko.cut.importGeneratedClip(assetPath, duration?, trackIndex?)` ✅
- [x] **ISkillProvider P3**（跨扩展技能发现）：neko-canvas 3 skills + neko-cut 2 skills；`ListPluginSkills` Agent Tool ✅
- [x] **NekoCutAPI.ai.generateVideoForClip**：`neko.cut.ai.generateVideoForClip` 命令 ✅
- [x] **CanvasNodeType 扩展**：@neko/shared canvas.ts 补全 `shot/scene/gallery/script/document/model/canvas-embed` + validator 白名单 ✅
- [x] **canvas 文件选择器 P1**：`canvasEditorProvider.ts` 补 `case 'pickMedia'` handler ✅

---

## 🔵 P3 — 长期功能

- [x] neko-preview 文档预览 P0 ✅（PDF/CBZ/EPUB/DOCX 自建预览器 + 选区→AI 桥接；策略见 [ADR](./docs/architecture/document-preview.md)）
- [x] neko-preview 文档预览 P0.5 ✅（瀑布流 + 直连 engine HTTP + PathResolver + 双栏模式 + 右键菜单 + 状态栏）
- [ ] neko-preview 文档预览 P1：XLSX（x-data-spreadsheet）/ PPTX（LibreOffice headless）/ FDX（XML 解析）/ 缩略图缓存
- [ ] neko-preview 文档大纲：EPUB TOC → TreeDataProvider（VSCode Custom Editor 不支持 DocumentSymbolProvider）
- [x] Diff/LSP AI 增强 L1：ScriptIndex（neko-story WorkspaceIndexService.getScriptIndex + GetScriptIndex agent tool）✅
- [x] Diff/LSP AI 增强 L3：SearchScriptIndex 语义搜索（ScriptEmbeddingIndex 余弦相似度 + platform.embed() 注入 + EmbedFn 懒加载）✅
- [ ] Diff/LSP AI 增强 L3 扩展：Whisper ASR Diff + Demucs 音源分离（按需推进）— [ADR](./docs/architecture/lsp.md)
- [ ] neko-agent MCP 客户端重连退避（低复杂度，低优先级）
- [ ] neko-model AI MCP Tools：`face.generate_params` / `face.from_image` / `face.adjust`
- [x] neko-sketch S.4 P1：`sketch.generate` ✅（SketchGenerate MCP tool → MediaGenerationService → postImageData → canvas layer；NekoSketchAPI 跨扩展接口）
- [ ] neko-sketch S.4 P2：`style_transfer` / 跨模块集成（依赖 NekoCanvasAPI 图像节点支持）
- [ ] **分镜系统 P1**：ShotNode 数据类型（@neko/shared）— `ShotScale` / `ShotCharacter[]` / `CameraMovement` / `GeneratedImageVersion[]`（见 [ADR §12](./docs/architecture/2d-capability-analysis.md)）
- [x] **分镜系统 P1**：neko-story 脚本视图（ScriptTableView）— 动态角色列组 + 场景行 + 时长估算；分镜表 tab ✅
- [x] **分镜系统 P1**：neko-story 创意视图（CreativeGridView）— 卡片网格 + 16:9 生图占位 + 角色 badge ✅
- [x] **分镜系统 P2**：neko-canvas ShotNode + SceneGroupNode（场景横向容器）✅（BaseNode 包装，generationHistory 候选导航）
- [x] **分镜系统 P2**：GenerationPromptPanel（内嵌生图对话框，ADR-2D-007）✅（canvasStore.generationPanelState + overlay UI）
- [ ] **分镜系统 P2**：角色一致性 — @引用素材节点图片 → IP-Adapter reference 注入
- [x] **GalleryNode P2**：多视图画廊节点（`gallery` 类型）✅（预置 5 种 layout + 单格/批量生图 + costumeLabel + @引用）
- [x] **AutoPrompt P1**：`neko.agent.buildPrompt(shotContext)` — 中文画面描述 + 角色/景别/情绪 → 结构化英文 prompt；GenerationPromptPanel 发送前预览/编辑 ✅
- [x] **分镜导出 P1**：neko-cut 时间线导入 ✅（`neko.cut.importStoryboard` postMessage→webview；storyboardExport.ts buildTimelineShots；PDF/ZIP 待 jsPDF/JSZip 依赖安装）
- [ ] **候选选择 UI P2**：创意视图卡片候选滑动（GeneratedImageVersion[] ◀ N/M ▶）；单次生成 1-4 张
- [ ] **ShotNode 补充字段 P2**：`dialogue` / `voiceOver` / `soundCue`（台词/画外音/音效，连通 neko-cut 字幕轨）
- [ ] **场景背景一致性 P2**：GalleryNode preset `scene-views`（全景/中景/特写细节）→ ControlNet 背景参考注入
- [x] **canvas 文件选择器 P1**：`canvasEditorProvider.ts` 补 `case 'pickMedia'` handler（5 行）— 打通工具栏 Add Image/Video/Audio 按钮 ✅
- [x] **CanvasNodeType 扩展**：@neko/shared canvas.ts 补全 `shot` / `scene` / `gallery` / `script` / `document` / `model` / `canvas-embed` 类型及 validator 白名单 ✅
- [x] **BatchGenerationScheduler P1**：批量分镜生图队列（maxConcurrent=2，指数退避重试，AbortController 取消，进度 postMessage 回传 canvas）✅
- [x] **Canvas × Agent MCP Tools P1**：`canvas_list_nodes` / `canvas_get_node` / `canvas_update_node` / `canvas_create_node` / `canvas_generate_image` / `canvas_generate_batch` / `set_project_generation_config` ✅（neko-agent extensionTools.ts + sendRequest↔_response 全链路；canvasAmbientContext 环境注入 + system prompt 自动注入选中节点）
- [x] **Agent Context Protocol P1**：`neko.agent.sendContext` 命令 + `AgentContextPayload` + `AgentContextChip` UI ✅（InputAreaContext contextChips + onTriggerSend；pre-intercept handler 修复 externalMessage/prefillInput；ChatViewProvider.sendContextPayload）
- [x] **neko-story → Agent P1**：右键 "→ Agent" 注入 `story-selection` payload；`neko.story.applyInlineDiff` 命令（WorkspaceEdit + 接受/拒绝确认）✅
- [x] **neko-cut importGeneratedClip P1**：`neko.cut.importGeneratedClip(assetPath, duration?, trackIndex?)` → postMessage `importGeneratedClip` 到 timeline webview ✅
- [x] **import_script_to_canvas MCP Tool P1**：screenplay → SceneGroupNode + ShotNode 链（每场景 1 SceneGroupNode + ~lineSpan/10 ShotNodes）✅
- [x] **ScriptNode P2**：剧本节点（TOC 目录模式，getScriptIndex 获取 scenes[]，点击跳转 SceneGroupNode）✅
- [x] **DocumentNode P2**：文档节点（PDF/DOCX/EPUB 封面缩略图 + openDocument → vscode.open）✅
- [x] **ModelNode P2**：AI 模型节点（reference/workflow 双模式，checkModelInstalled → neko-market）✅
- [ ] **CanvasEmbedNode P3**：嵌套画布引用节点（.nkc 缩略图 + 双击打开）
- [ ] **搜索系统增强**（当前仅文件名匹配 `MediaLibrarySearchService`，缺少深度搜索 + 缓存 + Engine 委托）：
  - **现状问题**：首次搜索全量 walkDirectory（万级文件 5-15s）；索引不感知文件变化（新增文件搜不到）；每次搜索 N 次 `fs.stat` 验证 mtime；Extension Host 读大文件阻塞主线程
  - **四层缓存架构**（核心改进）：
    - [ ] **L0 文件索引**（增量维护）：FileSystemWatcher 联动搜索索引（TreeProvider 已有 watcher 但未联动）；持久化到 `.neko/.cache/search-index.json`；增量 add/remove/rename，不再全量 walk
    - [ ] **L1 元数据缓存**（惰性验证）：搜索阶段 `getUnchecked()` 零 I/O 直返缓存；展示阶段 QuickPick `onDidChangeActive` 仅验证可见项 mtime；后台补充未缓存文件 metadata
    - [ ] **L2 倒排索引**（文档全文）：Engine `documents:text-extract` 提取纯文本 → 分词 → `Map<token, Set<filePath>>` 倒排索引；持久化到磁盘；FileSystemWatcher 增量更新
    - [ ] **L3 向量索引**（语义搜索，P2）：图片 Engine `models:clip-embed` → float32[512]；文档 Platform `embed()` → float32[1536]；持久化到 `.neko/.cache/vector-index.bin`；<1000 条暴力 cosine top-K 即够
  - **Engine 委托**（避免 Extension Host 阻塞）：
    - [ ] Engine 新增 `documents:text-extract` action（文件路径 → 纯文本 + 页数 + 字数，Rust mmap 流式解析）
    - [ ] Engine 新增 `models:clip-embed` action（文件路径 → 向量，复用现有 ONNX CLIP）
    - [ ] Engine 新增 `text:stats` action（文件路径 → 字数/行数/字符数，替代 TS 全量 `fs.readFile` 统计）
    - [ ] 现有阻塞修复：`puppetFaceTools.ts:270` `readFileSync` → async；`qualityCheckTools.ts:331` 大文件 base64 → 限制尺寸或 file URI；`messageHandler.ts:700` 同步 Range 读 → async
  - **Engine 并发保护**（防止搜索批量请求导致不稳定，同时惠及 Media LSP 诊断的并行 probe）：
    - [ ] Rust 侧：FFmpeg probe `Semaphore(4)` + GPU ops `Semaphore(2)` + ONNX `tokio::sync::Mutex` 替代 `std::Mutex`（防 executor stall）
    - [ ] Rust 侧：HTTP 中间件全局准入 `Semaphore(8)` + 请求超时 30s + Buffer Pool 16→32
    - [ ] TS 侧：SearchPipeline 分级限流（probe=4, thumbnail=2, embed=1）；渐进式加载（即时→快速→懒加载→按需）
  - **搜索功能**：
    - [ ] P0：类型筛选（QuickPick 增加文件类型过滤，复用 `detectMediaType()`）+ 高级过滤（大小/日期/排序）+ 突破 50 条上限
    - [ ] P0：项目目录资源搜索（当前 `.neko` 项目内媒体/文档，区别于 VSCode 文本搜索）
    - [ ] P1：文档全文搜索（依赖 L2 倒排索引 + Engine text-extract）
    - [ ] P1：拼音/模糊搜索（中文拼音首字母匹配，提升中文文件名体验）
    - [ ] P1：元数据搜索（分辨率/时长/编码检索，依赖 L1 元数据缓存）
    - [ ] P2：图片语义搜索（"悲伤的女孩" → CLIP 图文匹配，依赖 L3 + Engine clip-embed）
    - [ ] P2：相似素材查找（图图相似度，依赖 L3 向量索引）
    - [ ] P2：素材库 `AssetQuery` 查询落地验证（接口已完善：keyword/category/tags/sourceType/dateRange/variantFilter）
    - [ ] P3：音频语义搜索（"适合打斗的 BGM" → CLAP/AudioCLIP 模型，需 Engine 新增）
  - **LSP 依赖分析**（结论：LSP 与搜索系统独立，仅三处可复用）：
    - Fountain LSP（neko-story）：自有 WorkspaceIndex（`**/*.fountain`），不需要搜索/缓存/Engine 能力
    - Media LSP（neko-tools）：自有 MediaWorkspaceIndex（`**/*.nkv`）+ MediaProbeCache（60s TTL），已依赖 Engine probe
    - SearchScriptIndex（neko-agent）：自有 ScriptEmbeddingIndex + TF-IDF 降级，不依赖搜索系统
    - 交叉点 1：Engine Semaphore → Media LSP 的 `checkReferences()` 并行 probe 间接受益（无需改 TS）
    - 交叉点 2：probe 缓存可合并（见技术债务）
    - 交叉点 3：ScriptEmbeddingIndex 的 `EmbedFn` 注入模式可复用到 L3 向量索引
- [ ] **跨域链接**（LSP 与搜索系统之间的未覆盖区域，独立于两者）：
  - [ ] 剧本→媒体引用：Fountain `[[clip.mp4]]` 路径解析 + 跳转到实际文件（需文件索引 L0 做路径补全）
  - [ ] 资产路径补全：编辑 .nkv 时自动补全媒体文件路径（可用 TreeView 文件列表或搜索索引）
  - [ ] Whisper ASR 对白匹配：音频文件→自动字幕→与剧本对白诊断比对（需 Engine transcript 能力，P3）
- [ ] `neko://` 协议 + MediaResolver 代理/原始自动切换（Phase 6.6 客户端，依赖服务端）
- [x] ONNX 跨平台打包：随扩展分发 onnxruntime 动态库（download-ort.js + OrtInitializer.ts + bin/ bundling）
- [ ] neko-live 虚拟制片（MediaPipe + VMC + VRM + 录制 + 推流）
- [ ] VR/AR 沉浸式创作（远期 Phase 7）
- [ ] Git LFS 集成（.gitignore/.gitattributes 模板 + pHash + OID 自动填充）
- [ ] **DragDropBroker P1**（ADR-5）：Extension Host 代理拖拽，支持从 Agent chat 拖拽生成资产到 Canvas/Cut/Explorer
  - `DragDropBroker` singleton 在 Extension Host：`dnd:start` → 暂存 `GeneratedAsset` JSON → `dnd:query/drop` → `vscode.commands.executeCommand('neko.{target}.importAsset', asset)`
  - Agent webview: `ResultPreview`/`ImageGridCard` 添加 `draggable` + `dragstart` → `postMessage({ type: 'dnd:start', asset })`
  - Canvas/Cut webview: `drop` 事件 → `postMessage({ type: 'dnd:drop' })` → broker 分发 `importAsset` 命令
  - 前置条件：`neko.canvas.importAsset` ✅ / `neko.cut.importGeneratedClip` ✅ 已就绪
  - ~100 行 Extension Host + ~20 行/webview drop zone

---

## 📋 技术债务

- [x] ESLint 升级 ✅（`prefer-const`/`no-useless-escape` error；security 误报规则关闭；1837→0 error / 895 warn）
- [x] 国际化扩展 ✅（neko-model/neko-story webview i18n + neko-market/neko-auth L10N 补齐）
- [x] neko-agent 类型去重 ✅（新建 `@neko-agent/types` 共享包，消除 9 处重复类型定义；`ToolParameters` 类型约束防止工具 schema 错误）
- [x] neko-agent Logger 去重 ✅（`createLoggerRegistry()` 工厂函数，4 份 ~20 LOC 样板 → 各 1 行）

- [ ] Probe 缓存合并：MediaProbeCache（neko-tools, 60s 内存 TTL）+ MediaMetadataCache（neko-assets, mtime 磁盘持久化）→ 统一持久化缓存，消除同一文件被 probe 两次

**扫描基线**：`pnpm build` ✅ | `pnpm test` ✅ | `pnpm lint` 0 error ✅ | **0 循环依赖** ✅

---

## ✅ P2.5b — AI 媒体质量评估系统（已完成）

> [ADR](./docs/architecture/media-quality-assessment.md)

- [x] **Phase 1**：结构化评估 + 修复映射（VisionEvaluator + RemediationPlanner 15 category）
- [x] **Phase 2**：视频评估（VideoFrameEvaluator 多帧采样 + 3 种视频 category + VideoPart adapter 支持）
- [x] **Phase 3**：音频评估（AudioEvaluator LUFS/TruePeak/静音检测，零 LLM 成本）
- [x] **Phase 4**：跨场景一致性（ConsistencyEvaluator CLIP 快筛 + Vision LLM 精评 + 角色追踪 + qualityGate 管线阶段 + quality-checker SubAgent）
- [x] **Phase 5**：Skill + ToolSet 集成（qualityAssessmentSkill + `/quality-check` 斜杠命令 + mediaQAToolSet）

### 待做增强（非阻塞，需 Engine Rust 层扩展）
- [ ] VMAF 集成（使用 SSIM/PSNR 替代，收益有限）
- [ ] FFT 频谱分析 / onset detection（需新增 Rust 音频模块）
- [ ] LLM 语义音频评估（对话清晰度/情感匹配 → 需 ASR + LLM）
- [ ] SSIM/PSNR 相邻帧指标填充（VideoTechnicalMetrics optional 字段，待 Engine 图片 diff 扩展）
- [ ] 长视频分段评估（无分片机制）
- [ ] elementEditingToolSet / animationKeyframesToolSet 映射到 RemediationPlanner

---

## ✅ P2.5c — Agent 工具/技能/MCP 增强（已完成）

> [ADR](./docs/architecture/agent-tool-skill-enhancement.md)

- [x] **Phase A**：Tool 并发安全 + Schema 校验 + Shell 替换
- [x] **Phase B**：Auto-Compact + Progress + MCP 健壮性 + Paths 触发 + Coordinator + 版本锚点
- [x] **Phase C**：buildTool 工厂 + JSONL 持久化 + Prompt Cache + Agent Memory + SubAgent 预设

---

## ✅ P2.5e — 角色编辑 Rust 引擎 Phase 2（已完成）

> [ADR](./docs/architecture/character-editing-analysis.md)
> TS 侧 Phase 1 已完成（37 files, +3603 LOC），本阶段实现 Rust 后端使关键帧编辑器和动画混合在运行时可用。

### Step 0: EasingType 共享
- [x] `EasingType` 从 `native-core` 迁移到 `neko-types/easing.rs`（30+ variants + evaluate + from_str/to_str kebab-case）
- [x] `native-core/animation/easing.rs` 改为 re-export，零行为变化

### Step 2a: Puppet 关键帧 CRUD
- [x] `native-puppet/animation.rs` — Keyframe 扩展（UUID id + EasingType easing）、CRUD 方法（add/remove/update）、序列化类型（KeyframeInfo/ParameterCurveInfo）
- [x] `native-puppet/systems.rs` — `sample_eased()` 替换线性插值，支持 30 种缓动函数
- [x] `native-puppet/world.rs` — PuppetWorld +5 方法（get_keyframe_tracks/add/remove/update_keyframe/create_clip）
- [x] Service + Controller — 5 个 action（`keyframe_tracks/keyframe_add/keyframe_remove/keyframe_update/clip_create`）

### Step 2b: Puppet 动画混合
- [x] `native-puppet/animation_blend.rs` — BlendLayer/AnimationBlendState/CrossfadeRequest ECS 组件
- [x] `native-puppet/systems.rs` — `animation_blend_tick()` 多层加权混合 + 自动渐变
- [x] `native-puppet/world.rs` — crossfade_animation/set_blend_weight/get_blend_state + tick 自动切换 blend/single 模式
- [x] Service + Controller — 3 个 action（`anim_crossfade/blend_weight/blend_state`）

### Step 2c: Scene 关键帧 CRUD + 项目 v2
- [x] `native-scene/components.rs` — SceneKeyframe（UUID + easing）+ AnimationChannel 重构（from_flat/CRUD/to_info）+ AnimationClipData 扩展
- [x] `native-scene/systems.rs` + `loader.rs` — 适配新 keyframe 结构，glTF 加载使用 `from_flat()`
- [x] `native-scene/world.rs` — SceneWorld +5 方法（get_keyframe_tracks/add/remove/update_keyframe/create_clip）
- [x] `native-scene/project.rs` — v2 升级（新增 face_params/custom_clips/camera，v1 兼容加载）
- [x] Service + Controller — 5 个 action
- [x] `neko-types/registry.rs` — PUPPETS +8 actions, SCENES +5 actions

**测试结果**：puppet 51 tests + scene 40 tests = 91 全部通过

---

## ✅ P2.5f — 角色编辑 模板创建 + P0/P1 引擎 API（已完成）

> [能力差距分析](./docs/architecture/character-editing-gaps.md)

### 模板创建功能
- [x] `createNewFile` 扩展 `TemplateChoice` 接口 + QuickPick 模板选择 + `assets` 资源写入
- [x] `inp-template.ts` / `glb-template.ts` 二进制生成器（TypeScript 直接生成最小/人形模板）
- [x] neko-puppet / neko-model 三模板（空白 / 简单人形 / 导入现有文件）+ i18n
- [x] 13 个单元测试（INP + GLB 格式验证）

### P0: 显隐控制
- [x] 3D `Visible` 组件 + `scenes:set_visible` API + GPU 渲染过滤
- [x] 2D `puppets:set_opacity` API

### P1: 角色编辑 API
- [x] `scenes:morph_weights` — Morph Target 权重设置
- [x] `scenes:update_material` — PBR 材质参数运行时编辑
- [x] `scenes:delete_node` — 节点递归删除
- [x] `AssetCache.update_material_uniforms()` — GPU 材质 buffer 热更新

**测试结果**：native-scene 49 + native-puppet 51 + native-api 131 全部通过

### P2: 增强能力
- [x] 2D 纹理热替换（`puppets:set_texture` — 运行时修改 TextureRef.texture_index）
- [x] 2D 物理模拟（SimplePhysics + PhysicsState ECS 组件 + INP SimplePhysics 节点解析 + rigid/spring pendulum 求解器移植）
- [x] 3D 材质扩展（MaterialUniforms +emissive_factor +occlusion_strength + glTF 加载 + bind group +2 + WGSL AO/emissive）

### 编辑器 UI
- [x] neko-model：VerticalToolbar 共享组件 + Tailwind content 修复 + i18n 接入 + CSP 修复 + locale 注入
- [x] neko-puppet：Canvas 2D 渲染器（PuppetCanvas + inp-parser 纹理提取 + affine 纹理三角形 + zoom/pan）
- [x] 统一空白状态 UI（导入按钮 + 模板按钮 + 拖拽区，替代 QuickPick）
- [x] 程序化人形模板（INP: Part 节点 + mesh + 嵌入 PNG 纹理；GLB: 球+圆柱多 mesh 骨骼人形）

---

*最后更新：2026-04-05（角色编辑 P0-P2 + 编辑器 UI：Canvas 渲染器 + 共享组件 + i18n + 模板）*
