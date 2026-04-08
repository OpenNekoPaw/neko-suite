# TODO

> **Lang:** English | [中文](./TODO_CN.md)

> Active task list for the current iteration. For the long-term roadmap, see [ROADMAP.md](./ROADMAP.md).
> Server-side tasks live in the [neko-hub](../neko-hub) repo; this file only tracks the client (VSCode extensions).

---

## 🔵 Phase 1 — Core Features + Infrastructure

> Goal: Stability + core experience + AI capability completion

### ✅ Sprint 1 Complete (2026-04-06)
- [x] **neko-agent**: `puppetFaceTools.ts` `readFileSync` → `fs.promises.readFile`
- [x] **neko-engine**: HTTP global admission `Semaphore(8)` + codec `Semaphore(4)` + GPU `Semaphore(2)` + `ServiceOverloaded` 503 error code
- [x] **neko-assets**: Search L0 persistent index (`.neko/.cache/search-index.json` + FileSystemWatcher incremental updates) + QuickPick type filter buttons (5 categories) + MAX_RESULTS 50→200
- [x] **neko-preview**: EPUB outline TreeView (`EpubOutlineProvider` depth→hierarchical tree + Explorer sidebar + `neko.epubEditorActive` context-controlled visibility)
- [x] **neko-cut**: AI actions `ai-background-remove` + `ai-smart-crop` (delegated to neko-agent cloud AI, reusing the `generateForNode` pattern)
- [x] **Cross-module**: DragDropBroker (Agent `dnd:start` → Extension payload staging → Canvas/Cut `dnd:drop` → `importAsset`/`importGeneratedClip`; `ImageGridCard` draggable)

### To Do

### neko-engine (Engine)
- [ ] New actions: `documents:text-extract` / `models:clip-embed` / `text:stats` (not yet in the action registry)

### neko-assets (Asset Management)
- [ ] Search enhancement follow-ups:
  - [ ] P0: Project directory resource search
  - *L1-L3 cache + P1/P2 search features depend on new Engine actions; will proceed once engine work is done*

### Cross-module
- [ ] **Cross-domain linking**: Script→media references / asset path completion
- [ ] `neko://` protocol (ADR design only; depends on server-side)
- [ ] Git LFS integration

### Waiting on Backend
- [ ] neko-market: Registry Server integration (client UI 100% ready)
- [ ] neko-auth: End-to-end verification (client code 100% ready)

---

## 🟡 Phase 2 — Creative Tools + UX Enhancements

### neko-preview (Document Format Extensions)
- [ ] XLSX preview (x-data-spreadsheet)
- [ ] PPTX preview (LibreOffice headless)
- [ ] FDX preview (XML parsing + Fountain-style rendering)
- [ ] Thumbnail caching

### neko-canvas
- [ ] Install jsPDF + JSZip to unlock PDF/ZIP storyboard export
- [ ] Basic template system (needs to be built from scratch; commands not yet registered)
- [ ] **CanvasEmbedNode** (type exists; needs UI component)
- [ ] Character consistency — IP-Adapter reference injection
- [ ] Scene background consistency — ControlNet injection

### neko-cut
- [ ] AI action `ai-auto-edit` (needs to define "auto-edit" semantics)
- [ ] AI action `ai-match-music` (needs beat detection + scene matching)

### neko-story
- [ ] Storyboard image generation (needs Agent integration)

### neko-agent
- [ ] MCP reconnection backoff (exponential backoff + circuit breaker)
- [ ] **P1-1: Pipeline media landing unification** — `MediaGeneratorAdapter` returns remote URLs; chat main path saves locally + indexes assets. Need shared `MediaPersistenceService` or adapter-level alignment
- [ ] **CapabilityProvider context extension** — extend `AgentCapabilityContext` to carry `platform` services, unblocking Canvas/Sketch/Story/CutVideo migration
- [ ] **24 TODO(P1) Tools** — blocked on neko-cut API expansion (8 timeline + 7 effects + 2 color + 3 audio) and new model capabilities (4 generation)

### neko-tools
- [ ] Whisper ASR Diff + Demucs source separation
- [ ] Detail polish + theme refinements

### neko-audio (Audio Workstation)
- [ ] Enhanced test coverage (currently 78 tests; core features complete)

### neko-sketch (2D Painting)
- [ ] **Transform tool implementation**: rotation/scale/skew (currently UI shell only)
- [ ] S.4 P2: `style_transfer` / enhanced cross-module integration

---

## 🔴 Phase 3 — Professional Editing Capabilities

### neko-puppet (2D Skeletal Animation)
- [ ] Export functionality: INP writer (currently read-only editor)
- [ ] Advanced physics: cloth constraints + collision detection
- [ ] × neko-live deep integration: Puppet as real-time VTuber avatar driver

### neko-model (3D Editing)
- [ ] IK UI exposure: backend 482-line FABRIK is complete; needs frontend TransformGizmo interaction
- [ ] Undo/Redo state machine
- [ ] AI MCP Tools: `face.generate_params` / `face.from_image` / `face.adjust`
- [ ] Phase 3.5: Blender MCP bridge / 3DGS loader / rapier3d physics

