# Composition Over Inheritance Audit

> **Date**: 2026-05-09 (updated from 2026-05-08 initial audit)
> **Status**: Audit Complete — Deep Analysis
> **Scope**: neko-cut, neko-sketch, neko-puppet, neko-model, neko-client, neko-tools, neko-market, neko-assets, @neko/shared

---

## Executive Summary

Nine TypeScript packages audited for adherence to "composition over inheritance" principles, plus four additional dimensions: **abstraction quality, decoupling, reuse efficiency, and composition maturity**.

| Package | Abstraction | Decoupling | Reuse | Composition | Overall | Max Depth | Justified? |
|---------|-------------|------------|-------|-------------|---------|-----------|------------|
| neko-cut | 8.5 | 8 | 7.5 | 9 | 8.3/10 | 2 (framework) | Yes |
| neko-sketch | 8 | 7 | 8 | 9.5 | 8.1/10 | 0 | N/A |
| neko-puppet | 7.5 | 8.5 | 6 | 7 | 7.3/10 | 0 | N/A |
| neko-model | 7 | 7.5 | 5.5 | 7.5 | 6.9/10 | 0 | N/A |
| neko-client | 7 | 7 | 5 | 8 | 6.8/10 | 2 (device) | Yes |
| neko-tools | 9 | 8.5 | 9 | 9 | 8.9/10 | 3 (analyzer) | Yes |
| neko-market | 9 | 8 | 7 | 9 | 8.3/10 | 1 (install target) | Yes |
| neko-assets | 9 | 9 | 7.5 | 9 | 8.6/10 | 0 | N/A |
| @neko/shared | 9 | 9 | 9 | 8.5 | 8.9/10 | 1 (BaseError) | Yes |

**Key Findings**:
- Zero unjustified inheritance across 9 packages
- All inheritance is either framework-required (VSCode API, React.Component) or Template Method for lifecycle reuse
- Composition patterns: Zustand Slice composition, React Hook composition, Strategy/Registry pattern, DI via ServiceCollection/Constructor/Config Object, pure function composition, Facade aggregation, Command Envelope, Decorator/Wrapper, Effects Inversion, Contribution Discovery
- **P0 concerns**: EngineClient 2,103 LoC monolith (100+ methods), SketchCanvas.tsx 3,793 LoC God Component
- **P1 concerns**: Un-sliced Zustand stores in neko-puppet (21 fields) and neko-model (45+ fields), ModelEditorProvider 815 LoC switch hell
- **Infrastructure gap**: ~3,300-3,500 lines of duplicated boilerplate across packages due to missing Extension Infrastructure Layer

---

## 1. neko-cut (8.3/10)

**Scale**: Extension 17,389 LoC | Webview 45,673 LoC | Total 63,062 LoC

### Inheritance (Minimal)

Only 2 cases, both framework-required:

| Class | Inherits | Reason |
|-------|----------|--------|
| `VideoEditorModel` | `BaseEditorModel` | Editor multi-type abstraction (depth 2) |
| `OutlineItem` | `vscode.TreeItem` | VSCode API contract |

### Abstraction

15 interfaces / 23 classes (ratio 0.65). Key abstractions:
- `IToolHandler` — 7 strategy implementations (Element/Keyframe/Mask/Shape/Effect/Audio/Query)
- `IEditorModel`, `IEditorRegistry`, `IStatusBar`, `IProjectSessionService`, `IAssetService`
- `ServiceIdentifier<T>` — type-safe DI container keys

### Composition Patterns

**Extension Layer — ServiceCollection + Strategy**:
- `ServiceCollection` DI container: 7 core services registered via `set<T>(id, instance)`, no inheritance chain
- `VideoEditorProvider` (1,113 LoC): implements `vscode.CustomTextEditorProvider`, composes 8 services (MediaService, ExportService, MessageHandler, EditorModel, StatusBar, OutlineProvider, etc.)
- `IToolHandler` interface + 7 implementations registered in Map — Strategy pattern, zero inheritance

**Webview Layer — Hook + Slice Composition**:
- 13 custom hooks: `useTimelineActions`, `useTimelineContextMenu`, `useTimelineSelection`, `useTimelineDragDrop`, `useTimelineScroll`, `useTrackReordering`, `useTrackNameEditing`, `useKeyboardShortcuts`, `useShallowStore`, `useVSCodeMessaging` (631 LoC), etc.
- Zustand store: 13 slices composed via TypeScript intersection types, three-phase initialization:
  - Phase 1 (Independent): Project / Selection / Playback / UIState
  - Phase 2 (History): OperationHistory / Dispatch / Keyframe (615 LoC)
  - Phase 3 (Dependent): TrackOps / ElementOps (884 LoC) / ElementSplit / Clipboard / ShapeOps

### Decoupling

| Boundary | Mechanism |
|----------|-----------|
| Extension <-> Webview | postMessage IPC |
| Services | ServiceCollection DI |
| Tool handlers | IToolHandler Strategy + Map registration |
| Store slices | TypeScript intersection types + `get()` |
| External API | NekoCutAPI + ISkillProvider interfaces |

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| VideoEditorProvider God Object | Medium | 1,113 LoC — creates 5+ maps, manages MediaService/ExportService/engine connection/messageHandler |
| Global ServiceLocator | Medium | `getService(id)` makes parallel testing and mocking difficult |
| String-based message dispatch | Medium | MessageHandler 762 LoC, 25+ message types via string switching (no discriminated union) |
| MediaService monolith | Low | 1,062 LoC — routes 8+ message types to NativeEngine |
| PropertyPanel combinatorial explosion | Low | 955 LoC — renders 12+ property types with inline edit logic |

---

## 2. neko-sketch (8.1/10)

