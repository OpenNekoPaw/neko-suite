# TODO

> 当前迭代的活跃任务清单。长期路线图见 [ROADMAP.md](./ROADMAP.md)。
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

## 🔴 Bug / 严重问题（审计 2026-04-06 发现）

### P0 — 功能失效
- [ ] **neko-cut**: `resolveElementSourcePath()` 硬编码返回 null（`AIActionHandler.ts:524-528`）→ 所有 P0 本地 AI action（upscale/denoise/enhance/whisper/remove-silence）因无源路径而静默失败。需接通 VideoEditorModel。
- [ ] **neko-cut**: `commands/index.ts` 使用 `path.extname/basename/dirname/join` 但**未 import path 模块**，运行时崩溃

### P1 — 测试失败
- [ ] **neko-engine**: `test_actions_for_placeholder_controllers`（`router.rs:385`）断言过期：registry 11 actions vs 测试期望 4 actions
- [ ] **neko-preview**: `StatusBarManager.test.ts:60` 缺少 ID 参数 + `extension.test.ts` 缺少 EventEmitter mock（15 个测试失败）

---

## 📋 技术债务

### 死代码 / 占位
- [ ] neko-engine: CanvasController 3 个 action（composite/capture/export）返回 "not implemented"
- [ ] neko-engine: 10+ unused imports + 9 unused functions/structs（编译 warning）
- [ ] neko-canvas: `neko.template.apply/save` 注册在 package.json 但无实现代码（空命令）
- [ ] neko-cut: 7 个 package.json 命令无对应实现

### 阻塞 I/O
- [ ] neko-agent: `generatedAssetIndex.ts:58,168` `readFileSync/writeFileSync`（有意为之，原子写入）
- [ ] neko-agent: `system-prompt-builder.ts:210` `readFileSync`（初始化阶段）

### 类型安全
- [ ] neko-types: 54 处 `any` 类型残留

### 基础设施一致性（审计 2026-04-06）

**i18n 分裂**（5/10）：
- [ ] Extension Host 统一采用 `vscode.l10n.t()`（当前仅 5/14 使用，其余 9 个未用）
- [ ] neko-preview 补 `package.nls.json`（EN + ZH-CN），命令名当前未本地化
- [ ] neko-auth 补 `package.nls.json`（如有用户可见命令）

**共享组件重复**（4/10）：
- [ ] **useDragDrop** 重复实现：audio（69 行）vs canvas（152 行），API 不兼容 → 提取到 @neko/shared/hooks
- [ ] **useVSCodeMessaging** 重复实现：cut（462 行）vs story（56 行）→ 标准化 API
- [ ] useKeyboardShortcuts：cut / canvas 各自实现 → 考虑提取

**错误处理不统一**（7/10）：
- [ ] 5 个扩展未使用统一 VSCodeErrorHandler：audio / preview / live / story / client → 接入 @neko/shared setErrorHandler

**右键菜单缺口**（6/10）：
- [ ] "Send to AI Agent" 在 editor/context 不支持 .fountain 文件（neko-story 仅 editor/context，neko-agent 仅 explorer/context）

**测试覆盖**（5/10）：
- [ ] 4 个扩展零 TS 测试：puppet / engine(TS) / live / model(TS)
- [ ] neko-preview: StatusBarManager mock 缺 ID 参数 + extension.test.ts 缺 EventEmitter mock
- [ ] neko-tools: vscode mock 缺 `extensions` 导出（测试 noise）
- [ ] neko-audio: `console.error()` 残留（webview audioProjectStore.ts 3 处）

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

*最后更新：2026-04-06（Sprint 1 完成 + 子包审计 + 基础设施一致性审计：i18n/Logger/Theme/右键菜单/ErrorHandler/共享组件/测试覆盖）*
