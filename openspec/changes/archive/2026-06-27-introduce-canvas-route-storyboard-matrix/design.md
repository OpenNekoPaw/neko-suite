## Context

The accepted ADR `docs/architecture/adr-canvas-cut-playback-route-and-timeline-boundary.md` establishes that Canvas owns semantic playback order, Cut owns editing timeline truth, and Agent only reads, displays, confirms, and dispatches high-level actions. The ADR now refines the Canvas route UI from a timeline-like strip into a Route Storyboard Matrix.

Current implementation already provides:

- `CanvasPlaybackPlan` as the single playback route projection.
- Same-Webview `PlaybackWorkspace` inside the Canvas Editor Webview.
- Independent Canvas, playback stage, and route pane visibility.
- A compact route strip with time ruler, segment selection, playhead, route tabs, preview seek, and host-enriched preview plan request.
- `CanvasCutDraftPayload` and Cut import handoff from selected route.

The remaining gap is information architecture. A route strip can show one selected route well, but it does not scale to branching storyboards, route candidates, container boundaries, or quick comparison between branches. The matrix should make route structure visible while preserving the ADR boundary: Canvas still does not own Cut tracks/clips and the matrix still does not persist its own order.

### Five-layer analysis

| Layer | Analysis |
| --- | --- |
| Responsibility | Canvas Webview owns matrix rendering, selection, focus, preview jump, route family choice, filters, fold state, and compact/matrix view mode. `CanvasPlaybackPlan` remains order input. Canvas graph commands own any future write operation. Cut owns `.nkv` after import. Agent may reveal or trigger existing capabilities but does not own matrix state. |
| Dependency | Matrix projection can start package-local in `neko-canvas` because it is a Canvas presentation model over `CanvasPlaybackPlan`. Extract pure helpers to `@neko/shared` only if Agent/Cut/shared tests need the same projection. Canvas Webview must not import Cut internals or VS Code API; Cut must not import Canvas Webview components. |
| Interface | Inputs are `CanvasPlaybackPlan`, `CanvasPlaybackRouteCandidate`, `CanvasPlaybackUnit`, playback session state, and optional preview media metadata. Outputs are matrix rows/columns/cells/diagnostics and existing route/cell selection callbacks. Send-to-Cut uses the existing route id and `CanvasCutDraftPayload`, not matrix cell arrays. |
| Extension | New matrix view model separates alignment, row grouping, filter/highlight, and rendering so later route-edit operations can reuse semantic anchors. A compact route strip can be implemented as a sibling renderer over the same selected route and session state. |
| Testing | Unit tests cover matrix projection, route family grouping, column alignment, empty cells, container fold slot preservation, stable identity resolution, derivation exclusion, and filter semantics. Webview tests cover rendering, cell click, row switch, preview jump, Canvas selection, no private order writes, and send-to-Cut action dispatch. Runtime smoke covers VS Code Webview layout/focus. |
| Proportionality | No new server, project format, generalized spreadsheet engine, or full grid framework is introduced. The feature is a local Canvas Webview view model plus focused UI components. |
| Fail-visible behavior | Missing route, missing unit, stale plan, unsupported adapter mix, invalid matrix anchor, and attempted write outside Route Edit Mode return diagnostics or fail tests visibly instead of silently defaulting to empty rows or writing incorrect order. |

## Goals / Non-Goals

**Goals:**

- Make Route Storyboard Matrix the default bottom route navigator for medium/large panes.
- Preserve compact route strip as a fallback presentation for tight space or user-selected compact mode.
- Derive every matrix row/cell from `CanvasPlaybackPlan`; do not create matrix-owned route order.
- Group rows by route family and show only divergent routes/branches by default.
- Align columns by container boundary and stable Canvas-domain identity.
- Represent empty cells as view-only alignment slots.
- Let users click cells to select/focus Canvas nodes and jump PreviewStage.
- Let users switch branch/route rows and quickly send the selected row to Cut.
- Keep workflow/derivation graph inputs out of playback route projection.

**Non-Goals:**

- Full route editing implementation as part of first delivery.
- Cut-style timeline editing in Canvas.
- Multi-track, trim, transition, subtitle, audio, effect, or export editing.
- Persisting matrix view state or alignment results in `.nkc`.
- Introducing a generic reusable data-grid or spreadsheet primitive in `@neko/ui`.
- Changing `.nkv` import semantics or Cut timeline ownership.

## Decisions

1. **Matrix projection stays package-local first**
   - Implement a Canvas Webview-local pure projector, e.g. `canvasRouteMatrixProjector.ts`, that accepts `CanvasPlaybackPlan`, effective routes, selected route id, fold state, and filter/highlight state.
   - Alternative considered: put matrix projection in `@neko/shared` immediately. Rejected for the first implementation because the matrix view model is a Canvas UI projection, and no non-Canvas caller currently needs the full row/column/cell layout.