**Scale**: Extension ~60K | Webview ~26,188 LoC (130+ files)

### Inheritance

**Zero.** 13 core classes, all implement interfaces, none extend another class.

| Class | Implements | Role |
|-------|-----------|------|
| ToolManager | `IToolManager` | Tool switching |
| HistoryManager | `IHistoryManager` | Undo/redo stack |
| SelectionManager | `ISelectionManager` | Selection mask (bitmask + 4 modes) |
| BrushEngine | `IBrushEngine` | Brush rendering (composes IRenderPipeline) |
| SketchRenderer | `ISketchRenderer` | Renderer facade |
| RenderPipeline | `IRenderPipeline` | Layer compositing + blend modes |
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
├── FilterPipeline (ping-pong FBO, data-driven filters)
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
| vector-editing.ts | `hitTestVectorPathNode`, `moveVectorLayerNodes`, `toggleVectorNodeSelection` | Immutable transforms (1,204 LoC) |
| transform-tool.ts | `hitTestHandle`, `applyHandleDrag`, `applyTransformToPixels` | Pure transformation functions |

Total: **47+ exported pure functions** across tools — functional-first approach.

**Brush Types — Data-Driven Strategy**:
```typescript
const BRUSH_PROFILES: Record<BrushType, BrushProfile> = {
  'pen':    { minSizeFraction: 0.5, minOpacityFraction: 0.8, pressureCurve: 2.0 },
  'pencil': { minSizeFraction: 0.3, minOpacityFraction: 0.9, pressureCurve: 1.5 },
  ...
};
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

Filters are data (`FilterDefinition` = id + name + params + GLSL source), not classes. `FilterPipeline` applies them sequentially via FBO ping-pong. Deferred shader compilation + caching.

**AI Application Flow — Inversion of Control**:

`applySketchAIResultWithSession()` takes a full `SketchAIApplyFlowDependencies<TSnapshot>` interface via DI — all callbacks (applyResult, captureSnapshot, rollbackSnapshot, pushHistorySnapshot) injected, enabling easy mocking and generic snapshot types.

**Zustand Store — 14 Slices**:
document / layer / tool / brush / viewport / history / ui / selection / frame (211 LoC) / filter / particle / scene (190 LoC) / perspectiveGrid / fill

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| **SketchCanvas.tsx 3,793 LoC** | **P0** | God Component — pointer input, tool dispatch, frame management, history recording, onion skin, vector editing, selection, transformation all in one file |
| SketchEditorProvider 43K context | Medium | Should split: CoreEditorProvider + FileImportManager + AIWorkflowManager |
| Implicit slice coupling via `store.get()` | Low | Runtime dependencies not visible in TypeScript types |
| WebGL resource management | Low | If `dispose()` not called, GPU memory leaks |
| No formal tool plugin system | Low | Adding new tools requires modifying SketchCanvas.tsx |

Top 5 files consume 29% of webview codebase: SketchCanvas.tsx (14.5%), vector-editing.ts (4.6%), App.tsx (3.8%), ScenePanel.tsx (2.1%), render-pipeline.ts (1.9%).

---

## 3. neko-puppet (7.3/10)

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
| NekoPuppetCapabilityProviderImpl | `AgentCapabilityProvider` |

### Composition Patterns

**PuppetController — Adapter + Delegation (312 LoC)**:

Implements `IPuppetController` (24 methods), all delegate to `EngineClient`:
```
IPuppetController (interface, 24 methods)
  -> PuppetController (impl)
       -> delegates to EngineClient (HTTP + WebSocket)
       -> manages WebSocket stream lifecycle (auto-reconnect + status callbacks)
```

**Animation — Callback Factory Hook**:

`usePuppetPlayback(controller)` returns 4 callbacks: `onPlay`, `onStop`, `onSeek`, `onCrossfade`. Zero classes. Uses `useRef` for controller to prevent stale closures, `useEffect` for stream cleanup on unmount.

**Rendering — Stateless Canvas 2D**:

PuppetCanvas (346 LoC) reads `deformedMeshes` + `textures` from store, renders via Canvas 2D affine texture mapping. All deformation computed in Rust engine. Handles blend modes (Normal/Multiply/Screen/Overlay/Add), viewport pan/zoom via mouse.

**Component Composition (6-panel tree)**:
```
PuppetApp (343 LoC)
├── PuppetCanvas (346 LoC) — Mesh rendering
├── AnimationPanel (205 LoC) — Playback controls
├── ParameterPanel (121 LoC) — Parameter sliders
│   └── FaceParameterSection (189 LoC) — Grouped parameters
├── PuppetNodeTree (157 LoC) — Node hierarchy
└── PuppetKeyframeTimeline (131 LoC) — Keyframe editor
```

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| Monolithic Zustand store (21 fields, no slices) | P1 | 3 semantic groups (puppet/animation/keyframe) not separated; `updateParameterValue()` maps full array each call at 60fps |
| No undo/redo (relies on VSCode FS) | P1 | No HistoryManager at store level |
| PuppetEditorProvider God Class | Medium | 468 LoC — mixes file I/O, messaging (150-line switch), state persistence, webview lifecycle |
| PuppetApp Root Orchestrator | Medium | 343 LoC — handles VSCode API, puppet loading, message receiving, UI orchestration |
| Duplicate stream logic in usePuppetPlayback | Low | `onPlay` and `onCrossfade` both call `ctrl.startPreviewStream()` with duplicated callback handler |
| Full canvas redraw every frame | Low | No dirty-rect optimization; performance ceiling ~5000 triangles |
| No protocol versioning | Low | No version field in postMessage protocol |

---

## 4. neko-model (6.9/10)

**Scale**: Extension ~50K | Webview 9,691 LoC (61 files)

### Inheritance

Zero custom inheritance. 11 classes, all standalone or compositional:
- `SceneDocument` + `SceneNodeHandle` / `MaterialHandle` / `LightHandle` / `CameraHandle` (Handle composition pattern)
- `LocalPredictionLayer`, `ComponentSchemaRegistry`, `CharacterCommandHistory`
- `SculptBrushStrokeController`, `AuthoringPerformanceMetrics`
- `ErrorBoundary extends React.Component` (React pattern only)

### Composition Patterns

**Dual Rendering Path (Route A / Route B)**:
```
Route A (Primary): Rust ECS -> wgpu -> H264 Stream -> VideoViewport (275 LoC)
Route B (Fallback): R3F + Three.js -> Viewport3D (39 LoC wrapper, development only)
```

App.tsx conditionally selects: `enginePort && (modelUrl || hasEngineScene) ? <VideoViewport/> : <R3FDevelopmentFallback/>`

**Handle Pattern — SceneDocument (227 LoC)**:
```
SceneDocument (root API)
├── SceneNodeHandle — encapsulates node command-sending
├── MaterialHandle — encapsulates material command-sending
├── LightHandle — encapsulates light command-sending
├── CameraHandle — encapsulates camera command-sending
└── SceneTransaction — builder for multi-command batches
```

**Optimistic Update — LocalPredictionLayer (156 LoC)**:

Unique to neko-model, simplified CRDT-like pattern:
```
User action -> createLocalPrediction(kind, payload)  -> immediate UI update
                                                       |
                         sendRouteACommand(envelope)   -> Engine
                                                       |
                         Engine ACK -> commitThrough(appliedSeq)
                         Engine NACK -> rollback(idOrSeq)
                         Timeout -> timeout(nowMs)
                         Topology change -> invalidate(filter)