### neko-live (VTuber Livestreaming)
- [ ] Phase 5.1.3: Camera + MediaPipe (needs nokhwa crate)
- [ ] Phase 5.2: Calibration system + audio/video merging + import into neko-cut timeline
- [ ] Phase 5.3: Live streaming (RTMP/SRT → OBS)

---

## 🟣 Long-term

- [ ] VR/AR immersive creation (Phase 7)
- [ ] Interactive video creation (Phase 8)

---

## ✅ Bugs / Critical Issues (Found in 2026-04-06 audit; all fixed)

### P0 — Broken Functionality (Fixed)
- [x] **neko-cut**: `commands/index.ts` — added missing `import * as path from 'path'`
- [x] **neko-cut**: `resolveElementSourcePath()` — implemented `ctx.params.sourcePath` priority + `_documentUri` fallback; updated 6 call sites

### P1 — Test Failures (Fixed)
- [x] **neko-engine**: `router.rs:385` — updated MODELS actions assertion to 11 items → **132/132 passing**
- [x] **neko-preview**: `extension.test.ts` — added EventEmitter + languages + createTreeView + onDidChangeActiveTextEditor mocks; `StatusBarManager.test.ts` — added ID parameter → **115/115 passing**

---

## 📋 Technical Debt

### Dead Code / Stubs
- [ ] neko-engine: CanvasController 3 actions (composite/capture/export) return "not implemented"
- [ ] neko-engine: 10+ unused imports + 9 unused functions/structs (compiler warnings)
- [ ] neko-canvas: `neko.template.apply/save` registered in package.json but no implementation code (empty commands)
- [ ] neko-cut: 7 package.json commands with no corresponding implementation

### Blocking I/O (3 high-risk items fixed; remaining low-risk items kept)
- [x] neko-agent: `extensionTools.ts:771` `writeFileSync` ZIP → `fsp.writeFile` (20-500ms blocking eliminated) ✅
- [x] neko-agent: `system-prompt-builder.ts:210` `existsSync+readFileSync` → `fsp.readFile` (2-5ms blocking eliminated) ✅
- [x] neko-agent: `generatedAssetIndex.ts:58` `load()` → async + timer flush → `flushAsync()` (dispose retains sync atomic write per VSCode lifecycle requirements) ✅
- [ ] neko-agent: `generatedAssetIndex.ts` `flushSync()` dispose path retains sync (VSCode lifecycle requirement; cannot be async)
- [ ] neko-types: `config-reader.ts` writeConfigFile/readConfigFile sync (public API; needs new async variants, low priority)

### Type Safety
- [ ] neko-types: 54 remaining `any` type occurrences

### Infrastructure Consistency (2026-04-06 audit; mostly fixed)

**i18n** (5/10 → 7/10):
- [x] neko-preview: added `package.nls.json` (EN + ZH-CN, 19 keys) + package.json `%key%` references ✅
- [x] neko-auth: added `package.nls.json` (EN + ZH-CN, 6 keys) ✅
- [ ] Extension Host: adopt `vscode.l10n.t()` uniformly (still 9/14 not using it; non-blocking — nls files already cover package.json strings)

**Shared Component Duplication** (4/10 → 5/10):
- [x] useDragDrop / useVSCodeMessaging / useKeyboardShortcuts duplication marked with TODO ✅ (actual extraction deferred; high risk, low reward)

**Error Handling** (7/10 → 9/10):
- [x] audio / preview / live / story — 4 extensions connected to VSCodeErrorHandler ✅ (new `utils/errorHandler.ts` + `activate()` call)

**Context Menus** (6/10 → 9/10):
- [x] neko-agent `package.json`: added editor/context .fountain menu entries (summarizeDocument + chatWithDocument) ✅

**Test Coverage** (5/10 → 7/10):
- [x] neko-audio: `console.error()` → `logger.error()` (audioProjectStore.ts, 4 occurrences) ✅
- [x] neko-tools: vscode mock — added `extensions.getExtension` ✅
- [ ] 4 extensions with zero TS tests: puppet / engine(TS) / live / model(TS) (low priority)

### neko-engine Architecture (2026-04-08 restructuring complete)

**Completed**: R0 (8 crate semantic rename) → R1 (runtime-device) → R2 (runtime-ml) → R3 (runtime-media) → P1 (PluginManager MVP) → cleanup (delete duplicate device/ml code, remove midir/gilrs/ort deps) → P0 fix (video_diff ffmpeg-next) → P1 fix (runtime-media independent). 11 crates, 758 tests. Zero external CLI dependencies.

**Resolved**:
- [x] **P0: video_diff.rs ffmpeg CLI** — rewritten to ffmpeg-next filter graph API (filter::Graph + buffer/buffersink for ssim/psnr). No external binary dependency.
- [x] **P1: media_service 循环依赖** — runtime-media 自包含（自定义 MediaError + ffmpeg-next 直接解码音频），engine-kernel 单向依赖 runtime-media
- [x] **PluginManager semver** — semver crate VersionReq matching（^, ~, >=, =, ranges）
- [x] **PluginManager activation handler** — PluginActivationHandler trait for enable/disable lifecycle
- [x] **RuntimeDescriptor trait** — RuntimeRegistry 动态 runtime 发现
- [x] **ServiceContainer 删除** — EngineApi 已接管服务装配

