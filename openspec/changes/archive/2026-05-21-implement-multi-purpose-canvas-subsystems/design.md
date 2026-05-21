## Context

`neko-canvas` currently provides the shared infinite-canvas substrate for media, storyboard, script, document, model, artboard, container, and Agent workflows. The current architecture already has strong layer boundaries: persisted Canvas data is JSON, nodes keep absolute canvas coordinates, relationship edges live in top-level `CanvasData.connections`, Webview code owns React rendering, and Extension Host owns VSCode APIs and file/resource boundaries.

The new product direction adds narrative flow, behavior debugging, entity relationship, and memory graph use cases. These use cases share pan/zoom, selection, connections, undo/redo, clipboard, viewport culling, Agent context, and status reporting, but they do not share all node renderers, panels, playback controllers, or graph rules. A file-level `kind` discriminator would force projects into artificial silos even though subsystem logic naturally dispatches by node type.

This design follows `docs/architecture/adr-canvas-kind-multi-purpose.md`: `.nkc` remains the single Canvas file extension, nodes from different libraries may coexist, and subsystems activate from the node types that are actually present.

## Goals / Non-Goals

**Goals:**

- Keep `.nkc` files freely mixed without a file-level `kind` lock.
- Add a pure-data subsystem manifest contract that can be read outside Webview code without importing React or VSCode APIs into the wrong layer.
- Add a Webview subsystem registration contract for React renderers, floating panels, playback controllers, and lazy-loaded subsystem bundles.
- Align NKC version constants around the migrator authority and add v2.1 optional fields for projected Canvas state and subsystem metadata.
- Allow complete unknown registered-future nodes to load with warnings and fallback rendering while keeping structurally invalid nodes as errors.
- Add subsystem-aware active Canvas context for Agent tools without breaking existing Agent calls.
- Add projected Canvas support where entity/memory JSON remains the source of truth and `.nkc` stores layout/cache state.
- Preserve existing storyboard behavior through a storyboard subsystem migration before adding new narrative/entity/behavior/memory features.

**Non-Goals:**

- This change does not implement third-party marketplace Canvas subsystems. It records a future path but keeps built-in subsystem types as compile-time unions.
- This change does not replace the existing Canvas layered content architecture or make block content own graph edges.
- This change does not move Rust/engine authority into Canvas; Canvas remains a Webview/Extension orchestration surface.
- This change does not guarantee that older Canvas versions can render v2.1 files containing new node types.
- This change does not introduce a separate CustomEditor for each subsystem.

## Decisions

### 1. Free mixing over file-level kind

`CanvasData` remains kind-free. A Canvas file activates narrative, behavior, storyboard, entity, or memory behavior by scanning `CanvasData.nodes` for trigger node types.

Alternatives considered:
- File-level `kind`: rejected because it forces early user commitment and splits mixed projects into multiple files.
- Separate Webviews per domain: rejected because it duplicates core Canvas infrastructure and complicates cross-domain references.

### 2. Split Manifest from Webview registration

Subsystem contracts are split into two layers:

- `CanvasSubsystemManifest`: pure data, suitable for `@neko/shared` or an Extension-side manifest registry. It contains subsystem id, trigger node types, connection types, rule descriptors, auto-arrange strategy ids, JSON-schema-like Agent tool declarations, and JSON-serializable metadata defaults.
- `WebviewSubsystemRegistration`: Webview-only registration that extends the manifest with React lazy node renderers, floating panels, and playback controllers.

This keeps Extension Host from importing `webview/src/subsystems/*` and keeps React/VSCode APIs out of L0 contracts.

### 3. Version v2.1 as optional extension over NKC v2.0

`CURRENT_NKC_VERSION` in the NKC migrator is the authoritative version source. `CANVAS_VERSION` must be aligned with it. v2.1 adds optional `projected`, `narrative`, `behavior`, `entityGraph`, and `memoryGraph` fields without requiring structural migration of v2.0 Canvas data.

The v2.0-to-v2.1 migrator is loss-preserving and no-op apart from version normalization/default optional sections when needed.

### 4. Registered built-in node/connection unions now, dynamic registry later

Built-in subsystems extend compile-time unions with registered node and connection types:

- Narrative: `choice`, `merge`, `narrative-scene`, `narrative-note`
- Behavior: `state`, `trigger`, `action`, `condition`, `composite`
- Entity: `entity`, `representation-slot`, `occurrence`, `generated-asset`
- Memory: `memory`, `conversation`, `fact`

