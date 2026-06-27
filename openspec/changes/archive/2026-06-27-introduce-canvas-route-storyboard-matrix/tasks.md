## 1. Matrix Projection Contract

- [x] 1.1 Audit existing Canvas playback projection helpers, `PlaybackWorkspace`, `PlaybackRouteStrip`, playback store, and route-to-Cut draft code for reuse points and extraction boundaries.
- [x] 1.2 Define package-local `RouteStoryboardMatrix` view-model types for route families, rows, container groups, alignment slots, cells, empty cells, summary cells, diagnostics, and semantic edit anchors.
- [x] 1.3 Implement a pure matrix projector from `CanvasPlaybackPlan` / effective routes that groups route candidates into route families and folds overlapping subset candidates by default.
- [x] 1.4 Implement container-boundary column alignment with stable Canvas-domain identity (`sourceNodeId`, container child id, source scene/shot id) and no cross-container global LCS.
- [x] 1.5 Implement empty cell generation as view-only alignment slots and semantic insertion anchors based on container + previous/next playable unit.
- [x] 1.6 Implement global container fold projection with colspan/slot preservation and folded summary cells.
- [x] 1.7 Implement derivation/workflow exclusion so prompt/reference/note/asset dependency/multi-input generation edges do not become route rows unless already projected by `CanvasPlaybackPlan`.

## 2. Playback Session and View State

- [x] 2.1 Extend Canvas playback session state with route view mode (`matrix`/`compact`), active route family, matrix filters/highlights, focused cell/row/column, and globally folded container ids.
- [x] 2.2 Ensure matrix view/session state is reset or reconciled on plan revision, selected adapter, route family, and canvas data changes without writing `.nkc` order fields.
- [x] 2.3 Add store actions for toggling matrix/compact view, selecting route family, folding containers, setting matrix filter/highlight state, and focusing a matrix cell or column.
- [x] 2.4 Add playback store tests proving matrix view state is runtime-only and does not mutate Canvas project data.

## 3. Matrix UI Components

- [x] 3.1 Create `RouteStoryboardMatrix` component inside Canvas Webview playback components using existing theme tokens, `@neko/ui` icons/primitives where suitable, and package i18n strings.
- [x] 3.2 Render route family / row headers with route title, source kind, unit count, duration, diagnostics, and Send to Cut action affordance.
- [x] 3.3 Render container headers, folded summary cells, playable thumbnail cells, empty cells, diagnostic/status badges, and current playhead/current unit indicators.
- [x] 3.4 Preserve stable layout under hover/focus/selection with horizontal scrolling and compact cell sizing suitable for the bottom route pane.
- [x] 3.5 Keep `PlaybackRouteStrip` as compact fallback and wire matrix/compact selection to the same `PlaybackSession` current route, unit, and playhead.
- [x] 3.6 Add English and Chinese i18n labels for matrix mode, compact mode, route family, folded container summary, empty cell, Send to Cut, filters, diagnostics, and edit-mode disabled hints.

## 4. Preview Interactions

- [x] 4.1 Wire playable cell click to select the Canvas source node/container, focus or reveal it in the Canvas viewport, and jump PreviewStage/current playback unit without mutating order.
- [x] 4.2 Wire route row click to switch the active route/branch and synchronize matrix, playback controls, route strip fallback, and PreviewStage.
- [x] 4.3 Wire step column click to highlight comparable cells at the same alignment slot without treating the column as a persistent domain entity.
- [x] 4.4 Implement route family/container row or range filtering and unit-property highlight/badge behavior without hiding individual alignment slots by default.
- [x] 4.5 Add keyboard focus metadata so matrix navigation does not conflict with Canvas edit shortcuts or playback shortcuts.
- [x] 4.6 Add hover/selection highlighting for related Canvas node, container boundary, and route path using existing Canvas selection/highlight mechanisms where available.

## 5. Send to Cut and Edit Boundaries

- [x] 5.1 Add a matrix row Send to Cut action that resolves the selected route id and current Canvas revision, then calls the existing route-to-draft / Cut import path.
- [x] 5.2 Add stale-plan and missing-route diagnostics so Send to Cut cannot import visible cells from an outdated matrix.
- [x] 5.3 Ensure folded cells, empty cells, filters, highlights, and matrix coordinates are not serialized into `CanvasCutDraftPayload`.
- [x] 5.4 Add an explicit Route Edit Mode UI state or disabled placeholder that makes write operations visibly gated.
- [x] 5.5 If any edit operation is enabled in this change, route it through Canvas graph commands/capabilities, undo history, semantic anchors, and confirmation policy.
- [x] 5.6 Explicitly block whole-column clear and present batch operation guidance through container, route family, step range, or explicit selection set instead.

## 6. Tests

- [x] 6.1 Add pure projector tests for route family grouping, duplicate candidate folding, divergent branch rows, and all-candidates debug mode.
- [x] 6.2 Add pure projector tests for container-boundary alignment, stable Canvas identity matching, empty cells, folded container slot preservation, and no cross-container LCS.
- [x] 6.3 Add pure projector tests proving derivation/workflow dependencies do not become matrix route rows.
- [x] 6.4 Add Canvas Webview component tests for matrix rendering, thumbnail/status/diagnostic cells, folded summaries, compact fallback, and no private order writes.
- [x] 6.5 Add Canvas Webview interaction tests for cell click selection/focus/preview jump, route row switch, step column highlight, filter/highlight behavior, and keyboard focus metadata.
- [x] 6.6 Add Send to Cut tests proving selected route draft creation is called, stale matrix import is blocked, and folded/empty/filter state does not affect draft order.
- [x] 6.7 Update existing `PlaybackWorkspace`, `CanvasPlaybackController`, toolbar, and layout tests that currently assume the route strip is the default bottom UI.

## 7. Documentation and Quality Gates

- [x] 7.1 Update Canvas package docs or architecture notes that still describe the bottom route UI as only a route strip.
- [x] 7.2 Run focused Canvas Webview typecheck and tests covering playback workspace and matrix components.
- [x] 7.3 Run shared playback boundary checks and Webview boundary checks proving Canvas/Cut internals remain separated.
- [x] 7.4 Run `openspec validate introduce-canvas-route-storyboard-matrix`.
- [x] 7.5 Run VS Code Extension Development Host / `vscode-extension-debugger` smoke for opening a `.nkc`, revealing PlaybackWorkspace, switching matrix/compact view, selecting cells, folding containers, jumping preview, and invoking Send to Cut.
- [x] 7.6 Record any residual risk if Route Edit Mode write operations, column virtualization, or full visual smoke are deferred.

### Residual Risk Notes

- Route Edit Mode write operations are intentionally deferred. The current matrix is preview/navigation/send-to-Cut only; destructive row/cell/column operations have no enabled UI path.
- Column virtualization is deferred. The initial matrix uses fixed-size cells and horizontal scrolling; very large route families may need virtualization after runtime profiling.
- `pnpm smoke:webview:runtime` passed and observed an active `neko.neko-canvas` Webview target. The smoke is the repository runtime target-discovery gate; deep manual clicking of every matrix interaction in Extension Development Host was not separately recorded.
