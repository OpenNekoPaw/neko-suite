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

### ✅ Sprint 2 Complete (2026-04-09)
- [x] **neko-canvas**: P0-1~P0-5 fully converged — `nodes.update`/`nodes.create` protocol unified + message channel encapsulation + result review closed loop (`generationHistory.selected`) + `SceneGroupNode` upgraded to semantic container (shot management/ordering/auto-layout/batch generation) + creation entries covered (script/document/model/canvas-embed picker + drag-in)
- [x] **neko-canvas**: P1-1 `CanvasEmbedNode` minimal landing (type + outline + webview rendering + picker entry)
- [x] **neko-canvas**: P1-4 `NodeRendererRegistry` first round landing (replaced core render dispatch hardcoding; new node types extensible via registry)
- [x] **neko-canvas**: Asset proxy boundary converged (restricted proxy impl + `timelineSync` minimal write-back contract)
- [x] **neko-story**: Scene workflow state persistence (`StorySceneStateStore` + `workspaceState` cross-session) + semantic storyboard pipeline entry `neko.story.startVideoCreation` + scene/shot planning tools + canvas handoff
- [x] **neko-agent**: Fountain pipeline routed through scene planning + semantic storyboard canvas import pipeline

### To Do

### neko-cut (Video Editing) — P0-1: Field Consistency
> [ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md) — Scores: basic editing 8/10, complete workflow 6.5/10.
- [x] **Transition field naming unification**: `transitionIn/transitionOut` as canonical fields; legacy `inTransition/outTransition` retained for read-compat
- [x] **Effects export chain**: `effects / colorCorrection / masks` export conversion complete (EffectInstance→EffectParams + mask shape validation + animation baseValue fallback)
- [x] **Edit/Preview/Export field consistency**: element `speed/reverse/timeRemap` consistent across pause/playback/export; global `playbackSpeed` vs element-level `speed` layering clarified
- [ ] Export round-trip test suite: edit → preview → export → reimport consistency check

### neko-canvas (Storyboard) — Convergence Enhancements
> [ADR](./docs/architecture/canvas-role-boundary.md) — P0 fully converged; entering P1 enhancement phase.
- [ ] Continue converging peripheral bridge interfaces (keep `nodes.update/create` unified contract stable)
- [ ] Message semantic refinement (new message types extend tool layer first, not direct global object access)
- [ ] Batch candidate comparator + stronger review UI experience
- [x] `NodeRendererRegistry` extension: metadata, icons, default sizes, property panel schema converge into registry
- [ ] `asset` namespace boundary cleanup: push `neko-assets` to provide formal extension API, replace command-level proxy

### neko-agent (AI Assistant) — P0-2: Webview Architecture
> [ADR](./docs/architecture/neko-agent-webview-optimization.md) — Score 7.5/10. Top-level controller bloat + weak message contracts.
- [x] **Decompose `AIAssistant` component** (~589 lines) → `AppShell` + `ConversationController` + `ChatWorkspace`
- [x] **Unify outbound message gateway**: all Webview→Extension through `VSCodeMessages` builder; prohibit direct `vscode?.postMessage(...)` in component code; retrofit `SendToMenu.tsx`, `TaskCard.tsx`, etc.
- [x] **Strengthen inbound message types**: define `ExtensionToWebviewMessage` discriminated union; update `MessageHandler`/`MessageHandlerRegistry` signatures for compile-time safety

### neko-engine (Engine)
- [ ] New actions: `documents:text-extract` / `models:clip-embed` / `text:stats` (not yet in the action registry)
- [ ] Integrate `effects:register` / `models:register` into unified plugin lifecycle (PluginManager P1 follow-up)
- [ ] **Headless CLI export**: `host-cli export --input a.nkv --output a.mp4 --format mp4 --resolution 1080p` (CI/CD 基础, host-cli 已有入口)
- [ ] **Batch render API**: `POST /v1/batch/render` — 模板 + 数据实例数组 → 队列并行渲染 → N 个视频输出
- [ ] **.nkv 模板变量绑定**: `{{variable}}` 槽位标记 + JSON 数据源替换 + 校验 — 支持 text/media/puppet/scene3d/emotion 变量

### neko-assets (Asset Management)
- [ ] Search enhancement follow-ups:
  - [ ] P0: Project directory resource search
  - *L1-L3 cache + P1/P2 search features depend on new Engine actions; will proceed once engine work is done*

