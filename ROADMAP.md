# Neko Suite Roadmap

> **Lang:** English | [中文](./ROADMAP_CN.md)

> The project is currently in **Alpha stage**. The core triangle (Engine + Cut + Agent) is operational and under rapid iteration.
> For detailed task lists, see [TODO.md](./TODO.md). Server-side tasks are tracked in the [neko-hub](../neko-hub) repository.

---

## Development Status Overview

> **Phasing strategy**: Phase 1 focuses on core functionality + infrastructure, ensuring the AIGC video creation pipeline is usable end-to-end. Phase 2 completes the creative toolset. Phase 3 expands professional editing capabilities.

### Phase 1: Core Functionality + Infrastructure (Current Focus)

> Goal: Complete AIGC video creation loop (script → storyboard → editing → export) + AI-driven + asset management + marketplace ecosystem

| Module | Status | Progress | Description |
|--------|--------|----------|-------------|
| **neko-engine** | Alpha | 98% | GPU rendering + codec + export + HTTP/WS + device proxy + ONNX ML inference + full color/keying pipeline + keyframe/animation blending + character editing API + **concurrency guard Semaphore(8/4/2) ✅** |
| **neko-agent** | Alpha | 99% | **0 TODOs**, 108 tests, 300+ files; 7 LLM + 10 media adapters + MCP + Coordinator + SubAgent + Creative Memory + quality assessment; remaining: MCP reconnection backoff + **Webview architecture optimization** ([ADR](./docs/architecture/neko-agent-webview-optimization.md)) |
| **neko-cut** | Alpha | 95% | **~65K LOC**, 50+ commands; AI Handler 14/16 actions; **P0 closed**; subtitle/ripple editing/playback speed/effects export complete; remaining: export round-trip tests + ai-auto-edit/ai-match-music + advanced time editing ([ADR](./docs/architecture/neko-cut-timeline-creation-assessment.md)) |
| **neko-story** | Alpha | 95% | **0 TODO(P0)**, 155+ tests; 8 LSP Providers + Fountain parser + 3 preview views + ScenePlan/ShotPlan planners + StorySceneStateStore cross-session persistence; Story→Agent→Canvas semantic pipeline fully operational ([ADR](./docs/architecture/story-agent-canvas-boundary.md)) |
| **neko-canvas** | Alpha | 90% | 13 node types + BatchGenerationScheduler + 7 MCP Tools; **P0 fully converged** ✅ (protocol unified + message encapsulation + review closed loop + SceneGroupNode semantic container + creation entry coverage) + P1-1 CanvasEmbedNode + P1-4 NodeRendererRegistry; remaining P1 enhancements ([ADR](./docs/architecture/canvas-role-boundary.md)) |
| **neko-preview** | Alpha | 86% | 6 editor types + waterfall layout + Content→Agent + **EPUB outline TreeView ✅**; Phase 1 remaining: FDX; Phase 2: XLSX/PPTX |
| **neko-assets** | Alpha | 88% | Pure TreeView architecture + ThumbnailService + **search L0 persistent index + type filtering + 200 limit ✅**; remaining: L1-L3 cache (depends on new Engine actions) |
| **neko-market** | Alpha | 88% | **~4.4K LOC**; full React Webview implementation (Browse/Installed/Updates + Zustand + i18n) + market-core 58 tests; remaining: Registry Server integration (neko-hub) |
| **neko-auth** | Alpha | 90% | Full OAuth 2.0 + PKCE implementation (OAuthClient + TokenManager + NekoAuthService + VscodeTokenStorage), 0 TODOs, 43 tests; remaining: backend end-to-end verification |
| **neko-tools** | Alpha | 72% | **~15K LOC**; image/video/audio diff + silence detection + metadata viewer; remaining: polish |
| **neko-types** | Alpha | 92% | Shared types + unified cross-cutting concerns + type-safe Operations |
| **neko-client** | Alpha | 80% | H264/fMP4/PCM streaming client + EngineClient HTTP dispatch |
| **neko-proto** | Stable | 100% | timeline.proto + diff.proto complete IDL |

### Phase 2: Creative Tools Completion

> Goal: Audio workstation + 2D painting capabilities, expanding creative scenario coverage

