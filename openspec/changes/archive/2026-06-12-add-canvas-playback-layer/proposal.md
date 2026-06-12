## Why

Canvas now has mature primitives for nodes, containers, and connections, but playback remains split between Narrative-only graph playback and single media playback. Storyboard `scene` / `shot` graphs, grouped nodes, and ordinary `sequence` / `choice` connections cannot be previewed as one coherent route, which makes Canvas Preview report zero runtime nodes for valid non-narrative structures.

This change introduces a generic Canvas playback layer that projects existing Canvas structure into an executable playback plan without weakening the current layered Canvas model or mixing storyboard nodes into Narrative Runtime.

## What Changes

- Add shared Canvas playback contracts for playback metadata, node and connection playback overrides, playback plans, playback units, transitions, behavior modes, and diagnostics.
- Add a Playback Adapter Registry that converts `CanvasData` into a `CanvasPlaybackPlan` using adapter hints and automatic detection.
- Add initial adapters for storyboard, narrative, media-sequence, and generic playback:
  - Storyboard supports `scene` / `shot` playback, scene child expansion, and scene-to-scene `sequence` routes.
  - Narrative reuses the existing narrative runtime semantics rather than admitting `scene` / `shot` into narrative runtime node types.
  - Media-sequence supports media-node playback with media-ended advancement.
  - Generic supports container order plus `sequence` / `default` / `choice` transitions.
- Extend Canvas playback UI and Preview surfaces to consume `CanvasPlaybackPlan`, including branch selection and clearer diagnostics when a requested preview surface does not support the selected graph.
- Keep basic Canvas node, container, and connection persistence unchanged; playback metadata remains optional extension metadata.

## Capabilities

### New Capabilities
- `canvas-playback-layer`: Defines Canvas playback metadata, playback plan projection, adapter selection, container and connection ordering, branch behavior, UI controls, preview consumption, and diagnostics.

### Modified Capabilities
- `canvas-subsystem-activation`: Clarify that subsystem playback controls can be backed by the shared Canvas playback layer and can coexist with existing subsystem-specific controllers.
- `canvas-container-organization`: Clarify that container child order may be consumed by playback projection while containment remains independent from connections.
- `canvas-layered-node-model`: Clarify that playback metadata is an extension layer and MUST NOT alter base spatial, content, organization, or relationship invariants.

## Impact

- Shared contracts: `packages/neko-types/src/types/` gains Canvas playback types and helpers.
- Canvas Webview: playback controller host, playback controls, route highlighting, branch choice UI, and adapter integration.
- Canvas Extension: preview bridge messaging and diagnostics for generic playback plans.
- Story/Narrative Preview: Preview entry points gain support for shared playback plans while current Narrative Preview contracts stay compatible.
- Tests: shared projection tests, adapter tests, Canvas UI tests, preview bridge tests, and regression tests for Narrative Runtime boundaries.
- Documentation: Canvas playback ADR/spec updates describing adapter/profile versus behavior mode, supported node/connection rules, and non-goals.