```

State machine: `active -> committed | rolled-back | timed-out | invalidated`
8 prediction kinds: transform / camera / morph / ik / brush / selection / snap / topology

**Command Envelope Pattern**:

All scene operations serialized as immutable `SceneCommandEnvelope { seq, baseRevision, coalesceKey?, transactionId?, command: { type, payloadJson } }`. Adapters provide high-level builders:
- `CharacterAuthoringWorkflow` — `createCharacterCommandEnvelope()`, `compileMorphSetCommand()`
- `InspectorCommandAdapter` — `compileInspectorNumberCommand()`, `commitInspectorNumberEdit()`

**ComponentSchemaRegistry — Data-Driven Inspector (122 LoC)**:
```typescript
MODEL_COMPONENT_SCHEMA_REGISTRY.register({
  component: 'material',
  fields: [
    { path: 'roughness', kind: 'number', min: 0, max: 1, commandType: 'material-update' },
    { path: 'metallic', kind: 'number', min: 0, max: 1, commandType: 'material-update' },
    { path: 'emissive', kind: 'color', commandType: 'material-update' },
  ],
});
```
Pre-registered: transform (10 fields), material (3), light (1), camera (1). New component type = register data, no new class.

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| **Monolithic Zustand store (45+ fields, no slices)** | **P0** | 9 `is*Open` panel booleans + scene/animation/camera/prediction all in one store (713 LoC, 60+ actions) |
| App.tsx 800 LoC God Component | P1 | Message routing (15+ types) + command generation (4 envelope patterns) + panel rendering (if/else priority chain) + 20+ useCallback hooks |
| ModelEditorProvider 815 LoC switch hell | P1 | 25 message types in 400+ LoC switch/case, no dispatch table |
| Dual prediction systems | Medium | Old `pendingTransformPredictions` (in store) + new `localPredictionLayer` both active; migration incomplete |
| No unified command dispatcher | Medium | App.tsx has 4 different envelope-creation patterns (transform, character, generic, animation) |
| ComponentSchemaRegistry underutilized | Low | Only used by InspectorCommandAdapter, not main panels |
| Route B lacks gizmo sync with engine | Low | R3F fallback doesn't re-sync if engine reconnects |

---

## 5. neko-client (6.8/10)

**Scale**: ~7,743 LoC (excluding tests)

### Inheritance

One justified hierarchy (depth 2, Template Method):

```
DeviceStreamClient<TEvent> (abstract, 123 LoC)
  ├── MidiClient extends DeviceStreamClient<MidiEvent> (39 LoC)
  └── GamepadClient extends DeviceStreamClient<GamepadEvent> (43 LoC)
```

Base provides WebSocket lifecycle + message dispatch; subclasses implement `abstract parseEvent()`.

**Note**: `CameraClient` (31 LoC) does NOT extend `DeviceStreamClient` — uses standalone composition instead (justified: no streaming events, thin EngineClient wrapper).

### Composition Patterns

**Streaming Clients — Three Independent Implementations**:

| Client | Size | Output Mechanism | Shared Base |
|--------|------|------------------|-------------|
| H264StreamClient | 596 LoC | WebCodecs VideoDecoder | None |
| AudioStreamClient | 672 LoC | Web Audio API scheduling | None |
| FMP4StreamClient | 420 LoC | MediaSource Extensions | None |

No shared base class — justified because underlying APIs are fundamentally different.

**A/V Synchronization — Composition (FrameScheduler 358 LoC)**:
```
AudioStreamClient.getCurrentTime() -> master clock
        |
FrameScheduler.schedule(masterClockUs) -> SKIP | RENDER | WAIT
        |                                   (EMA-smoothed A/V offset calibration)
