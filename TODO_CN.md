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

### 待做

### neko-engine（引擎）
- [ ] 新增 action：`documents:text-extract` / `models:clip-embed` / `text:stats`（action registry 中不存在）

### neko-assets（资产管理）
- [ ] 搜索增强后续：
  - [ ] P0：项目目录资源搜索
  - *L1-L3 缓存 + P1/P2 搜索功能依赖 Engine 新 action，随 engine 完成后推进*

### 跨模块
- [ ] **跨域链接**：剧本→媒体引用 / 资产路径补全
- [ ] `neko://` 协议（仅 ADR 设计，依赖服务端）
- [ ] Git LFS 集成

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
- [ ] **CanvasEmbedNode**（类型已有，需 UI 组件）
- [ ] 角色一致性 — IP-Adapter reference 注入
- [ ] 场景背景一致性 — ControlNet 注入

### neko-cut
- [ ] AI action `ai-auto-edit`（需定义"自动剪辑"语义）
- [ ] AI action `ai-match-music`（需节奏检测 + 场景匹配）

### neko-story
- [ ] 故事板图片生成（需 Agent 集成）

### neko-agent
- [ ] MCP 重连退避（指数退避 + 熔断）

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

### neko-live（VTuber 直播）
- [ ] Phase 5.1.3：摄像头 + MediaPipe（需 nokhwa crate）
- [ ] Phase 5.2：标定系统 + 音视频合并 + 导入 neko-cut 时间线
- [ ] Phase 5.3：直播推流（RTMP/SRT → OBS）

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

**剩余技术债**：
- [ ] media_service/ 在 engine-kernel 和 runtime-media 中仍有副本（engine-kernel 内部 service 引用；后续可委托给 runtime-media）
- [ ] generate_diff_video (blend) 为 stub（需 encode+mux pipeline，使用频率低）
- [ ] P2: PluginManager 纳入 effects:register / models:register 统一生命周期
- [ ] P2: semver crate 替换当前 PluginManager 的简单 major 版本比较
- [ ] R4: RuntimeDescriptor trait — host-api 动态发现 runtime（当前 ActionRouter 硬编码 18 个 controller）
- [ ] ServiceContainer 可考虑删除（host-api EngineApi 已接管服务装配）

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

</details>

---

*最后更新：2026-04-06（Sprint 1 + P0/P1 Bug + 基础设施一致性 + 阻塞 I/O 修复 3 处：extensionTools ZIP async + system-prompt-builder async + generatedAssetIndex async load/flush）*
