## Context

Canvas already persists a layered graph: spatial node fields, composable content, optional container organization, and top-level connections. `scene` and `group` are containers over ordinary Canvas nodes, and connections remain top-level graph relations. Narrative Preview currently consumes a narrower `NarrativeGraphSnapshot` that only admits narrative runtime nodes, while Canvas media preview handles single media assets. As a result, valid storyboard structures such as `scene` containers with `shot` children or `scene -> scene` sequence edges do not have a common playback surface.

The design must preserve existing Canvas boundaries:

- Webview code must not call VSCode APIs directly except through existing postMessage contracts.
- Extension Host code must not import React or Webview runtime registrations.
- `scene` / `shot` must not be added to `NARRATIVE_RUNTIME_NODE_TYPES`.
- Container membership must remain `parentId` plus `container.childIds`; connections must not determine containment.
- Playback state must not persist runtime URLs, timer handles, DOM state, or media element state into `.nkc`.

## Goals / Non-Goals

**Goals:**

- Define a shared Canvas playback contract that projects existing Canvas data into a `CanvasPlaybackPlan`.
- Support storyboard playback for `scene` / `shot`, including scene child expansion and scene-to-scene sequence routes.
- Support generic grouped-node playback by consuming container order without changing container ownership rules.
- Support node-to-node playback through `sequence`, `default`, and `choice` connections, with deterministic ordering and branch behavior.
- Keep Narrative Preview compatible and reuse existing narrative semantics through an adapter rather than broadening narrative runtime node types.
- Provide Canvas and Preview diagnostics that explain unsupported graph surfaces instead of reporting only zero runtime nodes.

**Non-Goals:**

- Do not replace the existing Narrative Runtime, condition evaluator, or HTML5 narrative export pipeline.
- Do not introduce a new Canvas file kind, `.story`, `.nks`, `.nkstory`, or standalone graph format.
- Do not make `start` / `end` base fields on every Canvas node.
- Do not persist playback timers, current playhead, media element current time, blob URLs, Webview URIs, or resolved preview URLs in `.nkc`.
- Do not implement full timeline editing or engine-rendered video composition for storyboard playback in this change.

## Decisions

### Decision 1: Add a Playback Projection Layer

Canvas playback will use a projection step:

```text
CanvasData -> CanvasPlaybackAdapter -> CanvasPlaybackPlan -> PlaybackRuntime/UI
```

`CanvasData` stays authoritative for nodes, containers, connections, and domain data. The playback layer produces a transient `CanvasPlaybackPlan` with units, transitions, entries, behavior mode, and diagnostics.

Alternatives considered:

- Add playback fields directly to `CanvasNodeBase`. Rejected because start/end/order are playback concerns and would pollute the base spatial contract.
- Reuse `NarrativeGraphSnapshot` for all playback. Rejected because storyboard `scene` / `shot` and media playback have different semantics from interactive narrative nodes.

### Decision 2: Store Playback Metadata as Optional Extension Data

Canvas-level metadata will be optional:

```ts
interface CanvasPlaybackMetadata {
  version: 1;
  adapterId?: 'auto' | 'storyboard' | 'narrative' | 'media-sequence' | 'generic';
  mode?: 'auto' | 'manual' | 'linear' | 'interactive';
  entryIds?: readonly string[];
  nodeOverrides?: Readonly<Record<string, CanvasPlaybackNodeOverride>>;
  edgeOverrides?: Readonly<Record<string, CanvasPlaybackEdgeOverride>>;
}
```

Node and connection overrides may also live under `node.extension.playback` and `connection.extension.playback` when local ownership is better. Projection must normalize all sources into a plan without requiring metadata to exist.

Alternatives considered:

- Require a profile on every Canvas. Rejected because Canvas files can mix storyboard, narrative, media, and generic graph regions.
- Use only node-local overrides. Rejected because entry points and behavior mode are naturally canvas-level concerns.

### Decision 3: Separate Adapter/Profile from Behavior Mode

Adapter/profile answers "how to interpret Canvas structure." Behavior mode answers "how to execute the resulting plan."

Initial adapters:

