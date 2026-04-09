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

### neko-cut (Video Editing) — P0-1: Field Consistency
> [ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md) — Scores: 7/10 basic, 5.5/10 complete. Critical gaps in export chain.
- [ ] **Transition field naming unification**: audit `inTransition` vs `transitionIn` across Property Panel write / Preview composite read / Export Service; choose canonical name and update all paths
- [ ] **Effects export chain**: `effects: []` currently empty in export; implement `EffectInstance` → `EffectParams` schema mapping; verify color correction + mask export
- [ ] **Edit/Preview/Export field consistency**: ensure all element types have matching field reads across edit-time, preview-time, and export-time
- [ ] Export round-trip test suite: edit → preview → export → reimport consistency check

### neko-canvas (Storyboard) — P0-2: Protocol Fixes
> [ADR](./docs/architecture/canvas-role-boundary.md) — Current 80%. Protocol inconsistencies block Agent→Canvas reliability.
- [ ] **Fix `nodes.update`/`nodes.create` protocol inconsistency**: audit Extension→Webview calls; unify to `{ nodeId, data }` for update, `{ type, position, data }` for create; update all Agent tools that call `canvas_update_node`/`canvas_create_node`
- [ ] **Fix message channel consistency**: audit `canvasOperationStore` VSCode API exposure; unify Webview-side VSCode API calls through single wrapper; ensure `operationApplied` event fires reliably + dirty tracking
- [ ] **Complete result review cycle**: define canonical field for selected candidate (`generationHistory.selected`); implement `onSelectCandidate` handler; sync selected → node state → store → `generatedAsset` field

### neko-agent (AI Assistant) — P0-2: Webview Architecture
> [ADR](./docs/architecture/neko-agent-webview-optimization.md) — Score 7.5/10. Top-level controller bloat + weak message contracts.
- [ ] **Decompose `AIAssistant` component** (~589 lines) → `AppShell` + `ConversationController` + `ChatWorkspace`
- [ ] **Unify outbound message gateway**: all Webview→Extension through `VSCodeMessages` builder; prohibit direct `vscode?.postMessage(...)` in component code; retrofit `SendToMenu.tsx`, `TaskCard.tsx`, etc.
- [ ] **Strengthen inbound message types**: define `ExtensionToWebviewMessage` discriminated union; update `MessageHandler`/`MessageHandlerRegistry` signatures for compile-time safety

### neko-engine (Engine)
- [ ] New actions: `documents:text-extract` / `models:clip-embed` / `text:stats` (not yet in the action registry)
- [ ] Integrate `effects:register` / `models:register` into unified plugin lifecycle (PluginManager P1 follow-up)

### neko-assets (Asset Management)
- [ ] Search enhancement follow-ups:
  - [ ] P0: Project directory resource search
  - *L1-L3 cache + P1/P2 search features depend on new Engine actions; will proceed once engine work is done*

### Cross-module
- [ ] **Cross-domain linking**: Script→media references / asset path completion
- [ ] `neko://` protocol (ADR design only; depends on server-side)
- [ ] Git LFS integration
- [ ] **Remove `CreativeGridView` from neko-story** (ADR-1: image generation belongs entirely in canvas)

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
- [ ] **Strengthen `SceneGroupNode` semantics**: true semantic container + scene-level batch operations + shot ordering + auto-layout
- [ ] **First-class input nodes**: toolbar buttons for script/document/model reference nodes; support drag-from-file-tree/marketplace
- [ ] **Node renderer registry**: replace hardcoded `switch(node.type)` with `NodeRendererRegistry`; allow external registration
- [ ] **CanvasEmbedNode** (type exists; needs UI component)
- [ ] Character consistency — IP-Adapter reference injection
- [ ] Scene background consistency — ControlNet injection

### neko-cut
- [ ] AI action `ai-auto-edit` (needs to define "auto-edit" semantics)
- [ ] AI action `ai-match-music` (needs beat detection + scene matching)
- [ ] **Subtitle system consolidation**: single data model + editing entry; .srt/.vtt → subtitle track not text track; integrate SubtitlePanel into main workspace
- [ ] **Pause-time composite expansion**: extend high-quality composite to text/subtitle/shape/scene3d elements
- [ ] **Asset library integration**: embed asset panel as dockable pane in editor (currently separate Webview)
- [ ] **Ripple editing completeness**: extend `rippleEditingEnabled` to insert/drag/trim/split operations

### neko-story
> [ADR](./docs/architecture/story-agent-canvas-boundary.md) — Story-Agent-Canvas Pipeline
- [x] **ScriptIndex upgrade**: stable `sceneId` + `sceneTitle`/`location`/`timeOfDay` + `sceneCharacters[]` + `actionSummary` + `estimatedDuration`
- [x] **Lightweight storyboard table**: `ScriptTableView` with Agent/Canvas status columns + scene-level action buttons
- [x] **Two code paths**: Path A mechanical + Path B semantic (story→agent→canvas ShotPlan); `flowF` standard entry via `neko.story.startVideoCreation`
- [x] Agent tools: `GetScriptIndex` + `SearchScriptIndex` + `GenerateScenePlan` / `GenerateShotPlan`
- [x] Upgrade `import_script_to_canvas` to semantic ShotPlan import via `createStoryboardPayload` / `applyStoryboardPayloadToCanvas`
- [ ] Upgrade `canvasStatus = opened` from button-driven to canvas real-time event write-back

