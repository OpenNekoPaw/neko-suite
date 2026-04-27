# System Architecture Overview

> **Lang:** English | [中文](./ARCHITECTURE_CN.md)

> This document serves as the architecture entry point for Neko Suite. For detailed Architecture Decision Records (ADRs), see [docs/architecture/](./docs/architecture/) and [docs/](./docs/).

---

## System Positioning

Neko Suite is a creative work suite deeply integrated into VS Code. The core challenge is delivering heavy computation capabilities — media processing, GPU rendering, etc. — within VS Code's security sandbox constraints, while maintaining editor responsiveness.

**Solution**: Rust Sidecar process + dual-process communication model.

---

## Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Process                          │
│                                                                 │
│  ┌──────────────────────────────────────────────┐              │
│  │              Extension Host (Node.js)         │              │
│  │                                              │              │
│  │  neko-engine ext  neko-cut ext  neko-agent ext  ...         │
│  │       │                │               │                    │
│  └───────┼────────────────┼───────────────┼────────────────────┘
│          │ N-API          │ postMessage   │ postMessage         │
│          │         ┌──────┼───────────────┼──────┐             │
│          │         │      Webview (Browser)       │             │
│          │         │  neko-cut UI  neko-agent UI  │             │
│          │         └──────────────────────────────┘             │
└──────────┼──────────────────────────────────────────────────────┘
           │ Unified HTTP/WebSocket (axum, single port)
┌──────────▼──────────────────────────────────────────────────────┐
│                   neko-engine (Rust Sidecar)                    │
│                                                                 │
│  engine-kernel:   wgpu GPU · FFmpeg codec · Animation · GPU Skinning · Export · Cache │
│  runtime-scene:  3D Scene ECS (bevy_ecs + glTF/VRM + IK + Blend)  │
│  runtime-puppet: 2D Skeletal ECS (bevy_ecs + inox2d + Blend/Crossfade) │
│  host-http:   axum HTTP/WebSocket server (unified port)        │
│  host-napi:   Node.js N-API bindings                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Communication Patterns

### 1. Extension Host ↔ Webview: postMessage IPC

```
Webview (React)          Extension Host (Node.js)
     │                          │
     │─── postMessage ──────────▶│  Handle request (file I/O, VSCode API)
     │◀── postMessage ───────────│  Return result
```

The Webview runs inside a browser sandbox and **cannot directly access the file system or VS Code APIs** — all such operations must go through the message protocol proxy. Message types are defined in `@neko/shared` under `types/message.ts`.

### 2. Extension Host ↔ Rust Engine: Unified HTTP/WS (EngineClient)

```
Extension Host
     │
     └─ EngineClient (@neko/neko-client, zero vscode dependency)
          │
          ├─ HTTP POST /v1/dispatch  →  host-http  →  engine-kernel
          │  For: synchronous commands (probe, waveform, diff, extractFrame, effects)
          │
          └─ WebSocket /v1/streams/:id  →  host-http  →  engine-kernel
             For: streaming (H.264 push, PCM decode, control commands)
```

**Key architecture points**:
- **Unified port**: All extensions share a single neko-engine Sidecar process and port
- **Port discovery**: `vscode.commands.executeCommand('neko.engine.ensureFrameServer')` → `{ port }`
- **EngineClient location**: `@neko/neko-client` (not a neko-engine subpackage), zero vscode dependency
- **Convenience methods**: `probe()`, `waveform()`, `diff()`, `extractFrame()`, `listEffects()`, `applyEffect()`, etc.

### 3. Webview ↔ Rust Engine: Direct WebSocket (Streaming)

```
Webview (H264StreamClient / AudioStreamClient)
     │ WebSocket
     ▼
neko-engine axum WebSocket endpoint
     │
     ▼
engine-kernel decoder → GPU decoded frames → H.264 NAL / PCM Float32
```

Streaming goes over WebSocket directly, bypassing the Extension Host to avoid redundant frame data copies through the Node.js layer.

---

## Package Dependency Graph