### Cross-module
- [ ] **Cross-domain linking**: Script→media references / asset path completion
- [ ] `neko://` protocol (ADR design only; depends on server-side)
- [ ] Git LFS integration
- [ ] **Remove `CreativeGridView` from neko-story** (ADR-1: image generation belongs entirely in canvas)
- [ ] **SceneSpec 统一场景描述**: @neko/shared 定义 SceneSpec 类型 (environment + characters + props + camera + effects) — 替代 Scene3DElement 碎片字段, 所有 Stage 共用
- [ ] **EffectSpec 统一特效描述**: @neko/shared 定义 EffectSpec 类型 (layers + params + scope + emotionBinding) — 替代 EffectInstance, 支持多渲染后端 (wgpu/Three.js/CSS)
- [ ] **ExpressionSpec 统一表情描述**: @neko/shared 定义 ExpressionSpec 类型 (原子通道 + 复合预设 ~30 个 + blendMode + micro noise) — 统一 VRM/Live2D/ARKit 表情, 支持 EmotionArc 连续混合
- [ ] **LightSpec 光照标准**: 嵌入 SceneSpec (ambient IBL + directional/point/spot + shadow + postProcess AO/Bloom/Fog + emotionBinding)
- [ ] **格式兼容 P0 — BVH 动捕适配**: bvh_adapter (BVH ↔ SemanticMotion, 骨骼名映射) — 解锁 Mixamo/CMU/专业动捕生态
- [ ] **格式兼容 P0 — LUT 色彩预设**: cube_adapter (.cube/.3dl ↔ EffectSpec LUT) — 解锁 DaVinci/调色生态
- [ ] **格式兼容 P0 — HDR 环境贴图**: hdr_adapter (.hdr/.exr → LightSpec IBL texture) — 解锁 PBR 光照生态
- [ ] **格式兼容 P1 — VMD 动画**: vmd_adapter (.vmd ↔ SemanticMotion + ExpressionSpec + CameraKeyframe) — 解锁 MMD 社区动作库
- [ ] **视频→动作/表情提取**: 视频逐帧 MediaPipe Pose + FaceMesh (ONNX) → SemanticMotion + ExpressionSpec[] → .nkmotion 保存 — "拍一段视频→驱动任何角色"
- [ ] **图片→2.5D 分层场景**: Depth Anything v2 + SAM 分割 (ONNX) → 前景/中景/背景分层 → SceneSpec + parallaxFactor → 单张图片变可运镜场景
- [ ] **视频→场景全分解**: SceneDetect 分镜 + Demucs 音频分轨 + Whisper 字幕 + 动作/表情/运镜提取 → 一段视频→完整结构化项目
- [ ] **VoiceSpec + TTS viseme 驱动**: VoiceSpec 类型 (ttsProvider + voiceId + visemeMode) 绑定角色; TTS 输出 viseme 时间戳 → ExpressionSpec viseme 通道 additive 叠加
- [ ] **CharacterAgent 人设框架**: 基于 neko-agent SubAgent — persona + 独立 memory + 结构化 LLM 输出 (emotion/action/text) + VoiceSpec + ExpressionStyle 绑定
- [ ] **CharacterBundle 角色打包**: .nkchar 格式 (model + motions{} + expressions{} + voice + agent) — 可发布 marketplace, 拖入场景即用
- [ ] **StoryBinding 剧本绑定**: .nkbind 格式 (角色名→CharacterBundle + 场景标题→SceneSpec + 情绪词→ExpressionSpec + 动作词→SemanticMotion + 运镜/配乐默认规则) — 松耦合 ID 引用, 资产可独立替换
- [ ] **SeriesSpec 连载系列**: .nkseries 格式 (sharedAssets + stateContract 跨集变量契约 + episodes[] 依赖 DAG) — 支持增量发布/跨集蝴蝶效应/向后兼容
- [ ] **PlayerSave 存档系统**: 每玩家×每系列独立存档 (progress + currentState + characterMemories) — 跨集状态持久化 + 角色 Agent 记忆保留
- [ ] **MemoryAnchor 记忆锚点系统**: 不可回溯的经历节点 (fact Ground Truth + 多角色 perspectives + anchor_rules) + 信息分层解锁 (Layer 0-5) + NPC 对话发掘 + 记忆衰退/重构 — CharacterAgent perspectiveFilter 注入 LLM, 角色只知道自己的视角
- [ ] **SemanticMotion 录制**: neko-live VMC/MediaPipe 数据 → 逐帧缓冲 → smooth/denoise → 保存为 .nkmotion + 同步 WAV 音频 — 动捕从"实时驱动"升级为"可编辑资产"
- [ ] **动捕曲线编辑**: .nkmotion 在时间线上逐通道曲线编辑 (平滑/裁剪/循环/多段拼接 crossfade)
- [ ] **.nkmotion → 时间线**: 拖入 puppet/scene3d track → 角色按动捕表演 + 叠加 ExpressionSpec + viseme

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
- [x] ~~**Strengthen `SceneGroupNode` semantics**~~: upgraded to semantic container (shot management/ordering/auto-layout/scene-level batch generation)
- [x] ~~**First-class input nodes**~~: script/document/model/canvas-embed picker + Explorer drag-in complete
- [x] ~~**Node renderer registry**~~: `NodeRendererRegistry` replaced core render dispatch hardcoding (first round; metadata/schema extension see Phase 1 P1)
- [x] ~~**CanvasEmbedNode**~~: type + outline + webview rendering + picker entry complete
- [ ] Character consistency — IP-Adapter reference injection
- [ ] Scene background consistency — ControlNet injection