2. **Rows are route-family divergent branches, not all route candidates**
   - Group candidates by route family/scope such as current entry, scene, container, component, or selection.
   - Default rendering expands the active family and shows divergent routes/branches only.
   - Local candidates like `single-unit`, `selection`, `scene`, and `container` can appear as focus/filter scopes, not permanent parallel rows unless explicitly selected.
   - Alternative considered: render every route candidate as a row. Rejected because it duplicates units, makes matrix height explode, and misrepresents subset candidates as competing branches.

3. **Column alignment uses container boundaries and stable Canvas identity**
   - Force alignment at container boundaries.
   - Expand units linearly within each container.
   - Align common cells by stable Canvas-domain identity such as `sourceNodeId`, container child id, source scene id, or source shot id. Do not use potentially regenerated `CanvasPlaybackUnit.id` for cross-route alignment.
   - Do not run cross-container global LCS/diff alignment.
   - Alternative considered: global LCS across every route row. Rejected because it is unpredictable for users, expensive for large canvases, and can align similar-looking units across unrelated containers.

4. **Container fold state is global to the matrix view**
   - A container is folded or expanded across all visible route rows.
   - Folded containers render a summary cell while preserving equivalent colspan/slot occupancy in the view model.
   - Alternative considered: per-row fold state. Rejected because it breaks column alignment and makes row comparison unreliable.

5. **Filtering preserves alignment**
   - Route family, route row, and container scope filters can hide rows or whole container ranges.
   - Unit-property filters such as media availability, diagnostics, generation status, or node kind default to highlight/badge/issue view or result focus instead of hiding individual alignment slots.
   - Alternative considered: hide individual columns matching a filter. Rejected because it makes empty cells and step comparisons unstable.

6. **Empty cell edits anchor to Canvas semantics**
   - Empty cells are view-only in Preview Mode.
   - If Route Edit Mode later supports insertion, the write anchor must resolve to same container, current row's previous playable unit, and current row's next playable unit. It must not persist or rely on `[row, col]`.
   - Alternative considered: store matrix coordinates as insertion points. Rejected because matrix coordinates change when route family, fold, filter, or alignment changes.

7. **Send to Cut uses selected route, not matrix serialization**
   - Matrix row action calls the existing selected-route draft creation path.
   - The system regenerates or validates the current `CanvasPlaybackPlan` before handoff and creates `CanvasCutDraftPayload` from route id/source mapping.
   - Alternative considered: serialize visible cells to Cut. Rejected because hidden rows, folded containers, and empty cells are UI state, not playback truth.

8. **Route Edit Mode is explicit and initially guarded**
   - First implementation can show disabled or confirmation-gated edit affordances but should prioritize preview/navigation/send-to-Cut.
   - Any enabled write goes through Canvas commands/capabilities, undo history, and confirmation policy.
   - Whole-column clearing is not supported because columns are alignment slots, not domain entities.

## Risks / Trade-offs

- [Risk] Matrix projection becomes too complex for initial UI delivery. -> Mitigation: implement a minimal read-only matrix first: row family grouping, container alignment, cells, empty slots, fold state, and cell click; defer edit operations.
- [Risk] Matrix looks like a spreadsheet and invites destructive batch editing. -> Mitigation: default to Preview Mode, make edit mode explicit, and omit whole-column clear.
- [Risk] Large route families create wide/slow DOM. -> Mitigation: constrain initial rendering to active route family, compact cells, horizontal scroll, and optionally virtualize columns later.
- [Risk] Thumbnail resolution leaks runtime URLs into durable state. -> Mitigation: cells use preview-enriched runtime metadata only for rendering; no Webview URI/blob/Engine token is written to `.nkc`.
- [Risk] Container identity differs by adapter. -> Mitigation: one matrix instance uses one adapter projection; mixed adapter rows are rejected or shown as separate view modes.
- [Risk] Send-to-Cut from a stale matrix imports old order. -> Mitigation: route draft creation regenerates or validates the plan revision before import and reports stale diagnostics.

## Migration Plan

1. Add matrix view state to Canvas playback session: preferred route view mode, active route family, filters/highlights, and global folded container ids.
2. Implement pure package-local matrix projector and tests.
3. Add `RouteStoryboardMatrix` UI component and integrate it into `PlaybackWorkspace` route pane.
4. Keep `PlaybackRouteStrip` as compact fallback and ensure both presentations use the same selected route/current unit state.
5. Add cell/row/column interactions for selection, route switch, preview jump, and diagnostics.
6. Add send-to-Cut row action using existing Canvas draft creation/import commands.
7. Update i18n, CSS, tests, and package docs.
8. Run focused tests and VS Code Webview runtime smoke.

Rollback is UI-local: switch the default route pane presentation back to compact route strip. No `.nkc` or `.nkv` migration is required because matrix state is not durable.

## Open Questions

- Should the initial UI expose a manual compact/matrix toggle, or auto-switch based on route pane height with an override later?
- Should thumbnails in matrix cells use the same PreviewSurface registry or a lighter thumbnail-only projection for performance?
- Should first delivery include any Route Edit Mode operation, or only render guarded placeholders and capability tests for future implementation?