```
@neko/proto (single source of truth for IDL)
     ↓ generates
@neko/shared (neko-types)    ←── all packages depend on this (Logger/i18n/Theme/Errors, zero internal deps)
@neko/neko-client            ←── EngineClient + streaming client (zero internal deps)
     ↑
neko-engine/host-napi      ←── N-API bindings (independently compiled)
     ↑
neko-engine/extension        ←── sole Sidecar manager + unified HTTP/WS server
     ↑ (communicates via EngineClient HTTP/WS)
neko-preview  →  @neko/neko-client
neko-cut      →  @neko/neko-client + neko-tools + neko-preview
neko-agent    →  @neko/neko-client + neko-tools + neko-preview
neko-tools    →  @neko/neko-client
neko-canvas   →  neko-engine + neko-tools + neko-preview
neko-model    →  neko-engine + @neko/neko-client + neko-tools + neko-preview
neko-sketch   →  neko-engine + @neko/neko-client + @neko/shared
neko-story    →  @neko-story/parser + @neko/shared
neko-assets   →  @neko/asset + @neko/shared
```

---

## Core Data Flows

### Video Playback Flow

```
User clicks play
  │
  ▼
Extension Host
  └── PreviewService / MediaService
        └── EngineClient.createStream() → HTTP POST /v1/dispatch
              └── Hardware decode → H.264 NAL stream (WebSocket /v1/streams/:id)
                    │
                    ▼
              Webview H264StreamClient
                    └── WebCodecs VideoDecoder
                          └── Canvas renders frame
```

### Video Export Flow

```
User triggers export
  │
  ▼
Extension Host
  └── ExportService
        └── EngineClient.dispatch() → HTTP POST /v1/dispatch
              ├── GPU render pipeline (wgpu compositor + EffectDispatcher)
              ├── Hardware encode (VideoToolbox/NVENC/VAAPI)
              └── Audio/video mux → .mp4 file
```

### Storyboard Pipeline (Script → Canvas → Cut)

```
neko-story script (.fountain)
  │
  ├── Path A: Mechanical (import_script_to_canvas tool)
  │     └── createStoryboardPayload(mode=mechanical) → ~lineSpan/10 ShotNodes
  │
  ├── Path B: Semantic (story → agent → canvas pipeline)
  │     └── ScriptIndex (stable sceneId + metadata)
  │           → GenerateScenePlan / GenerateShotPlan (deterministic planners)
  │           → neko-agent parseStoryboard (IStructuredStoryPlanner preferred)
  │           → importStoryboardToCanvas pipeline stage
  │           → NekoCanvasAPI.storyboard.import(mode=semantic)
  │
  ├── Path F: Full video creation (neko.story.startVideoCreation → flowF)
  │     └── parseStoryboard → importStoryboardToCanvas → generatePrompts
  │           → generatePilot → batchGenerate → qualityGate → arrangeOnTimeline
  │
  ▼
neko-canvas
  ├── GenerationPromptPanel
  │     └── neko.agent.buildPrompt (Chinese description → structured English prompt)
  │     └── neko.agent.generateForNode → BatchGenerationScheduler
  │           └── platform.media.generateImage → waitForTask → fetch base64
  │                 └── ShotNode.generatedImage updated
  ├── GalleryNode (candidate multi-view layouts: 3-view / 4-view / 9-grid)
  ├── 7 Canvas MCP Tools (canvas_list/get/update/create_node +
  │   generate_image/batch + set_project_generation_config)
  └── Export: neko.cut.importStoryboard
          │ postMessage → webview
          ▼
    neko-cut timeline (ShotNode → VideoClip track segments)
```

**Shared Storyboard Utils** (`@neko/shared/utils/storyboardPlanner.ts`):
- `createStoryboardPayload()` — builds `CanvasStoryboardPayload` from `ScriptIndex` (mechanical or semantic mode)
- `applyStoryboardPayloadToCanvas()` — applies payload to canvas API, creating scene/shot nodes

**Complete Canvas Node Types** (`@neko/shared` `types/canvas.ts`):

| Node Type | Purpose |
|-----------|---------|
| `shot` | Storyboard frame (ShotScale + GeneratedImageVersion[] + candidate navigation) |
| `scene` | Horizontal scene container (SceneGroupNode, groups ShotNodes by scene) |
| `gallery` | Multi-view gallery (5 layouts + costumeLabel + @references + batch generation) |
| `script` | Script node (TOC directory + getScriptIndex → click to jump to SceneGroupNode) |
| `document` | Document node (PDF/DOCX/EPUB cover thumbnail + openDocument → vscode.open) |
| `model` | AI model node (reference/workflow dual mode + checkModelInstalled) |
| `canvas-embed` | Nested canvas reference (P3 planned, .nkc thumbnail + double-click to open) |

