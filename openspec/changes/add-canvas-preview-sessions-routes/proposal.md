## Why

Canvas Preview now needs to play storyboard scenes and shots, media sequences, scripts, text, images, audio, video, and generic Canvas nodes. The current Preview bridge behaves like a singleton panel and the Preview route starts from `entryUnitIds[0]`, which makes multiple Canvas documents, multiple playable chains, and selected-node preview ambiguous.

This change introduces explicit Preview sessions and multi-route playback so each Canvas document can own an isolated Preview panel while each Preview can switch among the playable routes inside that Canvas.

## What Changes

- Add a Canvas Preview session model that isolates Preview webview panels by source Canvas document.
- Add session-aware message routing using `sessionId`, `sourceCanvasUri`, and `revision` to reject stale or cross-session messages.
- Ensure Preview-specific resource projection, local resource roots, pending variant requests, and media playback handles are scoped to the owning Preview session.
- Add route candidate contracts for `CanvasPlaybackPlan` so a single plan can expose multiple playable chains.
- Add a shared effective-route resolver that centralizes compatibility behavior for `routeCandidates` and legacy `entryUnitIds`.
- Add Preview UI behavior for route switching, single-node playback, and branch choice handling without enumerating every possible branch path.
- Add Canvas editor lifecycle handling for visible stale Preview sessions, hidden session disposal, and stale-session expiration.
- Preserve existing lightweight Canvas toolbar traversal as graph inspection; immersive playback controls and route switching belong to the Preview panel.

## Capabilities

### New Capabilities

- `canvas-preview-sessions-routes`: Defines per-Canvas Preview sessions, session-scoped resource/media ownership, multi-route playback candidates, effective route resolution, route switching, and selected-node/single-node preview behavior.

### Modified Capabilities

- `canvas-preview-capabilities`: Clarifies that runtime Preview URLs and media playback ownership remain webview/session-scoped and must not be persisted or reused across Preview sessions.

## Impact

- `packages/neko-types/src/types/canvas-playback.ts`: add route candidate types and shared route resolution helpers.
- `packages/neko-canvas/packages/extension/src/editor/narrativePreviewBridge.ts`: refactor from singleton panel state to per-Canvas Preview sessions.
- `packages/neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts`: pass selected-node context to Preview plan creation, configure resource access per Preview session, and integrate Canvas editor close handling.
- `packages/neko-canvas/packages/extension/src/editor/narrativePreviewBridge.test.ts` and shared type tests: add route resolver, session isolation, stale message, and resource/media cleanup coverage.
- Preview webview HTML/runtime inside `NarrativePreviewBridge`: render route switcher, use effective routes, reset playback on route change, and keep branch choice as runtime state.
- No persisted `.nkc` migration is required; `routeCandidates`, `previewUrl`, active route state, and media handles are runtime-only.