- `storyboard`: expands `scene` containers into `shot` playback units and follows scene/shot `sequence` edges.
- `narrative`: delegates to existing narrative graph extraction/runtime semantics.
- `media-sequence`: plays media units and advances on media-ended by default.
- `generic`: consumes container order and supported graph transitions without domain-specific fields.

Initial behavior modes:

- `manual`: only previous/next controls move playback.
- `linear`: automatically follows the first eligible ordered transition.
- `interactive`: pauses when multiple eligible branch transitions exist.
- `auto`: adapter default, such as storyboard linear, narrative interactive, media-sequence media-ended, generic linear.

Alternatives considered:

- Encode behavior into adapter names such as `storyboard-interactive`. Rejected because it multiplies adapters and prevents one graph interpretation from supporting multiple playback behaviors.

### Decision 4: Deterministic Ordering Rules

Container child ordering uses this priority:

1. Playback node override `order`.
2. `container.childPlacements[childId].order`.
3. `container.childIds` order.
4. Domain ordering such as `shotNumber` or `sceneNumber`.
5. Stable position fallback, top-to-bottom then left-to-right, followed by node id.

Connection ordering uses this priority:

1. Playback edge override `order`.
2. `connection.priority`.
3. Connection creation order from `CanvasData.connections`.
4. Connection id as a stable fallback.

`reference` edges are excluded from playback routes by default. `sequence`, `default`, and `choice` are playable. `transition` can decorate a route but must not be the sole authority for connectivity unless an adapter explicitly opts in.

Alternatives considered:

- Use canvas position as the main order. Rejected because visual layout is unstable under auto-layout and does not express branch priority.
- Use only connection priority. Rejected because container-only structures need playback even without edges.

### Decision 5: Keep Narrative Runtime Boundary Intact

The narrative adapter will continue to use narrative runtime nodes only: `narrative-start`, `narrative-scene`, `choice`, `merge`, and `narrative-ending`. `scene`, `shot`, and `script` remain storyboard/source-reference nodes. When a user opens a narrative surface for non-narrative nodes, the UI must provide a diagnostic and route them to storyboard/generic playback when possible.

Alternatives considered:

- Add `scene` and `shot` to `NARRATIVE_RUNTIME_NODE_TYPES`. Rejected because it breaks the ADR boundary and forces storyboard data into interactive narrative metadata.

### Decision 6: Preview Consumes Plans Through Host Adapters

The Preview surface will accept a `CanvasPlaybackPlan` message in addition to existing narrative messages. Rendering for a playback unit is delegated by unit kind:

- `shot` and `scene`: show node summary, Fountain/storyboard metadata, available preview assets, or selected-node highlight.
- `media`: use existing preview resolver and media playback store.
- `narrative`: use existing Narrative Preview player.
- `generic`: highlight or summarize the source node.

The plan must carry persistent resource identities or source node ids, not runtime-only Webview URIs.

## Risks / Trade-offs

- Cross-surface scope creep -> Start with storyboard and generic plan projection before expanding Preview rendering depth.
- Ambiguous mixed Canvas graphs -> Default to `auto` detection with explicit adapter override and diagnostics when multiple adapters match.
- Duplicate playback controllers -> Route subsystem controllers through a shared host that exposes one active controller at a time.
- Ordering surprises -> Surface the resolved path and branch order in tests and diagnostics so users can see why a route was chosen.
- Preview resource leakage -> Keep runtime URLs inside existing preview resolver and playback store; plans only contain durable refs and node ids.
- Narrative regression -> Add tests proving `scene` / `shot` are not admitted into narrative runtime snapshots.

## Migration Plan

No destructive migration is required. Existing `.nkc` files load without `playback` metadata. The adapter registry derives plans from existing nodes, containers, and connections. If playback metadata is later saved, it is optional and versioned. Rollback removes the UI entry points and ignores the optional metadata while preserving it on load/save.

## Open Questions

- Should the first MVP expose adapter selection to users, or keep `auto` only with diagnostics?
- Should storyboard playback default to opening a Preview panel or only highlight nodes in Canvas until richer shot rendering lands?
- Should branch conditions reuse the narrative condition evaluator immediately, or begin with label/priority-only branching for non-narrative adapters?
