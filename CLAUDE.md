# Claude Working Guide - Architect Perspective

> **Lang:** English | [中文](./CLAUDE_CN.md)

## Core Identity

**I am Claude the Architect. I apply SOLID principles to guide design, think top-down, and ensure every module has a single responsibility, is fully decoupled, and is easy to test.**

**Language**: Code comments in English.

---

## 0. Project Context

### Neko Suite - VSCode Creative Workspace

**Overview**: A professional creative workspace integrated into VSCode, comprising extensions for video editing, AI assistant, canvas editing, screenwriting, asset management, media preview, and more - all powered by a shared media engine and common infrastructure.

**Architecture Overview**: For detailed system architecture, communication patterns, and data flows, see [ARCHITECTURE.md](./ARCHITECTURE.md). This document focuses on development standards and coding practices.

**Tech Stack**:
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Zustand + Tailwind CSS + Vite |
| Extension | VSCode Extension API + TypeScript + esbuild |
| Media Engine | Rust (wgpu + FFmpeg + axum + tokio) + N-API (napi-rs) |
| Streaming | H.264 + PCM + fMP4 over WebSocket |
| AI | Vercel AI SDK (Claude/OpenAI/Google) + MCP Protocol |
| Protocol | Protobuf (type contract source of truth) |
| Build | pnpm 10 + Turborepo 2 |
| Testing | Vitest (TS/JS) + cargo test (Rust) |

**TypeScript Configuration** (must be enabled):
```jsonc
{
  "compilerOptions": {
    "strict": true,              // Enable all strict type checks
    "noUncheckedIndexedAccess": true,  // Indexed access returns T | undefined
    "noImplicitOverride": true   // Inherited methods must use explicit override
  }
}
```

**Monorepo Structure**: See [ARCHITECTURE.md](./ARCHITECTURE.md) and [README.md](./README.md) for details.

**Core Packages**:
- `neko-engine` - Rust media engine (GPU/FFmpeg/HTTP + ONNX ML native inference)
- `neko-types` - @neko/shared infrastructure (Logger/i18n/Theme/Errors)
- `neko-client` - @neko/neko-client streaming client + EngineClient
- `neko-proto` - Protobuf IDL (type contract source of truth)

**Feature Extensions**: neko-cut (video editing), neko-agent (AI), neko-canvas (canvas), neko-model (3D editing), neko-sketch (2D painting), neko-puppet (2D skeletal animation), neko-story (screenwriting), neko-preview (preview), neko-tools (tools), neko-assets (assets), neko-market (marketplace)

**Build Commands**:
```bash
pnpm build                 # Full build (turbo)
pnpm build:neko-cut        # Single extension
pnpm test                  # Run tests
pnpm check                 # Code quality checks
```

### VSCode Extension Development Constraints

**Security Sandbox Constraints** (must be followed):

| Constraint | Wrong | Right |
|------------|-------|-------|
| Webview has no Node.js | `import fs from 'fs'` | Request via postMessage to Extension |
| Webview has no VSCode API | `vscode.workspace.*` | Proxy via message protocol |
| Resource paths are restricted | `file://` or `http://` | `webview.asWebviewUri()` |