### neko-cut
- [x] **PuppetElement + puppet track**: PuppetElement 类型 (src/animationClip/expression/parameterOverrides) + 'puppet' TrackType + Rust ElementType::Puppet + TimelineElementContent UI
- [ ] **runtime-puppet → GpuLayer 桥接**: engine-kernel 中 runtime-puppet 渲染到 RGBA 纹理 → GpuLayer, 插入 gpu_export_pipeline ③④ 之间 — 实现 2D+3D+视频同管线合成
- [ ] **Camera Keyframe Track**: 摄像机关键帧轨道 (position/target/fov 随时间插值) + 预设运镜模板 (推拉摇移跟升降) — 支持 3D 场景运镜直出视频
- [ ] **NPR 后处理 (3 渲 2)**: Cel Shading (色阶化光照) + Outline (描边, 法线/深度边缘检测) compute shader — 支持 3D 人物 + 2D 场景风格统一
- [ ] AI action `ai-auto-edit` (needs to define "auto-edit" semantics)
- [ ] AI action `ai-match-music` (needs beat detection + scene matching)
- [x] **Subtitle system consolidation**: subtitle track/element unified data model; PropertyPanel + inline SubtitlePanel dual entry; .srt/.vtt/.ass drag-in creates subtitle track
- [x] **Pause-time composite expansion**: text/subtitle/shape via Webview overlay; scene3d retains engine seek frame
- [x] **Asset library integration**: main workspace left dock panel (Assets + Subtitles tabs)
- [x] **Ripple editing completeness**: ripple covers delete/insert/paste/trim(trimToPlayhead)/split/same-track drag; remaining: multi-select combo + insert/overwrite mode toggle + left-trim/cross-track drag edge rules
- [ ] **Advanced time editing**: visual speed curve / time remap UI / slip-slide-roll edit

### neko-story
> [ADR](./docs/architecture/story-agent-canvas-boundary.md) — Story-Agent-Canvas Pipeline
- [x] **ScriptIndex upgrade**: stable `sceneId` + `sceneTitle`/`location`/`timeOfDay` + `sceneCharacters[]` + `actionSummary` + `estimatedDuration`
- [x] **Lightweight storyboard table**: `ScriptTableView` with Agent/Canvas status columns + scene-level action buttons
- [x] **Two code paths**: Path A mechanical + Path B semantic (story→agent→canvas ShotPlan); `flowF` standard entry via `neko.story.startVideoCreation`
- [x] Agent tools: `GetScriptIndex` + `SearchScriptIndex` + `GenerateScenePlan` / `GenerateShotPlan`
- [x] Upgrade `import_script_to_canvas` to semantic ShotPlan import via `createStoryboardPayload` / `applyStoryboardPayloadToCanvas`
- [x] **Scene workflow state persistence**: `StorySceneStateStore` as unified source of truth + `workspaceState` cross-session persistence + pipeline event state write-back
- [ ] Upgrade `canvasStatus = opened` from button-driven to canvas real-time event write-back