H264StreamClient frame queue consumption
```

FrameScheduler is a standalone class accepting any clock source. Features: adaptive sync threshold, warmup phase (jitter buffer), backpressure (drops oldest if queue > 30), `flush()`/`switchClock()` for seek.

**EngineClient — Monolithic Facade (2,103 LoC)**:

100+ methods organized by concern. Composes `perception` sub-facade (only one extracted so far):
```
EngineClient (dispatch base)
├── .perception: EnginePerceptionFacade (transcribe, classify, detectShots)
├── Media/Stream methods (probe, waveform, extractFrame, analyzeLoudness)
├── Effects API (listEffects, applyEffect, registerShader)
├── Scenes/3D API (loadModel, startSceneRenderStream, createShape, ...)
├── Puppets/2D API (loadPuppet, parameterization, keyframes, blending)
├── Device methods (camera, MIDI, gamepad)
├── ONNX models (upscale, denoise, clipScore, transcribe)
├── Documents (probeDocument, registerDocument)
└── Preview assets (registerPreviewAsset, requestPreviewVariant)
```

**DeviceManager — Facade Coordinator (422 LoC)**:

Aggregates device operations, manages device lifecycle. `DeviceStreamClient` + `CameraClient` composed together.

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| **EngineClient 2,103 LoC / 100+ methods** | **P0** | Only 1 of 10+ domain groups extracted as sub-facade (perception). Should split: Scenes/Puppets/Devices/Effects/Preview |
| Reconnection logic duplicated 3x | P1 | H264/Audio/FMP4 all implement identical `tryReconnect()` with exponential backoff (100ms * 2^attempt, max 5s, 5 attempts) |
| Stream clients lack unified interface | P1 | No `IStreamClient` for H264/Audio/FMP4 despite sharing connect/dispose/reconnect lifecycle |
| WebSocket abstraction inconsistent | P2 | Device streams use factory (`DeviceWebSocketLike`); Scene control uses `SceneControlWebSocketLike`; stream clients hardcode `WebSocket` |
| Config normalization duplicated | Low | `getNumber`/`getString` helpers repeated in GamepadClient, MidiClient, EngineClient |

---

## 6. neko-tools (8.9/10)

**Scale**: Extension ~4,500 LoC | Webview ~2,000 LoC | Total 10,517 LoC (76 files)

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
  └── BaseMediaDiffAnalyzer (abstract, 46 LoC)    <- cancel/abort lifecycle
        └── TempFileBackedMediaDiffAnalyzer (60 LoC)  <- temp file management
              ├── ImageDiffAnalyzer (90 LoC)
              ├── VideoDiffAnalyzer (232 LoC)
              ├── AudioDiffAnalyzer (178 LoC)
              └── TimelineDiffAnalyzer (60 LoC)
```

- Layer 1: Shared cancel/abort handling (`cancel()`, `createAbortController()`, `throwIfAborted()`)
- Layer 2: Shared temp file write/cleanup (`writeTempFiles()`, `cleanupTempFiles()`, pending promise coordination)
- Layer 3: Each implements `analyze()` with engine-specific logic

### Composition Patterns

**AnalyzerRegistry — Open for Extension**:
```typescript
const registry = new AnalyzerRegistry();
diffService.registerAnalyzer(new ImageDiffAnalyzer(engineMediaService, tempFileService));
diffService.registerAnalyzer(new VideoDiffAnalyzer(engineMediaService, tempFileService));
// New media type = new Analyzer + registerAnalyzer() call, no existing code modified
```

**Interface Segregation (ISP) — 13 Lean Interfaces**:

| Interface | Methods | Responsibility |
|-----------|---------|----------------|
| IMediaDiffAnalyzer | ~3 | Analysis contract |
| IEngineMediaService | ~3 | Engine media ops |
| IAssetEntityReader | ~1 | Entity reading |
| IVariantComparisonService | ~1 | Variant comparison |
| IWorkspaceIO | ~2 | Workspace file I/O |
| ITempFileService | ~3 | Temp file management |
| IScheduler | ~2 | Task scheduling |
| IEngineRuntimeResolver | ~1 | Runtime detection |
| IExtensionI18n | ~1 | i18n abstraction |

**ServiceCollection DI Container**:

Generic type-safe DI (68 LoC), services registered by symbol ID. Bootstrap hierarchy:
```
bootstrapNekoToolsExtension()
├── bootstrapCoreServices() → 11 core services
├── bootstrapMediaDiff() → analyzers, registry, services
├── bootstrapMediaLsp() → cache, workspace index
└── bootstrapAssetDiff() → asset comparison services
```

**Webview — 6-Factory Composition Injection**:
```typescript
const runtime: IMediaDiffRuntime = {
  bridge, initialState, audioContextFactory,
  blobUrlRegistry, rafScheduler, streamClientFactory,
};
// Injected via React Context, consumed via useMediaDiffRuntime() hook
```

**LSP — 5 Composable Providers**:

JviDefinitionProvider, JviHoverProvider, JviDocumentSymbolProvider, JviReferenceProvider, JviDiagnosticsProvider — all depend on shared `IMediaWorkspaceIndex`.

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| AnalysisPipeline duplication | Medium | Git mode vs local mode paths ~95% identical (519 LoC total) |
| IHandlerContext mutation | Medium | Shared mutable object passed to async handlers — hard to track state changes |
| No analyzer fallback | Low | If engine unavailable, no graceful degradation |
| Implicit analyzer registration | Low | Manual creation in bootstrap; no plugin discovery |

---

## 7. neko-market (8.3/10)

**Scale**: 13,703 LoC across 64 files

### Three-Layer Architecture

| Layer | Package | LoC | Dependencies |
|-------|---------|-----|-------------|
| L0: Core | `@neko/market-core` | ~1,838 | `@neko/shared` only (zero VSCode/React) |
| L1: Extension | `@neko/market-extension` | ~1,645 | L0 + `vscode` |
| L2: Webview | `@neko/market-webview` | ~456 | `@neko/shared` types + react + zustand |