**Remaining tech debt**:
- [ ] media_service/ 在 engine-kernel 和 runtime-media 中仍有副本（后续可委托给 runtime-media）
- [ ] generate_diff_video (blend) 为 stub（需 encode+mux pipeline，使用频率低）

### Other
- [ ] Probe cache merge: MediaProbeCache (neko-tools) + MediaMetadataCache (neko-assets) → unified
- [ ] Linux/Windows NV12 export zero-copy
- [ ] `apply_custom_tex_fallback()` CPU round-trip → GPU compute
- [ ] E5 Engine-aware modules: depth/normal/pose/edge local ONNX extraction
- [ ] Quality assessment enhancements: VMAF / FFT / long-video segmentation / semantic audio
- [ ] neko-types: 54 remaining `any` type occurrences

### Content Provenance (C2PA) — Deferred
> Analyzed 2026-04-07: not needed now; revisit when regulations or users demand it.
- [ ] Export pipeline post-processing hook (muxer 后置签名切入点)
- [ ] `GeneratedAsset.provenance` field (AI generation tool/model/params traceability)
- [ ] `c2pa-rs` integration + `ExportConfig.sign` option + certificate/key management
- **Why deferred**: product is local creative tool (not distribution platform); C2PA is voluntary standard; core features still in active development; no legal mandate yet
- **Trigger to re-evaluate**: EU AI Act enforcement requiring AI content labeling, or user/partner explicit request

**Scan baseline**: `pnpm build` ✅ 28/28 | `pnpm test` pre-existing failures | `pnpm lint` 0 error ✅ | **0 circular dependencies** ✅

---

<details>
<summary>📦 Completed Task Archive (click to expand)</summary>

### ✅ P0 — GPU Pipeline Zero-Copy
- macOS full-chain zero-copy (GpuProcessor/GpuPipeline dead code removed)

### ✅ P1 — Shader Completion
- Curves / Color Wheels / HSL / Sharpen / Chroma Key / Luma Key all implemented

### ✅ P2 — Enhanced Features
- Shapes (tiny-skia, 6 shape types) + audio silence detection UI

### ✅ P2.5 — AI Media Editing Capabilities (E1-E4 + E2.5 + E6)
- Type extensions + fal.ai/DashScope/Kling adapters + Cut AI Handler + Canvas editing UI

### ✅ P2.5b — AI Media Quality Assessment System
- VisionEvaluator + VideoFrameEvaluator + AudioEvaluator + ConsistencyEvaluator + quality-checker SubAgent

### ✅ P2.5c — Agent Tools/Skills/MCP Enhancements
- Tool concurrency safety + Coordinator + Creative Memory + JSONL persistence

### ✅ P2.5d — Storyboard Creation Pipeline + Cross-Extension Collaboration
- ShotNode/SceneGroupNode/GalleryNode + GenerationPromptPanel + BatchScheduler + 7 MCP Tools + Agent Context Protocol

### ✅ P2.5e — Character Editing Rust Engine Phase 2
- Puppet/Scene keyframe CRUD + animation blending + EasingType 30+ variants (91 tests)

### ✅ P2.5f — Character Editing Template Creation + P0/P1/P2 Engine API
- Template creation + Visible/Opacity/MorphWeights/Material/DeleteNode API + texture hot-swap + physics simulation + editor UI (231 tests)

### ✅ Technical Debt (Resolved)
- ESLint upgrade + i18n expansion + neko-agent type/Logger dedup + ONNX cross-platform packaging

### ✅ Phase 1 Sprint 1 (2026-04-06)
- puppetFaceTools `readFileSync` → async + Engine Semaphore(8/4/2) + Assets search L0 persistent index + type filters + EPUB outline TreeView + Cut AI background-remove/smart-crop + DragDropBroker

### ✅ P0+P1 Agent Architecture (2026-04-08)
- **P0-1**: AgentCapabilityProvider protocol (interface + CapabilityDiscoveryService hybrid manifest/command discovery + neko-cut demo migration)
- **P0-2**: TOOL_NAMES constants (44 tools, 11 categories) + Builtin Skill naming drift fix (31 unregistered tools removed) + SkillService runtime validation
- **P0-3**: toolBootstrap.ts extraction + capabilityBootstrap.ts + index.ts simplified to orchestration
- **P1-2**: Quality check audio/video dependency injection (EngineAudioAnalyzerAdapter + EngineFrameExtractorAdapter wired into pipeline-bootstrap)
- **P1-3**: Default media models (DALL-E 3 / Sora / TTS-1 / Jukebox) + defaultMediaModels config for open-box media generation

</details>

---

*Last updated: 2026-04-08 (+ Agent P0/P1 architecture refactor completed)*