### AI Agent Workflow

```
User natural language input
  │
  ▼ UserPromptSubmit hooks (Shell, dynamic context injection)
  │
  ▼
Webview chat UI
  │ postMessage (regular message / /slash-command)
  ▼
Extension Host
  ├── SlashCommandHandler — parse /command, apply SkillInjection to AgentSession
  └── AgentManager — independent AgentRunner per session, LRU max 10 instances
        │
        ▼
  AgentSession (unified abstraction for Extension + CLI)
  │  system prompt = base + [accumulated Skill prompt injections]  ← Session-level, permanently written, see Note ①
  │
  ▼  PreToolUse hooks chained (Shell → TS PermissionHooks)
  │
  AgentExecutor (ReAct loop)
  │  tool list = ToolInjectionManager.getToolsForTurn()  ← recalculated per turn, see Note ②
  │              ├── always layer: core tools (Read/Write/Bash/Grep + meta-tools)
  │              │                 + alwaysActive ToolSets' tools
  │              └── dynamic layer: manually activated ToolSets' tools
  │                                 (LLM calls ActivateToolSet / Skill auto-links)
  │
  ├── Claude / OpenAI API (streaming, @neko/platform LLM router)
  └── Tool call → ToolRegistry.execute()
        └── Timeline tools → EngineClient → neko-engine timeline mutation
```

**Three Injection Mechanisms Compared** (important — do not confuse):

| Mechanism | Implementation | Injection Timing | Reversible | Context-Aware |
|-----------|---------------|-----------------|------------|---------------|
| **① Skill System Prompt** | `applySkillInjection()` appends to `_history[0]` | One-time write per session | ❌ No removal path | ❌ Not governed by token budget |
| **② ToolSet Tool List** | `getToolsForTurn()` recalculated each time | Dynamic per turn | ✅ Real-time activate/deactivate | ✅ Two-tier token budget (always/dynamic) |
| **③ ContextItem** | `ContextManager` (used by MemoryHooks) | Injected as separate message per turn | ✅ LRU eviction | ✅ Three-tier size budget (turn/session/persistent) |

> **Note ①**: `applySkillInjection()` directly mutates `_history[0].content`. Multiple calls (from multiple slash commands) accumulate without limit. `compressContext()` does not compress `_history[0]`, so the system prompt may grow linearly over the session. The only reset path: `configure({ systemPrompt })` for full replacement.
>
> **Note ②**: `SkillService.clearActiveSkill()` deactivates associated ToolSets (②), but **does not** remove already-injected prompt text from `_history[0]` (①). The two mechanisms have asymmetric lifecycles.

**neko-agent Internal Subsystems**:

| Subsystem | Components | Responsibilities |
|-----------|-----------|-----------------|
| **Tool** | ToolRegistry, ToolCategoryRegistry, ToolInjectionManager, ToolGroupRegistry, TOOL_NAMES | Tool registration / execution / layered injection / set management / name constants |
| **Skill** | SkillRegistry, SkillService, SkillMatcher, SkillInjector, ToolGuard | Skill discovery / application / prompt injection / tool guarding |
| **Hook** | PermissionHooks, MemoryHooks, ValidationHooks, SettingsHookLoader | In-process TS interception + external Shell hook chaining |
| **Capability** | CapabilityDiscoveryService, AgentCapabilityProvider | Sub-package capability discovery (manifest + command) / registration / lifecycle |

**Concept Boundaries**:
- `Tool` = atomic capability (executable function)
- `ToolSet` = tool visibility module (activated on demand, reduces token usage)
- `Skill` = behavioral pattern (system prompt + optional tool guard + associated ToolSets)
- `Hook` = execution interceptor (Shell external + TS internal chained execution)
- `SlashCommand` = user-triggered workflow (`/slash-command` → injects Skill prompt)

---

## Architecture Decision Records (ADR)

