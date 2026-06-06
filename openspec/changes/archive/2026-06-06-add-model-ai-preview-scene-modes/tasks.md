## 1. Shared Contracts

- [x] 1.1 Add L0 TypeScript DTOs for `CharacterPreviewModeId`, preview mode descriptors, mode requests, mode state, diagnostics, playback state, camera override state, and runtime guards.
- [x] 1.2 Add Rust engine-types mirrors and serde fixtures for the preview mode contracts.
- [x] 1.3 Add scene-control payload guards for `characterPreview:setMode`, `characterPreview:resetModeCamera`, and preview playback commands/events.
- [x] 1.4 Add contract tests that round-trip TypeScript and Rust fixtures for all four modes and degraded diagnostic states.

## 2. Engine Preview Orchestration

- [x] 2.1 Add an engine preview scene controller/service that validates character id, viewport id, base revision, mode id, and capability availability.
- [x] 2.2 Implement face and full-body camera/framing/render presets with revision-aware state emission.
- [x] 2.3 Implement per-mode camera override storage, compatibility checks, and reset-to-preset handling.
- [x] 2.4 Implement motion mode demo clip selection, playback lifecycle, and missing/unsupported diagnostics.
- [x] 2.5 Implement voice-pack mode audio stream coordination, viseme/expression timing, playback lifecycle, and missing/unsupported diagnostics.
- [x] 2.6 Emit preview mode state events and render frame metadata containing active mode, applied sequence, revision, and playback clock data where available.

## 3. Client And Controller Integration

- [x] 3.1 Extend `SceneControlSocket`/`EngineClient` helpers with typed preview mode request, reset, playback, state event, and diagnostic readers without unsafe casts.
- [x] 3.2 Add `ModelController` preview mode methods that dispatch through the direct scene-control WebSocket and reconcile pending/applied/rejected state.
- [x] 3.3 Add Zustand or controller-owned Webview state for requested, pending, applied, unavailable, and diagnostic preview mode UI state.
- [x] 3.4 Ensure preview commands bypass Extension Host and remove or avoid HTTP camera fallback paths for this workflow.

## 4. Neko Model UI

- [x] 4.1 Add a compact AI preview mode selector for face, full-body, motion, and voice-pack in the character authoring/preview surface.
- [x] 4.2 Connect selector actions to `ModelController` and show pending, applied, unavailable, failed, and diagnostic states.
- [x] 4.3 Add reset-current-mode-camera behavior without duplicating existing orbit/navigation controls.
- [x] 4.4 Add motion and voice playback affordances only when engine state reports compatible assets and playback capability.
- [x] 4.5 Verify the removed generic top horizontal viewport toolbar remains absent from Neko Model.

## 5. Validation And Documentation

- [x] 5.1 Add Webview unit tests for selector rendering, mode dispatch, pending rollback, diagnostics, and no-top-toolbar regression.
- [x] 5.2 Add client/controller tests for scene-control command routing, stale revision rejection, and state reconciliation.
- [x] 5.3 Add Rust tests for preview preset application, camera override compatibility, motion fallback diagnostics, voice fallback diagnostics, and frame metadata alignment.
- [x] 5.4 Run focused validation: shared contract tests, Neko Model Webview tests/build, and relevant engine tests.
- [x] 5.5 Update Chinese documentation for AI character preview modes and note that the feature is a preview/evaluation workflow rather than a generic camera toolbar.
