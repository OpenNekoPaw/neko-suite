## 1. Shared Contracts

- [x] 1.1 Add `CanvasCutDraftPayload` and unit/source mapping types with schema/version fields, route id, source canvas URI, source revision/hash, ordered units, media refs, cues, diagnostics, and namespaced extensions.
- [x] 1.2 Add validators/type guards for `CanvasCutDraftPayload`, including invalid version, stale source revision, illegal extension namespace, unmanaged path/runtime handle, and forbidden timeline semantics in extension metadata.
- [x] 1.3 Add route-to-draft projection helpers from `CanvasPlaybackPlan` with selected route handling, missing route diagnostics, cue provenance, and durable media reference projection.
- [x] 1.4 Add focused shared tests for draft validation, stale plan rejection, extension namespace validation, cue conflict diagnostics, and source node/scene/shot mapping.

## 2. Canvas Playback Workspace

- [x] 2.1 Introduce Canvas Webview `PlaybackSession` state for visible panes, route id, current unit, playhead, playback status, focus owner, and stale state without writing private order to `.nkc`.
- [x] 2.2 Implement `PlaybackWorkspace` shell inside `CanvasApp` with hideable `CanvasViewportPane`, `PlaybackStage`, and `PlaybackRouteStrip`.
- [x] 2.3 Move or adapt reusable rendering logic from the existing separate preview runtime into same-Webview `PlaybackStage` without retaining the separate preview Webview as the canonical path.
- [x] 2.4 Implement `PlaybackRouteStrip` rendering from `CanvasPlaybackPlan.routeCandidates` and selected route units, including current segment, diagnostics, missing media, branch markers, and click-to-jump.
- [x] 2.5 Wire Canvas toolbar and command actions to reveal/focus `PlaybackWorkspace` inside the active `neko.canvasEditor` Webview.
- [x] 2.6 Add keyboard/focus handling so editing shortcuts and playback shortcuts do not conflict across Canvas pane and `PlaybackWorkspace`.
- [x] 2.7 Add media lifecycle handling so hiding `PlaybackWorkspace`, Webview blur, stale session, route change, or dispose pauses, releases, or downgrades media resources.
- [x] 2.8 Add Canvas Webview tests for reveal/focus, pane visibility, route rendering, click-to-jump, session state, no private order writes, shortcut suppression/passthrough, and media lifecycle cleanup.

## 3. Canvas Extension and Legacy Path Migration

- [x] 3.1 Replace the default `openNarrativePreview`/separate preview reveal path with a `playback:revealWorkspace` or equivalent same-Webview message to the active Canvas editor.
- [x] 3.2 Keep any legacy preview command only as a fail-visible migration shim or remove it after all callers migrate; add tests proving the canonical reveal path does not succeed through the legacy separate preview bridge.
- [x] 3.3 Update Canvas extension message handling for plan projection, preview enrichment, media source resolution, variant resolution, and stale revision diagnostics in the same-Webview path.
- [x] 3.4 Add Canvas extension tests for active editor lookup, same-Webview reveal, plan refresh, stale plan rejection, resource authorization, and legacy path poisoning.

## 4. Cut Draft Import

- [x] 4.1 Add or extend Cut extension command/API for `cut.importCanvasDraft` while preserving existing storyboard import behavior until callers are migrated.
- [x] 4.2 Implement Cut-side adapter from `CanvasCutDraftPayload` to editable `.nkv` timeline draft elements with source canvas/route/node/scene/shot mapping metadata.
- [x] 4.3 Ensure Cut import rejects invalid draft version, stale source diagnostics, missing media policy violations, invalid extension namespace, and forbidden full-timeline backflow fields.
- [x] 4.4 Emit minimal `CanvasTimelineSyncPayload` after import with project name, importedAt, duration/thumbnail when available, selectedInTimeline, and source shot/node mapping.
- [x] 4.5 Add Cut extension/Webview tests for draft import, source mapping, timeline ownership after import, and minimal sync payload shape.

## 5. Agent Capability and UI Projection

- [x] 5.1 Register Agent-readable Canvas capabilities for `canvas.getPlaybackPlan`, `canvas.getPlaybackRoutes`, `canvas.revealPlaybackWorkspace`, `canvas.createCutDraftFromRoute`, and `canvas.reorderPlaybackUnits`.
- [x] 5.2 Register Cut capabilities for `cut.importCanvasDraft`, `cut.revealTimeline`, and `cut.getTimelineInfo` with read-only vs confirmation-gated safety metadata.
- [x] 5.3 Add Agent message/card projection for route summary, diagnostics, ordered unit list, thumbnails/posters when available, and actions for reveal Canvas workspace, send to Cut, and view full order.
- [x] 5.4 Enforce approval policy: read-only route queries and reveal actions do not require confirmation; Agent-inferred reorder and Cut import require confirmation; specific same-turn user reorder instructions can follow auto-approve policy.
- [x] 5.5 Add Agent capability tests for route display, reveal dispatch, no Agent-owned playhead/player state, reorder confirmation, explicit-instruction auto-approve, and Cut import confirmation.

## 6. Documentation and Cleanup

- [x] 6.1 Update Canvas package docs and architecture references after implementation to match the final same-Webview runtime and remove stale separate Preview Panel wording.
- [x] 6.2 Update command names, i18n labels, and tests from "open narrative preview" to "reveal playback workspace" where the behavior changed.
- [x] 6.3 Remove obsolete separate Canvas preview Webview code paths when their behavior has moved into `PlaybackWorkspace`, or leave only documented fail-visible shims with owner and removal condition.
- [x] 6.4 Add or update boundary/legacy-debt checks so new code cannot reintroduce Canvas preview as a second Webview success path.

## 7. Validation

- [x] 7.1 Run focused shared contract tests for `CanvasPlaybackPlan`, `CanvasCutDraftPayload`, `CanvasTimelineSyncPayload`, and route-to-draft projection.
- [x] 7.2 Run focused Canvas Webview and extension tests for `PlaybackWorkspace`, route strip, keyboard/focus, resource lifecycle, same-Webview reveal, and legacy path poisoning.
- [x] 7.3 Run focused Cut tests for `cut.importCanvasDraft`, imported timeline source mapping, and minimal sync.
- [x] 7.4 Run focused Agent capability/provider tests for route cards, reveal dispatch, approval gates, and no Agent-owned playback runtime.
- [x] 7.5 Run Webview boundary checks proving Canvas Webview still does not import VS Code/Node APIs and Cut/Canvas Webviews do not import each other's internals.
- [x] 7.6 Run `pnpm build:neko-canvas`, `pnpm build:neko-cut`, and the smallest reliable package test/check commands covering changed packages.
- [ ] 7.7 Run VS Code Extension Development Host / `vscode-extension-debugger` smoke for opening a `.nkc`, revealing `PlaybackWorkspace`, switching focus between edit/playback, playing/jumping route units, hiding workspace, releasing media, sending route to Cut, and opening the generated Cut draft.
- [x] 7.8 Run `openspec validate introduce-canvas-playback-workspace` and record any residual validation gaps.