| Domain | Document | Key Decision |
|--------|----------|-------------|
| Unified Engine Architecture | [adr-unified-engine.md](./docs/adr-unified-engine.md) | EngineClient HTTP dispatch unifies all Engine calls, ports reduced from 3 to 1 |
| Cross-Cutting Concerns | [architecture/adr-cross-cutting-concerns.md](./docs/architecture/adr-cross-cutting-concerns.md) | Logger/i18n/Theme/Error unified in @neko/shared, three-layer isolation |
| AI Agent Architecture | [plans/2026-03-10-neko-agent-skill-tool-refactor-design.md](./docs/plans/2026-03-10-neko-agent-skill-tool-refactor-design.md) | ToolSet/Skill/Hook subsystem separation; Shell hooks bridged to PermissionHooks; Skill auto-activates ToolSets |
| Agent Capability Provider | [architecture/neko-agent-media-requirements-fit.md](./docs/architecture/neko-agent-media-requirements-fit.md) | Sub-packages register AgentCapabilityProvider via manifest+command; TOOL_NAMES constants as naming contract; CapabilityDiscoveryService hybrid discovery |
| Media Diff + LSP | [architecture/media-lsp.md](./docs/architecture/media-lsp.md) | H.264 + PCM streaming (not per-frame extraction); SSIM‖PSNR parallel; JVI diagnostics + symbol navigation + script semantic search |
| Cross-Language Architecture | [architecture/cross-language-architecture.md](./docs/architecture/cross-language-architecture.md) | Rust engine is the authoritative data model, TS handles UI only |
| Shared Package Design | [architecture/shared-packages-design.md](./docs/architecture/shared-packages-design.md) | @neko/shared exports via subpath layers |
| Asset Management | [architecture/asset-management-design.md](./docs/architecture/asset-management-design.md) | Unified AssetManifest + Handler registry pattern |
| 3D Capabilities | *Internalized* | bevy_ecs standalone crate + runtime-scene + R3F frontend; GPU Skinning (dual pipeline: skinned/non-skinned); FABRIK/CCD/TwoBone IK solvers; animation blending/crossfade |
| 2D Capabilities | *Internalized* | neko-sketch (painting) + neko-puppet (skeletal animation, standalone sub-extension); runtime-puppet (bevy_ecs + inox2d); multi-layer animation blending + crossfade; WS real-time streaming for neko-live |
| Character Editing | *Internalized* | 2D/3D face customization, motion adjustment, painting, modeling assessment; standardized facial parameter templates (3D: 22 params / 2D: 32 params); shared keyframe timeline; .nkm project format; IK skeletal interactive editing |
| VSCode Constraints | [architecture/vscode-constraints.md](./docs/architecture/vscode-constraints.md) | Panel placement: editor-bound → embedded Webview, global → native container; device access: Webview sandbox proxied through neko-engine Rust sidecar (cpal/nokhwa/midir/gilrs) |
| Engine Pluginization (RFC) | [architecture/engine-plugin-rfc.md](./docs/architecture/engine-plugin-rfc.md) | Capability pluginization instead of kernel pluginization; expose controlled shader/model/format/device/exporter/connector extension points; marketplace distributes, Engine Host activates |
| Engine Runtime Layering | [architecture/engine-runtime-layering.md](./docs/architecture/engine-runtime-layering.md) | Split runtimes by package and keep one Host app by default; Video/2D/3D/Docs/Device/ML stay in one host; Game/Sim/XR may graduate to dedicated sidecars later |
| Creative Context Compression | [architecture/creative-context-compression.md](./docs/architecture/creative-context-compression.md) | 7-level priority semantic classification: user messages permanently retained; creative decisions/version anchors/iteration chains/asset state/aesthetic preferences compressed in tiers |
| Ablation Experiment Framework | [architecture/ablation-experiment-framework.md](./docs/architecture/ablation-experiment-framework.md) | AblationToggles → AgentSessionConfig mapping + MetricsHooks metric collection, zero intrusion on existing subsystems |
| Agent Media Architecture | [architecture/agent-media-architecture.md](./docs/architecture/agent-media-architecture.md) | Story storyboard responsibility boundaries; Agent self-sufficiency; GeneratedAsset disk storage + JSON references; DragDropBroker cross-extension transfer; Send-to-Agent unified protocol (file-level + content-level, zero base64); MediaPreprocessor auto-scaling/frame-extraction |
| Story-Agent-Canvas Boundary | [architecture/story-agent-canvas-boundary.md](./docs/architecture/story-agent-canvas-boundary.md) | Agent-first boundary convergence: story owns script facts + lightweight review table, agent owns orchestration, canvas owns storyboard workspace; dual-path (mechanical/semantic) import; StorySceneStateStore + workspaceState persistence |
| Document Preview | [architecture/document-preview.md](./docs/architecture/document-preview.md) | PDF/EPUB/CBZ/DOCX built-in previewer; waterfall virtual scroll + dual-column mode; Webview direct connection to neko-engine HTTP (no postMessage relay); epub.js fetchForEpub replaces XHR |
| Path System | *Internalized* | Project files store only relative paths + `${VAR}/path`; PathResolver (@neko/shared L0) unified resolution; Rust ProjectContext (resolve/validate); EngineClient/PreviewFileServer auto-expand variables; variable sources: .neko/settings.json + settings.local.json |

