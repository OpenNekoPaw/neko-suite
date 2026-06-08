## Context

Canvas already has a multi-purpose subsystem model with lazy narrative registration, narrative variables, choice connection metadata, and lightweight traversal. Story already owns standard Fountain parsing and script preview. The missing capability is a branching runtime surface that can assemble Canvas narrative nodes and `.fountain` scene files into a playable experience without turning Canvas into a full-screen player or inventing a second story-graph file format.

Five-layer analysis:

| Layer | Design stance |
| ----- | ------------- |
| Responsibilities | Canvas owns branching graph authoring and current in-memory graph state; Story parser owns Fountain-to-directive parsing; Preview owns playback state and rendering; Extension hosts own resource resolution and panel routing. |
| Dependencies | Shared contracts stay in `@neko/shared`; Canvas does not import Story extension internals; Webviews do not access VSCode APIs; Preview renderers receive data and resource ports through props/context. |
| Interfaces | `NarrativeGraphSnapshot`, `NarrativePreviewMessage`, `NarrativeAssetRef`, `NarrativeAssetResolver`, `ConditionEvaluator`, `FountainPlayParser`, `NarrativeRuntime`. |
| Extension | New renderers, asset ref variants, character performance levels, export targets, and Agent diagnostics can register without changing Canvas core traversal contracts. |
| Testing | Shared validators and traversal tests first; bridge snapshot and message ordering tests next; runtime/renderer tests; export packaging tests; focused Canvas/Story/Agent tests by phase. |

The feature follows `adr-canvas-interactive-narrative.md`: `.nkc` is the branching story graph SSOT, scene content is standard `.fountain`, `script` nodes are references only, and `.nks` / `.story` / standalone `.nkstory` are out of scope for the new workflow.

## Goals / Non-Goals

**Goals:**

- Make Canvas narrative graphs playable through a separate Narrative Preview panel.
- Add start/end node semantics and correct traversal so editor notes do not participate in runtime paths.
- Preserve Canvas as an editor and keep immersive playback outside the Canvas Webview.
- Extract narrative graph snapshots from the open Canvas editor's in-memory document model, including unsaved changes.
- Parse standard `.fountain` scene files into renderer-friendly play directives without adding non-standard Fountain syntax.
- Resolve narrative media through stable refs and explicit content access intents.
- Provide a reusable Preview runtime that can become the HTML5 export kernel.
- Keep `.fountain` as the only supported scene text file format for this workflow.

**Non-Goals:**

- Do not add a standalone `.nkstory` graph format or projection adapter.
- Do not make `.nks` or `.story` part of the new authoring or preview workflow.
- Do not implement Canvas-internal Play Mode or mode-gated Canvas event handling.
- Do not implement Live2D/Spine/3D character runtime in the core phase beyond interface seams and static/CSS character layers.
- Do not implement timeline editing, audio mixing, or heavy media transcoding inside Preview.
- Do not automatically expand a `script` node into narrative-scene nodes.

## Decisions

### Decision 1: Use `.nkc` as the branching story graph SSOT

Branching structure is authored with Canvas narrative nodes and connections. `narrative-scene` nodes link to `.fountain` scene files through `sceneRef`. This reuses Canvas storage, undo/editing, node library, and Agent Canvas APIs.

Alternative considered: introduce `.nkstory` as a scene graph JSON projected into Canvas. Rejected because it creates a second graph data owner and requires write-back conflict handling without adding a clear authoring benefit.

### Decision 2: Split narrative node types into activation and traversal sets

The narrative subsystem should activate when any narrative editor node exists, including `narrative-note`. Runtime traversal should include `narrative-start`, `narrative-scene`, `choice`, `merge`, and `narrative-ending`, but exclude `narrative-note`.

Alternative considered: keep one `NARRATIVE_NODE_TYPES` set. Rejected because it makes editor notes appear in default paths, dead-end diagnostics, and runtime choices.

### Decision 3: Own Preview bridge in `neko-canvas/packages/extension`

`NarrativePreviewBridge` needs the current Canvas editor document model, dirty edits, selection/highlight routing, and document revision. Therefore Canvas extension owns bridge routing and snapshot extraction. Story parser/runtime code is used through shared contracts, build outputs, commands, or package boundaries, not direct cross-extension imports.

