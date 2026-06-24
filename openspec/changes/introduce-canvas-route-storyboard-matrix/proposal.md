## Why

Canvas playback now has a same-Webview `PlaybackWorkspace`, but the bottom route UI still behaves like a compact route strip / lightweight timeline. The accepted ADR has narrowed the desired model: Canvas should show route and branch structure as a Route Storyboard Matrix, where rows are route families / divergent branches, columns are playback steps, containers provide grouping, and cells are playable units with thumbnails.

This change makes Canvas playback navigation useful for large storyboard and branching canvases without turning Canvas into Cut. It also keeps send-to-Cut fast by projecting the selected matrix row back through `CanvasPlaybackPlan` and `CanvasCutDraftPayload`.

## What Changes

- Replace the default Canvas playback route strip with a `RouteStoryboardMatrix` view inside the existing Canvas Editor Webview `PlaybackWorkspace`.
- Keep a compact route strip as an alternate/narrow presentation when the bottom pane is too small or the user chooses a compact mode.
- Add a matrix view model derived from `CanvasPlaybackPlan`:
  - route family grouping and duplicate route candidate folding,
  - container-boundary column alignment,
  - stable unit identity based on Canvas domain identifiers such as `sourceNodeId`,
  - empty alignment cells that are view-only,
  - global container fold state with colspan/slot preservation,
  - row/column/cell metadata for selection, preview jump, diagnostics, and Cut draft handoff.
- Render matrix cells with thumbnails/poster frames when available, unit label, time range/duration, media status, and diagnostics.
- Support matrix interactions for preview mode:
  - click cell to select/focus the Canvas node or container and jump PreviewStage,
  - click row to switch route / branch,
  - click column to compare branch differences at the same step,
  - filter or highlight by route family, container, node kind, media availability, diagnostics, and generation status.
- Add a fast "Send to Cut" action from the selected matrix route row using the existing `CanvasCutDraftPayload` handoff path.
- Add an explicit `Route Edit Mode` entry point for future/optional write operations, with write operations routed through Canvas graph commands and confirmation/undo policy.
- Keep derivation/workflow graphs separate from playback routes: multi-input generation, prompt/reference dependencies, and asset provenance do not appear as route rows unless explicitly projected as playable units.

### Non-Goals

- Implement Cut-style tracks, clips, trim handles, transitions, subtitles, audio tracks, effects, or export settings in Canvas.
- Make the matrix a second persistent route/order model.
- Persist empty cells, alignment columns, fold state, filters, hover, playhead, or matrix-specific ordering to `.nkc`.
- Reuse Cut Webview timeline internals or Cut store in Canvas.
- Implement full route editing in the first phase if preview/navigation and Cut handoff are not stable.
- Add a generic table/grid framework to `@neko/ui` before Canvas-specific behavior proves reusable.

### Compatibility

This is a prelaunch UI and view-model migration on top of the existing Canvas playback workspace. Existing `.nkc` order facts remain authoritative through Canvas nodes, containers, connections, and playback metadata. Existing `.nkv` projects are not migrated. The compact route strip can remain as a presentation option, but it must consume the same matrix/plan-derived route selection and must not become a separate success path.

## Capabilities

### New Capabilities

- `canvas-route-storyboard-matrix`: Defines the Canvas Route Storyboard Matrix view model, rendering behavior, interactions, Cut handoff entry point, and edit-mode boundaries.

### Modified Capabilities

- None.

## Impact

- Canvas Webview:
  - `PlaybackWorkspace`
  - existing `PlaybackRouteStrip`
  - new `RouteStoryboardMatrix` and matrix view-model projector
  - playback store/session state for matrix view mode, route family, focus, filters, and global container fold state
  - Canvas selection / viewport focus integration
  - preview stage jump and current unit highlighting
- Shared contracts and helpers:
  - `CanvasPlaybackPlan` and route candidates remain the input contract
  - possible new pure helpers under `@neko/shared` only if the matrix projection is needed by Agent or tests outside Canvas Webview
- Cut handoff:
  - selected matrix route uses existing `CanvasCutDraftPayload` creation and `cut.importCanvasDraft`
  - no Cut timeline or `.nkv` contract changes expected
- Agent:
  - may reveal/focus the matrix, request route summaries, or trigger existing send-to-Cut actions
  - does not gain playback or matrix-order ownership
- Documentation and validation:
  - update Canvas package docs if they describe the route strip as the default UI
  - add Canvas Webview tests for matrix projection/rendering/interactions
  - run VS Code Webview runtime smoke for matrix layout, focus, selection, preview jump, and send-to-Cut entry.