### neko-agent
- [ ] MCP reconnection backoff (exponential backoff + circuit breaker)
- [ ] **P1-1: Pipeline media landing unification** — `MediaGeneratorAdapter` returns remote URLs; chat main path saves locally + indexes assets. Need shared `MediaPersistenceService` or adapter-level alignment
- [x] **CapabilityProvider context extension** — extended `AgentCapabilityContext` with `mediaService`/`configManager`/`embedFn`; all sub-packages migrated
- [ ] **4 TODO(P1) Generation Tools** — remaining model capabilities: `GenerateCharacter` / `TransferStyle` / `EnhanceVideo` / `OptimizeAudio`
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
- [x] **Live2D (.moc3) import support** — clean-room implementation (Phase 0-5 complete, 2026-04-14)
  - [x] Phase 0: Remove inox2d ghost dependency (RUSTSEC-2022-0081 resolved)
  - [x] Phase 1: Self-built MOC3 binary parser + loader + 1D key form interpolation
  - [x] Phase 2: WarpDeformer (bilinear grid) + RotationDeformer (pivot rotation)
  - [x] Phase 3: Expression (.exp3.json) + Motion (.motion3.json → AnimationClip) + Physics (.physics3.json → SimplePhysics)
  - [x] Phase 4: Extension .moc3 file type registration + webview drag-drop + i18n
  - [x] Phase 5: Face tracking mapping enhancement (ParamBody/Breath/Cheek/EyeSmile + LIVE2D_PARAM_ALIASES)
- [ ] **Phase 6**: AI-assisted puppet creation — `PuppetListExpressions` + `PuppetSetExpression` agent tools, template import UI ([plan](./docs/development/neko-puppet-moc3-support.md#phase-6))
- [ ] **Phase 7**: VTube Studio API compatibility — WebSocket endpoint for VTS plugin interop ([plan](./docs/development/neko-puppet-moc3-support.md#phase-7))
- [ ] Export functionality: MOC3 writer (currently read-only editor; INP format deprecated — legacy read-only support retained)
- [x] **motion3/exp3 标准格式导出**: `serialize_motion3()` + `serialize_expression3()` + `export_motion3`/`export_expression3` API actions (round-trip tested)
- [ ] **2D 可复用动作资产**: 独立表情/动作预设集 (存 Live2D 标准参数名) — 支持跨 MOC3 模型复用 + marketplace 分享
- [ ] Advanced physics: cloth constraints + collision detection
- [ ] × neko-live deep integration: Puppet as real-time VTuber avatar driver

### neko-model (3D Editing)
- [ ] IK UI exposure: backend 482-line FABRIK is complete; needs frontend TransformGizmo interaction
- [ ] Undo/Redo state machine
- [ ] AI MCP Tools: `face.generate_params` / `face.from_image` / `face.adjust`
- [ ] Phase 3.5: Blender MCP bridge / 3DGS loader / rapier3d physics
- [x] **glTF animation 回写**: `exporter.rs` animation channel 导出 (samplers + channels + accessors, 覆盖 Translation/Rotation/Scale/MorphWeights)
- [x] **VRM BlendShape preset 元数据导出**: `build_vrm_extensions()` VRMC_vrm 1.0 (preset/custom 分类 + extras.defaultWeight); morphTargetBinds 为空 — 需 loader 扩展存储 morph target name→index 映射后补全
- [ ] **3D 可复用动作资产**: 独立动画资产格式 (存 VRM Humanoid bone name 而非 node ID) + 骨骼重定向 retargeting — 支持动作跨 VRM 模型复用 + marketplace 分享

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

### ✅ Sprint 2 — Canvas Convergence + Story Pipeline (2026-04-09)
- **neko-canvas**: P0-1~P0-5 fully converged (protocol unification + message encapsulation + review closed loop + SceneGroupNode semantic container + creation entry coverage) + P1-1 CanvasEmbedNode + P1-4 NodeRendererRegistry + asset proxy boundary + timelineSync write-back contract
- **neko-story**: Scene workflow state persistence (StorySceneStateStore + workspaceState) + semantic storyboard entry + scene/shot planning tools + canvas handoff
- **neko-agent**: Fountain pipeline routed through scene planning + semantic storyboard canvas import pipeline

</details>

---

*Last updated: 2026-04-15 (neko-agent Webview P0 complete: AppShell/ConversationController/ChatWorkspace split + typed message protocol + unified outbound gateway; neko-canvas NodeTypeDescriptor unified registry)*