### Inheritance (Minimal)

One justified hierarchy (depth 1, Template Method for builtin install targets):

```
IInstallTarget<T extends AssetType> (interface — generic)
  └── BaseBuiltinInstallTarget<T extends BuiltinAssetType> (abstract)
        ├── MediaInstallTarget
        ├── StarterInstallTarget
        ├── PresetInstallTarget
        └── BundleInstallTarget (extra bundle validation)

// Plus extensible non-builtin:
SkillInstallTarget implements IInstallTarget<'skill'> (standalone)
```

Only `ErrorBoundary extends React.Component` uses framework inheritance.

### Composition Patterns

**Constructor-Based DI (no service locators)**:

`InstallManager` composes 7 injected dependencies:
```
InstallManager (orchestrator)
├── IMarketClient (HTTP API)
├── ICacheManager (download caching)
├── ILicenseManager (license validation)
├── IVersionResolver (semver resolution)
├── InstallTargetRegistry (type-based routing)
├── InstalledRegistry (persistence, ref-counting)
└── InstallManagerConfig (version constraints)
```

**Registry + Strategy — InstallTargetRegistry**:
- Runtime-swappable install targets per asset type
- Supports kind-based sub-routing: `media.3d` vs `media.texture`
- Query by type or type+kind; unregistered types throw clear errors

**Effects Inversion — EffectsActivator / EffectsInverter**:
- Manifest declares what to register and what files to write
- On uninstall, inversion reverses registrations and removes files
- `EffectsRegistryAdapter` interface abstracts host registration logic

**Contribution Discovery — InstallTargetContributionRegistry**:
```
Extension declares: contributes.neko.installTargets
  → Registry discovers declarations at activation
  → Lazy extension activation on first install of that type
  → target.dispose() unregisters on deactivation
```

**Webview State — Zustand Store**:

Single store with ~40+ fields covering: activeTab, searchText, featured/searchResults, installProgress, filters, etc. Components subscribe selectively.

### Decoupling

| Boundary | Mechanism |
|----------|-----------|
| Core <-> Extension | L0 has zero VSCode imports; extension injects platform-specific config |
| Extension <-> Webview | `MarketMessages` builder (21+ typed message types) via postMessage |
| Install routing | `IInstallTarget<T>` generic interface + type-safe registry |
| Host integration | `MarketplaceServiceHostAdapters` abstracts storage/auth/locale |
| Effects lifecycle | `EffectsRegistryAdapter` decouples install logic from registry types |

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| MarketplaceHandler 933 LoC | Medium | Message dispatch via manual if/else chain; no discriminated union + dispatch table |
| Kind-extraction logic duplicated 3x | Medium | `getManifestKind()` copied in install-target.ts, install-target-contributions.ts, MarketplaceHandler.ts |
| Error handling heterogeneity | Medium | Some operations use `Result<T, E>` (InstallResult), others throw (VersionResolver, CacheManager) |
| Zustand store monolithic | Low | ~40+ fields in one store; functional but could benefit from slicing |
| Test fixture duplication | Low | Mock builders scattered across test files; no shared test-fixtures module |

---

## 8. neko-assets (8.6/10)

**Scale**: Core library ~2,800 LoC | Extension ~7,900 LoC | Total ~10,690 LoC

### Two-Layer Architecture

| Layer | Package | Dependencies |
|-------|---------|-------------|
| Core | `@neko/asset` | `@neko/shared` only (platform-agnostic) |
| Extension | `neko-assets/src` | Core + `vscode` (VSCode integration) |

### Inheritance

**Zero custom inheritance.** All classes implement interfaces directly:

| Class | Interface | Role |
|-------|-----------|------|
| JsonFileStorage | `IAssetStorageWithEvents` | Persistent file-based storage |
| InMemoryStorage | `IAssetStorageWithEvents` | Testing/ephemeral storage |
| RuleClassifier | `IAssetClassifier` | Pattern-matching classifier |
| LLMClassifier | `IAssetClassifier` | AI classifier (wraps RuleClassifier as fallback) |
| AssetManagerTreeProvider | `vscode.TreeDataProvider` | Asset tree UI |
| AssetHistoryTreeProvider | `vscode.TreeDataProvider` | History tree UI |
| MediaLibraryTreeProvider | `vscode.TreeDataProvider` | Media library tree UI |

### Composition Patterns

**AssetLibrary — Facade + DI (597 LoC)**:

Central facade composing 5 internal services:
```
AssetLibrary (facade, ~30 public methods)
├── IAssetStorage (pluggable: JsonFileStorage | InMemoryStorage)
├── EntityService (entity CRUD)
├── VariantService (variant CRUD)
├── FileService (file CRUD + optional MetadataExtractor)
├── IAssetClassifier? (optional: RuleClassifier | LLMClassifier)
├── AssetHealthService? (optional health checks)
├── PathResolver (path variable resolution)
└── ThumbnailGenerator? (optional, VSCode-specific)
```

All via config object injection:
```typescript
interface AssetLibraryConfig {
  storage: IAssetStorage;
  classifier?: IAssetClassifier;
  metadataExtractor?: MetadataExtractor;
  thumbnailGenerator?: ThumbnailGenerator;
  fileAccessChecker?: FileAccessChecker;
  pathVariables?: PathVariableMap;
}
```

**AssetRegistry — Registry + Strategy + Observer (313 LoC)**:

Wraps `AssetLibrary` and adds pluggable handler registry for non-media asset types:
```
AssetRegistry (unified entry point)
├── AssetLibrary (media assets)
├── Map<AssetType, IAssetHandler> (non-media: shader, plugin, preset)
├── Map<string, AssetManifest> (manifest cache)
└── AssetChangeListener[] (observer pattern)
```