---

## EditOperation Command System

All editors share a unified `EditOperation` abstraction (defined in `@neko/shared` under `operations/`), enabling operation-level undo/redo, AI integration, and audit trails.

```
Webview (user action)
  │
  ├─ Build EditOperation (type + payload + before + meta)
  ├─ Apply to local state (applyOperation)
  ├─ Record to undo stack (invertOperation generates inverse operation)
  └─ postMessage('operationApplied', operation)
        │
        ▼
Extension Host
  ├─ Incremental update of in-memory cache (applyOperation)
  ├─ Fire dirty event (onDidChangeCustomDocument)
  └─ Optional: forward to AI Agent for analysis
```

**Operation Domain Coverage**:

| Editor | Operation Prefix | Integration Method |
|--------|-----------------|-------------------|
| neko-cut | `track.*` / `element.*` | Built-in dispatch in editorStore |
| neko-audio | `audio.effect.*` / `audio.marker.*` | audioProjectStore (dispatch + undo/redo) |
| neko-canvas | `canvas.node.*` / `canvas.connection.*` | canvasOperationStore bridge layer |
| neko-sketch | `sketch.layer.*` / `sketch.stroke.*` | sketchOperationStore bridge layer |

---

## Design Principles

**SOLID-Driven**: Each module has a single responsibility, programs to interfaces, and decouples through dependency injection.

**Single Source of Authority**:
- Type contracts: `@neko/proto` (.proto IDL)
- Shared infrastructure: `@neko/shared` (Logger/i18n/Theme/Errors, three-layer isolation)
- Engine communication: `@neko/neko-client` (EngineClient + streaming client, zero vscode dependency)
- Computation logic: `neko-engine` (Rust — TS layer does not duplicate computation logic)

**Dual-Process Isolation**: Each extension is split into `extension/` (Node.js Host) and `webview/` (Browser) layers, communicating via postMessage.

**Progressive Architecture**: Extension Pack pattern — each extension can be installed independently and activated on demand.

---

## Tech Stack Overview

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 18 + Zustand + Tailwind + Vite | Mature ecosystem, Slice pattern for testability |
| Extension | VS Code Extension API + TypeScript + esbuild | Platform requirement |
| Media Engine | Rust + wgpu + FFmpeg + axum + tokio | Zero GC, cross-platform GPU, proven codecs |
| AI | Vercel AI SDK + Claude/OpenAI + MCP | Multi-model abstraction, streaming responses |
| Protocol | Protobuf IDL (manually maintained) | Cross-language type contracts |
| Streaming | H.264 + PCM over WebSocket | Low latency, native browser support (WebCodecs) |
| Build | pnpm 10 + Turborepo 2 | Monorepo parallel builds |
| Testing | Vitest v4.0.18 + cargo test | Covers both TS and Rust, unified coverage thresholds |

---

## Extension Activation Dependency Chain

```
neko-engine ◀── neko-preview ◀── neko-cut
                              ◀── neko-agent
                              ◀── neko-canvas ◀── neko-sketch
neko-tools  ◀── neko-cut
            ◀── neko-agent
```

`neko-engine` is the foundation for all media-processing extensions and must be activated first. All extensions communicate with neko-engine's unified HTTP/WS port via `EngineClient` (`@neko/neko-client`).

---

## Cross-Extension AI Collaboration

Neko Suite extensions collaborate through two mechanisms: **Exported APIs** (type-safe bidirectional calls) and the **VSCode Command Bus** (loosely-coupled unidirectional triggers).

### Communication Patterns

```
neko-canvas / neko-cut / neko-story
  │
  ├─ [Pattern A] vscode.extensions.getExtension<T>(id).exports
  │     → Direct typed API calls (NekoCanvasAPI / NekoCutAPI / NekoStoryAPI)
  │
  └─ [Pattern B] vscode.commands.executeCommand('neko.agent.*', payload)
        → Command bus IPC (loosely coupled, silent no-op if neko-agent is not installed)
```