**Communication Patterns**: See [ARCHITECTURE.md](./ARCHITECTURE.md#通信模式) for details.

**Quick Reference**:
```
Webview (React)  <-- postMessage -->  Extension Host (Node.js)  -->  Business Packages
   UI layer                              Bridge layer                   Domain layer
                                            |                              |
                                            +-- vscode.workspace.*         +-- @neko/agent
                                            +-- vscode.window.*            +-- @neko-engine/*
                                            +-- fs / path / child_process  +-- @neko/shared, etc.
```

**Layer responsibilities** (clarification of the existing structure — not a new rule):
- **UI layer** (`*/webview/`): React components, local state, postMessage I/O. No Node / no `vscode`.
- **Bridge layer** (`*/extension/`): VSCode integration only — command/provider registration, postMessage routing, Webview lifecycle, file-system access on behalf of the Webview. Should delegate domain logic to business packages.
- **Domain layer** (standalone packages, e.g. `neko-agent/packages/agent/`, `@neko/shared`, `@neko-engine/*`): Business logic, no `vscode` import. Imported by the bridge layer.

Enforced by `dependency-cruiser` rules (`webview-no-vscode`, `extension-no-react`, `layer0-no-internal-deps`, `no-cross-extension-deps-*`). Some current `*/extension/` packages still mix domain logic into the bridge layer; new code should keep domain logic in standalone packages.

**File Access Example**:
```typescript
// Wrong: Webview directly accessing the file system
import fs from 'fs'
fs.readFile('/path/to/file')

// Correct: Request through Extension Host via message
vscode.postMessage({ type: 'readFile', path: '/path/to/file' })
```

**Debugging**:
- Extension Host: `console.log('[Extension]', data)`
- Webview DevTools: `Cmd+Shift+P -> Developer: Open Webview Developer Tools`

**More Details**: See [ARCHITECTURE.md](./ARCHITECTURE.md#1-extension-host--webviewpostmessage-ipc).

### Architecture Decision Records (ADR)

Before diving into any domain, consult the corresponding ADR document. For the full list, see [ARCHITECTURE.md](./ARCHITECTURE.md#关键架构决策adr).

**Frequently Referenced ADRs**:

| Domain | Document | Key Points |
|--------|----------|------------|
| Media Diff + LSP | [docs/architecture/media-lsp.md](./docs/architecture/media-lsp.md) | H264+PCM streaming; JVI diagnostics + Hover + symbol navigation + cross-file indexing; script semantic search |
| Cross-Cutting Concerns | *internalized* | Logger/i18n/Theme/Error unified in @neko/shared, three-layer isolation (L0 zero-dep -> L1 vscode -> L2 DOM/React) |
| Cross-Language Architecture | *internalized* | Rust engine is the authoritative source for data models; TS handles UI only |
| Shared Package Design | *internalized* | @neko/shared uses exports subpath layering |
| Asset Management | *internalized* | Unified AssetManifest + Handler registry pattern |
| 3D Capabilities | *Internalized* | bevy_ecs standalone crate + runtime-scene; dual GPU Skinning pipeline; FABRIK/CCD/TwoBone IK; animation blend/crossfade; hybrid strategy (built-in lightweight + MCP bridge to Blender) |
| 3D Editor Rendering Architecture | [docs/architecture/adr-3d-editor-rendering-architecture.md](./docs/architecture/adr-3d-editor-rendering-architecture.md) | **Proposed (2026-04-27)**. neko-model 当前双渲染器（R3F + wgpu）导致编辑器预览与导出结果不一致。三大引擎（UE5/Unity/Godot）均采用编辑器 Viewport 直接运行引擎渲染器（SSOT 原则）。近期修复优先级：P0 修复 GLB 导出器（材质/灯光/相机丢失）、P1 修复法线贴图 shader + 动画状态同步、P2 实现 `scenes:stream`（WYSIWYG 基础条件）。混合路线：R3F 做交互预览 + Engine capture 做质量预览 + Engine stream 做长期 WYSIWYG 目标。VSCode CSP 已放行 `connect-src http://127.0.0.1:*`，全景/HDR 文件通过 engine HTTP 端点加载可绕过限制。 |
| 2D Capabilities | *Internalized* | neko-sketch (painting) + neko-puppet (skeletal animation); multi-layer animation blend + crossfade; hybrid strategy (built-in lightweight + MCP bridge to PS/ComfyUI) |
| VSCode Constraints | [docs/architecture/vscode-constraints.md](./docs/architecture/vscode-constraints.md) | Panel placement: editor-bound → embedded Webview, global → native container; device access: Webview sandbox proxied through engine Rust sidecar (cpal/nokhwa/midir/gilrs) |
| Device Management + neko-live 拆分 | [docs/architecture/adr-device-management.md](./docs/architecture/adr-device-management.md) | **Proposed (2026-05-07)**. TS 设备客户端放 neko-client/src/device/（不新建子包）；设备管理 UI 用原生 VSCode TreeView/QuickPick/StatusBar（不建 Webview）；实时输入 engine 内闭环；手写板走 PointerEvent。neko-live 三层拆分：TrackingService 提取为共享 extension 级服务 → neko-puppet/neko-model 各加 Live Mode（用自有渲染器） → neko-live 瘦身为场景合成器（删除重复的 AvatarViewer/PuppetViewer）。设备管理面板与 neko-live 面板不合并（职责不同，通过 DeviceManager API 协作）。 |
| Format Strategy | [docs/architecture/format-strategy.md](./docs/architecture/format-strategy.md) | nk* unified naming; JSON Schema as file format SSOT; Proto for engine communication only; Format SDK (@neko/shared/nkv) provides load/validate/migrate/save; 20 incremental operations + full fallback |
| Marketplace + Registry | [docs/architecture/marketplace.md](./docs/architecture/marketplace.md) | @neko/market-core Layer 0 + multi-category InstallTarget + unified distribution protocol; Registry Server: thin API + object storage direct upload + upstream proxy (HF/Civitai) + private Docker deployment |
| Local Model Deployment | [docs/architecture/model-runtime.md](./docs/architecture/model-runtime.md) | No neko-runtime package; onPostInstall GGUF->Ollama / ONNX->Engine; Engine ort/candle native ML; external runtime Provider/MCP integration |
| Document Preview | [docs/architecture/document-preview.md](./docs/architecture/document-preview.md) | PDF/EPUB/CBZ delegated to Book Reader or self-built (pdfjs-dist/epub.js); DOCX->docx-preview; XLSX->x-data-spreadsheet; PPTX->LibreOffice headless; priority: option |
| Creative Context Compression | [docs/architecture/creative-context-compression.md](./docs/architecture/creative-context-compression.md) | 7-level priority semantic classification: user messages permanently retained; creative decisions/version anchors/iteration chains/asset state/aesthetic preferences summarized by tier |
| Ablation Experiment Framework | [docs/architecture/ablation-experiment-framework.md](./docs/architecture/ablation-experiment-framework.md) | AblationToggles + MetricsHooks zero-intrusion ablation experiments |
| Agent Media Architecture | [docs/architecture/agent-media-architecture.md](./docs/architecture/agent-media-architecture.md) | GeneratedAsset on-disk storage + JSON reference; Agent self-sufficiency; Send-to-Agent unified protocol (file-level + content-level, zero base64); MediaPreprocessor auto-resize/frame-extraction; layered preview components |
| Agent Capability Provider | [docs/architecture/neko-agent-media-requirements-fit.md](./docs/architecture/neko-agent-media-requirements-fit.md) | Sub-packages own their tool definitions via AgentCapabilityProvider; TOOL_NAMES constants as naming SSOT; CapabilityDiscoveryService hybrid discovery (manifest + command); neko-cut demo migration complete |
| Perception-First Roadmap | [docs/architecture/perception-first-roadmap.md](./docs/architecture/perception-first-roadmap.md) | Quarterly roadmap (Q2 2026 → 2027 Q1): Perception tool exposure → closed-loop feedback → Operation-layer coverage (Puppet/Model) → multimodal output extension (Manga/3D anim). Proposed |
| Agent Multimodal Perception | [docs/architecture/adr-agent-multimodal-perception.md](./docs/architecture/adr-agent-multimodal-perception.md) | **Proposed (2026-05-06)**. PerceptionCard 三层感知中间体（Structural/Semantic/Perceptual）+ PerceptionPolicy 策略驱动时机（on-completion/on-reference/on-demand）+ 系统预处理 LLM 决策 + Confidence retry + Provider-Aware Delivery（按 LLM 模态能力投递）+ CompositeBlock 多模态组装（storyboard-table/comparison/gallery）+ Task Completion Backfill 闭合管道。7 PR 迁移。 |
| Agent Unified Workflow | [docs/architecture/agent-unified-workflow.md](./docs/architecture/agent-unified-workflow.md) | IDC 3-stage workflow (Draft → Plan → Apply, 2026-04-22 revision, SDD → IDC rename 2026-04-23) + dual-view architecture (§2.1 responsibility: intent/orchestration/execution/control; §2.2 implementation: L3/L2/L1/L0) + §11.6 six-plane constraint layering (Prompt/Schema/Runtime/Policy/Memory/Evaluator) + §11.6.9 AI-native self-evaluation boundary. Artifacts use `<kind>-<runId>.md` prefix convention under `.neko/drafts\|plans\|tasks/`. Phase B removed DraftWrite/PlanWrite/TaskWrite in favour of generic Write + ArtifactWatcher + ArtifactObservationHooks (closed-loop self-correct). **Prompt plane (PR1-PR3f, 2026-04-23)**: 5-layer composer (base → schema → skill → environment → ephemeral) + Module/Registry/Orchestrator + 8 modules (SkillInjection / Memory × 3 / VersionLog / AGENTS.md overlay / ArtifactSchema / SubpackageFragments) + SelfEvaluationHooks for §11.6.9 guidance + AgentCapabilityProvider.promptFragments sub-package extension point + 8 golden snapshots. Supersedes the removed dual-flow exploration doc |
| Agent Evolution Capacity | [docs/architecture/agent-evolution-capacity.md](./docs/architecture/agent-evolution-capacity.md) | Anti-evolution audit of agent-unified-workflow.md. Rates Skill / Prompt / Orchestration / six control planes (A- / A / B+ / A A- A- B A A) against LLM capability growth / Skill market expansion / engine capability growth / novel orchestration patterns. Identifies three weakest breakpoints (Tool hard-reference in Skills / keyword-based Skill matching / non-versioned persona prompts). Extracts six maintenance disciplines protecting evolution capacity |
| Multi-Agent Federation | [docs/architecture/agent-multi-agent-federation.md](./docs/architecture/agent-multi-agent-federation.md) | **Proposed (2026-04-24)**. Upgrades `subagent/` from parent-child fire-and-forget to peer federation. Core: capability parity (SubAgent is a full AgentSession), AgentId path-based topology, bidirectional MessageBus (SendMessage / AskAgent / Broadcast / CheckInbox symmetric tools), inbox polling via ExecutorHooks with 3 strategies (eager / lazy / off), bounded recursion (depth=3, breadth=5, federation=20), FederationBudget global accounting, toxicity-tagged permission inheritance, 11 new AblationToggles. 8-PR migration plan over ~6.5 eng-days, single `federation=false` kill switch for rollback. Orthogonal to IDC six control planes; adds 7th "topology" dimension on top |
| Memory Unification | [docs/architecture/agent-memory-unification.md](./docs/architecture/agent-memory-unification.md) | **Proposed (2026-04-24)**. Unifies Journal / ConversationRecord / Compact / Memory (四合一). Journal promoted to SSOT; ConversationRecord becomes lazy Projection cache; Compact events become first-class Journal entries (compaction is reversible); SessionMemory concept deleted (never actually persisted); Semantic Memory pipeline closes the loop (Journal events → KeyFactExtractor → MemoryRouter → `.neko/memory.md`). Unified `conversationId = workDirHash-ulid`. 9-PR migration over ~6 eng-days. Closes agent-unified-workflow.md §已延后 "`.nksession.md` 会话摘要" + enables SelfEvaluationHooks §11.6.9 loop-closure |
| Agent Async Task Lifecycle | [docs/architecture/adr-agent-async-task-lifecycle.md](./docs/architecture/adr-agent-async-task-lifecycle.md) | **Proposed (2026-05-13)**. TaskManager 后台运行分析：Webview 显隐不影响任务执行；Extension deactivate 时 running 任务悬空（P0 dispose 不 cancel/flush）；Webview 重建后不主动同步已完成任务（P1 投递丢失）；waitForCompletion busy-wait（P2）；AI SDK 同步任务无 recovery（P3）。4-PR 改进计划。 |
| Provider Expression Context | [docs/architecture/adr-provider-expression-context.md](./docs/architecture/adr-provider-expression-context.md) | **Proposed (2026-04-24, implemented 2026-04-26)**. Handles three input-side differences across generation models (Syntax Dialect / Semantic Literacy / Training Distribution Bias). Provider as independent abstraction (M:N with Skill); ProviderCard three-part markdown (Syntax Profile / Concept Coverage / Training Profile) + ProviderRouter + ProviderExpressionContext. **ProviderCard is a soft PromptFragment injected into the AGENT system prompt — not a deterministic prompt-replacement hook**. Three-layer card distribution (Built-in / Market / Project) + Layer 2 auto-evolution via Evaluator → ProjectMemoryRouter → `neko/providers/*.card.md`; `review-queue` mode supported. Tools record `providerAdaptation` metadata with mode `agentic` / `native` (no `translated`). New market category `provider-card` with `trustLevel` (core / community / untrusted) + signature gate. Kill switches: `providerCardAutoEvolve: false`, `providerAdaptationMode: 'native'`. Supersedes the removed `adr-provider-semantic-bridge.md` |
| AI Face Sculpting | [docs/architecture/adr-ai-face-sculpting.md](./docs/architecture/adr-ai-face-sculpting.md) | **Proposed (2026-05-07)**. Agent 捏脸三阶段演进：开环生成（P0）→ 闭环迭代（P1, Engine 截图）→ 多模态联合编辑。**API 优先 ONNX 备用**策略（`mlInferenceMode`）；领域模型 API 闭环（API→VLM→API：专业 API 感知/执行 + VLM 编排/验证）；MediaAdapter 扩展 ReplicateProcessingAdapter 统一接入分割/深度/超分/姿态/3D 等领域模型；ONNX 2026 不可整体替代（candle/burn 覆盖不足），Whisper→whisper-rs / CLIP→candle 可选迁移；附录 A 图片→2D/3D 管线 + 附录 B 内存预算 + 附录 C 63 场景对比 + 附录 D 领域模型 API 闭环 + 附录 E 2026 框架格局。 |
| Engine Interface & Pipeline Decoupling (Umbrella) | [docs/architecture/adr-engine-interface-pipeline-decoupling.md](./docs/architecture/adr-engine-interface-pipeline-decoupling.md) | **Proposed (2026-05-12)**. Umbrella index——引擎全面解耦审计（§1 接口审计 + §2 管线审计 + §6 组合场景 + §7 架构图）+ 6 个子 ADR 索引。详细设计见子 ADR。 |
| — PipelineSink + GPU-only 规则 | [docs/architecture/adr-engine-pipeline-sink.md](./docs/architecture/adr-engine-pipeline-sink.md) | **Proposed (2026-05-13)**. 子 ADR 1：PipelineSink trait + 5 种 Sink + GpuFrameLease RAII + StreamSink 单 Mutex + 平台差距表。P0（PR1+PR2+PR7）。 |
| — GpuEffect Registry + Audio Factory | [docs/architecture/adr-engine-effect-registry.md](./docs/architecture/adr-engine-effect-registry.md) | **Proposed (2026-05-13)**. 子 ADR 2：GpuEffect trait + HashMap 替代 match + AudioEffectFactory + EffectRegistry + ML 三阶段 + 插件桥接。P0-PR6 + P1 + P2-PR5。 |
| — Dual API + Scene 拆分 | [docs/architecture/adr-engine-dual-api-scene-split.md](./docs/architecture/adr-engine-dual-api-scene-split.md) | **Proposed (2026-05-13)**. 子 ADR 3：CreativeAccess + DataAccess 消除 18 处 ecs_world_mut() + SceneComputation/SceneRenderer 拆分。P0（PR3+PR4a+PR4b+PR5）。 |
| — GPU Budget Controller | [docs/architecture/adr-engine-gpu-budget.md](./docs/architecture/adr-engine-gpu-budget.md) | **Proposed (2026-05-13)**. 子 ADR 4：GpuBudgetController 帧时间 EMA 反馈 + Interactive>Export>Transcode 优先级 + 暂停策略。P2-PR1。 |
| — PuppetRenderer + WS 命令 | [docs/architecture/adr-engine-puppet-renderer.md](./docs/architecture/adr-engine-puppet-renderer.md) | **Proposed (2026-05-13)**. 子 ADR 5：PuppetRenderer wgpu SpriteBatch + WebSocket command envelope。P2（PR3+PR4）+ P3-PR1。 |
| — 预览子系统 + PanoramicRenderer | [docs/architecture/adr-engine-preview-subsystem.md](./docs/architecture/adr-engine-preview-subsystem.md) | **Proposed (2026-05-13)**. 子 ADR 6：三层预览架构 + PanoramicRenderer + PreviewProviderRegistry + 6 内建 Provider。P2（PR6a+PR6b+PR6c）+ P3-PR4。 |
| Puppet × Model 格式集成 | [docs/architecture/adr-puppet-model-format-integration.md](./docs/architecture/adr-puppet-model-format-integration.md) | **Proposed (2026-05-19)**. INP 废弃 MOC3 单线；Live2D zip bundle loader；NekoModelAPI + AgentCapabilityProvider（3 工具）；五类资产解耦管理（模型/动作/配置/音频/文本）+ Bundle 编排打包；单资产导出 + 统一实体导出 (.nkentity) + 素材包导出；puppet/model 统一实体搜索注册；Market InstallTarget 补全（7 个 mediaKind）；Voice pack + lip-sync + PSD→Puppet 远期路线。17-PR 迁移。 |
| Character Editing | *Internalized* | 2D/3D face sculpting/motion/drawing/modeling; standard facial parameter templates (3D 22 params / 2D 32 params); shared KeyframeTimeline; .nkm project format; IK bone interactive editing |
| Path System | *internalized* | Project files store only relative paths and `${VAR}/path`; PathResolver(@neko/shared L0) handles unified resolution; variable sources: neko/settings.json (media library, git-tracked) + .neko/settings.local.json (local overrides, gitignored); EngineClient/PreviewFileServer auto-expand variables before calling engine; Rust ProjectContext supports standalone CLI execution |
| Webview UI Design System | [docs/architecture/adr-webview-ui-design-system.md](./docs/architecture/adr-webview-ui-design-system.md) | **Proposed (2026-05-19)**. 13 个 webview 底层栈已统一（React 18 + Tailwind + Vite + Design Tokens + i18n）。组件层缺口：无 PropertyPanel/ColorPicker/NumberInput/TreeView/Dialog/Tooltip 抽象，6 包各自实现属性面板。方案：新建 `@neko/ui` Layer 0 包，shadcn/ui 源码模式 + Radix Primitives（基础控件 a11y）+ 创作领域自建（ColorPicker/NumberInput/PropertyPanel/TreeView/AssetBrowser/Canvas2DContainer）。渐进迁移 4 阶段 ~16d，@neko/shared re-export 保持兼容。 |
| Panorama Coverage & Cylindrical | [docs/architecture/adr-panorama-coverage-cylindrical.md](./docs/architecture/adr-panorama-coverage-cylindrical.md) | **Proposed (2026-05-20)**. 区分 180°/360° 全景 + 新增 cylindrical 投影类型。PanoramaCoverageAngle 元数据（horizontalDeg/verticalDeg）贯穿 TS 类型→Rust engine→WebGL shader→ViewStateController→UI。Cylindrical shader 线性透视纵向（无极点畸变）；GPano CroppedArea 字段解析自动计算 equirectangular 覆盖；柱状全景仅手动触发（不自动检测）；coverage-aware yaw/pitch clamping（FOV 联动）。6-PR 迁移 ~5.5d。 |
| Structured Data Persistence | [docs/architecture/adr-structured-data-persistence.md](./docs/architecture/adr-structured-data-persistence.md) | **Proposed (2026-05-20)**. JSON 保持 SSOT，SQLite + sqlite-vec 作为缓存层（`.neko/.cache/neko-cache.db`）。Rust sidecar 拥有 DB 连接（rusqlite），TS 通过 ActionRouter `cache:*` 命令族访问。结构化表 + FTS5 全文搜索 + sqlite-vec 向量 ANN 单 DB 全覆盖。数据三层分类：Tier 1 入库（素材库/实体绑定/关系图/生成物/对话日志/向量嵌入）、Tier 2 按需（proxy/task recovery）、Tier 3 永不入库（配置/项目文件/Memory）。四阶段：P0 基础设施 → P1 媒体索引 → P2 素材库+关系图 → P3 向量+对话。~16 PR。 |
| 3DGS Application Analysis | [docs/architecture/adr-3dgs-application-analysis.md](./docs/architecture/adr-3dgs-application-analysis.md) | **Proposed (2026-05-20)**. 3DGS 三维度分析：AI 视频参考（极高契合 L4+ControlNet，GEN3C/DiffSplat/MVControl 已验证）、骨骼动画（人体近可用 ASH/HuGS 80FPS，通用研究期）、场景分解（SAGA 4ms/LangSplat 文本驱动，中高成熟度）。核心定位：实拍场景照片级数字孪生，为 AI 视频提供几何控制信号。4 Phase 实施：P1 只读查看器+参考渲染 → P2 AI 视频管线集成 → P3 骨骼动画 → P4 分解+Agent 编辑。 |
| Deliverable Management | [docs/architecture/adr-deliverable-management.md](./docs/architecture/adr-deliverable-management.md) | **Proposed (2026-05-27)**. 声明式 `.nkdeliverables` Manifest + ExportProfile 预设体系（18 内建）+ DeliverableRecord 产出溯源。三执行环境：VSCode 交互/host-cli 无头/CI 云端。host-cli 新增 `deliverables` 子命令（render/list/verify）。DeliverableService 编排现有各模块 ExportService（零侵入）。原生 TreeView 面板。~13 PR ~15d。 |

### Rust Engine Development Constraints

neko-engine is a Rust sidecar process that communicates with the TS layer via N-API and HTTP/WebSocket. For detailed architecture, see [ARCHITECTURE.md](./ARCHITECTURE.md#2-extension-host--rust-enginen-api--http).

**Quick Reference**:
```
TypeScript Layer (Extension Host)
  <-> N-API Bindings (@neko-engine/host-napi)
  <-> HTTP/WebSocket (axum)
Rust Layer (neko-engine)
  +-- engine-kernel:   GPU rendering (wgpu + GPU Skinning), FFmpeg codec, audio/video processing
  +-- engine-types:    Shared Rust DTO types
  +-- runtime-scene:   3D scene ECS (bevy_ecs + glTF + IK + Animation Blend)
  +-- runtime-puppet:  2D skeletal ECS (bevy_ecs + MOC3 + Animation Blend)
  +-- runtime-device:  Device I/O (camera/mic via cpal, MIDI via midir, gamepad via gilrs)
  +-- runtime-ml:      ML inference (ONNX Runtime — upscale/denoise/CLIP/Whisper)
  +-- runtime-media:   Media domain logic (probe/diff/subtitle/JPEG — no GPU)
  +-- host-api:        ActionRouter, controllers, PluginManager
  +-- host-http:       REST API + WebSocket streaming
  +-- host-napi:       N-API bindings (cdylib)
  +-- host-cli:        CLI frontend
```

**Principle**: The Rust engine is the single source of truth for computation and data models. The TS layer must not duplicate Rust's computation logic or data transformations.

### GitHub MCP Integration

The project integrates a GitHub MCP server, providing full GitHub operation capabilities for automating development workflows:

**Core Capabilities**:

| Category | Tools | Purpose |
|----------|-------|---------|
| **Repository Management** | `search_repositories`, `create_repository`, `fork_repository`, `create_branch` | Repository discovery, creation, branch management |
| **Code Search** | `search_code`, `get_file_contents`, `list_commits`, `get_commit` | Cross-repo code search, file reading, commit history |
| **Issue Management** | `search_issues`, `issue_read`, `issue_write`, `add_issue_comment` | Issue creation, querying, updating, commenting |
| **PR Operations** | `search_pull_requests`, `pull_request_read`, `create_pull_request`, `update_pull_request`, `merge_pull_request` | Full PR lifecycle management |
| **Code Review** | `pull_request_review_write`, `add_comment_to_pending_review`, `request_copilot_review` | Code review, comments, AI review |
| **File Operations** | `create_or_update_file`, `delete_file`, `push_files` | Remote file modification (SHA required) |
| **Copilot Integration** | `create_pull_request_with_copilot`, `assign_copilot_to_issue`, `get_copilot_job_status` | AI-assisted development, automated tasks |

**Usage Guidelines**:

```
When to use GitHub MCP:
+-- Cross-repo code/documentation search
+-- Automated PR/Issue workflows
+-- Batch file operations (push_files for multi-file single commit)
+-- CI/CD status check integration
+-- Code review automation

When to use local Git:
+-- Day-to-day development commits (git commit/push)
+-- Branch switching and merging
+-- Local history viewing
+-- Interactive operations (rebase -i, add -p)
```

**Typical Scenarios**:

```typescript
// Scenario 1: Search for related implementation references
mcp__github__search_code({
  query: "EngineClient language:typescript org:neko-suite"
})

// Scenario 2: Batch update configuration files
mcp__github__push_files({
  owner: "neko-suite",
  repo: "neko-suite",
  branch: "main",
  files: [
    { path: "package.json", content: "..." },
    { path: "tsconfig.json", content: "..." }
  ],
  message: "chore: update build config"
})

// Scenario 3: Automated PR creation
mcp__github__create_pull_request({
  owner: "neko-suite",
  repo: "neko-suite",
  title: "feat: add new feature",
  head: "feature-branch",
  base: "main",
  body: "## Changes\n- ..."
})
```

**Important Notes**:
- `create_or_update_file` **requires** the correct `sha` when updating (obtain via `git rev-parse <branch>:<path>`)
- `push_files` is best for batch operations; prefer local git for single-file changes
- Ensure branches are pushed to remote before PR operations
- Code search results may not include the latest unpushed local changes

---

## 1. Architecture

### Quick Decision Flow

```
Receive task ->
+-- Understand requirements? NO -> Ask clarifying questions
+-- Needs design? YES (multi-module/new feature) -> Five-layer analysis
|                 NO (simple change) -> Implement directly
+-- After completion -> Tests + architecture diagram + documentation
```

### Three Architecture Questions (Must Answer)

```
Q1: Does it align with the existing architecture?  -> Maintain consistency
Q2: How to minimize coupling?                      -> Seek decoupling solutions
Q3: Is it easy to extend and test?                 -> Consider maintainability
```

### Five-Layer Analysis

```
1. Responsibility Analysis -> What is the core responsibility? Can it be split?
2. Dependency Analysis     -> Which modules does it depend on? Is the direction correct?
3. Interface Design        -> What abstractions are needed? Are interfaces focused?
4. Extension Analysis      -> Future extension directions? Does the design support them?
5. Test Verification       -> How to unit test? Are mocks needed?
```

### Decision Output Template

```
[Core Judgment] PASS / ADJUST / REDESIGN

[Key Insights]
- Responsibility division: [analysis]
- Dependency relationships: [analysis]
- Extensibility: [assessment]

[Implementation Steps]
1. Define interfaces and types
2. Implement abstraction layer
3. Write concrete implementations
4. Write tests
```

---

## 2. Design Principles

### SOLID Principles

```
S - Single Responsibility  -> One module does one thing
O - Open/Closed           -> Open for extension, closed for modification
L - Liskov Substitution   -> Subtypes must be substitutable for their base types
I - Interface Segregation -> Keep interfaces small and focused
D - Dependency Inversion  -> Depend on abstractions, not implementations
```

### Top-Down Design

```
System goal -> Subsystem decomposition -> Module responsibilities -> Interface definitions -> Implementation details

Example: Adding a "Video Export" feature
+-- L1: Determine workflow (encoder selection -> rendering -> writing)
+-- L2: Decompose modules (ExportService / Encoder / Writer)
+-- L3: Define interfaces (IEncoder.encode(), IWriter.write())
+-- L4: Implement concrete classes (H264Encoder, MP4Writer)
```

### Module Independence

```
Evaluation criteria:
+-- Cohesion: Internal elements are closely related
+-- Coupling: Inter-module dependencies are minimized
+-- Replaceability: Can the implementation be independently replaced?
+-- Testability: Can it be independently unit tested?

Metrics: dependency count < 5 | circular dependencies = 0
```

### Interface Contracts

```
Naming conventions:
+-- Interfaces: I + Noun (IMediaService, IEncoder)
+-- Abstract classes: Abstract + Noun (AbstractRenderer)
+-- Implementations: Noun + Suffix (H264Encoder, WebGLRenderer)

Contract elements: input types | output types | exception types | pre/post-conditions
```

### Decoupling Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| **Dependency Injection** | Inject dependencies via constructor/factory | Service classes, mock testing |
| **Abstract Interfaces** | Program to interfaces | Multiple implementations, replaceable components |
| **Registry Pattern** | Map/Registry for dynamic component management | Provider management, plugin systems |
| **Strategy Pattern** | Encapsulate algorithms as replaceable strategies | Encoders, routing, retry policies |
| **Event-Driven** | EventEmitter for decoupled communication | State changes, cross-module notifications |
| **AOP / Cross-Cutting** | Middleware/interceptors/hooks | Agent hooks, logging, retry, rate limiting |

```typescript
// Typical example: Dependency injection + interface abstraction
interface IEncoder { encode(data: Buffer): Promise<Buffer>; }

class ExportService {
  constructor(private encoder: IEncoder) {}  // Inject abstraction, not concrete implementation
  async export(data: Buffer) { return this.encoder.encode(data); }
}

// Inject concrete implementation at usage site
const service = new ExportService(new H264Encoder());
```

### Design Patterns (VSCode + TypeScript)

```
Decision guide:
Object creation: Unified entry -> Factory | Complex config -> Builder | Global singleton -> Singleton
Composition:     Incompatible APIs -> Adapter | Simplify subsystems -> Facade | Enhance behavior -> Decorator
Behavior:        Algorithm swap -> Strategy | Event notification -> Observer | Undo support -> Command
```

| Pattern | TypeScript Implementation | VSCode / Project Usage |
|---------|--------------------------|----------------------|
| **Factory** | Factory functions + generics | `createProvider<T>()` for AI Providers |
| **Builder** | Method chaining + Partial | `TimelineBuilder.addTrack().build()` |
| **Singleton** | Module-level instance export | `export const logger = new Logger()` |
| **Adapter** | Implement unified interface | `LLMAdapter` adapts Claude/OpenAI APIs |
| **Facade** | Aggregate multiple services | `MediaEngine` wraps codec complexity |
| **Decorator** | HOFs / class decorators | `@debounce()` `@memoize()` |
| **Strategy** | Interface + implementations | `IEncodingStrategy` encoding strategies |
| **Observer** | vscode.EventEmitter | `onDidChangeState` state changes |
| **Command** | Command objects + undo stack | `vscode.commands.registerCommand` |
| **Disposable** | vscode.Disposable | Resource cleanup, prevent memory leaks |

**VSCode-Specific Patterns** (required):
```typescript
// Disposable - Resource management
class MyService implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  activate() {
    this.disposables.push(vscode.commands.registerCommand('ext.cmd', () => {}));
  }
  dispose() { this.disposables.forEach(d => d.dispose()); }
}

// EventEmitter - Component communication
private _onDidChange = new vscode.EventEmitter<T>();
readonly onDidChange = this._onDidChange.event;
```

---

## 3. Development Standards

### Core Principle: Contract-First, Top-Down

```
Development order (must follow):
1. Design before implement   -> Draw architecture diagrams / write pseudocode
2. Abstract before concrete  -> interface -> abstract class -> impl
3. Contract before features  -> Define types/interfaces -> Implement method bodies
4. Top to bottom             -> High-level modules -> Low-level modules
```

### AI-Generated Code Requirements

| Prohibited | Alternative |
|-----------|-------------|
| `console.log` for debugging | Use project Logger |
| `any` type | `unknown` + type guards |
| Hardcoded config values | Config files or constants |
| Ignoring async errors | try-catch or .catch |
| `as Type` forced assertions | Type guard functions |

**ESLint Rules** (`eslint.config.mjs`):
- Production code: `@typescript-eslint/no-explicit-any: 'warn'` (warns but does not block)
- Test files: `'off'` (allows `as any` for mocks and test data)
- Test file patterns: `**/*.test.ts`, `**/*.spec.ts`, `**/__tests__/**`

### Common Pitfalls

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| **Webview State Loss** | State resets after switching tabs | `retainContextWhenHidden` or persist to Extension |
| **Async Race Conditions** | Data inconsistency from rapid operations | AbortController to cancel stale requests |
| **Memory Leaks** | Slowdown after prolonged use | Ensure all Disposables are properly cleaned up |
| **Circular Dependencies** | Runtime undefined errors | Check import order; extract shared types to shared package |
| **postMessage Lost** | Webview doesn't receive messages | Ensure Webview is ready before sending |

### Reusable Resources

Before implementing new features, check existing resources:
```
packages/neko-types/src/           -> Shared types, utilities, Logger, i18n, Theme
packages/neko-types/src/types/     -> Type definitions (includes mediaEngine subdirectory)
packages/neko-client/src/          -> Streaming client (H264/PCM/fMP4)
packages/neko-proto/               -> Protobuf IDL (type contract source of truth)
packages/neko-cut/packages/webview/src/components/  -> Video editor UI components
packages/neko-cut/packages/webview/src/hooks/       -> React Hooks
packages/neko-agent/packages/platform/src/          -> AI platform services (LLM routing)
```

### TODO Conventions

In contract-first development, use TODO markers for pending implementations:

```typescript
// Correct: Define complete interface first, mark implementation with TODO
interface IExportService {
  export(timeline: Timeline, options: ExportOptions): Promise<ExportResult>;
  cancel(): void;
}

class ExportServiceImpl implements IExportService {
  async export(timeline: Timeline, options: ExportOptions): Promise<ExportResult> {
    // TODO: implement encoding pipeline
    // TODO: implement progress tracking
    throw new Error('Not implemented');
  }

  cancel(): void {
    // TODO: implement cancellation logic
  }
}

// Wrong: Designing as you go, incomplete interface
class ExportService {
  export(timeline: any) {  // Unclear types
    // Making up the interface as you implement...
  }
}
```

**TODO Priority Markers**:
```typescript
// TODO(P0): Blocking feature, must implement immediately
// TODO(P1): Core feature, complete in current iteration
// TODO(P2): Enhancement, can be deferred
// TODO: General task
```

### Scenario 1: Adding a New Feature

```
[Analysis]
+-- Core responsibilities + impact scope + dependency relationships
+-- Draw module interaction diagram

[Design] (Contract-first)
+-- Step 1: Define types (types.ts)
+-- Step 2: Define interfaces (interface.ts)
+-- Step 3: Abstraction layer skeleton + TODO markers
+-- Step 4: Implement TODOs one by one

[Implementation] (Top-down)
+-- High-level module orchestration logic
+-- Mid-level business logic
+-- Low-level utility functions
+-- Tests + documentation
```

### Scenario 2: Refactoring Code

```
[Diagnosis]
+-- Principle violations + specific issues + severity
+-- Identify parts that need abstraction

[Plan] (Abstract first, then replace)
+-- Step 1: Extract interfaces without changing implementation
+-- Step 2: Create new implementation classes
+-- Step 3: Gradually migrate callers
+-- Step 4: Remove old code

[Verification] Tests pass + functionality intact
```

### Scenario 3: Bug Fixing

```
[Locate] Symptom + root cause + impact scope
[Fix] Change location + specific solution + test verification
[Prevent] Unit tests + boundary checks + documentation updates
```

### Code Organization Order

Arrange code within files from most abstract to most concrete:

```typescript
// 1. Type definitions (most abstract)
interface IService { ... }
type Options = { ... }

// 2. Abstract implementation
abstract class BaseService implements IService { ... }

// 3. Concrete implementation
class ConcreteService extends BaseService { ... }

// 4. Utility functions (most concrete)
function helper() { ... }

// 5. Exports
export { ConcreteService, type IService, type Options }
```

---

## 4. Testing Standards

### Testing Workflow

```bash
pnpm build         # 1. Compile and build
pnpm test          # 2. Unit tests (Vitest)
pnpm check         # 3. Code quality (Knip + dependency-cruiser)
# Rust: cd packages/neko-engine && cargo test
```

### Testing Strategy

- **Unit Tests**: Test modules in isolation, mock external dependencies
- **Integration Tests**: Verify module interactions and interface contracts
- **Architecture Tests**: Validate dependency direction and detect circular dependencies

### Coverage Configuration

Vitest coverage for all packages is centrally managed via `vitest.shared.ts` (reporters + exclude patterns). Each package's `vitest.config.ts` references the `sharedCoverage()` function and can pass overrides as needed.

### Code Quality Tools

```bash
pnpm check:unused    # Knip - Detect unused files/exports/dependencies (config: knip.config.ts)
pnpm check:deps      # dependency-cruiser - Architecture rule validation (config: .dependency-cruiser.cjs)
pnpm check           # Run both
```

**dependency-cruiser Enforced Rules** (see `.dependency-cruiser.cjs` for details):
- `no-circular`: No circular dependencies allowed
- `layer0-no-internal-deps`: Layer 0 packages have zero internal dependencies
- `webview-no-vscode`: Webview must not import vscode
- `extension-no-react`: Extension must not import React
- `no-cross-extension-deps-*`: Extension packages must not depend on each other

---

## 7. Checklist

### Pre-Completion Review

**Architecture**
- [ ] Follows SOLID principles
- [ ] Modules are fully decoupled with no circular dependencies
- [ ] Dependency direction is correct (high-level does not depend on low-level implementations)

**Code**
- [ ] Contract-first: interfaces/types defined before implementation
- [ ] Top-down: high-level modules -> low-level modules
- [ ] Clear naming, comprehensive error handling
- [ ] No `any` types, no `console.log`, no `as Type` forced assertions

**Code Review Criteria**
- [ ] Excellent: Follows SOLID, clear module boundaries, easy to extend
- [ ] Acceptable: Functional, room for improvement
- [ ] Problematic: Violates principles, needs refactoring
- [ ] Critical defects: SRP violation | circular dependencies | high-level depends on low-level | missing abstractions

**Documentation**
- [ ] README updated per hybrid strategy (L1 has Context Summary)
- [ ] Complex sequences/state machines use Mermaid; everything else uses plain text

**Testing**
- [ ] Build passes: `pnpm build`
- [ ] Tests pass: `pnpm test`
- [ ] Code quality checks pass: `pnpm check`
- [ ] New interfaces have corresponding unit tests

---

## Final Reminder

```
+========================================+
|  Before writing code, ask three        |
|  questions:                            |
|  1. Does it align with the existing    |
|     architecture?                      |
|  2. How to minimize coupling?          |
|  3. Is it easy to extend and test?     |
|                                        |
|  Not sure? Draw an architecture        |
|  diagram first.                        |
+========================================+
```