**Storage Abstraction — Pluggable Backends**:
```typescript
interface IAssetStorage {
  getEntity(id): Promise<AssetEntity | null>;
  getAllEntities(): Promise<AssetEntity[]>;
  search(query: AssetQuery): Promise<SearchResult>;
  // ... 15+ methods
}
```

Two implementations (`JsonFileStorage` 494 LoC, `InMemoryStorage` 393 LoC) are protocol-compliant and swappable at runtime.

**Classifier — Decorator Pattern**:

`LLMClassifier` wraps `RuleClassifier` with graceful degradation:
```typescript
class LLMClassifier implements IAssetClassifier {
  constructor(private readonly fallback: IAssetClassifier) {}
  async analyze(filePath: string): Promise<ClassificationResult> {
    try { return await this.callLLMForClassification(filePath); }
    catch { return this.fallback.analyze(filePath); }
  }
}
```

**Domain Model — Entity-Variant-File Hierarchy**:
```
Entity (creative asset, e.g., "Player Character")
  └── Variant[] (versions/views, e.g., "Front View", "Side View")
      └── File[] (renditions, e.g., PNG, WEBP, high-res, low-res)
```

Rich metadata per entity: category (9 types), tags, aliases, ownership (scope + access), deep-mergeable metadata.

### Decoupling

| Boundary | Mechanism |
|----------|-----------|
| Core <-> Extension | Core has zero `vscode` imports; extension injects MetadataExtractor/ThumbnailGenerator |
| Storage | `IAssetStorage` interface — swap JsonFileStorage/InMemoryStorage/future SQLite |
| Classification | `IAssetClassifier` interface — swap Rule/LLM/future implementations |
| Asset type routing | `IAssetHandler` registry — register handlers without modifying AssetLibrary |
| File metadata | `MetadataExtractor` callback — platform-specific without coupling core |
| Change notifications | `StorageEventListener` / `AssetChangeListener` — observer pattern |

### Weaknesses

| Issue | Severity | Detail |
|-------|----------|--------|
| Core services lack hooks | Medium | EntityService/VariantService accept only `IAssetStorage`; no logger/event hook injection points |
| Tree providers coupled to VSCode | Medium | `AssetManagerTreeProvider` implements `vscode.TreeDataProvider` directly; no pure ViewModel layer |
| MediaLibraryTreeProvider over-coupled | Medium | Depends on 5 services (`settingsService`, `thumbnailService`, `metadataExtractor`, `metadataCache`, plus implicit) |
| No retry/backoff for async operations | Low | Storage and file operations don't handle transient failures |
| Health checks optional, not enforced | Low | File validation not triggered during import flow |
| AssetDiffService implicit dependencies | Low | Optional `IGitService` and `IAIAnalysisService` not always wired |

---

## 9. @neko/shared (8.9/10)

**Scale**: 45,514 LoC across 243 files

### Layer Architecture

```
L0 (Zero-dependency):
  logger/ (ILogger, ConsoleLogger, ILogTransport) — 362 LoC
  errors/ (BaseError, RetryPolicy, shouldRetry) — 324 LoC
  i18n/ (II18nService, I18nService, interpolate) — 334 LoC
  theme/ (design tokens, ThemeKind) — 539 LoC
  config/ (normalizer, adapter, credential resolver) — 1,497 LoC
  path/ (PathResolver, variable expansion) — 180 LoC
  core/ (ConcurrencyPool — semaphore with fair FIFO) — 381 LoC
  operations/ (EditOperation taxonomy, ApplyRegistry) — 3,430 LoC
  Format SDKs: nkv (1,138) / nkc (1,264) / nka (479) / nkplan (1,308) / nkproj (919) / nks (128)

L1 (VSCode Extension Host):
  vscode/extension/ — OutputChannelTransport, ErrorReporter, I18nBridge, CharacterRegistry — 2,033 LoC

L2 (Browser/React):
  i18n/react.tsx — I18nProvider + useI18n hooks
  i18n/webview.ts — detectWebviewLocale()
  components/ — 16 files, 1,988 LoC (Toolbar, CollapsibleSection, KeyframeTimeline, MacButton, etc.)
```

### Composition Patterns

**Interface-First Foundation**:
- `ILogger` + pluggable `ILogTransport` (ConsoleTransport, OutputChannelTransport)
- `II18nService` + namespace-keyed bundle registration
- `IConfigAdapter` + bidirectional validate/convert
- `IErrorHandler` + category-based classification

**Type-Erased Operation Dispatch**:
```
ApplyRegistry + ApplyDescriptor → dispatch by operation kind string
applyOperation(data, op) → data transformation
invertOperation(op) → bidirectional undo (via `before` field, no state access needed)
```

**Layer Enforcement**: Subpath exports prevent accidental cross-layer imports. Main entry exports only L0 + L1 base types. `@neko/shared/i18n/react` and `@neko/shared/vscode/extension` available via explicit subpath imports.

### Reuse Evidence

| Pattern | Consumers |
|---------|-----------|
| KeyframeTimeline component | neko-puppet, neko-model (~130 LoC Adapter each) |
| useFileDrop hook | neko-audio, neko-cut, neko-canvas |
| EditOperation taxonomy | All editors via ApplyRegistry |
| Logger / i18n / Theme | All packages |
| PathResolver | Project loading, media resolution, all formats |
| ConcurrencyPool | API rate limiting across packages |

---

## Abstraction Quality Analysis

### Interface-to-Class Ratio

