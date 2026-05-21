## 1. Shared Contracts and NKC Format

- [x] 1.1 Add shared pure-data subsystem contract types for `CanvasSubsystemManifest`, connection rule descriptors, auto-arrange strategy ids, and JSON-serializable metadata defaults.
- [x] 1.2 Add shared projection contract types for projected Canvas data, write-back operations, and disposable callback source-change subscriptions without VSCode API types.
- [x] 1.3 Split Canvas node and connection types into core and registered built-in subsystem unions.
- [x] 1.4 Add v2.1 optional `projected`, `narrative`, `behavior`, `entityGraph`, and `memoryGraph` fields to `CanvasData`.
- [x] 1.5 Align `CANVAS_VERSION` with the NKC migrator authority and add the v2.0-to-v2.1 migration path.
- [x] 1.6 Update NKC validation so structurally complete unknown nodes warn in normal mode and error in strict mode.
- [x] 1.7 Add unit tests for v1.0/v2.0/v2.1 migration, optional metadata preservation, projected flag validation, and unknown-node warning/error behavior.

## 2. Subsystem Registry Foundation

- [x] 2.1 Add built-in subsystem manifests for storyboard, narrative, behavior, entity, and memory trigger node and connection types.
- [x] 2.2 Add an Extension-safe manifest registry that does not import Webview subsystem modules.
- [x] 2.3 Add a Webview subsystem registry that lazy-loads `WebviewSubsystemRegistration` modules on trigger node presence or explicit node-library access.
- [x] 2.4 Add subsystem scanning utilities that compute active subsystem ids and node type summaries from `CanvasData.nodes`.
- [x] 2.5 Add subsystem metadata default application when trigger nodes are introduced.
- [x] 2.6 Add fallback node renderer for unsupported complete nodes with visible warning and data preservation.
- [x] 2.7 Add tests for subsystem activation, deactivation of UI/controller state, bundle lazy-loading behavior, and fallback rendering.

## 3. Storyboard Compatibility Migration

- [x] 3.1 Register existing storyboard node types and connection behavior through the storyboard subsystem manifest.
- [x] 3.2 Move storyboard Webview renderers and panels behind a storyboard `WebviewSubsystemRegistration` without changing existing user-visible behavior.
- [x] 3.3 Update node renderer and descriptor lookup to consult active subsystem registrations before falling back.
- [x] 3.4 Update node creation paths to use registered descriptors and defaults for existing storyboard nodes.
- [x] 3.5 Run and update existing Canvas store, node renderer, node factory, container, and storyboard tests for zero-regression coverage.

## 4. Agent Context and Tools

- [x] 4.1 Extend `CanvasAgentActiveContextResult` with optional `nodeTypeSummary`, `activeSubsystems`, `selectedNodeTypes`, and bounded subsystem metadata summaries.
- [x] 4.2 Update Webview active-context construction to compute subsystem summary fields from the registry and current selection.
- [x] 4.3 Update Extension API forwarding and Agent capability provider code to preserve backward compatibility for old callers.
- [x] 4.4 Add validation for Agent create/list/derive/traversal operations against core plus registered subsystem node and connection types.
- [x] 4.5 Add tests showing old active-context callers still pass and mixed Canvas context includes subsystem summaries.

## 5. Subsystem-Aware Canvas UI Shell

- [x] 5.1 Add the top toolbar host with interaction tools, undo/redo, auto-arrange menu, and playback-controller slot.
- [x] 5.2 Add grouped `NodeLibraryPanel` populated from core descriptors and subsystem manifests.
- [x] 5.3 Add `FloatingPanel` host for subsystem panels with show/hide and drag behavior.
- [x] 5.4 Add node collapsed/expanded state and `useNodeExpand` behavior for inline node editing.
- [x] 5.5 Add inline connection editor for label, connection type, and registered subsystem connection attributes.
- [x] 5.6 Preserve existing storyboard editing and connection editing coverage while migrating away from permanent `PropertyPanel` reliance.
- [x] 5.7 Update Canvas status-bar messages to include active subsystem summaries without introducing a separate viewport protocol.

## 6. Projected Graph Infrastructure

- [x] 6.1 Add projected Canvas cache loading and regeneration flow for `.neko/.cache/*.nkc` files.
- [x] 6.2 Add projection adapter discovery through shared/extension API boundaries.
- [x] 6.3 Route projected graph write-back operations through adapters and surface recoverable adapter errors.
- [x] 6.4 Add source-change subscription handling that reprojects or prompts before overwriting source-owned data.
- [x] 6.5 Add projected graph status indicators and ensure layout-only edits persist to cache without writing source JSON.
- [x] 6.6 Add tests for adapter write-back failure, source-change reprojection, cache regeneration, and source/layout ownership separation.

## 7. Narrative Subsystem First Slice

- [x] 7.1 Add narrative node data types, descriptors, factory defaults, and renderers for `choice`, `merge`, `narrative-scene`, and `narrative-note`.
- [x] 7.2 Add narrative connection type support for `choice` connections with choice text, condition, and priority attributes.
- [x] 7.3 Add narrative connection validation descriptors and runtime rule implementation.
- [x] 7.4 Add `FlowTraversal` utilities for successors, predecessors, default path, choices, and cycle detection.
- [x] 7.5 Add narrative floating variable panel backed by `CanvasData.narrative`.
- [x] 7.6 Add narrative toolbar playback controller for step, choice pause, and path highlighting.
- [x] 7.7 Add narrative Agent tool registrations and tests for mixed Canvas traversal ignoring non-narrative nodes.

## 8. Verification and Documentation

- [x] 8.1 Run focused TypeScript checks and tests for `@neko/shared`, `neko-canvas` webview, and `neko-canvas` extension packages.
- [x] 8.2 Run relevant Agent extension tests for Canvas active context and tool compatibility.
- [x] 8.3 Add or update architecture documentation links from the ADR to the implemented OpenSpec change where appropriate.
- [x] 8.4 Verify `openspec validate implement-multi-purpose-canvas-subsystems --strict` passes after implementation updates.
- [x] 8.5 Record any deferred entity, behavior, or memory subsystem work as follow-up tasks before archive.

## 9. Post-Archive Review Closure

- [x] 9.1 Unify Narrative and Storyboard Webview registration paths around shared built-in manifests.
- [x] 9.2 Replace timestamp-only Narrative variable IDs with UUID-first ID generation.
- [x] 9.3 Remove duplicate subsystem load triggering from `CanvasApp` and log subsystem load failures.
- [x] 9.4 Clean up floating panel drag listeners on pointer end/cancel and unmount.
- [x] 9.5 Add Canvas Agent prompt fragments for mixed-purpose subsystem context.
- [x] 9.6 Add contract coverage for projection write-back responses, regeneration error status, malformed subsystem status input, and prompt fragments.
- [x] 9.7 Style inline connection editor controls with Canvas design tokens.
- [x] 9.8 Mark placeholder Narrative playback controls with a P1 TODO for runtime stepping.
- [x] 9.9 Replace Storyboard descriptor raw emoji with Webview-side SVG React icons.
- [x] 9.10 Remove the unused `FloatingPanelFrame.activeSubsystemIds` prop path.