| Module | Status | Progress | Description |
|--------|--------|----------|-------------|
| **neko-audio** | Alpha | 92% | **0 TODOs**, ~9.1K LOC, 78 tests; waveform + spectrum + 12-type effect chain + multi-track + microphone; essentially complete |
| **neko-sketch** | Alpha | 78% | **~13.5K LOC**, 7 tests; brush engine + pressure sensitivity + layers + selection + AI tools + cross-module workflow; **missing**: transform tools (rotate/scale) |

### Phase 3: Professional Editing Capabilities

> Goal: 3D/2D character editing + VTuber live streaming, targeting professional users

| Module | Status | Progress | Description |
|--------|--------|----------|-------------|
| **neko-puppet** | Alpha | 92% | **8.5K LOC** + 104 Rust tests; INP + **MOC3 loading** (clean-room parser/deformers/expressions/motions/physics) + parameter deformation + animation blending + 60fps streaming + Canvas rendering; remaining: AI tools (Phase 6) / VTS API (Phase 7) / export |
| **neko-model** | Alpha | 85% | **12.6K LOC** + 49 Rust tests; glTF/VRM + PBR/IBL + CSG + face sculpting + particles + keyframes; remaining: IK UI / Undo / Blender bridging |
| **neko-live** | Alpha | 55% | **2.6K LOC** + 0 tests; VMC+VRM + Puppet integration + recording; **blocked**: nokhwa crate / MediaPipe / streaming |

### Meta Package

| Module | Status | Progress | Description |
|--------|--------|----------|-------------|
| **neko-suite** | Stable | 90% | Extension Pack + Release workflow |

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
- [ ] P1: `NodeRendererRegistry` extension (metadata/icons/property panel schema converge into registry)
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

### neko-agent — Webview Architecture Optimization TODO
> [ADR](./docs/architecture/neko-agent-webview-optimization.md) — Score 7.5/10
- [ ] **P0: Decompose `AIAssistant`** (~589 LOC) → `AppShell` + `ConversationController` + `ChatWorkspace`
- [ ] **P0: Unify outbound message gateway** — all Webview→Extension through `VSCodeMessages` builder
- [ ] **P0: Strengthen inbound types** — `ExtensionToWebviewMessage` discriminated union + typed handlers
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

### neko-agent — Rich Media Architecture TODO
> [ADR](./docs/architecture/agent-media-architecture.md)
- [ ] P1: RichContentBlock registry (type + kind→component mapping + ContentBlockRenderer integration)
- [ ] P1: Predefined kinds (storyboard / media_card / comparison / form / data_table)
- [ ] P1: `mediaPreprocessor.ts` (image resize + video keyframe extraction)
- [ ] P1: `parse_script_to_shots` refactor (agent-internal, zero canvas deps)
- [ ] P1: Pipeline media landing unification (`MediaGeneratorAdapter` → local save + asset index)
- [ ] P2: Extension Host DragDropBroker enhancement (~100 lines)

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

### neko-sketch (2D) — S.1-S.4 All Complete ✅
- ✅ Phase S.1-S.3 (painting + skeletal animation + advanced 2D)
- ✅ Phase S.4 P1: `sketch.generate` (SketchGenerate MCP tool → MediaGenerationService → canvas layer)
- ✅ Phase S.4 P1: Inpaint / StyleTransfer / AutoLayer AI tools (getSelectionMask/getCanvasImageData → generate → new layer)
- ✅ Phase S.4: Cross-module workflow (editImage → SketchEditorProvider → pendingImport; sendToTimeline / sendToCanvas commands)
- [ ] Phase S.4 P2: `style_transfer` cross-module integration enhancement (depends on NekoCanvasAPI image node support)

### neko-engine — Plugin Architecture Expansion
> [Plugin RFC](./docs/architecture/engine-plugin-rfc.md) + [Runtime Layering](./docs/architecture/engine-runtime-layering.md)
- ✅ P1: PluginManager MVP (manifest scan + version validation + enable/disable/reload + PluginsController 5 actions + 12 tests)
- [ ] P1 remaining: Integrate `effects:register` / `models:register` into unified plugin lifecycle
- [ ] P2: Create FormatRegistry / DeviceRegistry / ExporterRegistry / PreviewRegistry (plugin-extensible registries)
- [ ] P2: Extract `runtime-format` crate (decouple file format probing from engine-kernel)
- [ ] P3: Connector plugin support (external sidecar/remote runtime declarations + health check)

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

