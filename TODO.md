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

## 🔵 P3 — 长期功能

- [ ] neko-preview 文档预览（暂缓，当前委托 Book Reader / Office Viewer 等第三方扩展，策略见 [ADR](./docs/architecture/document-preview.md)）
- [x] Diff/LSP AI 增强 L1：ScriptIndex（neko-story WorkspaceIndexService.getScriptIndex + GetScriptIndex agent tool）✅
- [x] Diff/LSP AI 增强 L3：SearchScriptIndex 语义搜索（ScriptEmbeddingIndex 余弦相似度 + platform.embed() 注入 + EmbedFn 懒加载）✅
- [ ] Diff/LSP AI 增强 L3 扩展：Whisper ASR Diff + Demucs 音源分离（按需推进）— [ADR](./docs/architecture/lsp.md)
- [ ] neko-agent MCP 客户端重连退避（低复杂度，低优先级）
- [ ] neko-model AI MCP Tools：`face.generate_params` / `face.from_image` / `face.adjust`
- [x] neko-sketch S.4 P1：`sketch.generate` ✅（SketchGenerate MCP tool → MediaGenerationService → postImageData → canvas layer；NekoSketchAPI 跨扩展接口）
- [ ] neko-sketch S.4 P2：`style_transfer` / 跨模块集成（依赖 NekoCanvasAPI 图像节点支持）
- [ ] **分镜系统 P1**：ShotNode 数据类型（@neko/shared）— `ShotScale` / `ShotCharacter[]` / `CameraMovement` / `GeneratedImageVersion[]`（见 [ADR §12](./docs/architecture/2d-capability-analysis.md)）
- [ ] **分镜系统 P1**：neko-story 脚本视图（ScriptTableView）— 动态角色列组 + 景别/运镜/情绪/场景标签
- [ ] **分镜系统 P1**：neko-story 创意视图（CreativeGridView）— 卡片网格 + 生图占位 + 状态显示
- [ ] **分镜系统 P2**：neko-canvas ShotNode（替换 StoryboardNode）+ SceneGroupNode（场景横向容器）
- [ ] **分镜系统 P2**：GenerationPromptPanel（内嵌生图对话框，ADR-2D-007）— 风格/景别/@引用素材委托 neko-agent.generateForNode
- [ ] **分镜系统 P2**：角色一致性 — @引用素材节点图片 → IP-Adapter reference 注入
- [ ] **GalleryNode P2**：多视图画廊节点（`gallery` 类型）— 预置三视图/四视图/九宫格/转面8方向；单格独立生图 + 批量生图；@引用粒度到单格（cell），用于分镜 IP-Adapter 角色一致性；`costumeLabel` 支持服装版本切换
- [x] **AutoPrompt P1**：`neko.agent.buildPrompt(shotContext)` — 中文画面描述 + 角色/景别/情绪 → 结构化英文 prompt；GenerationPromptPanel 发送前预览/编辑 ✅
- [ ] **分镜导出 P1**：PDF 分镜表（jsPDF）+ ZIP 图片包（JSZip）+ neko-cut 时间线导入（分镜图 → MediaElement + 字幕轨）
- [ ] **候选选择 UI P2**：创意视图卡片候选滑动（GeneratedImageVersion[] ◀ N/M ▶）；单次生成 1-4 张
- [ ] **ShotNode 补充字段 P2**：`dialogue` / `voiceOver` / `soundCue`（台词/画外音/音效，连通 neko-cut 字幕轨）
- [ ] **场景背景一致性 P2**：GalleryNode preset `scene-views`（全景/中景/特写细节）→ ControlNet 背景参考注入
- [x] **canvas 文件选择器 P1**：`canvasEditorProvider.ts` 补 `case 'pickMedia'` handler（5 行）— 打通工具栏 Add Image/Video/Audio 按钮 ✅
- [x] **CanvasNodeType 扩展**：@neko/shared canvas.ts 补全 `shot` / `scene` / `gallery` / `script` / `document` / `model` / `canvas-embed` 类型及 validator 白名单 ✅
- [x] **BatchGenerationScheduler P1**：批量分镜生图队列（maxConcurrent=2，指数退避重试，AbortController 取消，进度 postMessage 回传 canvas）✅
- [x] **Canvas × Agent MCP Tools P1**：`canvas_list_nodes` / `canvas_get_node` / `canvas_update_node` / `canvas_create_node` / `canvas_generate_image` / `canvas_generate_batch` / `set_project_generation_config` ✅（neko-agent extensionTools.ts + sendRequest↔_response 全链路；canvasAmbientContext 环境注入 + system prompt 自动注入选中节点）
- [ ] **ScriptNode P2**：剧本节点（TOC 目录模式，`neko-story.getScriptIndex` 获取结构，不渲染全文；点击场景导航到 SceneGroupNode）
- [ ] **DocumentNode P2**：文档节点（PDF/DOCX/EPUB — 封面缩略图 + 委托 neko-preview 打开，`docType` 字段区分类型）
- [ ] **ModelNode P2**：AI 模型节点（`reference` 模式展示模型信息卡；`workflow` 模式有 port 连接 ShotNode 指定生图模型；从 neko-market 查询 installed 状态）
- [ ] **CanvasEmbedNode P3**：嵌套画布引用节点（.nkc 缩略图 + 双击打开）
- [ ] `neko://` 协议 + MediaResolver 代理/原始自动切换（Phase 6.6 客户端，依赖服务端）
- [x] ONNX 跨平台打包：随扩展分发 onnxruntime 动态库（download-ort.js + OrtInitializer.ts + bin/ bundling）
- [ ] neko-live 虚拟制片（MediaPipe + VMC + VRM + 录制 + 推流）
- [ ] VR/AR 沉浸式创作（远期 Phase 7）
- [ ] Git LFS 集成（.gitignore/.gitattributes 模板 + pHash + OID 自动填充）

---

## 📋 技术债务

- [x] ESLint 升级 ✅（`prefer-const`/`no-useless-escape` error；security 误报规则关闭；1837→0 error / 895 warn）
- [x] 国际化扩展 ✅（neko-model/neko-story webview i18n + neko-market/neko-auth L10N 补齐）
- [x] neko-agent 类型去重 ✅（新建 `@neko-agent/types` 共享包，消除 9 处重复类型定义；`ToolParameters` 类型约束防止工具 schema 错误）
- [x] neko-agent Logger 去重 ✅（`createLoggerRegistry()` 工厂函数，4 份 ~20 LOC 样板 → 各 1 行）

**扫描基线**：`pnpm build` ✅ | `pnpm test` ✅ | `pnpm lint` 0 error ✅ | **0 循环依赖** ✅

---

*最后更新：2026-03-29（CanvasNodeType 全集类型扩展；BatchGenerationScheduler；Canvas × Agent MCP Tools 全链路（sendRequest↔_response + canvasAmbientContext 环境注入）；AutoPrompt neko.agent.buildPrompt（LLM shot→英文 prompt）；statusBar.ts（活跃模型状态栏）；neko-cut 时间线导入（storyboardExport.exportToNekoCut）））*