### Exported API Contracts (`@neko/shared/types/extension-api.ts`)

| Extension | Export Type | Key Namespaces |
|-----------|-----------|----------------|
| neko-canvas | `NekoCanvasAPI & ISkillProvider` | `asset` / `canvas` / `storyboard` / `nodes` / `events` |
| neko-cut | `NekoCutAPI & ISkillProvider` | `timeline` / `ai` |
| neko-story | `NekoStoryAPI` | `parseScript` / `convertToTimeline` / `getScriptIndex` / `getCharacterRegistry` / `resolveCharacter` / `generateScenePlans` / `generateShotPlan` |
| neko-auth | `NekoAuthAPI` | `getSession` / `onDidChangeSession` |

### Cross-Extension Command Protocol

neko-agent registers the following commands for other extensions to invoke. Commands silently no-op when not registered:

| Command | Caller | Purpose |
|---------|--------|---------|
| `neko.agent.generateForNode` | neko-canvas `BatchGenerationScheduler` | Trigger platform media service image generation, returns `{ dataUrl: string }` |
| `neko.agent.reportGenerationProgress` | neko-canvas `BatchGenerationScheduler` | Broadcast generation progress to Agent Chat Webview |
| `neko.agent.registerSlashCommands` | neko-canvas / neko-cut etc. | Register `/slash` commands in the Agent chat panel |
| `neko.agent.internalChat` | Any extension | Reuse the configured LLM service for inference |
| `neko.agent.sendContext` | neko-canvas / neko-story | Inject context payload (AgentContextChip UI + story-selection / canvas-selection) |
| `neko.agent.startPipeline` | neko-story | Start a pipeline flow (flowF etc.) with structured params (source, importToCanvas, eventCommand) |
| `neko.agent.buildPrompt` | neko-canvas `GenerationPromptPanel` | Chinese scene description → structured English prompt (with character/shot scale/mood) |
| `neko.story.applyInlineDiff` | neko-agent | Apply WorkspaceEdit to script file (accept/reject confirmation) |
| `neko.story.startVideoCreation` | User / neko-story | Launch standard video creation workflow (flowF) from the current screenplay scene |
| `neko.story.handlePipelineEvent` | neko-agent pipeline | Write-back pipeline events to StorySceneStateStore for status tracking |
| `neko.canvas.importStoryboard` | neko-story / neko-agent | Import a `CanvasStoryboardPayload` into the active canvas as scene/shot nodes |

### ISkillProvider — Skill Discovery Interface

Extensions implementing `ISkillProvider` have their `getSkills()` aggregated by neko-agent's `ListPluginSkills` tool and exposed to the LLM:

```typescript
// @neko/shared
interface ISkillProvider {
  getSkills(): readonly SkillDef[];
}
interface SkillDef {
  id: string;
  name: string;
  description: string;       // LLM-readable capability description
  icon?: string;             // VSCode codicon
  command: string;           // VSCode command ID to execute this capability
  tags?: readonly string[];  // For filtering ('generation' | 'export' | ...)
}
```

Extensions currently implementing `ISkillProvider`:

| Extension | Skills |
|-----------|--------|
| neko-canvas | `batch-generate` / `export-storyboard` / `generate-selected` |
| neko-cut | `generate-video-clip` / `transcribe-audio` |

### Image Generation Data Flow (Canvas → Agent → Platform)

```
BatchGenerationScheduler (Extension Host)
  │
  ├─ callAgent()
  │     └─ executeCommand('neko.agent.generateForNode', { nodeId, prompt, ratio, ... })
  │                │
  │                ▼ neko-agent Extension Host
  │           platform.media.generateImage({ prompt, ratio, count })
  │                │
  │                ▼ @neko/platform → AI media service (Replicate / ComfyUI / ...)
  │           platform.media.waitForTask(taskId, timeout=3min)
  │                │
  │                ▼ fetch(output.url) → base64
  │           return { dataUrl: 'data:image/png;base64,...' }
  │
  ├─ reportToAgent(task, status)
  │     └─ executeCommand('neko.agent.reportGenerationProgress', { nodeId, taskId, status, total })
  │                │
  │                ▼ chatViewProvider.postMessage({ type: 'generationProgress', ... })
  │                      → Chat Webview real-time progress card
  │
  └─ onProgress('done', dataUrl)
        → Webview postMessage → ShotNode updates generated image
```
