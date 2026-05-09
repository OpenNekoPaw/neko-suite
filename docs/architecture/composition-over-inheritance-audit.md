# Composition Over Inheritance Audit

> **Date**: 2026-05-08  
> **Status**: Audit Complete  
> **Scope**: neko-cut, neko-sketch, neko-puppet, neko-model, neko-client, neko-tools

---

## Executive Summary

Six core packages audited for adherence to "composition over inheritance" principles. Overall the codebase demonstrates **strong commitment to composition**, with inheritance used only where justified (framework requirements or Template Method patterns).

| Package | Score | Max Inheritance Depth | Justified? |
|---------|-------|-----------------------|------------|
| neko-cut | 9/10 | 2 (framework) | Yes |
| neko-sketch | 10/10 | 0 | N/A |
| neko-puppet | 8/10 | 0 | N/A |
| neko-model | 8.5/10 | 0 | N/A |
| neko-client | 7.5/10 | 2 (device) | Yes |
| neko-tools | 9/10 | 3 (analyzer) | Yes |

**Key Findings**:
- Zero unjustified inheritance across 6 packages
- All inheritance is either framework-required (VSCode API, React.Component) or Template Method for lifecycle reuse
- Composition patterns: Zustand Slice composition, React Hook composition, Strategy/Registry pattern, DI via ServiceCollection, pure function composition
- Primary concern: EngineClient 63K monolith and un-sliced Zustand stores in neko-puppet/neko-model

---

## 1. neko-cut (9/10)

**Scale**: Extension 13,443 LoC | Webview 45,673 LoC

### Inheritance (Minimal)

Only 2 cases, both framework-required:

| Class | Inherits | Reason |
|-------|----------|--------|
| `VideoEditorModel` | `BaseEditorModel` | Editor multi-type abstraction (depth 2) |
| `OutlineItem` | `vscode.TreeItem` | VSCode API contract |

### Composition Patterns

**Extension Layer — ServiceCollection + Strategy**:
- `ServiceCollection` DI container: 15+ services registered via `set<T>(id, instance)`, no inheritance chain
- `VideoEditorProvider` (1114 LoC): implements `vscode.CustomTextEditorProvider`, composes 8 services (MediaService, ExportService, MessageHandler, EditorModel, StatusBar, OutlineProvider, etc.)
- `IToolHandler` interface + 7 implementations (Element/Keyframe/Mask/Shape/Effect/Audio/Query) registered in Map — Strategy pattern, zero inheritance

**Webview Layer — Hook + Slice Composition**:
- Timeline component splits concerns across 8 hooks: `useTimelineActions`, `useTimelineContextMenu`, `useTimelineSelection`, `useTimelineDragDrop`, `useTimelineScroll`, `useTrackReordering`, `useTrackNameEditing`, `useKeyboardShortcuts`
- Zustand store: 13 slices composed via TypeScript intersection types, three-phase initialization:
  - Phase 1 (Independent): Project / Selection / Playback / UIState
  - Phase 2 (History): OperationHistory / Dispatch / Keyframe
  - Phase 3 (Dependent): TrackOps / ElementOps / ElementSplit / Clipboard / ShapeOps

### Decoupling

| Boundary | Mechanism |
|----------|-----------|
| Extension <-> Webview | postMessage IPC |
| Services | ServiceCollection DI |
| Tool handlers | IToolHandler Strategy + Map registration |
| Store slices | TypeScript intersection types + `get()` |
| External API | NekoCutAPI + ISkillProvider interfaces |

### Improvement Opportunities

- MediaService (1062 LoC) and ExportService (998 LoC) could be further split
- Slice dependency graph could be documented explicitly (Mermaid)

---

## 2. neko-sketch (10/10)

**Scale**: Extension ~60K | Webview ~45K

### Inheritance

**Zero.** 13 core classes, all implement interfaces, none extend another class.