### Device Proxy ✅
- Microphone ✅ | MIDI ✅ | Gamepad ✅ | Camera ⚠️ framework ready (capture TODO, prerequisite for neko-live)
> [ADR](./docs/architecture/device-access.md)

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

| Completed Capability | LOC | Quality |
|---------------------|-----|---------|
| glTF/VRM loader (two-pass skeleton parsing) | 385 lines Rust | Production |
| bevy_ecs scene graph (20+ components) | 922+388 lines Rust | Production |
| Animation playback + blending + keyframe CRUD | 814+85 lines Rust | Production |
| CSG boolean operations (BSP tree) | 798 lines Rust | Production |
| Procedural geometry (6 primitives) | 602 lines Rust | Production |
| PBR rendering (Cook-Torrance + IBL + post-processing) | 2,917 lines Rust GPU | Production |
| GPU particle system (Compute Shader) | 449 lines Rust | Production |
| Parametric face sculpting (22 params + skeletal expressions + VRM 17 expressions) | 632 lines TS | Production |
| IK solver (FABRIK, 12 tests) | 482 lines Rust | Backend complete, no UI |

**Phase 3.4: AI-Assisted 3D (Long-term)**
- [ ] AI MCP Tools: `face.generate_params` / `face.from_image` / `face.adjust` (infrastructure ready, needs neko-agent connection)
- [ ] IK UI exposure: wire backend 482-line IK solver to frontend (TransformGizmo drag → IK chain inverse solving)
- [ ] Direct face drag editing (Raycasting → Morph Target mapping, high effort)
- [ ] Undo/Redo state machine (commands registered, Zustand store ready, needs history stack implementation)

**Phase 3.5: Advanced 3D (Long-term)**
- [ ] MCP Blender bridge (complex modeling/modifiers/UV unwrapping → external professional tools)
- [ ] MCP ComfyUI integration (AI image pipeline + ControlNet → texture generation)
- [ ] 3DGS Gaussian Splatting (Compute Shader skeleton exists, needs loader/UI)
- [ ] rapier3d physics engine (collision/cloth/rigid body)
- [ ] neko-live integration (face capture → skeleton mapping, cross-module)

**TS frontend test gap**: 0 test files (vitest configured, framework ready).

---

### neko-puppet Long-term Roadmap

**Current state**: ~8,500 lines of production code, 104 Rust tests. Supports both INP (.inp) and **Live2D MOC3 (.moc3)** formats.

| Completed Capability | LOC | Quality |
|---------------------|-----|---------|
| INP binary parsing (JSON + TEX_SECT texture extraction) | 704 lines Rust + 65 lines TS | Production |
| **MOC3 binary parser** (clean-room, zero unsafe, OpenL2D spec) | ~570 lines Rust | Production |
| **MOC3 loader** (→ format-agnostic ECS entities) | ~370 lines Rust | Production |
| **Key form interpolation** (1D linear) | ~170 lines Rust | Production |
| **Warp deformer** (grid bilinear interpolation) | ~180 lines Rust | Production |
| **Rotation deformer** (pivot rotation) | ~100 lines Rust | Production |
| **Expression** (.exp3.json → 3 blend modes + crossfade) | ~200 lines Rust | Production |
| **Motion** (.motion3.json → AnimationClip, Bezier 30fps sampling) | ~270 lines Rust | Production |
| **Physics** (.physics3.json → SimplePhysics chained pendulum) | ~280 lines Rust | Production |
| bevy_ecs skeletal world (parameter-driven deformation) | 840+226 lines Rust | Production |
| Animation system (11 easing types + blending + keyframe CRUD) | 401+84 lines Rust | Production |
| Physics simulation (spring/rigid pendulum) | System 815 lines incl. physics tick | Production |
| WebSocket 60fps streaming | Controller layer | Production |
| Canvas 2D texture rendering (affine UV + blend modes + zoom/pan) | 346 lines TS | Production |
| Parameter panel + facial parameter categories + animation panel + node tree + keyframe timeline | ~800 lines TS | Production |
| **Face tracking**: ParamBody/Breath/Cheek/EyeSmile + LIVE2D_PARAM_ALIASES | ~120 lines TS | Production |

