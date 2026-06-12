## 1. Shared Route Contracts

- [x] 1.1 Add `CanvasPlaybackRouteSourceKind`, `CanvasPlaybackRouteCandidate`, and `CanvasPlaybackRouteResolution` types to the shared Canvas playback contract.
- [x] 1.2 Extend `CanvasPlaybackPlan` with optional runtime-only `routeCandidates` without changing persisted Canvas data requirements.
- [x] 1.3 Implement `resolveEffectiveCanvasPlaybackRoutes(plan)` with routeCandidates-first, empty-route diagnostic, and legacy `entryUnitIds[0]` compatibility behavior.
- [x] 1.4 Implement deterministic route validation and sorting helpers for route candidates.
- [x] 1.5 Add shared tests for effective route resolution, legacy fallback, empty-route diagnostics, and stable route ordering.

## 2. Route Candidate Projection

- [x] 2.1 Extend playback plan creation to generate selection, explicit entry, container, scene, connected component, and single-unit route candidates.
- [x] 2.2 Add selected-node context to Preview plan creation so opening Preview from a selected node can prioritize a selection route.
- [x] 2.3 Add route candidate cap handling with a default cap of 50 and truncation diagnostics.
- [x] 2.4 Add tests for multiple entries, disconnected playable components, selected-node-first ordering, single-node routes, and cap truncation.
- [x] 2.5 Add regression tests proving route candidates, active route id, branch selections, runtime URLs, and media handles are not persisted into saved Canvas data.

## 3. Preview Route UI

- [x] 3.1 Update the Preview runtime to consume `resolveEffectiveCanvasPlaybackRoutes(plan)` instead of directly starting from `entryUnitIds[0]`.
- [x] 3.2 Add Preview playback state for `activeRouteId`, active route unit ids, elapsed time reset, active media surface reset, and branch selections.
- [x] 3.3 Render a conditional route switcher when more than one effective route exists and hide it for zero or one route.
- [x] 3.4 Implement route switching so it resets active unit, elapsed time, active media surface, and branch selections without mutating Canvas data.
- [x] 3.5 Keep branch choices as runtime route state and ensure branch selection appends or rewrites active route history from the current unit.
- [x] 3.6 Add webview tests for route switcher visibility, route switching reset behavior, single-node controls, and branch choice history updates.

## 4. Preview Session Manager

- [x] 4.1 Refactor `NarrativePreviewBridge` from singleton `panel/sourceCanvasUri/ready/pendingMessages` fields into per-Canvas Preview sessions.
- [x] 4.2 Add session lookup by source Canvas URI and panel, with same-Canvas reveal/refresh and different-Canvas distinct sessions.
- [x] 4.3 Add session manager revision acceptance with lower-revision rejection, equal-revision idempotency, and higher-revision immutable session update.
- [x] 4.4 Add session-aware message envelopes and reject mismatched `sessionId`, mismatched `sourceCanvasUri`, and stale revisions.
- [x] 4.5 Add bridge tests for same-Canvas reuse, two-Canvas isolation, stale message rejection, wrong-session rejection, and equal-revision idempotency.

## 5. Session-Scoped Resources And Media

- [x] 5.1 Generate Preview-specific playback plans per session webview and avoid sharing projected `previewUrl` values between sessions.
- [x] 5.2 Reconfigure Preview webview resource access for the session source Canvas before each reveal/refresh plan generation.
- [x] 5.3 Scope pending variant requests to the owning Preview session and drop requests that target stale or mismatched sessions.
- [x] 5.4 Scope media playback handles to the owning Preview session panel and dispose only that session's handles on session close.
- [x] 5.5 Add extension tests for per-session resource roots, per-session projected URLs, variant request isolation, and media handle cleanup.

## 6. Canvas Editor Lifecycle

- [x] 6.1 Detect owning Canvas editor close events and notify the Preview session manager.
- [x] 6.2 Mark visible Preview sessions stale and render non-blocking stale state in Preview chrome.
- [x] 6.3 Dispose hidden Preview sessions immediately when their owning Canvas editor closes.
- [x] 6.4 Add stale session expiration with an injectable clock and default grace period.
- [x] 6.5 Add tests for visible stale state, hidden session disposal, stale expiration, and resource/media release after expiration.

## 7. Integration And Quality

- [x] 7.1 Update Preview status/i18n strings for route switcher labels, no-route diagnostics, truncation diagnostics, and stale-session state.
- [x] 7.2 Verify Story Preview or other consumers compile against the shared route resolver and do not reimplement route fallback logic.
- [x] 7.3 Run focused tests for shared playback contracts and Canvas extension Preview bridge.
- [x] 7.4 Run the Canvas extension build and copy-extension flow used by local VSCode extension validation.
- [x] 7.5 Use the VSCode extension debugger to validate two Canvas documents with two Preview sessions, route switching, single-node Preview, image display, and media playback behavior.
- [x] 7.6 Run the Neko quality review checklist and document residual risks before marking the change complete.