Alternative considered: Story extension owns the bridge. Rejected because Story cannot safely read unsaved Canvas state or route Canvas selection/highlight updates without widening Canvas internals.

### Decision 4: Use revisioned graph snapshots rather than Preview reading `.nkc`

Canvas sends `NarrativeGraphSnapshot` payloads with `requestId` and monotonically increasing `revision`. Preview discards stale snapshots and commands. This avoids disk reads and covers unsaved changes.

Alternative considered: Preview loads `.nkc` from disk on refresh. Rejected because it misses unsaved edits and makes editor/preview state drift under rapid changes.

### Decision 5: Keep Preview runtime host-independent

`NarrativeRuntime`, `NarrativePlayer`, and PlayRenderers run from a Webview package but do not call VSCode APIs or read files directly. File loading, URI projection, asset materialization, and export packaging are injected through `NarrativeAssetResolver`, graph snapshots, and parsed scene content.

Alternative considered: let Preview Webview request local files directly. Rejected by Webview sandbox and local resource access rules.

### Decision 6: Align narrative assets with `ResourceRef` and `ContentAccessIntent`

Durable narrative asset fields store `NarrativeAssetRef`, which is either a `ResourceRef` or a project-relative path ref. Preview rendering uses `interactive-preview`; HTML5 export uses `final-export`; bundle generation uses `package`. Runtime Webview URIs are never persisted.

Alternative considered: use raw strings for all asset paths. Rejected because raw strings blur preview URLs, source paths, cache paths, and export inputs.

### Decision 7: Implement renderers incrementally

The first playable renderer should be `IllustratedTextRenderer` because it validates graph traversal, Fountain text, choices, variables, and Preview/Canvas sync with minimal media complexity. `VisualNovelRenderer` follows for background, character image layers, ADV/NVL, and CSS performance. `InteractiveFilmRenderer` lands after media resource handling is validated.

Alternative considered: implement all renderers at once. Rejected because media and character performance concerns can hide runtime state-machine bugs.

## Risks / Trade-offs

- **Risk: Canvas and Preview message ordering can race.** -> Use `requestId`, `revision`, and stale-message discard in Preview tests.
- **Risk: Snapshot extraction reaches too deeply into Canvas internals.** -> Add a narrow Canvas editor provider API that returns read-only current document snapshots and posts typed highlight messages.
- **Risk: Resource refs in `characters.yaml` are awkward for authors.** -> Support project-relative shorthand while normalizing durable Canvas metadata to `NarrativeAssetRef`.
- **Risk: Fountain semantics cannot express every performance cue.** -> Keep Fountain standard and put scene-level performance metadata in `narrative-scene` data and `characters.yaml`.
- **Risk: Preview and export diverge.** -> Keep the same runtime/renderers and swap only resolver/message adapters.
- **Risk: Legacy Story extensions remain registered in package manifests.** -> Treat cleanup as separate work; this change's workflow and tests only accept `.fountain`.

## Migration Plan

1. Add shared contracts, validators, traversal split, and start/end node types without changing existing Canvas documents.
2. Add Canvas Webview node descriptors/renderers and preserve fallback behavior for older runtimes.
3. Add bridge snapshot extraction and Preview panel behind `narrative.preview`.
4. Add runtime/player/renderers incrementally, starting with illustrated text.
5. Add export once Preview runtime and asset resolution are stable.
6. Add optional Agent graph diagnostics after the core user loop works.

Rollback is straightforward before export: disable `narrative.preview`, hide start/end node library entries, and keep existing narrative nodes as editable Canvas nodes. Existing `.nkc` files with new node types still open through fallback in older runtimes if their structure is complete.

## Open Questions

- Should `narrative-start` be auto-created by a new narrative template command, or remain a manual node-library action in the first release?
- Should `characters.yaml` normalization to `NarrativeAssetRef` happen on save, on preview snapshot extraction, or only on export?
- Should HTML5 export initially live under the Deliverables command surface or a dedicated `Neko: Export Interactive Story` command before unification?