### neko-agent
- [ ] MCP reconnection backoff (exponential backoff + circuit breaker)
- [ ] **P1-1: Pipeline media landing unification** — `MediaGeneratorAdapter` returns remote URLs; chat main path saves locally + indexes assets. Need shared `MediaPersistenceService` or adapter-level alignment
- [x] **CapabilityProvider context extension** — extended `AgentCapabilityContext` with `mediaService`/`configManager`/`embedFn`; all sub-packages migrated
- [ ] **24 TODO(P1) Tools** — blocked on neko-cut API expansion (8 timeline + 7 effects + 2 color + 3 audio) and new model capabilities (4 generation)
- [ ] **Zustand state management migration**: replace hook/ref architecture with Zustand stores (conversation, UI, config, resources, skills, context); align with neko-cut/canvas/model Webview pattern
- [ ] **Subdivide `InputAreaContext`** → `ModelContext` + `MentionContext` + `GenerationContext` to reduce re-render blast radius
- [ ] **RichContentBlock registry** ([ADR §6.2](./docs/architecture/agent-media-architecture.md)): define `RichContentBlock` type + `RichContentRegistry` (kind→component mapping) + `ContentBlockRenderer` integration; implement storyboard / media_card / comparison / form / data_table kinds
- [ ] **`mediaPreprocessor.ts`** ([ADR-7](./docs/architecture/agent-media-architecture.md)): image resize if >1568px/>4MB; video keyframe extraction via EngineClient (max 8 frames); store in `.neko/preprocessed/`
- [ ] **Fix Context Chip consumption**: distinguish file-level vs content-level chips in `InputArea.tsx`
- [ ] **Unify Explorer "Send to Agent"**: replace 4 existing implementations with unified `sendFileChip(uri, intent, typeOverride?)`
- [ ] **`parse_script_to_shots` refactor** (ADR-2): extract as agent-internal step (zero canvas deps), separate from `create_canvas_storyboard`

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

### neko-engine (Engine Plugin Expansion)
> [ADR](./docs/architecture/engine-plugin-rfc.md) + [Runtime Layering](./docs/architecture/engine-runtime-layering.md)
- [ ] Extract `runtime-format` crate (decouple file format probing from engine-kernel)
- [ ] Create FormatRegistry / DeviceRegistry / ExporterRegistry / PreviewRegistry (plugin-extensible registries)
- [ ] Connector plugin support (external sidecar/remote runtime declarations + health check + state sync)

### neko-live (VTuber Livestreaming)
- [ ] Phase 5.1.3: Camera + MediaPipe (needs nokhwa crate)
- [ ] Phase 5.2: Calibration system + audio/video merging + import into neko-cut timeline
- [ ] Phase 5.3: Live streaming (RTMP/SRT → OBS)

---

## 🟤 Phase 3.6 — Cross-Extension Semantic Layer

> Goal: Unified entity identity + multimodal version management. Independent from core editing, builds on top of Phase 1-3 foundations.

### Unified Entity Identity System
> [ADR](./docs/architecture/adr-character-unified-index.md) — Characters → Scenes → Objects progressive entity binding
- [ ] **P1: Structure closure** — `characters.json` contract + read/write service + JSON schema; add `characterId` to `GalleryNode`/`ShotCharacter`/`GeneratedAsset`; `CharacterWorkspaceIndex` service; script name→characterId resolution
- [ ] **P1: Generation lineage** — auto-inherit `characterId` when generating from annotated ShotNode/GalleryNode; `registryId` field on Asset Entity; update `import_script_to_canvas` to populate character bindings
- [ ] **P2: CreativeEntityGraph + OccurrenceIndex** — entity/occurrence/asset/canvas-node/script-range/timeline-element/media-segment node types; confirmed/inferred edges with provenance; unified Definition/References/Hover queries
- [ ] **P2: Scene & Object extension** — `sceneId` binding model (SceneGroupNode↔script scene); `objectId` for items/props; replicate character binding for objects
- [ ] **P3: Rule matching + text vectors** — filename/alias/tag matching; `CharacterMatchSuggestion` with confidence; text embedding index for descriptions/prompts
- [ ] **P3: Multimodal vector enhancement** — image/face/video keyframe/speaker embedding; multimodal candidate recall; vector results default to `inferred`

### Multimodal Git Integration
> [ADR](./docs/architecture/adr-multimodal-git-integration.md) — 6-phase plan for Git + multimodal version management
- [ ] **P1: Git integration baseline** — `.gitattributes` template for media files; connect `MediaDiff` viewer to SCM panel; display basic media change summaries
- [ ] **P2: CLI diff driver** — `neko-diff` CLI tool; format-specific summaries replacing `Binary files differ`
- [ ] **P3: JSON semantic diff** — semantic diff schema for `characters.json`/`library.json`; `JsonSemanticDiff` analyzer; Webview review panel
- [ ] **P3: Entity impact analysis** — connect JSON diff to CreativeEntityGraph; "affected characters/scenes/objects" view; back-jump to Definition/References
- [ ] **P4: Commit-level semantic review** — aggregated entity changes across multifile commits; confirmed vs inferred change distinction

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

*Last updated: 2026-04-08 (+ architecture doc analysis: P0 cut/canvas/agent field consistency + Phase 3.6 Entity Identity & Git Integration)*
