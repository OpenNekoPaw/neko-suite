# Neko Suite Roadmap

> **Lang:** English | [中文](./ROADMAP_CN.md)

> The project is currently in **Alpha stage**. The core triangle (Engine + Cut + Agent) is operational and under rapid iteration.
> For detailed task lists, see [TODO.md](./TODO.md). Server-side tasks are tracked in the [neko-hub](../neko-hub) repository.

---

## Development Status Overview

> **Phasing strategy**: Phase 1 focuses on core functionality + infrastructure, ensuring the AIGC video creation pipeline is usable end-to-end. Phase 2 completes the creative toolset. Phase 3 expands professional editing capabilities.

### Phase 1: Core Functionality + Infrastructure (Current Focus)

> Goal: Complete AIGC video creation loop (script → storyboard → editing → export) + AI-driven + asset management + marketplace ecosystem

| Module           | Status | Progress | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **neko-engine**  | Alpha  | 98%      | GPU rendering + codec + export + HTTP/WS + device proxy + ONNX ML inference + full color/keying pipeline + keyframe/animation blending + character editing API + **concurrency guard Semaphore(8/4/2) ✅** + **3D rendering control plane ✅** + configurable log levels                                                                                                                                                                                                                                                                                       |
| **neko-agent**   | Alpha  | 99%      | **0 TODOs**, 1957+ tests, 300+ files; 7 LLM + 10 media adapters + MCP + Coordinator + SubAgent + Creative Memory + quality assessment + Webview P0 complete + **IDC Unified Workflow Phase A+B+closure ✅** + **multimodal perception pipeline ✅** + **rich content delivery ✅** + **runtime boundary hardening ✅** (workflow evaluation harness, feedback loops, boundary adapters) + **dead code cleanup ✅** (13 unused bridges/routes removed); remaining: MCP reconnection backoff + P1 Zustand migration + ask-mode decoupling ([ADR](./docs/architecture/agent-unified-workflow.md)) |
| **neko-cut**     | Alpha  | 95%      | **~65K LOC**, 50+ commands; AI Handler 14/16 actions; **P0 closed**; subtitle/ripple editing/playback speed/effects export complete; remaining: export round-trip tests + ai-auto-edit/ai-match-music + advanced time editing ([ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md))                                                                                                                                                                                                                                                          |
| **neko-story**   | Alpha  | 95%      | **0 TODO(P0)**, 155+ tests; 8 LSP Providers + Fountain parser + 3 preview views + ScenePlan/ShotPlan planners + StorySceneStateStore cross-session persistence; Story→Agent→Canvas semantic pipeline fully operational ([ADR](./docs/architecture/story-agent-canvas-boundary.md))                                                                                                                                                                                                                                                                           |
| **neko-canvas**  | Alpha  | 93%      | 13 node types + BatchGenerationScheduler + 7 MCP Tools; **P0 fully converged** ✅ + P1-1 CanvasEmbedNode + P1-4 NodeRendererRegistry + **NodeTypeDescriptor registry** ✅ + **scene-shot thumbnail mode + management UI ✅**; remaining P1 enhancements ([ADR](./docs/architecture/canvas-role-boundary.md))                                                                                                                                                                                                                                                  |
| **neko-preview** | Alpha  | 88%      | 6 editor types + waterfall layout + Content→Agent + **EPUB outline TreeView ✅** + **panoramic image preview (WIP)**; Phase 1 remaining: FDX + panoramic; Phase 2: XLSX/PPTX ([ADR](./docs/architecture/adr-panoramic-image-preview.md))                                                                                                                                                                                                                                                                                                                     |
| **neko-assets**  | Alpha  | 88%      | Pure TreeView architecture + ThumbnailService + **search L0 persistent index + type filtering + 200 limit ✅**; remaining: L1-L3 cache (depends on new Engine actions)                                                                                                                                                                                                                                                                                                                                                                                       |
| **neko-market**  | Alpha  | 90%      | **~4.4K LOC**; full React Webview + market-core 58 tests + **plugin governance hardening ✅** (registry contract alignment); remaining: Registry Server integration (neko-hub)                                                                                                                                                                                                                                                                                                                                                                                |
| **neko-auth**    | Alpha  | 90%      | Full OAuth 2.0 + PKCE implementation (OAuthClient + TokenManager + NekoAuthService + VscodeTokenStorage), 0 TODOs, 43 tests; remaining: backend end-to-end verification                                                                                                                                                                                                                                                                                                                                                                                      |
| **neko-tools**   | Alpha  | 72%      | **~15K LOC**; image/video/audio diff + silence detection + metadata viewer; remaining: polish                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **neko-types**   | Alpha  | 93%      | Shared types + unified cross-cutting concerns + type-safe Operations + **device/tracking/preview contracts ✅**                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **neko-client**  | Alpha  | 82%      | H264/fMP4/PCM streaming client + EngineClient HTTP dispatch + **device client classes (WIP)** + **perception facade ✅**                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **neko-proto**   | Stable | 100%     | timeline.proto + diff.proto complete IDL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Phase 2: Creative Tools Completion

> Goal: Audio workstation + 2D painting capabilities, expanding creative scenario coverage

| Module          | Status | Progress | Description                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **neko-audio**  | Alpha  | 72%      | **0 TODOs**, ~9.1K LOC, 78 tests; waveform + spectrum + 12-type effect chain + multi-track skeleton + microphone; **missing**: multi-track P0 UI (marker lane / clip drag / track header / recording closure) + P1 Mixer/Automation + P2 Bus/Stem/Comping ([ADR](./docs/architecture/neko-audio-workstation-assessment.md))                                  |
| **neko-sketch** | Alpha  | 68%      | **~14K+ LOC**; brush engine + pressure sensitivity + layers + selection + AI tools + cross-module workflow + **PSD import + AI bridge ✅** + **.nks migration ✅**; **missing**: P0 core tools (adjustment layers / layer masks / lasso / alpha lock) + transform tools + 2D lighting system ([ADR](./docs/architecture/sketch-feature-gap-analysis.md), [ADR](./docs/architecture/sketch-2d-lighting.md)) |

### Phase 3: Professional Editing Capabilities

> Goal: 3D/2D character editing + VTuber live streaming, targeting professional users

| Module          | Status | Progress | Description                                                                                                                                                                                                                                                                         |
| --------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **neko-puppet** | Alpha  | 92%      | **8.5K LOC** + 104 Rust tests; **MOC3 loading** (clean-room parser/deformers/expressions/motions/physics) + INP legacy read-only + parameter deformation + animation blending + 60fps streaming + Canvas rendering + **Live Mode (WIP)**; remaining: AI tools (Phase 6) / VTS API (Phase 7) / MOC3 export |
| **neko-model**  | Alpha  | 87%      | **12.6K LOC** + 49 Rust tests; glTF/VRM + PBR/IBL + CSG + face sculpting + particles + keyframes + **viewport orbit/pan/zoom ✅** + **3D rendering pipeline fixes ✅** + **i18n complete ✅** + **engine rendering control plane ✅** + **Live Mode (WIP)**; remaining: IK UI / Undo / Blender bridging |
| **neko-live**   | Alpha  | 58%      | **~3K LOC** + 0 tests; VMC+VRM + Puppet integration + recording + **LiveSessionService (WIP)** + **TrackingService extraction (WIP)**; **blocked**: nokhwa crate / MediaPipe / streaming ([ADR](./docs/architecture/adr-device-management.md))                                                        |

### Meta Package

| Module         | Status | Progress | Description                       |
| -------------- | ------ | -------- | --------------------------------- |
| **neko-suite** | Stable | 90%      | Extension Pack + Release workflow |

---

## Phase 1: Core Editing Capabilities ✅

> Completed: 2026-03-05

Engine GPU rendering + codec + export. Cut timeline + preview + EditOperation. Client streaming. Types 50+ shared types.

---

## Phase 2: AI-Driven Creation ✅ (~95%)

> Remaining: MCP client reconnection backoff (low priority)

<details>
<summary>Completed items</summary>

- Phase 3 architecture refactor (AgentExecutor unified loop + SessionInitializer + IPermissionManager + SkillInjection rollback)
- Media tool integration (GenerateImage/Video/Music/TTS — 4 tools)
- AI SDK migration (@ai-sdk/openai,google,anthropic v3)
- Pipeline Hook Registry + storyboard → batch video → timeline (6 Flow types)
- Conversation persistence CLI `--resume` / `/resume`
- AI subtitle generation (Whisper timestamps + TranscribeAudio + NekoCutAPI subtitle)
- Auto scoring (sceneToMusicSkill)
- SSO integration + AccountBar + OnboardingFlow
</details>

### AI Media Editing Capabilities (E1-E4 + E2.5 + E6 ✅, E5 TODO)

- ✅ E1: Media type extensions (ControlMode/IPAdapterReference/image-edit/video-edit + ImageRequest 5 fields + VideoRequest 8 fields)
- ✅ E2: fal.ai ControlNet Adapter (queue-based API, Flux + ControlNet/IP-Adapter, composite taskId)
- ✅ E2.5: Cut AI Action Handler (12 action routes + remove-silence wired to EngineClient.detectSilence)
- ✅ E3: DashScope Adapter (Qwen-Image 2.0 + Wan 2.7 unified adapter, camera code movements + first/last frame + instruction editing)
- ✅ E4: OpenAICompat Kling enhancement (generateVideo +8 camera parameters, generateImage +5 ControlNet parameters)
- ⏳ E5: Engine perception module (depth/pose/edge local ONNX)
- ✅ E6: Canvas editing UI (GenerationPromptPanel + ControlNet/Video parameters + context menu extensions)

### Media Quality Assessment System ✅

> [ADR](./docs/architecture/media-quality-assessment.md)

- ✅ Image/video/audio quality assessment (VisionEvaluator + VideoFrameEvaluator + AudioEvaluator)
- ✅ Cross-scene consistency (ConsistencyEvaluator: CLIP fast-screening + Vision LLM precision evaluation + character tracking)
- ✅ Deterministic remediation mapping (RemediationPlanner 15 categories → ToolSet invocations)
- ✅ quality-checker SubAgent + qualityGate Pipeline stage + `/quality-check` Skill
- ⏳ Enhancements: VMAF / FFT / long video segmentation / semantic audio assessment (requires Engine Rust extensions)

### Agent Tools/Skills/MCP Enhancements ✅