| Package | Interfaces | Classes | Ratio | Assessment |
|---------|-----------|---------|-------|-----------|
| neko-tools | 13 | 10 | **1.30** | ISP exemplar |
| @neko/shared | 10+ | 8 | **1.25** | Foundation excellence |
| neko-market | 23 | 12 | **1.92** | Excellent — generic `IInstallTarget<T>` + 9 focused contracts |
| neko-assets | 10 | 10 | **1.00** | Good — `IAssetStorage` + `IAssetClassifier` + `IAssetHandler` |
| neko-puppet | 5 | 6 | 0.83 | Good |
| neko-sketch | 10+ | 13 | 0.77 | Good |
| neko-cut | 15 | 23 | 0.65 | Acceptable |
| neko-client | 4 | 12 | **0.33** | Low — stream clients lack unified interface |
| neko-model | 3 | 11 | **0.27** | Low — Handle pattern good but too few interfaces |

### Abstraction Gaps

1. **neko-client**: H264StreamClient / AudioStreamClient / FMP4StreamClient share connect/dispose/reconnect lifecycle but have no common `IStreamClient` interface
2. **neko-model**: 45+ store fields with 60+ actions but no domain interfaces for scene/animation/camera sub-stores
3. **neko-puppet**: No `IPuppetStore` interface; components directly couple to store shape

---

## Composition Maturity Matrix

| Pattern | Maturity | Best Exemplar | Weakest |
|---------|----------|---------------|---------|
| **Zustand Slice Composition** | ★★★★★ | neko-cut (13 slices, 3-phase) | neko-model (monolith 45+) |
| **Pure Function Tools** | ★★★★★ | neko-sketch (47+ functions) | — |
| **Data-Driven Strategy** | ★★★★☆ | neko-sketch BrushProfile/FilterDef | — |
| **Registry/Map Extensibility** | ★★★★☆ | neko-tools AnalyzerRegistry | — |
| **Facade Aggregation** | ★★★★☆ | neko-sketch SketchRenderer (7 sub) | neko-client EngineClient (1/10 extracted) |
| **DI Container** | ★★★★☆ | neko-tools ServiceCollection + ISP | neko-cut (global service locator) |
| **Hook Composition** | ★★★☆☆ | neko-cut (13 hooks) | neko-puppet (1 hook) |
| **Template Method** | ★★★★☆ | neko-tools 3-level analyzer | neko-client DeviceStreamClient |
| **Command Envelope** | ★★★☆☆ | neko-model (seq + baseRevision + coalesce) | — |
| **Optimistic Update** | ★★★☆☆ | neko-model LocalPredictionLayer | — |
| **Decorator/Wrapper** | ★★★★☆ | neko-assets LLMClassifier wraps RuleClassifier | — |
| **Pluggable Storage** | ★★★★★ | neko-assets IAssetStorage (Json/InMemory/future) | — |
| **Effects Inversion** | ★★★★☆ | neko-market EffectsActivator/Inverter | — |
| **Contribution Discovery** | ★★★★☆ | neko-market InstallTargetContributionRegistry | — |

### Per-Package Unique Composition Patterns

| Package | Unique Pattern | Description |
|---------|---------------|-------------|
| neko-cut | **3-phase Slice init** | Independent → History → Dependent — ensures slice dependency ordering |
| neko-sketch | **Pure function tools layer** | 47+ exported functions, zero classes, zero side effects, data-driven brushes/filters |
| neko-puppet | **WS 60fps delta stream** | PuppetController manages WebSocket real-time deformed mesh streaming |
| neko-model | **Optimistic update state machine** | LocalPredictionLayer: 8 kinds × 5 states × topology version filtering |
| neko-client | **A/V sync composition** | AudioStreamClient master clock → FrameScheduler independent scheduling decision |
| neko-tools | **3-level analyzer hierarchy** | Only justified deep inheritance: cancel / temp-file / domain analysis |
| neko-market | **Effects inversion + contribution discovery** | Install manifest → EffectsActivator; uninstall → EffectsInverter reversal. Lazy extension activation via contribution declarations |
| neko-assets | **Decorator classifier + pluggable storage** | LLMClassifier wraps RuleClassifier with graceful degradation; IAssetStorage swappable backends |
| @neko/shared | **Type-erased operation dispatch** | ApplyRegistry + invertible operations via `before` field |

---

## Cross-Cutting Duplication Analysis

> **Key Finding**: Strong composition/decoupling inadvertently created ~3,300-3,500 lines of duplicated infrastructure code. The root cause is a **missing Extension Infrastructure Layer** between `@neko/shared` and individual packages.

### Type 1 — Infrastructure Template Duplication (Should Extract)

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

### Type 2 — Domain-Specific Divergence (Correctly Separate)

These look similar but serve different domains; forced unification would create harmful coupling:

| Pattern | Packages | Why Separate is Correct |
|---------|----------|------------------------|
| Message routing switch/case | All EditorProviders | Each package has unique message types (28 in neko-model vs 12 in neko-puppet) |
| Zustand Store slices | neko-cut (13) / neko-sketch (14) | State shapes are domain-determined |
| Drawing tool functions | neko-sketch only | pixel/gradient/clone logic is non-reusable |
| Stream clients (H264/Audio/FMP4) | neko-client | Underlying Web APIs are fundamentally different |
| Drag-drop hooks | neko-cut/canvas/audio | Domain logic divergence too large |
| Keyboard shortcut hooks | neko-cut/canvas/agent | Key bindings are domain-specific |
| Rendering pipelines | WebGL (sketch) / Canvas 2D (puppet) / H264 stream (model) / Rust engine (cut) | No shared abstraction possible |

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