| Class | Implements | Role |
|-------|-----------|------|
| ToolManager | `IToolManager` | Tool switching |
| HistoryManager | `IHistoryManager` | Undo/redo stack |
| SelectionManager | `ISelectionManager` | Selection mask |
| BrushEngine | `IBrushEngine` | Brush rendering |
| SketchRenderer | `ISketchRenderer` | Renderer facade |
| RenderPipeline | `IRenderPipeline` | Layer compositing |
| WebGLContext | `IWebGLContext` | GL state wrapper |
| ShaderManager | `IShaderManager` | Shader compilation/cache |
| TextureManager | `ITextureManager` | Texture/FBO lifecycle |

### Composition Patterns

**Rendering Engine — Facade + DI**:

`SketchRenderer` composes 7 subsystems via constructor injection:
```
SketchRenderer (Facade)
├── IWebGLContext
├── IShaderManager
├── ITextureManager
├── IRenderPipeline (injected with IShaderManager + ITextureManager)
├── FilterPipeline
├── LightPass
├── ParticleRenderer + ParticleSimulation
```

**Drawing Tools — Pure Functions (zero classes)**:

| Module | Functions | Design |
|--------|-----------|--------|
| pixel-tool.ts | `drawPixel`, `drawLine`, `floodFill`, `patternFill` | Pure functions on ImageData |
| gradient-tool.ts | `paintLinearGradient`, `gradientRadius` | Pure functions |
| clone-tool.ts | `cloneStamp`, `cloneStampFromSource` | Pure functions |
| vector-tool.ts | `createPath`, `createRectangle`, `createEllipse`, `createPolygon`, `createStar`, `moveTo`, `lineTo`, `cubicTo` | Immutable data builders |
| vector-editing.ts | `hitTestVectorPathNode`, `moveVectorLayerNodes`, `toggleVectorNodeSelection` | Immutable transforms |

**Brush Types — Data-Driven Strategy**:
```typescript
const BRUSH_PROFILES: Record<BrushType, BrushProfile> = {
  'pen':    { minSizeFraction: 0.5, minOpacityFraction: 0.8, pressureCurve: 2.0 },
  'pencil': { minSizeFraction: 0.3, minOpacityFraction: 0.9, pressureCurve: 1.5 },
  ...
};
// Applied via: const profile = BRUSH_PROFILES[this.settings.type];
```

**Layer Management — Immutable Pure Functions**:
```
createLayer()      -> LayerData
addLayer()         -> LayerData[]  (new array)
removeLayer()      -> LayerData[]  (new array)
moveLayer()        -> LayerData[]  (new array)
duplicateLayer()   -> LayerData[]  (new array)
groupLayers()      -> LayerData[]  (new array)
```

**Filter Pipeline — Data-Driven + Ping-Pong FBO**:

Filters are data (`FilterDefinition` = id + name + params + GLSL source), not classes. `FilterPipeline` applies them sequentially via FBO ping-pong.

**Zustand Store — 14 Slices**:
document / layer / tool / brush / viewport / history / ui / selection / frame / filter / particle / scene / perspectiveGrid / fill

### Improvement Opportunities

- SketchEditorProvider (43K) should be split: CoreEditorProvider + FileImportManager + AIWorkflowManager
- SketchCanvas (2000+ LoC) should extract InputHandler + ToolDispatcher + CanvasHistoryRecorder

---

## 3. neko-puppet (8/10)

**Scale**: Extension ~75K | Webview ~65K

### Inheritance

Zero custom inheritance. All classes implement VSCode/domain interfaces at depth 1:

| Class | Interface |
|-------|-----------|
| PuppetEditorProvider | `vscode.CustomEditorProvider` |
| PuppetDocument | `vscode.CustomDocument` |
| PuppetController | `IPuppetController` |
| PuppetLiveModeService | `vscode.Disposable` |
| PuppetMotionInstallTarget | `IInstallTarget<'media'>` |

### Composition Patterns

**PuppetController — Delegation Wrapper**:

Implements `IPuppetController` (24 methods), all delegate to `EngineClient`:
```
IPuppetController (interface, 24 methods)
  -> PuppetController (impl)
       -> delegates to EngineClient (HTTP + WebSocket)
```

**Animation — Hook Composition**:

`usePuppetPlayback(controller)` returns 4 callbacks: `onPlay`, `onStop`, `onSeek`, `onCrossfade`. Zero classes.

**Rendering — Stateless Canvas**:

PuppetCanvas reads `deformedMeshes` + `textures` from store, renders via Canvas 2D affine texture mapping. All deformation computed in Rust engine.

### Weaknesses

| Issue | Severity |
|-------|----------|
| Monolithic Zustand store (21 fields, no slices) | Medium |
| No undo/redo (relies on VSCode FS) | Medium |
| Global logger registry (module singleton) | Low |
| IK solvers only in Rust (no JS preview) | Low (MVP) |

---

## 4. neko-model (8.5/10)

**Scale**: Extension ~50K | Webview 7,831 LoC (61 files)

### Inheritance

Zero custom inheritance. All classes implement interfaces.

### Composition Patterns

**Dual Rendering Path (Route A / Route B)**:
```
Route A (Primary): Rust ECS -> wgpu -> H264 Stream -> VideoViewport
Route B (Fallback): R3F + Three.js -> Viewport3D (development only)
```

App.tsx conditionally selects: `enginePort && routeAReady ? <VideoViewport/> : <R3FDevelopmentFallback/>`

**Optimistic Update — LocalPredictionLayer**:

Unique to neko-model, simplified CRDT-like pattern:
```
User action -> createLocalPrediction() -> immediate UI update
                                            |
                              sendRouteACommand() -> Engine
                                            |
                              Engine ACK -> commitPredictionsThrough(seq)
                              Engine NACK -> rollbackLocalPrediction(seq)
```

State machine: `active -> committed | rolled-back | timed-out`

**Command Envelope Pattern**:

All scene operations (transform, CSG boolean, bone update, keyframe CRUD) serialized as immutable `SceneCommandEnvelope { seq, baseRevision, command: { type, payloadJson } }`.

**ComponentSchemaRegistry — Data-Driven Inspector**:
```typescript
MODEL_COMPONENT_SCHEMA_REGISTRY.register({
  component: 'material',
  fields: [
    { path: 'roughness', kind: 'number', min: 0, max: 1 },
    { path: 'metallic', kind: 'number', min: 0, max: 1 },
    { path: 'emissive', kind: 'color' },
  ],
});
```
New component type = register data, no new class.

**Undo/Redo — CharacterCommandHistory**:

Stack-based, pure function undo/redo via command replay.

### Weaknesses

| Issue | Severity |
|-------|----------|
| Monolithic Zustand store (40+ fields, no slices) | High |
| App.tsx 800 LoC (message handling + callback chains) | Medium |
| ModelEditorProvider 25K (28 message types in switch/case) | Medium |
| Route B lacks gizmo sync with engine | Low |

---

## 5. neko-client (7.5/10)

**Scale**: ~180K total (EngineClient 63K alone)

### Inheritance

One justified hierarchy (depth 2, Template Method):

```
DeviceStreamClient<TEvent> (abstract)
  ├── MidiClient extends DeviceStreamClient<MidiEvent>
  └── GamepadClient extends DeviceStreamClient<GamepadEvent>
```

Base provides WebSocket lifecycle; subclasses implement `abstract parseEvent()`.

### Composition Patterns

**Streaming Clients — Three Independent Implementations**:

| Client | Size | Output Mechanism | Shared Base |
|--------|------|------------------|-------------|
| H264StreamClient | 18K | WebCodecs VideoDecoder | None |
| AudioStreamClient | 23K | Web Audio API scheduling | None |
| FMP4StreamClient | 12K | MediaSource Extensions | None |

No shared base class — justified because underlying APIs are fundamentally different.

**A/V Synchronization — Composition**:
```
AudioStreamClient.getCurrentTime() -> master clock
        |
FrameScheduler.schedule(masterClockUs) -> SKIP | RENDER | WAIT
        |
H264StreamClient frame queue consumption
```

FrameScheduler is a standalone class accepting any clock source.

**EngineClient — Monolithic Facade (63K)**:

100+ methods organized by concern (media/stream/audio/effects/scenes/puppets/recordings/devices/models/documents). Composes `perception` sub-facade.

### Weaknesses

| Issue | Severity |
|-------|----------|
| **EngineClient 63K single file** | **High** |
| Reconnection logic duplicated in H264/Audio/FMP4 | Medium |
| Config normalization pattern duplicated | Low |

---

## 6. neko-tools (9/10)

**Scale**: Extension ~4,500 LoC | Webview ~2,000 LoC

### Tools

| Tool | Module | Purpose |
|------|--------|---------|
| Media Diff | `media-diff/` | Compare image/video/audio files against Git versions |
| Asset Diff | `asset-diff/` | Compare asset entity variants |
| Media LSP | `media-lsp/` | JVI file language features (diagnostics, hover, definition, symbols) |

Three tools are completely independent — zero inter-tool imports or communication.

### Inheritance (3-level, justified)

The only 3-level hierarchy in the entire codebase:

```
IMediaDiffAnalyzer (interface)
  └── BaseMediaDiffAnalyzer (abstract)       <- cancel/abort lifecycle
        └── TempFileBackedMediaDiffAnalyzer  <- temp file management
              ├── ImageDiffAnalyzer
              ├── VideoDiffAnalyzer
              ├── AudioDiffAnalyzer
              └── TimelineDiffAnalyzer
```

- Layer 1: Shared cancel/abort handling (`cancel()`, `createAbortController()`, `throwIfAborted()`)
- Layer 2: Shared temp file write/cleanup (`writeTempFiles()`, `cleanupTempFiles()`)
- Layer 3: Each implements `analyze()` with engine-specific logic (89-232 LoC each)

### Composition Patterns

**AnalyzerRegistry — Open for Extension**:
```typescript
const registry = new AnalyzerRegistry();
diffService.registerAnalyzer(new ImageDiffAnalyzer(engineMediaService, tempFileService));
diffService.registerAnalyzer(new VideoDiffAnalyzer(engineMediaService, tempFileService));
// New media type = new Analyzer + registerAnalyzer() call, no existing code modified
```

**Interface Segregation (ISP) — 9 Lean Interfaces**:

| Interface | Methods | Responsibility |
|-----------|---------|----------------|
| IMediaDiffAnalyzer | ~3 | Analysis contract |
| IEngineMediaService | ~3 | Engine media ops |
| IAssetEntityReader | ~1 | Entity reading |
| IVariantComparisonService | ~1 | Variant comparison |
| IWorkspaceIO | ~2 | Workspace file I/O |
| ITempFileService | ~1 | Temp file management |
| IScheduler | ~1 | Scheduling |

**ServiceCollection DI Container**:

Generic type-safe DI (68 LoC), services registered by symbol ID.

**Webview — 6-Factory Composition Injection**:
```typescript
const runtime: IMediaDiffRuntime = {
  bridge,
  initialState,
  audioContextFactory,
  blobUrlRegistry,
  rafScheduler,
  streamClientFactory,
};
// Injected via React Context, consumed via useMediaDiffRuntime() hook
```

### Improvement Opportunities

- MediaDiffSession / AssetVariantDiffSession share similar structure; could extract `BaseEditorSession<TState>` if more tools are added

---

## Cross-Cutting Duplication Analysis

> **Key Finding**: Strong composition/decoupling inadvertently created ~3,300-3,500 lines of duplicated infrastructure code. The root cause is a **missing Extension Infrastructure Layer** between `@neko/shared` and individual packages.

### Problem: Two Types of Repetition

**Type 1 — Infrastructure Template Duplication (Should Extract)**:

These are identical or near-identical implementations repeated across packages with no domain justification:

| Pattern | Instances | Duplicate LoC | Root Cause |
|---------|-----------|--------------|------------|
| `getNonce()` CSP nonce generation | 13 files | ~78 | No shared utility |
| EditorProvider lifecycle boilerplate | 18 files | **~1,700** | No BaseEditorProvider |
| Webview HTML generation (CSP/DOCTYPE/script) | 18 files | ~350-400 | No HTML factory |
| Logger initialization boilerplate | 12 files | ~80 | No `initExtensionLogger()` |
| ErrorBoundary React component | 8 files | ~527 | No shared component |
| `acquireVsCodeApi` + message listener | 5+ files | ~200-300 | No shared Hook |
| Time formatting functions | 7+ files | ~200 | Exists in neko-client but not fully reused |
| CustomEditor registration | 18 files | ~100-150 | No helper function |
| Disposable/cleanup in onDidDispose | 18+ files | ~100-150 | No helper function |
| LocalResourceRoots setup | 15+ files | ~80-120 | No helper function |

**Type 2 — Domain-Specific Divergence (Correctly Separate)**:

These look similar but serve different domains; forced unification would create harmful coupling:

| Pattern | Packages | Why Separate is Correct |
|---------|----------|------------------------|
| Message routing switch/case | All EditorProviders | Each package has unique message types |
| Zustand Store slices | neko-cut (13) / neko-sketch (14) | State shapes are domain-determined |
| Drawing tool functions | neko-sketch only | pixel/gradient/clone logic is non-reusable |
| Stream clients (H264/Audio/FMP4) | neko-client | Underlying Web APIs are fundamentally different |
| Drag-drop hooks | neko-cut/canvas/audio | Domain logic divergence too large |
| Keyboard shortcut hooks | neko-cut/canvas/agent | Key bindings are domain-specific |

### Missing Abstraction Layer

```
Current architecture:

  @neko/shared (types, Logger, i18n, Theme)
        |
        v  (gap — no extension infrastructure)
  neko-cut / neko-sketch / neko-puppet / neko-model / neko-tools ...
  (each re-implements EditorProvider / HTML / Nonce / Logger init / ErrorBoundary)


Recommended architecture:

  @neko/shared (types, Logger, i18n, Theme)
        |
        v
  @neko/shared/vscode/extension         <-- NEW: Extension infrastructure
  (BaseEditorProvider / createWebviewHtml / getNonce /
   initExtensionLogger / setupWebviewOptions / registerCustomEditor)
        |
        v
  @neko/shared/components               <-- NEW: Shared React components
  (ErrorBoundary / useVSCodeMessaging / useKeyboardShortcuts)
        |
        v
  neko-cut / neko-sketch / neko-puppet / neko-model / neko-tools
  (domain logic only; scaffolding inherited from shared layers)
```

**Precedents proving this layer is viable**:
- `KeyframeTimeline` component: already extracted to `@neko/shared`, consumed by neko-puppet and neko-model via ~130-line Adapter wrappers
- `useFileDrop` hook: already shared, wrapped by neko-audio/cut/canvas with domain logic
- `injectLocaleAttribute()`: already shared, called directly by all packages

### Consolidation Roadmap

**Phase 1 — Quick Wins (low risk, ~500 LoC eliminated)**:
1. Extract `getNonce()` to `@neko/shared/vscode/extension` (13 files)
2. Extract `initExtensionLogger(context, packageName)` (12 files)
3. Extract `createWebviewHtml(options)` HTML factory (18 files)
4. Extract `ErrorBoundary` to `@neko/shared/components` (8 files)

**Phase 2 — Medium Effort (~2,000 LoC eliminated)**:
5. Create `BaseEditorProvider<TDocument>` abstract class with:
   - Generic `resolveCustomEditor()` template
   - Shared webview options setup
   - Shared disposable cleanup
   - Abstract `handleWebviewMessage()` for domain dispatch
6. Extract thin `useVSCodeMessaging()` base hook
7. Extend `@neko/neko-client/formatTime` with missing variants

**Phase 3 — Careful Refactoring (~800 LoC eliminated)**:
8. Extract generic `useKeyboardShortcuts()` from neko-agent's implementation
9. Create `BaseAgentCapabilityProvider` with common registration boilerplate
10. Extract `setupWebviewOptions()` and `registerCustomEditor()` helpers

### What NOT to Consolidate

Resist the urge to unify these — divergence is correct:

| Pattern | Why Unification Would Hurt |
|---------|---------------------------|
| Store slice structure | Each domain has unique state shapes; a generic slice factory would add indirection without reducing complexity |
| Message handler bodies | 28 message types in neko-model vs 12 in neko-puppet; a generic dispatcher would be more complex than the switch/case |
| Stream client internals | H264 (VideoDecoder) vs Audio (Web Audio) vs FMP4 (MediaSource) use incompatible APIs |
| Tool implementations | Drawing (pure functions), video (IToolHandler classes), 3D (command envelopes) — three fundamentally different paradigms |
| Rendering pipelines | WebGL (neko-sketch), Canvas 2D (neko-puppet), H264 stream (neko-model), Rust engine (neko-cut) — no shared abstraction possible |

---

## Cross-Package Comparison

| Dimension | neko-cut | neko-sketch | neko-puppet | neko-model | neko-client | neko-tools |
|-----------|----------|-------------|-------------|------------|-------------|------------|
| **Score** | 9/10 | 10/10 | 8/10 | 8.5/10 | 7.5/10 | 9/10 |
| **Max Depth** | 2 (framework) | **0** | 0 | 0 | 2 (device) | 3 (analyzer) |
| **DI Pattern** | ServiceCollection | Constructor | Constructor | Constructor | Constructor | ServiceCollection + ISP |
| **Store** | 13 Slices (3-phase) | 14 Slices | Monolith (21) | Monolith (40+) | N/A (library) | Hook + Context |
| **Largest File** | 1,114 LoC | 1,370 LoC | 312 LoC | 800 LoC | **63K** | 519 LoC |
| **OCP** | IToolHandler registry | FilterRegistry | — | ComponentSchema | — | AnalyzerRegistry |
| **ISP** | Medium | High | Medium | Medium | Low (facade) | **High (9 interfaces)** |
| **Unique Pattern** | 3-phase Slice init | Pure function tools | WS 60fps delta | Optimistic update | A/V sync composition | 3-level analyzer hierarchy |

---

## Global Improvement Priorities

| Priority | Package | Issue | Recommendation |
|----------|---------|-------|----------------|
| **P0** | neko-client | EngineClient 63K monolith | Split into sub-modules (MediaClient / SceneClient / PuppetClient / DeviceClient), EngineClient becomes thin composition facade |
| **P1** | neko-model | Store 40+ fields, no slices | Adopt neko-cut's 3-phase Slice pattern: scene / animation / face / viewport / prediction |
| **P1** | neko-puppet | Store 21 fields, no slices + no undo | Split into puppet / animation / keyframe / viewport slices; add HistoryManager |
| **P2** | neko-client | Reconnection logic duplicated 3x | Extract `ReconnectableWebSocket` utility (composition, not base class) |
| **P2** | neko-model | ModelEditorProvider 25K | Extract MessageRouter with per-domain dispatchers |
| **P2** | neko-sketch | SketchEditorProvider 43K | Split into CoreEditorProvider + FileImportManager + AIWorkflowManager |
| **P2** | neko-sketch | SketchCanvas 2000+ LoC | Extract InputHandler + ToolDispatcher + CanvasHistoryRecorder |

---

## Architectural Invariants (Observed)

These patterns are consistently applied across all 6 packages and should be codified:

1. **Zero unjustified inheritance**: All custom inheritance is Template Method for lifecycle reuse (max depth 3)
2. **Framework inheritance only**: `extends` is reserved for VSCode API (`TreeItem`, `CustomDocument`) and React (`Component` for ErrorBoundary)
3. **Interface-first**: All services implement interfaces; concrete types are not exported
4. **Extension <-> Webview decoupling**: Always via postMessage IPC, never via shared object references
5. **Store composition**: Zustand slices as function factories, composed via TypeScript intersection types
6. **Tool/analyzer extensibility**: Registry/Map pattern for adding new implementations without modifying existing code
7. **Pure function preference**: Drawing tools, layer operations, vector editing are stateless pure functions
8. **Data-driven strategies**: Brush profiles, filter definitions, component schemas are data objects, not class hierarchies