> [ADR](./docs/architecture/agent-tool-skill-enhancement.md)

- ✅ Tool concurrency safety + Schema validation + Shell replacement + Paths conditional triggers
- ✅ Auto-Compact + Progress Streaming + MCP robustness
- ✅ Coordinator multi-stage orchestration + Creative Memory + JSONL persistence + Prompt Cache

### Cross-Extension AI Integration ✅

> See [ARCHITECTURE.md](./ARCHITECTURE.md#跨扩展-ai-联动)

- ✅ `neko.agent.generateForNode` / `reportGenerationProgress` / `registerSlashCommands` / `internalChat` command registration
- ✅ `ISkillProvider` (neko-canvas 3 skills + neko-cut 2 skills) + `ListPluginSkills` Agent Tool
- ✅ Agent Context Protocol (`neko.agent.sendContext` + story-selection / canvas-selection payload + AgentContextChip UI)
- ✅ `NekoCutAPI.ai.generateVideoForClip` + cross-extension story/canvas/cut data flow

### Deferred Items

- MCP bridging to professional tools (Blender / ComfyUI / Photoshop → Phase 3.4)
- SubAgent Skills (Seed_Manager / Audio_Mixer / Camera Language)
- Smart asset recommendations + scene description assistance

---

## Phase 3: Visual Enhancement + 3D Capabilities (~88%)

### neko-engine GPU Effect Pipeline ✅

> Completed: 2026-03-27 (Phase 3 GPU zero-copy refactor)

- Zero-copy texture-to-texture effect chain (ping-pong Rgba8Unorm, macOS full pipeline zero-copy)
- Complete color correction pipeline: basic adjustments + Curves (5×256 LUT) + Color Wheels (3-way color wheel) + HSL (8-hue independent adjustment) + 3D LUT (.cube)
- Sharpen / Blur / Vignette / Film Grain / Glow / Chromatic Aberration
- Chroma Key ✅ + Luma Key ✅
- Shape element rendering ✅ (tiny-skia CPU rasterization → GPU upload; 6 shape types + fill/stroke/shadow/gradient)

### neko-story — Storyboard System ✅

- ✅ Script view (ScriptTableView): dynamic character columns + shot scale/camera movement/emotion/scene tag full-field table editing
- ✅ Creative view (CreativeGridView): card grid + image generation status + click triggers GenerationPromptPanel
- ✅ ShotNode data types (@neko/shared): `ShotScale` / `ShotCharacter[]` / `GeneratedImageVersion[]` / `CameraMovement`
- ✅ Storyboard export to neko-cut timeline (`neko.cut.importStoryboard` postMessage→webview)
- ✅ neko-story → Agent collaboration (right-click "→ Agent" context injection + `neko.story.applyInlineDiff`)

### neko-canvas — Storyboard + AI Collaboration ✅ (P0 Fully Converged)

> [Role Boundary ADR](./docs/architecture/canvas-role-boundary.md) — canvas as semantic orchestration layer

- ✅ ShotNode + SceneGroupNode (horizontal scene container)
- ✅ GenerationPromptPanel (inline image generation dialog, delegates to neko-agent.generateForNode, ADR-2D-007)
- ✅ GalleryNode (5 layouts + single/batch generation + costumeLabel + @references)
- ✅ AutoPrompt (`neko.agent.buildPrompt`: scene context → structured English prompt + preview editing)
- ✅ BatchGenerationScheduler (maxConcurrent=2 + exponential backoff + AbortController + progress reporting)
- ✅ 7 Canvas MCP Tools (`canvas_list/get/update/create_node` + `generate_image/batch` + `set_project_generation_config`)
- ✅ ScriptNode (TOC directory + getScriptIndex navigation) / DocumentNode (PDF/DOCX/EPUB cover thumbnails) / ModelNode (reference/workflow dual mode)
- ✅ `import_script_to_canvas` MCP Tool (screenplay → SceneGroupNode + ShotNode chain)
- ✅ Agent Context Protocol (`neko.agent.sendContext` + AgentContextChip + canvasAmbientContext system injection)
- ✅ **P0-1: Protocol consistency** — `nodes.update`/`nodes.create` unified contract (update `{ nodeId, data }`, create `{ type, position, data }`)
- ✅ **P0-2: Message channel encapsulation** — webview VSCode API converged to unified tool layer; `operationApplied` + dirty tracking stable
- ✅ **P0-3: Result review closed loop** — `generationHistory.selected` as unified source of truth; ShotNode/GalleryNode candidate switching UI
- ✅ **P0-4: SceneGroupNode semantic container** — shot management/ordering/auto-layout/scene-level batch generation
- ✅ **P0-5: Creation entry coverage** — script/document/model/canvas-embed picker + Explorer drag-in
- ✅ **P1-1: CanvasEmbedNode** — type + outline + webview rendering + picker entry
- ✅ **P1-4: NodeRendererRegistry** — replaced core render dispatch hardcoding; new nodes extensible via registry
- ✅ **P1: Asset proxy boundary** — converged to `neko-assets` restricted proxy + `timelineSync` minimal write-back contract
- ✅ `.nkc-ops` operation history persistence + AI source filter
- ✅ **P1: `NodeTypeDescriptor` unified registry** — labels/icons/defaultSize converged into single descriptor per node type; PropertyPanel labels + nodeFactory sizes migrated; property panel renderers remain in PropertyPanel (circular dep constraint)
- ✅ **P1: Scene-shot thumbnail mode** — thumbnail rendering + management UI for scene-shot overview; managed shots hidden from minimap
- [ ] P1: `asset` namespace cleanup (push `neko-assets` to provide formal extension API)
- [ ] P2: Batch candidate comparator + stronger review UI
- [ ] P2: Character consistency (@reference assets → IP-Adapter reference injection)
- [ ] Node performance optimization (on-demand; current DOM/SVG approach is sufficient)

### neko-cut — Timeline Editing Capabilities (P0/P1/P2 Basics Closed)

> [Assessment ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md) — Scores: basic editing 8/10, complete workflow 6.5/10

- ✅ **P0: Transition field naming** — `transitionIn/transitionOut` as canonical, legacy compat retained for read
- ✅ **P0: Effects export chain** — effects/colorCorrection/masks export conversion complete
- ✅ **P0: Edit/Preview/Export consistency** — element speed/reverse/timeRemap + global playbackSpeed layering clarified
- ✅ P1: Pause-time composite expansion (text/subtitle/shape Webview overlay + scene3d engine seek frame)
- ✅ P1: Subtitle system consolidation (unified track/element model + PropertyPanel/inline dual entry + .srt/.vtt/.ass drag-in)
- ✅ P1: Asset library integration (main workspace left dock panel)
- ✅ P1: Playback speed control (0.1x-4x + PreviewControls UI + stream speed message contract)
- ✅ P1: Element-level speed/reverse/copy/split-keep-sides (formal operation chain + context menu)
- ✅ P2: Ripple editing baseline (delete/insert/paste/trim/split/same-track drag)
- [ ] P2: Ripple editing refinement (multi-select combo + insert/overwrite mode + left-trim/cross-track edge rules)
- [ ] P2: Advanced time editing (slip/slide/roll edit + visual speed curve/time remap UI)
- [ ] P2: Export round-trip test suite
- [ ] Native composite protocol extension (current text/subtitle/shape use Webview overlay)
- [ ] **P2: 2D+3D+Video 联动合成**:
  - [ ] `PuppetElement` + `puppet` track type — Live2D/MOC3 角色作为时间线图层
  - [ ] runtime-puppet → GpuLayer 桥接 (渲染到 RGBA 纹理 → gpu_export_pipeline 合成)
  - [ ] Camera Keyframe Track (position/target/fov 关键帧插值 + 运镜预设模板)
  - [ ] NPR 后处理 shader (Cel Shading + Outline 描边) — 3 渲 2 风格化渲染
  - [ ] 支持 4 种组合：2D角色+3D场景 / 3D角色+2D场景 / 2D+3D+视频混合 / 3D 运镜直出视频

### neko-agent — Webview Architecture Optimization (P0 Complete ✅)

> [ADR](./docs/architecture/neko-agent-webview-optimization.md) — Score 7.5/10 → P0 resolved

- ✅ **P0: Decompose `AIAssistant`** (~589 LOC) → `AppShell` + `ConversationController` + `ChatWorkspace`
- ✅ **P0: Unify outbound message gateway** — all Webview→Extension through `VSCodeMessages` builder; 9 files migrated, zero direct postMessage
- ✅ **P0: Strengthen inbound types** — `ExtensionToWebviewMessage` discriminated union (38 types) + typed handlers across 10 domain files
- [ ] P1: Zustand state management migration (align with cut/canvas/model Webview pattern)
- [ ] P1: Subdivide `InputAreaContext` → `ModelContext` + `MentionContext` + `GenerationContext`
- [ ] P2: Message tracing (trace ID injection + structured audit trail)

### neko-story — Story-Agent-Canvas Pipeline ✅ (Semantic Pipeline End-to-End)

> [ADR](./docs/architecture/story-agent-canvas-boundary.md) — Clarifies story/agent/canvas responsibilities

- ✅ ScriptIndex upgrade (stable `sceneId` + sceneTitle/location/timeOfDay + sceneCharacters[] + actionSummary + estimatedDuration)
- ✅ Lightweight storyboard table (agent status + canvas status columns + scene-level actions)
- ✅ Two code paths — Path A mechanical + Path B semantic (story→agent→canvas ShotPlan); `flowF` standard entry via `neko.story.startVideoCreation`
- ✅ Agent tools (`GetScriptIndex` + `SearchScriptIndex` + `GenerateScenePlan` / `GenerateShotPlan`)
- ✅ `import_script_to_canvas` upgraded to semantic ShotPlan import; shared `createStoryboardPayload` / `applyStoryboardPayloadToCanvas`
- ✅ `NekoCanvasAPI.storyboard.import()` + `neko.canvas.importStoryboard` command
- ✅ `StorySceneStateStore` + `workspaceState` cross-session persistence + pipeline event scene state write-back
- ✅ Fountain pipeline routed through scene planning (Agent routing + semantic storyboard canvas import)
- [ ] P2: Upgrade `canvasStatus = opened` from button-driven to canvas real-time event write-back

### neko-agent — Multimodal Perception Pipeline ✅ (2026-05-06)

> [ADR](./docs/architecture/adr-agent-multimodal-perception.md) — PerceptionCard + CompositeBlock + Provider-Aware Delivery

- ✅ PerceptionCard three-layer perception intermediary (Structural / Semantic / Perceptual)
- ✅ Agent-first multimodal contracts (@neko/shared)
- ✅ EngineClient perception facade + capture helpers
- ✅ Agent feedback signals, perception tools, persona integration
- ✅ Observation recorder + journal events + ControlPlane wiring
- ✅ Multimodal context resolution + operation adapters
- [ ] P1: PerceptionPolicy strategy-driven timing (on-completion / on-reference / on-demand)
- [ ] P1: Provider-Aware Delivery (per LLM modality capability routing)
- [ ] P2: CompositeBlock multimodal assembly (storyboard-table / comparison / gallery)
- [ ] P2: Task Completion Backfill pipeline closure

### neko-agent — Rich Content Delivery ✅ (2026-05-07)

> [Analysis](./docs/architecture/agent-rich-content-delivery-analysis.md) — Agent → creative tools structured delivery

- ✅ Rich content delivery to Canvas, Cut, Model, Puppet, Explorer targets
- ✅ Structured payload projection (storyboard → canvas nodes, timeline clips, model import)
- [ ] P1: Cut generated audio landing (connect voiceOver/soundCue to TTS/sound-effect generation)
- [ ] P1: Batch transfer semantics (best-effort vs atomic per target + target-side feedback)
- [ ] P2: Puppet Send-to target (moc3/motion/expression payloads)
- [ ] P2: Model structured import protocol (beyond path-based .glb/.vrm)
- [ ] P2: Composite structured delivery (comparison / gallery / report projections)

### neko-agent — Runtime Workflow Hardening ✅ (2026-04-27 → 2026-05-04)

- ✅ Runtime boundary guards + unified workflow boundaries
- ✅ Workflow evaluation harness (structured test framework for pipeline paths)
- ✅ Runner boundary adapters hardening
- ✅ Runtime feedback loops closure + workflow polish gaps
- ✅ Capability injection state bounding
- ✅ Video quality evidence foundation + production wiring
- ✅ Dead code cleanup: 13 commits removing unused bridges, routes, messages (marketplace opener, config bridge, MCP test protocol, generation progress bridge, connection state bridge, skill task actions, webview control protocols)
- ✅ Domain logic restructuring: runtime modules + platform services + webview/runtime contract separation + shared presenter/helper consolidation

### neko-agent — Rich Media Architecture TODO

> [ADR](./docs/architecture/agent-media-architecture.md)

- [ ] P1: RichContentBlock registry (type + kind→component mapping + ContentBlockRenderer integration)
- [ ] P1: Predefined kinds (storyboard / media_card / comparison / form / data_table)
- [ ] P1: `mediaPreprocessor.ts` (image resize + video keyframe extraction)
- [ ] P1: `parse_script_to_shots` refactor (agent-internal, zero canvas deps)
- [ ] P1: Pipeline media landing unification (`MediaGeneratorAdapter` → local save + asset index)
- [ ] P2: Extension Host DragDropBroker enhancement (~100 lines)

### neko-agent — IDC Unified Workflow (Phase A + B + B-closure ✅, 2026-04-22)

> [ADR §4 revision](./docs/architecture/agent-unified-workflow.md) — collapses Speckit-aligned 4-stage flow to 3-stage (draft/plan/apply); AI owns artifact authoring through the generic Write tool with post-write schema validation.

- ✅ **Phase A (rename only, commit c5d6f993)** — stage vocabulary `specify/plan/tasks/implement` → `draft/plan/apply` (tasks merged into plan — shared persona/tools/guardians made the 4th stage redundant; `apply` borrows the Terraform plan/apply idiom); artifact renames `Proposal`→`Draft`, `TodoList`→`Task`, `ExecutionPlan.proposalId`→`draftId`; file naming `.nkproposal.md`/`.nktodo.md` extension style replaced with `<kind>-<runId>.md` prefix under `.neko/drafts|plans|tasks/` (easier to ls/grep, zero-config MD editor support, native Git diff); EventBus channels renamed in lock-step (`creation.draft.presented`, `execution.task.updated`, approval `draft-review`). 63 files changed, −1431 LOC source-layer net.
- ✅ **Phase B (tool removal + ArtifactWatcher, commit c5d6f993)** — deleted `DraftWriteTool`/`PlanWriteTool`/`TaskWriteTool`; AI writes via generic `Write` against the 3 artifact dirs; added `artifact/artifact-validator.ts` (pure frontmatter schema: missing-frontmatter, malformed-frontmatter, missing-field, wrong-kind, invalid-status, invalid-timestamp) + `artifact-watcher.ts` (fs.watch + 300ms debounce reusing HookLoader pattern); new `execution.artifact.written` / `execution.artifact.invalid` channels; `AgentSession` lifecycle wiring. **Non-blocking design**: invalid files stay on disk, validator emits structured issues for the AI to self-correct.
- ✅ **Phase B closure (observation loop, commit b1cc3f71)** — `artifact/artifact-observation-hooks.ts` subscribes to `artifact.invalid`, buffers issues (cap 32 + overflow reporting), drains into a `system` message appended to `context.messages` on the next `beforeThink` so the AI sees validator diagnostics; narrator `milestone-tracker.defaultClassify` handles the two new channels; `progress-narrator` icons (✎ / ⚠); `StagePersonaBinding.getRunId` substitutes `{runId}` / `{stage}` placeholders in persona systemPrompt at activation so artifact-file contract paths render concretely (`.neko/drafts/draft-tiktok-001.md`).
- [ ] **P1 — `ask` mode decoupling**: `ExecutionMode 'ask'` (per-tool confirmation UX) and `StageMode 'ask'` (IDC planner mode) currently share the same string via cast; redesign the permission/IDC boundary so stage planning only knows `plan`/`auto`.
- [ ] **P1 — `git rm --cached packages/neko-agent/neko`**: 65 MB arm64 binary was committed by accident; `.gitignore` rule already added, dedicated commit needed to untrack the existing copy.
- [ ] **P2 — `.nksession.md` session summary** (ADR §7.4 ⏳): requires E wave work first — unify Journal / ConversationRecord / compact / memory so "session" has one fact source.
- [ ] **P2 — `.neko/cache/*.json` derived indices**: `draft-index.json` consuming `artifact.written` events; unblocked when UI-side query needs surface.
- [ ] **P3 — 154 pre-existing TS errors**: `MCPTool`/`BashTool` parameters mismatches + `ToolParameters` shape drift; independent of the IDC refactor.
- [ ] **P3 — 5 pre-existing `fileOperationHandler.test.ts` failures**: vscode mock divergence; unrelated to the IDC refactor.

**End-to-end loop (Phase A+B+closure)**: AI writes `.neko/drafts/draft-xyz.md` via generic Write → ArtifactWatcher reads + validates after 300ms debounce → on failure emits `execution.artifact.invalid` with structured issues → `ArtifactObservationHooks` buffers then injects system message on next think → AI re-writes file with fixes. Validator is pure, watcher is single-path, and all events flow through the typed EventBus for narrator / logs / telemetry consumption.

**Test coverage**: 30 artifact-module tests (8 observation-hooks + 16 validator + 6 watcher); full agent suite 1957/1962 passing (5 pre-existing fileOperationHandler failures unchanged).

### neko-agent — Workflow Orchestration (Phase 1-6 mostly complete, Rust milestone pending)

> [Agent Unified Workflow](./docs/architecture/agent-unified-workflow.md) · [Plan Mode](./docs/architecture/plan-mode.md) · [Pipeline Execution](./docs/architecture/pipeline-execution.md) · [Asset Library](./docs/architecture/asset-knowledge-graph.md) · [Matching](./docs/architecture/cross-modal-matching.md) · [Consistency](./docs/architecture/creative-consistency.md)

- ✅ **Phase 1** — Router (FastProbe + InputProbe) + RouteRegistry + LitePlan + AssetLibrary facade + Matching L1/L2/L5
- ✅ **Phase 1.5** — Interactive Plan Mode + PlanCard webview
- ✅ **Phase 2** — `.nkplan` persistence + Plan state machine + ConsistencyChecker v1
- ✅ **Phase 2.5** — Fork + Diff + Checkpoint pause + PlanBrowser
- ✅ **Phase 3** — LLM Router (Haiku + 5 tools) + memory loop + cost estimator
- ✅ **Phase 3.5** — `ask_user` interactive broker (webview modal + pausable budget)
- ✅ **Phase 4.1** — L3/L4 TS contract stubs (ClipProvider / EmbeddingCache / SemanticMatcher / LLMMatcher) + feature flags
- ⏳ **Phase 4.2** — CLIP Rust napi binding + host-api TS wrapper (Rust milestone)
- ✅ **Phase 4.3a** — NodeEmbeddingCache (JSON + base64 Float32 + LRU)
- ⏳ **Phase 4.3b** — Model distribution + binary mmap + import-time preprocessing (Rust milestone)
- ✅ **Phase 5.1-5.2** — Reference chain builder (3 strategies + break tags) + PlanBuilder auto-compute + canvas field sync
- ✅ **Phase 5.3-5.4b** — PipelineContext threading + batch-generate in-batch deferred map + per-task reference path resolution
- ✅ **Phase 5.4c-stub / 5.4d** — RenderMode contracts (pure-render / render-then-ai / reference-only) + render-engine pipeline stage + `ctx.renderedAnchorPaths` priority
- ⏳ **Phase 5.4c-rust / 5.4e** — runtime-puppet / runtime-scene Rust adapters + bootstrap registration (Rust milestone)
- ✅ **Phase 6.1/6.2** — `.nkproj` Format SDK + Lossless Upgrade primitives
- ✅ **Phase 6.3a/b** — Clip lineage (proto regen) + ShotNode.workflowPlanId + wiring (PipelineContext.planId + applyStoryboardPayloadToCanvas + arrange-on-timeline lineage)
- ⏸ **Phase 6.3c** — Input handler registry (deferred; current inline switch in fast-probe adequate)
- ✅ **Governance C1/C2** — `orchestrator.enabled` default `true`; legacy `neko.pipeline.start` / `generateForNode` JSDoc `@deprecated`
- ✅ **R1-R6 Decoupling review** (6 rounds, 2026-04-19) — approve dispatches user-reviewed plan; plan.input + plan.matchingShots persisted for self-sufficient fork/reload; `WorkflowPlanCapabilities` contract gates UI buttons on actual handler support; legacy-fork clean rejection (no zombie preview); `WorkflowPlanHandler` split into facade + `PlanReviewSession` / `PlanQueryController` / `PipelineLifecycleBridge` / `RouterMemoryController` + `plan-wire/` module folder; `ReviewOrchestrator` narrow port + Shot↔NkplanShot compile-time compat check
- [ ] **Governance C3/C4** — `.nkproj` observation telemetry + legacy command usage funnel (needs telemetry infra)
- [ ] **Governance C5** — Plan Diff viewer webview menu entry (infra exists at [plan-diff.ts](./packages/neko-agent/packages/platform/src/workflow/plan/plan-diff.ts))
- [ ] **Testing D4/D5/D6** — `.nkproj` real-project round-trip + multi-workspace concurrent FileIO + 6.3 wiring integration test
- [ ] **Webview state rewrite** — `useWorkflowPlan` single-slot → reducer/store keyed by sessionId (enables concurrent plan panels)
- [ ] **Cross-ext typed contract** — replace `neko.canvas.orchestrator.planStateChanged` string command with shared typed extension-API (KNOWN COUPLING note inline at plan-wire/broadcast.ts)
- ⏭ **Rust Milestone (4.2 + 4.3b + 5.4c-rust + 5.4e)** — ~8-12 person-days, requires Rust toolchain + cross-platform CI

**Test coverage**: 914 green (437 workflow/pipeline + 477 neko-types). Six review rounds zero-regression; accumulated regression tests span commit_route validator (D2), reference-chain DAG invariants (D3), fork → approve dispatch (R1-Fix-2), plan.input fork-dispatch (R2-Fix-A), legacy-fork rejection (R4-Fix-D), capability timing (R4-Fix-F), fork-recheck via matchingShots (R5-Fix-I), Shot↔NkplanShot structural compat (R6-Fix-M).

**Architecture docs cleanup (2026-04-26)**: obsolete workflow/capability exploration docs have been removed from active references. Current entry points are [Agent Unified Workflow](./docs/architecture/agent-unified-workflow.md), [Capability Protocol](./docs/architecture/adr-capability-protocol.md), [Plan Mode](./docs/architecture/plan-mode.md), and [Pipeline Execution](./docs/architecture/pipeline-execution.md).

**Skill prompt-chain cleanup (2026-04-26)**: pre-launch Skill workflow DSL fields were removed from runtime contracts and market install gates. New Skill authoring uses prompt-chain body sections plus deterministic metadata boundaries.

**Marketplace governance hardening (2026-05-02)**: plugin governance contracts aligned with registry; trust level enforcement + signature gate tightened.

### neko-model (3D) + neko-puppet (2D) — Character Editing Rust Engine ✅

- Phase 3.1-3.3 ✅ (basic 3D + AI face sculpting + CSG + PBR + particles + timeline integration)
- Phase 2 Rust Engine ✅ (keyframe CRUD + animation blending + EasingType 30+ variants + project v2):
  - runtime-puppet: 51 tests (Keyframe CRUD + blend_tick + 8 API actions)
  - runtime-scene: 49 tests (SceneKeyframe + AnimationChannel CRUD + 5 API actions + NkmProject v2)
- **Phase 2.5 Character Editing P0+P1 ✅**:
  - Template creation (in-editor empty state UI: import/template/drag-drop + INP/GLB procedural humanoid templates)
  - 3D `Visible` component + `set_visible` API + GPU render filtering
  - 2D `set_node_opacity` API (runtime opacity modification)
  - 3D `set_morph_weights` API (interactive Morph Target adjustment)
  - 3D `update_material` API (runtime PBR material parameter editing)
  - 3D `delete_node` API (recursive node and descendant deletion)
  - SCENES +4 actions / PUPPETS +1 action
- **Phase 2.5 Character Editing P2 ✅**:
  - 2D texture hot-swap (`puppets:set_texture` API)
  - 2D physics simulation (SimplePhysics + PhysicsState component + INP parsing + rigid/spring pendulum solvers)
  - 3D material extensions (emissive_factor + occlusion_strength + emissive/AO textures + WGSL shader updates)
- **Phase 2.5 Editor UI ✅**:
  - neko-model: left-side VerticalToolbar (shared component) + i18n integration + CSP fix + locale injection
  - neko-puppet: Canvas 2D renderer (textured triangle affine mapping + blend modes + zoom/pan)
  - INP TEX_SECT texture parsing (webview-side PNG extraction → ImageBitmap)
- Phase 3.2 remaining: AI MCP Tools (face.generate_params / face.from_image / face.adjust)
- Phase 3.4: AI-assisted 3D + 3DGS + MCP bridging

### neko-preview — Panoramic Image Preview (WIP)

> [ADR](./docs/architecture/adr-panoramic-image-preview.md) — Spherical viewer + HDR first-class + Send-to-Model

**Phase 1 (WIP)**:

- ⏳ `PanoramicImagePreviewProvider` + `PanoramicVideoPreviewProvider` (custom editor providers)
- ⏳ Panoramic routing logic (equirectangular detection + projection type identification)
- ⏳ Panorama webview (sphere mesh + equirect shader + drag-to-orbit + zoom)
- ⏳ Preview manifest client (`PreviewManifestClient` in neko-client)
- ⏳ Engine-first routing (HDR/EXR files loaded via engine HTTP endpoints, bypassing Webview CSP limits)
- ⏳ Shared preview types (`@neko/shared/types/preview.ts`)
- [ ] HDR tone mapping (Reinhard/ACES in fragment shader)
- [ ] "Use as Environment in neko-model" Send-to action
- [ ] AI panoramic generation metadata (`projection` field on `ImageGenerationRequest`)

### neko-sketch (2D) — S.1-S.4 All Complete ✅ + PSD Import ✅

- ✅ Phase S.1-S.3 (painting + skeletal animation + advanced 2D)
- ✅ Phase S.4 P1: `sketch.generate` (SketchGenerate MCP tool → MediaGenerationService → canvas layer)
- ✅ Phase S.4 P1: Inpaint / StyleTransfer / AutoLayer AI tools (getSelectionMask/getCanvasImageData → generate → new layer)
- ✅ Phase S.4: Cross-module workflow (editImage → SketchEditorProvider → pendingImport; sendToTimeline / sendToCanvas commands)
- ✅ **Phase S.5: PSD Import + AI Bridge** — extension-level PSD import + AI painting tools in webview + shared sketch contracts + `.nks` format migration
- [ ] Phase S.4 P2: `style_transfer` cross-module integration enhancement (depends on NekoCanvasAPI image node support)

### neko-sketch — P0 Core Tool Gaps

> [ADR](./docs/architecture/sketch-feature-gap-analysis.md)

- [ ] Adjustment layers (Curves/Levels/White Balance/Vibrance)
- [ ] Layer masks + clipping masks
- [ ] Lasso + magic wand selection
- [ ] Alpha Lock
- [ ] Free transform (scale/rotate/skew handles)

### neko-sketch — 2D Lighting System

> [ADR](./docs/architecture/sketch-2d-lighting.md)

- [ ] Phase 0: flat point light + environment light + UI
- [ ] Phase 1: normal-map lighting + Blinn-Phong specular + RNM compositing
- [ ] Phase 2: spotlight / directional / soft shadows / SSAO (deferred)
- [ ] AI normal-map generation (Sobel-inferred shader → neko-agent)

### neko-engine — Plugin Architecture Expansion

> [Plugin RFC](./docs/architecture/engine-plugin-rfc.md) + [Runtime Layering](./docs/architecture/engine-runtime-layering.md)

- ✅ P1: PluginManager MVP (manifest scan + version validation + enable/disable/reload + PluginsController 5 actions + 12 tests)
- [ ] P1 remaining: Integrate `effects:register` / `models:register` into unified plugin lifecycle
- [ ] P2: Create FormatRegistry / DeviceRegistry / ExporterRegistry / PreviewRegistry (plugin-extensible registries)
- [ ] P2: Extract `runtime-format` crate (decouple file format probing from engine-kernel)
- [ ] P3: Connector plugin support (external sidecar/remote runtime declarations + health check)
- [ ] P4: Community plugin ecosystem (docs / SDK / contract tests / signing chain)

### neko-engine — Future Runtime Stages

> [ADR](./docs/architecture/neko-engine-architecture.md) — Stages 2-5

- [ ] **runtime-xr** (Stage 2): OpenXR + stereo instanced rendering + spatial input abstraction
- [ ] **runtime-stage** (Stage 3): ScriptEngine + interactive orchestration + QTE / hotspot system
- [ ] **runtime-game** (Stage 4): rapier3d physics + NavMesh + visual scripting
- [ ] **runtime-sim** (Stage 5): deterministic playback + sensor MRT + Gym API

### ControlNet Pipeline

> [ADR](./docs/architecture/controlnet-pipeline.md)

- [ ] **P0**: Fix 5 command bridge gaps (G1-G4: parameter forwarding + input type extension + API call corrections)
- [ ] **P1**: E5 preprocessor in `runtime-ml` (depth / normal / pose / canny extraction via ONNX)
- [ ] **P2**: Auto-preprocessing workflow (canvas selects controlMode → auto-extract conditioning image from shot)

### AI Video Reference System

> [ADR](./docs/architecture/ai-video-reference-system.md) — Unified framework for camera/angle/lighting + 2D/3D references + character consistency, with explicit camera motion translation pipeline

**Motivation**: AI video generation has fragmented reference handling (IP-Adapter per-shot only, no cross-shot character binding, no automated 3D→2D reference rendering, camera vocabulary inconsistent across provider adapters). Commercial models (Seedance 2.0 / Veo 3.1 / Sora 2 / Runway Gen-4 / Kling O3) already support L1-L2 reference + camera control natively; this system is a thin adaptation layer, not a reimplementation. **No provider accepts native 3D input**, so 3D camera paths must be translated through three artifact paths (prompt / keyframes / depth-seq).

**Phased rollout**:

- [ ] **P1 Types + Resolver + Path A**: `ReferenceStrategy` (L0-L5) + `CameraKeyframe` + `CameraMotionAnalysis` types + `ReferenceStrategyResolver` with **dual-axis capability matrix** (reference tier × camera channel) + Agent MCP tool + Seedance/Veo adapters + **`CameraMotionAnalyzer`** (Path A: 3D → cinematic prompt, Tier L1 syntax perception, every generation)
- [ ] **P2 3D→2D Turnaround + Path B + ControlNet Producer**: runtime-scene `render_views` offscreen action + GalleryNode "Fill from 3D" auto-fill + turnaround cache + L4 → L2 downgrade in adapters + **`KeyframeRenderer` + `CameraPayloadBuilder`** (Path B: 3D → start/end frame, Tier L2 composition perception) + **`ControlNetAssetProducer` interface + `Image2DControlProducer`** (source-agnostic ControlNet asset interface in @neko/shared, absorbs controlnet-pipeline.md §E5)
- [ ] **P3 Cross-shot Consistency + Path C + 3D/Puppet Producers**: `CharacterBundle.referenceSet` persistent binding + auto injection into `ImageGenerationRequest.characterBindings[]` via characterId lookup + **`MotionSequenceRenderer`** (Path C: depth/normal/RGB-low sequence for Kling O3 + ControlNet-video, Tier L3 spatial perception, opt-in) + **`Scene3DControlProducer`** (wgpu depth/normal/skeleton projection — ground-truth control maps) + **`PuppetControlProducer`** (optional; 2D bone + silhouette for Live2D/INP) + provider ControlNet capability matrix in payload builder
- [ ] **P4 Quality Gate**: CLIP identity consistency + camera angle LLM scoring + HSV lighting continuity + trajectory fidelity vs 3D ground truth metrics

**Perception decision**: L1 prompt normalization ships with every generation (cheap, universal benefit). L2 keyframe rendering is recommended for multi-shot productions (the main consistency pain point). L3 depth/motion sequence is opt-in only when a 3D scene is bound (avoids over-engineering for concept shots).

**ControlNet source decision**: unified `ControlNetAssetProducer` interface; 3D render path (ground-truth depth/normal/skeleton) preferred when shot is bound to a 3D scene; 2D ONNX path (Depth Anything v2 / OpenPose / Canny) fallback for photo references and concept shots. Output is always PNG (universal provider compatibility); raw float buffers stay engine-internal for quality gates.

**Cross-reference**: builds on [controlnet-pipeline.md](./docs/architecture/controlnet-pipeline.md) (preprocessors) + [ai-technology-landscape.md](./docs/architecture/ai-technology-landscape.md) (HMR2 / Depth Anything ONNX) + [canvas-agent-integration.md](./docs/architecture/canvas-agent-integration.md) (GenerationPromptPanel) + [adr-character-unified-index.md](./docs/architecture/adr-character-unified-index.md) (characters.json contract) + [media-quality-assessment.md](./docs/architecture/media-quality-assessment.md) (validation); depends on **Camera Keyframe Track** (TODO.md line 136, neko-cut P2) for camera path data source

### Media Diff — AI Semantic Phases

> [ADR](./docs/architecture/diff.md)

- ⏳ **Phase 2B**: Video H.264+PCM streaming completion (WebSocket protocol + H.264 decoder + PCM audio sync; ~60% done)
- [ ] **Phase 4**: CLIP scoring + Whisper ASR comparison + Demucs audio separation + Grounding DINO object-change localization
- [ ] **Phase 5**: AI generative screening (deepfake / AI-artifact forensic ML detection)
- [ ] **Phase 6**: End-to-end quality scoring (SSIM/PSNR thresholds + semantic analysis combined)

### Canvas-Agent Integration — Phase 6

> [ADR](./docs/architecture/canvas-agent-integration.md)

- [ ] First/last keyframe video generation (`canvas_generate_video_with_keyframes`)
- [ ] Style transfer (`canvas_apply_style_transfer` + IP-Adapter reference injection)
- [ ] neko-sketch integration tool (`sketch_generate` from canvas)
- [ ] Storyboard export enhancements (PDF / ZIP / neko-cut timeline)
- [ ] Story inline diff editor rendering (Agent suggestion acceptance UI)

### Creative Context Compression

> [ADR](./docs/architecture/creative-context-compression.md)

- [ ] `IMessageClassifier`: 7-level priority tagger for creative conversations
- [ ] `CreativeSummarizer`: structured output preserving version anchors / iteration chains / aesthetic preferences
- [ ] Integration into existing `ConversationCompressor` pipeline

### Format Strategy — SDK Gaps

> [ADR](./docs/architecture/format-strategy.md)

- [ ] `.nkc` (canvas) and `.nka` (audio) format validator / migrator / codec
- [ ] `.nkv-ops` operation history sidecar serialization
- [ ] Fountain asset reference extensions: `[[IMAGE:path]]` / `[[ASSET:id]]` syntax

---

## Phase 3.6: Cross-Extension Semantic Layer

> Goal: Unified entity identity + multimodal version management. Builds on Phase 1-3 foundations, enabling deep cross-module semantic integration.

### Unified Entity Identity System

> [ADR](./docs/architecture/adr-character-unified-index.md) — Characters → Scenes → Objects progressive entity binding

**Phase 1: Structure Closure**

- [ ] `characters.json` contract (JSON schema + TypeScript interfaces + read/write service)
- [ ] `characterId` field on `GalleryNode`, `ShotCharacter`, `GeneratedAsset`
- [ ] `CharacterWorkspaceIndex` service + script name→characterId resolution
- [ ] LSP: Go to Definition from script name → characters.json; Find References across layers; Hover shows metadata

**Phase 2: Generation Lineage**

- [ ] Auto-inherit `characterId` when generating from annotated ShotNode/GalleryNode
- [ ] `registryId` field on Asset Entity with explicit binding
- [ ] Update `import_script_to_canvas` to populate character bindings from registry

**Phase 3: CreativeEntityGraph + OccurrenceIndex**

- [ ] Graph node types: entity, occurrence, asset, canvas-node, script-range, timeline-element, media-segment, generated-asset
- [ ] Relationship types with strength (confirmed/inferred) and provenance (user/lineage/rule/ai/import)
- [ ] `OccurrenceIndex` for precise cross-layer navigation (script lines, canvas nodes, timeline elements, media segments)

**Phase 4: Scene & Object Extension**

- [ ] `sceneId` binding (SceneGroupNode↔script scene)
- [ ] `objectId` for items/props/vehicles; replicate character binding pattern

**Phase 5: Rule Matching + Vectors**

- [ ] Filename/alias/tag rule matching + `CharacterMatchSuggestion` with confidence
- [ ] Text embedding index (descriptions, prompts, action phrases)
- [ ] Multimodal: image/face/video keyframe/speaker embedding (results default to `inferred`)

### Multimodal Git Integration

> [ADR](./docs/architecture/adr-multimodal-git-integration.md) — 6-phase plan for Git + multimodal version management

- [ ] Phase 1: `.gitattributes` template + MediaDiff SCM panel entry + basic media change summaries
- [ ] Phase 2: `neko-diff` CLI tool (format-specific summaries replacing `Binary files differ`)
- [ ] Phase 3: JSON semantic diff for `characters.json`/`library.json` + Webview review panel
- [ ] Phase 4: Entity impact analysis (connect to CreativeEntityGraph; affected characters/scenes view)
- [ ] Phase 5: Commit-level semantic review (aggregated multifile entity changes; confirmed vs inferred)
- [ ] Phase 6: Remote collaboration (Git LFS lock evaluation + PR/patch export + hosting bridge)

---

## Phase 4: Audio Workstation ✅ (~95%)

neko-audio Phases A-J all complete (waveform + playback + spectrum + effect chain + microphone + AI noise reduction + export + 78 tests).

---

## Phase 4.5: UI Modernization ✅ (~95%)

Phases 0-5.6 all complete (Tailwind + macOS Token + shared components + VSCode theming + File Icon Theme).

> [ADR](./docs/architecture/ui-modernization-design.md)

### Device Proxy ✅ + Device Management (WIP)

- Microphone ✅ | MIDI ✅ | Gamepad ✅ | Camera ⚠️ framework ready (capture TODO, prerequisite for neko-live)
  > [Device Access ADR](./docs/architecture/device-access.md) · [Device Management ADR](./docs/architecture/adr-device-management.md)

**Device Management System (WIP, 2026-05-07)**:

- ⏳ TS device clients in `neko-client/src/device/` (GamepadClient, MidiClient, MicrophoneClient, CameraClient)
- ⏳ Engine device binding service (`engine-kernel/src/services/device_binding.rs`)
- ⏳ Extension-level device providers (`neko-engine/packages/extension/src/device/`)
- ⏳ Shared device/tracking types (`@neko/shared` — `device.ts`, `tracking.ts`)
- ⏳ neko-live TrackingService extraction (shared extension-level service)
- ⏳ neko-puppet Live Mode (`packages/extension/src/live/`)
- ⏳ neko-model Live Mode (`packages/extension/src/live/`)
- [ ] Native VSCode UI for device management (TreeView / QuickPick / StatusBar — no Webview)

---

## Phase 5: Virtual Production (~55%)

> Prerequisites: Phase 4 ✅

**Reusable foundations** (~80%): VRM 17 expressions + lip sync (neko-model), 2D skeletal ECS 60fps (neko-sketch), H.264 hardware encoding (neko-engine)

**To build**: ~~VMC protocol (~200 lines TS)~~ ✅ + MediaPipe (~300 lines TS) + RTMP/SRT streaming (~500 lines Rust)

### Phase 5.1.1 ✅ VMC + VRM Real-time Preview MVP

- ✅ Project restructured to `packages/extension/` + `packages/webview/` dual-package layout
- ✅ OSC binary parser (inline implementation, zero external dependencies)
- ✅ VmcReceiver (Node.js `dgram` UDP listener + frame accumulation + FPS measurement)
- ✅ LivePanelProvider (WebviewViewProvider + CSP + WASM-ready)
- ✅ Three.js + @pixiv/three-vrm VRM loading and real-time driving
- ✅ ARKit 52 blend shapes → VRM 17 expression mapping (vmcMapping)
- ✅ Zustand state management + inline styles control panel
- ✅ postMessage bidirectional bridge (Extension Host ↔ Webview)

### Phase 5.1.2 ✅ 2D Puppet Integration + Recording + i18n + Project Files

- ✅ PuppetViewer (Canvas 2D rendering of inochi2d deformed meshes + z_order sorting + auto-scaling)
- ✅ puppetMapping (ARKit → inochi2d parameters: eye/mouth/brow/head angle quaternion→euler)
- ✅ LivePanelProvider puppet management (fs → loadPuppet → openPuppetStream → PuppetDelta forwarding)
- ✅ Avatar selector supporting 7 formats: `.nkm`/`.nkp` (project files auto-parse `model.src`/`puppet.src`) + `.vrm`/`.glb`/`.gltf` + `.inp`/`.inx`
- ✅ CanvasRecorder (canvas.captureStream + MediaRecorder → WebM VP9 → base64 → disk save)
- ✅ Microphone recording (EngineClient.recordStart → cpal → WAV)
- ✅ Recording UI (red border + blinking REC badge + timer + save path display)
- ✅ EmptyState onboarding page (3-step guide + VMC connection checkmark + real-time tracking data visualization: blend shape bar chart + head direction dial)
- ✅ Three-layer i18n: `package.nls.json` (16 entries) + `vscode.l10n.t` (21 entries) + `I18nService` (20 webview entries)

### Phase 5.1.3 (TODO): Camera + MediaPipe

- [ ] Rust `ICameraService` implementation (nokhwa/FFmpeg avdevice → H.264 → WebSocket)
- [ ] CameraPreview component (H264StreamClient decode + Canvas rendering)
- [ ] @mediapipe/tasks-vision WASM (FaceLandmarker + PoseLandmarker)
- [ ] ITrackingProvider abstraction (MediaPipe / VMC / Hybrid switching)

**Milestones**:

- ~~5.1: Core tracking + 2D/3D integration + recording~~ ✅
- 5.2: Calibration system + audio/video merging + import to neko-cut timeline — 2-3 weeks
- 5.3: Live streaming (RTMP/SRT → OBS) — 2-3 weeks

### neko-model Long-term Roadmap (Phase 3.4+)

**Current state**: Phases 1-3 complete, 12,615 lines of production code (4,490 TS + 8,125 Rust), 49 Rust tests.

| Completed Capability                                                              | LOC                  | Quality                 |
| --------------------------------------------------------------------------------- | -------------------- | ----------------------- |
| glTF/VRM loader (two-pass skeleton parsing)                                       | 385 lines Rust       | Production              |
| bevy_ecs scene graph (20+ components)                                             | 922+388 lines Rust   | Production              |
| Animation playback + blending + keyframe CRUD                                     | 814+85 lines Rust    | Production              |
| CSG boolean operations (BSP tree)                                                 | 798 lines Rust       | Production              |
| Procedural geometry (6 primitives)                                                | 602 lines Rust       | Production              |
| PBR rendering (Cook-Torrance + IBL + post-processing)                             | 2,917 lines Rust GPU | Production              |
| GPU particle system (Compute Shader)                                              | 449 lines Rust       | Production              |
| Parametric face sculpting (22 params + skeletal expressions + VRM 17 expressions) | 632 lines TS         | Production              |
| Viewport controls (orbit/pan/zoom + quality stabilization)                        | ~200 lines TS        | Production              |
| Full i18n (all hardcoded strings replaced)                                        | —                    | Production              |
| 3D rendering control plane (engine-side)                                          | ~300 lines Rust      | Production              |
| IK solver (FABRIK, 12 tests)                                                      | 482 lines Rust       | Backend complete, no UI |

**Phase 3.4: AI-Assisted 3D (Long-term)**

- [ ] AI MCP Tools: `face.generate_params` / `face.from_image` / `face.adjust` (infrastructure ready, needs neko-agent connection)
- [ ] IK UI exposure: wire backend 482-line IK solver to frontend (TransformGizmo drag → IK chain inverse solving)
- [ ] Direct face drag editing (Raycasting → Morph Target mapping, high effort)
- [ ] Undo/Redo state machine (commands registered, Zustand store ready, needs history stack implementation)

**Phase 3.5: Advanced 3D (Long-term)**

- [ ] MCP Blender bridge (complex modeling/modifiers/UV unwrapping → external professional tools)
- [ ] MCP ComfyUI integration (AI image pipeline + ControlNet → texture generation)
- [ ] 3DGS Gaussian Splatting (Compute Shader skeleton exists, needs loader/UI)
- [ ] rapier3d physics engine (collision/rigid body); PBD cloth compute shader (separate pass, see [cloth-surface-materials.md](./docs/architecture/cloth-surface-materials.md))
- [ ] neko-live integration (face capture → skeleton mapping, cross-module)

**TS frontend test gap**: 0 test files (vitest configured, framework ready).

---

### neko-puppet Long-term Roadmap

**Current state**: ~8,500 lines of production code, 104 Rust tests. Primary format: **Live2D MOC3 (.moc3)** clean-room implementation. INP (.inp) legacy read-only support retained.

| Completed Capability                                                                            | LOC                                 | Quality    |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- | ---------- |
| INP binary parsing (JSON + TEX_SECT texture extraction)                                         | 704 lines Rust + 65 lines TS        | Production |
| **MOC3 binary parser** (clean-room, zero unsafe, OpenL2D spec)                                  | ~570 lines Rust                     | Production |
| **MOC3 loader** (→ format-agnostic ECS entities)                                                | ~370 lines Rust                     | Production |
| **Key form interpolation** (1D linear)                                                          | ~170 lines Rust                     | Production |
| **Warp deformer** (grid bilinear interpolation)                                                 | ~180 lines Rust                     | Production |
| **Rotation deformer** (pivot rotation)                                                          | ~100 lines Rust                     | Production |
| **Expression** (.exp3.json → 3 blend modes + crossfade)                                         | ~200 lines Rust                     | Production |
| **Motion** (.motion3.json → AnimationClip, Bezier 30fps sampling)                               | ~270 lines Rust                     | Production |
| **Physics** (.physics3.json → SimplePhysics chained pendulum)                                   | ~280 lines Rust                     | Production |
| bevy_ecs skeletal world (parameter-driven deformation)                                          | 840+226 lines Rust                  | Production |
| Animation system (11 easing types + blending + keyframe CRUD)                                   | 401+84 lines Rust                   | Production |
| Physics simulation (spring/rigid pendulum)                                                      | System 815 lines incl. physics tick | Production |
| WebSocket 60fps streaming                                                                       | Controller layer                    | Production |
| Canvas 2D texture rendering (affine UV + blend modes + zoom/pan)                                | 346 lines TS                        | Production |
| Parameter panel + facial parameter categories + animation panel + node tree + keyframe timeline | ~800 lines TS                       | Production |
| **Face tracking**: ParamBody/Breath/Cheek/EyeSmile + LIVE2D_PARAM_ALIASES                       | ~120 lines TS                       | Production |

**Phase P.next: MOC3 Enhancement (Near-term)**

- [ ] Phase 6: AI-assisted puppet creation — `PuppetListExpressions`/`PuppetSetExpression` agent tools + "Import .moc3 model" template UI
- [ ] Phase 7: VTube Studio API compatibility — WebSocket endpoint accepting VTS plugin protocol subset (AuthToken, InjectParameterData, ExpressionState)
- [ ] 2D bilinear interpolation (dual-axis key form interpolation for complex parameter bindings)
- [ ] Real .moc3 model E2E testing (validate parser against production models from VTube Studio)

**Phase P.1: Enhanced Editing (Mid-term)**

- [ ] Puppet export (MOC3 writer → save modified puppets; currently read-only; INP deprecated)
- [ ] Puppet creation from scratch (drawing tools → mesh → parameter binding, high effort, can delegate to neko-sketch collaboration)
- [ ] Advanced physics (cloth constraints + collision detection; currently spring/pendulum only)
- [ ] Video export (currently WebSocket streaming only, lacks H.264 recording to file)

**Phase P.2: Cross-Module Integration (Long-term)**

- [ ] neko-live deep integration (Puppet as VTuber avatar, tracking data → real-time parameter mapping)
- [ ] neko-cut timeline integration (Puppet animation clips → video elements)

**TS frontend test gap**: 0 test files.

**Known design constraints**:

- inox2d upstream lacks animation loading → bevy_animation ParameterCurve bridge (completed)
- Composite-as-mask panic on specific models → load-time detection + skip warning
- No wgpu renderer → frontend Canvas 2D rendering + Rust data (current approach)

---

### neko-live Long-term Roadmap

> [Device Proxy ADR](./docs/architecture/device-access.md) · [Device Management ADR](./docs/architecture/adr-device-management.md)

**Current state**: Phases 5.1.1-5.1.2 complete, ~3,000 lines of production code, 0 tests. **Active refactoring**: TrackingService extraction + LiveSessionService + neko-live three-layer split per Device Management ADR.

| Completed Capability                                                 | LOC                         | Quality                                |
| -------------------------------------------------------------------- | --------------------------- | -------------------------------------- |
| VMC/OSC protocol receiver (UDP frame accumulation + FPS measurement) | 375 lines TS                | Production, zero external deps         |
| VRM real-time driving (Three.js + @pixiv/three-vrm)                  | 108 lines TS                | Production                             |
| ARKit 52 → VRM 17 expression mapping                                 | 106 lines TS                | Production                             |
| ARKit → Inochi2D parameter mapping                                   | 118 lines TS                | 80% (head conversion needs refinement) |
| 2D Puppet renderer                                                   | 132 lines TS                | 80% (missing texture rendering)        |
| Canvas video recording (WebM VP9 → base64 → disk)                    | 111 lines TS                | Production                             |
| Microphone recording (EngineClient → cpal → WAV)                     | 131 lines TS                | Production                             |
| Avatar selector (7 formats + project file parsing)                   | LivePanelProvider 485 lines | Production                             |

**Phase 5.1.3: Camera + MediaPipe (Near-term, Blocker)**

- [ ] Rust `ICameraService` (nokhwa/FFmpeg avdevice → H.264 → WebSocket) — **requires adding nokhwa to Cargo.toml first**
- [ ] CameraPreview component (H264StreamClient decode + Canvas rendering)
- [ ] @mediapipe/tasks-vision WASM (FaceLandmarker + PoseLandmarker ~10MB)
- [ ] ITrackingProvider abstraction layer (MediaPipe / VMC / Hybrid unified switching)
- [ ] PuppetViewer texture rendering completion (texture_index → image data mapping)
- [ ] Puppet head bone rotation completion (Quaternion → Euler angle conversion)

**Phase 5.2: Calibration + Audio/Video Merging (Mid-term, 2-3 weeks)**

- [ ] Calibration system UI (current `calibrate` command only shows hardcoded messages)
- [ ] Audio/video merging (Canvas WebM + EngineClient WAV → MP4 mux)
- [ ] Recording import to neko-cut timeline (`neko.cut.importGeneratedClip` already available)
- [ ] Recording playback/preview

**Phase 5.3: Live Streaming (Long-term, 2-3 weeks)**

- [ ] RTMP/SRT streaming (~500 lines Rust, OS-specific: macOS ReplayKit / Win DirectShow / Linux v4l2loopback)
- [ ] Virtual camera output (OBS integration)
- [ ] Live control panel (scene switching / effect triggers / chat overlay)

**Phase 5.4: Advanced Features (Long-term)**

- [ ] Multi-character stage (multiple Avatar instances + independent tracking sources)
- [ ] Scene/background system (virtual scenes + green screen keying)
- [ ] Motion recording playback (pose → keyframe serialization → editable timeline)
- [ ] MIDI controller mapping (expression/action quick triggers, requires midir crate)
- [ ] Gamepad controls (character movement/expressions, requires gilrs crate)

**Key blocker**: `nokhwa` crate not in Cargo.toml; must be added before camera capture can be implemented.

**Test gap**: 0 test files (vitest configured but unused). Priority: add VmcReceiver + osc-parser unit tests.

---

---

## Phase 6: Asset Management & Collaboration (Client ~90%)

> Server-side (Registry Server / Storage Service) is in [neko-hub](../neko-hub)

### Phases 6.1-6.5.6 ✅ Local Assets + Marketplace Client

<details>
<summary>Completed items</summary>

- 6.1-6.3.5: Local asset management core + AI classification + cross-extension integration
- 6.4: Document + Ownership + external media libraries + PathVariable all formats
- 6.5.1: market-core Layer 0 (MarketClient + InstallManager + 58 tests)
- 6.5.2: Skill marketplace MVP (install/hot-reload/Webview)
- 6.5.3: Standalone Marketplace panel + CLI TUI
- 6.5.4: Multi-category InstallTarget (Shader/Model/Preset, 9 types)
- 6.5.5: Consumer integration (start/stop toggle + hot-reload + 64 + 468 tests)
- 6.5.6: neko-agent consumer integration + local model deployment Phases M1-M2 ✅
</details>

### Phase 6.5.7 ✅ Local Storage Strategy

> [ADR](./docs/architecture/local-storage-strategy.md)

- ✅ `IStorageLayout` + `resolveStorageLayout()` + `resolveGlobalStorageLayout()` (three-tier layout: L0 global / L1 project / L2 cache)
- ✅ `migrateStorageLayout()` one-time migration (proxies/generated/thumbnails → `.neko/.cache/`)
- ✅ Consumer migration (neko-assets / neko-cut / neko-agent / neko-market — 6 files total)
- ✅ `neko.engine.extractThumbnail` command registration (wired to Rust GPU thumbnail pipeline)
- ✅ ThumbnailService preheat + onDidGenerateThumbnail event mechanism
- ✅ Three TreeProvider thumbnail Tooltip infrastructure (MarkdownString + `<img>`)

### Phase 6.5.8 (Deferred): Local Storage Enhancements

> The following features have ADR designs but no driving user scenarios yet; deferred:

- [ ] Thumbnail activation: EPUB cover extraction (pure TS, zip unpack cover) + image scaling — current assets are all EPUB; VSCode Explorer doesn't support custom tooltips; media library panel thumbnails have no trigger scenario
- [ ] `LibraryDescriptor` (`.neko-library.json`) + AssetRegistry multi-source merge — waiting for multi-project sharing demand
- [ ] `IAssetGraph` asset dependency graph + passive write — waiting for "who is using this file?" need
- [ ] `IVectorStore` vector persistence — waiting for "script search too slow" feedback
- [ ] `ICacheStats` cache monitoring — waiting for performance issues
- [ ] History panel upgrade to "usage trails" — depends on IAssetGraph

### Phase 6.5.9 ✅ Document Preview Enhancement + Path System

- ✅ PDF/CBZ/EPUB waterfall layout (IntersectionObserver virtual scrolling, default continuous scroll mode)
- ✅ EPUB true waterfall (bypasses epubjs rendition, self-managed DOM + section.url resource URL rewriting)
- ✅ Document preview direct connection to neko-engine HTTP (removed postMessage base64 relay, eliminated 33% data bloat)
- ✅ CSP full format allowlisting `http://127.0.0.1:*` (connect/img/style/font)
- ✅ PathResolver extracted to @neko/shared (L0 zero dependencies, supports `${VAR}/path` + relative paths + URLs)
- ✅ Rust ProjectContext (resolve/validate + 9 unit tests)
- ✅ EngineClient.dispatch auto-expands path variables
- ✅ PreviewFileServer auto-calls `neko.assets.resolvePath` to expand variables
- ✅ Friendly error page for unresolved path variables (displays missing variable name + fix steps)
- ✅ Asset library health check fix (health check runs after path variable injection)
- ✅ Unified context menu (all formats "Send to AI")
- ✅ Document status bar (format icon | filename | page count | file size)
- ✅ PathResolver regex compatible with macOS fsPath leading `/`
- ✅ Three-state mode switching (scroll/dual/single) + modeEpoch race prevention + rAF DOM mount wait
- ✅ Dual-column side-by-side preview (PDF/CBZ double-page spread)
- ✅ Single/dual column content centering

### Phase 6.6 (TODO): Remote Storage Client Integration

> Server-side in [neko-hub](../neko-hub). [ADR](./docs/architecture/remote-storage.md)

- [ ] 6.6.1: `neko://` protocol + `IFileTransport` interface + S3Transport implementation + `MediaResolver`
- [ ] 6.6.2: FFmpeg Worker for server-side proxy / thumbnail generation
- [ ] 6.6.3: Incremental pull (byte-range export optimization) + AssetOwnership enforcement
- [ ] 6.6.4: Platform-side GPU export (neko-engine headless server rendering, deferred)
- [ ] Transcode Worker pipeline (PDF→pages / PPT→images / Word→HTML)

### Phase 6.7 (TODO): Project Collaboration Infrastructure

- [ ] Git LFS integration — [ADR](./docs/architecture/project-data-management.md)
- [ ] `neko-diff` CLI git diff driver (media-aware format summaries replacing `Binary files differ`)
- [ ] pHash perceptual hashing for media deduplication and similarity search
- [ ] LSP index caching for large projects (>50 .nkv files)
- ✅ Project Memory

### Phase 6.8 (TODO): Registry Server Backend

> [ADR](./docs/architecture/registry-server.md) — Server-side in [neko-hub](../neko-hub)

- [ ] **S1**: Minimal Registry Server (SQLite + local file storage + skill/model indexing + search API)
- [ ] **S2**: Object storage backend (S3/R2/OSS) + Upload API + Publisher registration
- [ ] **S3**: HuggingFace / Civitai upstream proxy + transparent caching
- [ ] **S4**: Commercial features (licenses / payments / publisher portal / analytics)

### Local Model Runtime

> [ADR](./docs/architecture/model-runtime.md)

- Phases M1-M2 ✅ (neko-market ModelInstallTarget + neko-engine ONNX inference macOS)
- TODO: ONNX cross-platform packaging (Win/Linux) · Phase M3 candle SD/SDXL (pending evaluation)

---

## Content Provenance (C2PA) — Deferred

> Analyzed 2026-04-07. C2PA (Coalition for Content Provenance and Authenticity) embeds cryptographic provenance metadata in exported media, enabling AI content labeling and authenticity verification.

**Current state**: No C2PA support. Export pipeline has no metadata embedding, EXIF/XMP writing, or content signing.

**Why deferred**: Product is a local creative workspace, not a distribution platform. C2PA is currently a voluntary standard with no legal mandate. Core features (editing/rendering/AI) are still in active development. Engineering cost is non-trivial (c2pa-rs + X.509 certificate management + export pipeline changes).

**Future value**: neko-agent generates AI media (images/video/audio) that could benefit from provenance labeling. Industry adoption growing (Adobe/Google/Microsoft). EU AI Act may require AI-generated content labeling.

**Pre-reserved integration points**:

1. Export pipeline: `FfmpegMuxer` post-write hook for C2PA signing (not yet implemented)
2. AI asset metadata: `GeneratedAsset` type can be extended with `provenance` field

**Implementation path (when triggered)**:

- [ ] Add `c2pa-rs` crate dependency
- [ ] `ExportConfig` add `sign: bool` + `certificate` options
- [ ] Post-muxing C2PA manifest injection (sign after encode)
- [ ] Certificate/key management service
- [ ] `GeneratedAsset.provenance` field for AI generation traceability

**Trigger to re-evaluate**: EU AI Act enforcement, partner/user explicit request, or competitive pressure.

---

## Phase 7: VR/AR Immersive Creation (Long-term)

> Prerequisites: Phase 3 + Phase 5

Hybrid strategy: VSCode in-editor editing/export + Electron WebXR app for immersive preview + Native OpenXR for high-perf + MCP bridging to Unity/Unreal.

- 7.1: Stereoscopic rendering (instanced stereo / wgpu multiview) + OpenXR session management — 2-3 weeks
- 7.2: Electron WebXR App + Three.js WebXRManager + hand tracking (SpatialInput abstraction) — 3-4 weeks
- 7.3: AR plane detection + light estimation + depth occlusion (MR) — 4-6 weeks
- 7.4: HRTF spatial audio (oddio/kira-spatial + ECS entity sound sources) — 2-3 weeks
- 7.5: AI-assisted XR (voice-driven scene manipulation + spatial layout suggestions) — TBD

Reuses from Phase 3 (interactive cinema): runtime-stage scene orchestration, ScriptEngine, DynamicDialogue, InteractionHandler (→ SpatialInput mapping), SemanticMotion + retarget maps, billboard 2D+3D compositing, Level 1 light matching, Depth-Aware compositing.

Publishing channels: Path A Electron+WebXR (primary) → Path B Native OpenXR (performance) → Path C Streaming (remote/demo).

---

## Phase 8: Interactive Video Creation (Long-term)

> Prerequisites: Phases 1-3

Bilibili interactive video / YouTube interactive content. Reuses neko-cut timeline + neko-canvas node graph + neko-story screenplay.

- 8.1: Branch editing (canvas ChoicePointNode + cut ChoiceMarker) — 2-3 weeks
- 8.2: Interactive previewer — 2-3 weeks
- 8.3: Branch validation + AI assistance — 1-2 weeks
- 8.4: Platform export (Bilibili IVG / YouTube / Web HTML5) — 2-3 weeks

---

## Cross-Scene Infrastructure (applies to all Phases)

> See [neko-engine-architecture.md](./docs/architecture/neko-engine-architecture.md) and [neko-suite-architecture-overview.md](./docs/architecture/neko-suite-architecture-overview.md) for detailed architecture.

### RenderProfile (one engine, scene-specific rendering)

- [ ] RenderProfile enum + per-profile config: Video (max quality, unlimited budget) / Interactive (60fps, adaptive effects) / XR (90fps×2, FFR, minimal post) / Game (60fps + CSM + LOD) / Simulation (headless MRT, batched, deterministic) / Web (Three.js TSL)
- [ ] Adaptive quality: framerate monitor → auto-drop effects when behind budget (Interactive/XR/Game)

### QualityProfile (scene-specific quality checks)

- [ ] QualityProfile config per scene type: Video (aesthetic + continuity + narrative + audio_sync) / Interactive (framerate + branch_coverage + state_consistency + persona) / Serialized (state_compat + save_compat + butterfly, strictest) / XR (framerate90 + comfort + spatial + stereo) / Game (physics + playable + balance) / Simulation (determinism + physics_accuracy + data_distribution)
- [ ] Checker trait registry: universal checkers (aesthetic/continuity/narrative/framerate/audio_sync) + scene-specific checkers loaded on demand
- [ ] Quality gate integration: stage transition blocked until quality gate passes

### WorkflowTemplate (scene-specific creation pipeline)

- [ ] WorkflowTemplate per scene: ordered stages + tools + quality gates — Video (7 stages: script→gen→edit→color→audio→review→export) / Interactive (8 stages: +branch_edit+ai_test) / Serialized (6 stages: +compat_check+save_test+butterfly_test)
- [ ] Workflow runner: guide creator through stages, enforce gates, AI assists at each stage

### AI Perceive-Edit-Verify Loop

- [ ] PerceptionContext: structured perception (read params/timeline, ms) + visual perception (render→VLM, sec) → aggregated context
- [ ] 5-level ValidationPipeline: L1 technical → L2 numerical → L3 visual (VLM) → L4 consistency (CLIP) → L5 narrative (LLM)
- [ ] AutoRefine: score ≥ 0.8 pass / 0.5-0.8 auto-fix max 3 rounds / < 0.5 report user with Before/After

### AI Edit Protocol

- [ ] AIEditResult standard format for all AI tool outputs
- [ ] Extended EditOperation types (~10 new domains: expression/motion/scene/light/effect/voice/camera/emotion/memory/binding)
- [ ] AIWorkflow multi-step DAG executor with atomic commit + rollback
- [ ] MCP tool → AIEditResult auto-apply pipeline

### Unified Asset Standard

- [ ] 4-layer standard: Identity (CharacterBundle) + Performance (SemanticMotion/ExpressionSpec/VoiceSpec) + World (SceneSpec/LightSpec/EffectSpec) + Narrative (StoryBinding/SeriesSpec/MemoryAnchor/PlayerSave)
- [ ] Format compatibility adapters: BVH + LUT + HDR + VMD + exp3 + motion3 + glTF + VRM
- [ ] Asset extraction from image/video: depth→2.5D, pose→motion, face→expression, camera→keyframes
- [ ] AssetRegistry as knowledge hub: capability metadata per asset, intelligent query API
- [ ] **CharacterBundle.textures**: albedo/normal/roughness/emission/subsurface 通道 + `materialOverrides` 运行时覆盖（不修改原始文件）；SceneSpec.terrain 支持 displacement 贴图；纹理文件本身使用标准格式（PNG/EXR/KTX2），元数据内联进 .nkchar/.nkscene（不创建独立 nk\* 格式）

### 布料模拟 + 表面材质 (Character & Scene Quality)

- [ ] **VRM Spring Bone 布料** (P1, Stage 1-3): runtime-scene tick 驱动 Spring Bone 链（stiffness/gravity/drag/hit_radius）；`ClothQuality` 字段进 RenderProfile（Video: 高质量离线迭代 / Interactive: 帧率优先限迭代次数）；基于现有 VRM 解析扩展，无需新物理库
- [ ] **2D 角色 Normal Map 打光** (P1, Stage 3): PuppetElement 增加 normal map 纹理通道；2D 光照 WGSL fragment shader（Blinn-Phong）；动态光源联动角色情绪/场景事件 → Stage 3 互动电影核心差异化功能
- [ ] **PBD 布料 compute shader** (P2, Stage 4+): wgpu compute pass + GPU buffer 直接更新 mesh vertices；distance + bend + collision constraints；插在 GPU Skinning pass 之前；Stage 4 游戏引擎必要条件
- [ ] **程序化纹理** (P2): wgpu compute 生成 Noise/Voronoi/Gradient；支持 AIEditResult `update-material` 操作实时修改（场景风格叙事联动）
- [ ] **纹理压缩 + 流式加载** (P3, Stage 4+): BC7/ASTC/KTX2 平台感知压缩；按视距分级加载 mipmap；`texture_lod_bias` 字段进 SceneSpec region

### AI Technology Integration (Local ONNX + Retargeting)

> [ADR](./docs/architecture/ai-technology-landscape.md) — Full landscape analysis + integration strategy

**P0 — Local ONNX models (runtime-ml infrastructure exists)**

- [ ] **HMR2 ONNX** (~100MB): video frames → SMPL body params + 3D joints → RetargetMap → SemanticMotion — "film yourself → drive any character"
- [ ] **Demucs ONNX** (~200MB): audio → vocals/drums/bass/other 4-track separation — unlocks beat sync, semantic audio diff, remix workflows
- [ ] **Depth Anything v2 ONNX** (~50MB): image → depth map; + SAM segmentation → foreground/midground/background → SceneSpec with parallax — single image → camera-movable 2.5D scene
- [ ] **RetargetMap types** (@neko/shared): SMPL↔VRM Humanoid / SMPL↔Live2D / BVH↔VRM bone name mapping — prerequisite for all AI motion extraction

**P1 — Narrative AI (EmotionArc + CharacterAgent)**

- [ ] **EmotionArc type**: time-series emotion keyframes (EmotionVector[joy/sadness/anger/fear/surprise × intensity] + trigger text) — drives 5 domains simultaneously: ExpressionSpec (face) + SemanticMotion (body) + VoiceSpec (tone) + LightSpec (atmosphere) + MusicSpec (score)
- [ ] **CameraDirector AI**: LLM generates CameraKeyframe[] from scene content + EmotionArc (dialogue → close-up alternating, tension → slow push-in, landscape → wide establishing + slow pan)
- [ ] **CharacterAgent framework**: per-character AI with independent memory + persona + structured LLM output (emotion/action/text) + VoiceSpec + ExpressionStyle binding
- [ ] **VoiceSpec + TTS viseme**: TTS outputs phoneme timestamps → ExpressionSpec viseme channel additive blending → lip sync

**P2 — Creative AI Tools**

- [ ] **ai-auto-edit**: SceneDetect scene boundary detection + LLM semantic analysis + auto-assembly/color/transition
- [ ] **ai-match-music**: FFT peak detection + onset strength beat analysis → edit points auto-align to music beats
- [ ] **IP-Adapter reference injection**: character consistency across storyboard shots (ControlNet pipeline prerequisite)
- [ ] **Holodeck scene layout**: LLM → structured SceneSpec (asset selection + spatial layout + lighting + atmosphere)

**P3 — Advanced Local Models (via neko-market)**

- [ ] SAM (~400MB ONNX): segmentation for layer extraction (Live2D prep, 2.5D scene creation)
- [ ] XTTS (~1.5GB): TTS with voice cloning for character voices
- [ ] Local VLM (LLaVA/MiniCPM-V via Ollama): offline visual understanding for PerceptionContext
- [ ] DUSt3R (~500MB ONNX): multi-image → 3D scene reconstruction without COLMAP

---

## Extension Pack Layered Installation

> [ADR](./docs/architecture/extension-pack-strategy.md)

14 extensions split into stackable sub-packs by scenario, **build order aligned with development phases**:

| Build Phase | Sub-pack             | Included Extensions                                       | Target Users                          |
| ----------- | -------------------- | --------------------------------------------------------- | ------------------------------------- |
| **Phase 1** | **neko-suite-core**  | engine + tools + preview + assets + auth + agent + market | Infrastructure + AI (auto-dependency) |
| **Phase 1** | **neko-suite-video** | core + cut + canvas + story                               | AIGC video creators                   |
| **Phase 2** | **neko-suite-audio** | core + audio                                              | Audio creators                        |
| **Phase 2** | **neko-suite-2d**    | core + sketch                                             | 2D illustration/animation creators    |
| **Phase 3** | **neko-suite**       | All 14 (incl. puppet + model + live)                      | Full-stack creators                   |

```
Build priority:
Phase 1 → neko-suite-core + neko-suite-video  (core creation loop)
Phase 2 → neko-suite-audio + neko-suite-2d    (creative tool expansion)
Phase 3 → neko-suite full pack                (professional editing + VTuber)
```

agent/market are included in core; scenario sub-packs stack with zero duplication:

```bash
./install.sh --pack video            # Phase 1: AIGC video full workflow
./install.sh --pack video --pack 2d  # Phase 2: video + 2D
./install.sh --all                   # Phase 3: all release-ready
```

---

## Contributing

- [CLAUDE.md](./CLAUDE.md) - Development standards and architecture guide
- [README.md](./README.md) - Project overview and quick start

**Priority contribution areas**: neko-engine rendering optimization · neko-agent Skills development · neko-cut interaction improvements · test coverage

---

_Last updated: 2026-05-07 (Device management WIP + Panoramic preview WIP + Agent multimodal perception pipeline + Rich content delivery + Runtime workflow hardening + neko-sketch PSD import + neko-model 3D fixes + Marketplace governance hardening.)_