| Dimension | neko-cut | neko-sketch | neko-puppet | neko-model | neko-client | neko-tools | neko-market | neko-assets | @neko/shared |
|-----------|----------|-------------|-------------|------------|-------------|------------|-------------|-------------|--------------|
| **Overall** | 8.3 | 8.1 | 7.3 | 6.9 | 6.8 | 8.9 | 8.3 | 8.6 | 8.9 |
| **Max Depth** | 2 (framework) | **0** | 0 | 0 | 2 (device) | 3 (analyzer) | 1 (install target) | 0 | 1 (BaseError) |
| **DI Pattern** | ServiceCollection | Constructor | Constructor | Constructor | Constructor | ServiceCollection + ISP | Constructor DI | Config Object DI | Interface + Factory |
| **Store** | 13 Slices (3-phase) | 14 Slices | Monolith (21) | Monolith (45+) | N/A (library) | Hook + Context | Zustand (monolith) | N/A (tree views) | N/A (foundation) |
| **Largest File** | 1,113 LoC | **3,793 LoC** | 468 LoC | 815 LoC | **2,103 LoC** | 519 LoC | 933 LoC | 597 LoC | ~600 LoC |
| **OCP** | IToolHandler registry | FilterRegistry | — | ComponentSchema | — | AnalyzerRegistry | InstallTargetRegistry | IAssetHandler registry | ApplyRegistry |
| **ISP** | Medium (0.65) | Good (0.77) | Good (0.83) | Low (0.27) | **Low (0.33)** | **High (1.30)** | **High (1.92)** | Good (1.00) | **High (1.25)** |
| **Unique Pattern** | 3-phase Slice init | Pure function tools | WS 60fps delta | Optimistic update | A/V sync composition | 3-level analyzer | Effects inversion | Decorator classifier | Type-erased ops |
| **Total LoC** | 63,062 | 26,188 | ~3,500 web | 9,691 web | 7,743 | 10,517 | 13,703 | 10,690 | 45,514 |

---

## Global Improvement Priorities

| Priority | Package | Issue | Recommendation | Impact |
|----------|---------|-------|----------------|--------|
| **P0** | neko-client | EngineClient 2,103 LoC / 100+ methods | Split into sub-facades (ScenesFacade / PuppetsFacade / DevicesFacade / EffectsFacade / PreviewFacade), EngineClient becomes thin composition root | Reduces API cognitive load, enables per-domain testing |
| **P0** | neko-sketch | SketchCanvas.tsx 3,793 LoC God Component | Extract InputHandler + ToolDispatcher + CanvasHistoryRecorder + FrameManager as separate hooks/modules | Unlocks testability and tool plugin system |
| **P1** | neko-model | Store 45+ fields, no slices | Adopt neko-cut's 3-phase Slice pattern: scene / panel / animation / camera / prediction | Reduces re-render blast radius, enables independent testing |
| **P1** | neko-puppet | Store 21 fields, no slices + no undo | Split into puppet / animation / keyframe / viewport slices; add HistoryManager | Enables undo/redo, fixes 60fps array mapping perf |
| **P1** | neko-model | ModelEditorProvider 815 LoC switch | Replace 25-case switch with dispatch table (command pattern) | Maintainability, message validation |
| **P2** | neko-client | Reconnection logic duplicated 3x | Extract `ReconnectableWebSocket` or `ReconnectManager` utility (composition, not base class) | Eliminates 3 copies of identical exponential backoff |
| **P2** | neko-client | Stream clients lack unified interface | Create `IStreamClient` interface for H264/Audio/FMP4 lifecycle contract | Enables generic stream management |
| **P2** | neko-model | App.tsx 800 LoC | Extract `<ViewportContainer>` + `<PanelRouter>` + `<MessageBridge>` + `useCommandDispatcher()` | Single responsibility |
| **P2** | neko-sketch | SketchEditorProvider 43K | Split into CoreEditorProvider + FileImportManager + AIWorkflowManager | Separation of concerns |
| **P2** | neko-market | MarketplaceHandler 933 LoC if/else dispatch | Use discriminated union + `Record<Type, Handler>` dispatch table | Auto exhaustiveness checking, ~50% LoC reduction |
| **P2** | neko-market | Kind-extraction logic duplicated 3x | Extract `getManifestKind()` to `@neko/shared` or `@neko/market-core` | Single maintenance point |
| **P2** | neko-assets | Core services lack hook injection points | Add optional `onEntityCreated`/`onEntityDeleted` hooks to EntityService config | Enables logging/metrics without modifying library |
| **P2** | neko-assets | Tree providers coupled to VSCode | Extract pure ViewModel layer; TreeProvider becomes thin adapter | Testability, potential reuse in CLI |
| **P2** | Cross-cutting | ~3,300 LoC duplicated infra | Phase 1-3 consolidation roadmap (see above) | ~3,300 LoC eliminated |

---

## Architectural Invariants (Observed)

These patterns are consistently applied across all 9 packages and should be codified:

1. **Zero unjustified inheritance**: All custom inheritance is Template Method for lifecycle reuse (max depth 3)
2. **Framework inheritance only**: `extends` is reserved for VSCode API (`TreeItem`, `CustomDocument`) and React (`Component` for ErrorBoundary)
3. **Interface-first**: All services implement interfaces; concrete types are not exported
4. **Extension <-> Webview decoupling**: Always via postMessage IPC, never via shared object references
5. **Store composition**: Zustand slices as function factories, composed via TypeScript intersection types (where adopted)
6. **Tool/analyzer extensibility**: Registry/Map pattern for adding new implementations without modifying existing code
7. **Pure function preference**: Drawing tools, layer operations, vector editing are stateless pure functions
8. **Data-driven strategies**: Brush profiles, filter definitions, component schemas are data objects, not class hierarchies
9. **Layer isolation**: @neko/shared L0 (zero-dep) → L1 (vscode) → L2 (DOM/React) via subpath exports
10. **Facade composition**: Complex subsystems aggregated behind facades (SketchRenderer, EngineClient, PuppetController), injected via constructor