**Phase P.next: MOC3 Enhancement (Near-term)**
- [ ] Phase 6: AI-assisted puppet creation — `PuppetListExpressions`/`PuppetSetExpression` agent tools + "Import .moc3 model" template UI
- [ ] Phase 7: VTube Studio API compatibility — WebSocket endpoint accepting VTS plugin protocol subset (AuthToken, InjectParameterData, ExpressionState)
- [ ] 2D bilinear interpolation (dual-axis key form interpolation for complex parameter bindings)
- [ ] Real .moc3 model E2E testing (validate parser against production models from VTube Studio)

**Phase P.1: Enhanced Editing (Mid-term)**
- [ ] Puppet export (INP/MOC3 writer → save modified puppets; currently read-only)
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
> [Device Proxy ADR](./docs/architecture/device-access.md)

**Current state**: Phases 5.1.1-5.1.2 complete, 2,600 lines of production code (1,032 extension + 1,580 webview), 0 tests.

| Completed Capability | LOC | Quality |
|---------------------|-----|---------|
| VMC/OSC protocol receiver (UDP frame accumulation + FPS measurement) | 375 lines TS | Production, zero external deps |
| VRM real-time driving (Three.js + @pixiv/three-vrm) | 108 lines TS | Production |
| ARKit 52 → VRM 17 expression mapping | 106 lines TS | Production |
| ARKit → Inochi2D parameter mapping | 118 lines TS | 80% (head conversion needs refinement) |
| 2D Puppet renderer | 132 lines TS | 80% (missing texture rendering) |
| Canvas video recording (WebM VP9 → base64 → disk) | 111 lines TS | Production |
| Microphone recording (EngineClient → cpal → WAV) | 131 lines TS | Production |
| Avatar selector (7 formats + project file parsing) | LivePanelProvider 485 lines | Production |

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
- 6.6.1: `neko://` protocol + MediaResolver (proxy/original auto-switching) + `AssetFile.proxy` + `IFileTransport`
- 6.6.4: Export optimization (preview uses proxy 720p + final export incremental pull of original files)

### Phase 6.7 (TODO): Project Collaboration Infrastructure
- Git LFS integration — [ADR](./docs/architecture/project-data-management.md)
- Project Memory ✅

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

Hybrid strategy: VSCode in-editor editing/export + Electron external app for immersive preview + MCP bridging to Unity/Unreal.

- 7.1: Stereoscopic rendering + XR endpoints — 2-3 weeks
- 7.2: Electron WebXR App + hand tracking — 3-4 weeks
- 7.3: AR (plane detection + lighting estimation) — 4-6 weeks
- 7.4: AI-assisted XR — TBD

---

## Phase 8: Interactive Video Creation (Long-term)

> Prerequisites: Phases 1-3

Bilibili interactive video / YouTube interactive content. Reuses neko-cut timeline + neko-canvas node graph + neko-story screenplay.

- 8.1: Branch editing (canvas ChoicePointNode + cut ChoiceMarker) — 2-3 weeks
- 8.2: Interactive previewer — 2-3 weeks
- 8.3: Branch validation + AI assistance — 1-2 weeks
- 8.4: Platform export (Bilibili IVG / YouTube / Web HTML5) — 2-3 weeks

---

## Extension Pack Layered Installation
> [ADR](./docs/architecture/extension-pack-strategy.md)

14 extensions split into stackable sub-packs by scenario, **build order aligned with development phases**:

| Build Phase | Sub-pack | Included Extensions | Target Users |
|-------------|----------|-------------------|--------------|
| **Phase 1** | **neko-suite-core** | engine + tools + preview + assets + auth + agent + market | Infrastructure + AI (auto-dependency) |
| **Phase 1** | **neko-suite-video** | core + cut + canvas + story | AIGC video creators |
| **Phase 2** | **neko-suite-audio** | core + audio | Audio creators |
| **Phase 2** | **neko-suite-2d** | core + sketch | 2D illustration/animation creators |
| **Phase 3** | **neko-suite** | All 14 (incl. puppet + model + live) | Full-stack creators |

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

*Last updated: 2026-04-09 (Sprint 2 convergence: canvas P0 fully closed + story state persistence + semantic storyboard pipeline end-to-end; Phase 3 ~88%)*