This preserves type safety for built-in subsystems. If third-party subsystem needs become concrete, the future path is to widen to `CoreCanvasNodeType | (string & {})` and validate through runtime registry plus trust boundaries.

### 5. Unknown complete nodes warn and render fallback

The NKC validator currently treats unknown node types as errors. For v2.1, structurally complete unknown nodes become warnings in normal load mode so a newer file can be inspected without data loss. Missing required structural fields such as `id`, `position`, `size`, or `zIndex` remain errors. Strict validation may promote unknown node warnings to errors for save/export pipelines that require full support.

The Webview fallback renderer displays type name and a bounded data summary, with no runtime behavior beyond selection, movement, deletion, and preservation.

### 6. Projected Canvas uses adapters, not direct package imports

Projected Canvas files use `.neko/.cache/*.nkc` for layout/cache state and mark `projected: true`. Entity and memory JSON remain the source of truth. Canvas discovers projection adapters through shared capability/API boundaries, and adapters expose a pure callback-style `onSourceChanged(listener): DisposableLike` rather than `vscode.Event` in shared types.

Canvas sends write-back operations to the adapter. It does not encode neko-assets or neko-agent internal JSON mutation rules.

### 7. UI shell becomes subsystem-aware

The Webview shell moves toward a top toolbar, a grouped left node library, floating subsystem panels, inline node expansion, and inline connection editing. The first implementation step is to preserve current storyboard functionality while creating injection points. Narrative/behavior playback controls and panels are added only when active subsystems provide them.

The toolbar/status/viewport behavior must remain compatible with the ongoing unified viewport protocol work. Canvas must not introduce a separate viewport command contract.

## Risks / Trade-offs

- Core extraction may regress storyboard behavior -> Keep storyboard as the first subsystem migration and require focused regression tests before adding new subsystems.
- Compile-time registered unions require code changes for each built-in subsystem -> Accept for built-in scope; document runtime-registry path for future marketplace extensions.
- Unknown node warning mode can hide unsupported behavior -> Fallback renderer must be visibly degraded, and strict validation must remain available for save/export gates.
- Projection write-back can desynchronize with external JSON -> Use adapter-owned write rules, FileSystemWatcher-triggered reprojection, and explicit write-back errors that do not crash Canvas.
- UI rewrite can grow beyond subsystem scope -> Phase UI work after contracts and storyboard migration; preserve existing editing paths until inline replacements pass coverage.
- Multiple active playback controllers can conflict -> Toolbar hosts only one active playback mode at a time, with mode selection when multiple playable subsystems are present.
- Agent context can become too large on mixed graphs -> Return summaries (`nodeTypeSummary`, `activeSubsystems`, selected node types) by default and keep detailed metadata optional.

## Migration Plan

1. Add v2.1 contracts and tests: version alignment, subsystem/projection types, registered node/connection unions, validator warning behavior, fallback renderer expectations.
2. Add subsystem registry scaffolding and migrate storyboard behavior into the first built-in subsystem without changing user-visible storyboard workflows.
3. Extend Agent active context with optional subsystem fields while preserving old callers.
4. Add the top toolbar, grouped node library, floating panel host, inline node expansion, and inline connection editor behind storyboard-compatible behavior.
5. Add narrative subsystem, then entity projection, then behavior and memory in separate phases.
6. For rollback, keep v2.0/v2.1 JSON fields optional and preserve unknown fields on load/save. If a subsystem rollout is disabled, Canvas should still open files and render unsupported nodes through fallback.

## Open Questions

- Whether built-in subsystem manifests should live in `@neko/shared` or an Extension-side manifest registry for the first implementation.
- Exact JSON schema for `AgentToolDef` in subsystem manifests.
- Whether floating panel positions should persist in `.nkc` viewport-adjacent state or workspace state.
- Whether the first implementation should include narrative playback in the same phase as narrative nodes or split playback into a later phase.

## Deferred Follow-ups Before Archive

- Entity graph runtime remains adapter-driven infrastructure only in this change. Follow-up work should add concrete `neko-assets` projection adapters, entity/slot/occurrence renderers, representation and coverage panels, and source-owned write-back commands.
- Behavior runtime is limited to shared node/connection contracts and placeholder subsystem activation in this change. Follow-up work should add behavior node renderers, transition/child rule execution, blackboard editing, debug overlays, playback mode integration, and behavior Agent tools.
- Memory graph runtime is limited to shared node/connection contracts and projection boundaries in this change. Follow-up work should add concrete `neko-agent` memory projection adapters, memory/fact/conversation renderers, association weight editing, time/search controls, and memory traversal/query tools.
