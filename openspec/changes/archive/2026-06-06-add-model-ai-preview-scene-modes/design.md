## Context

Neko Model is moving toward an engine-stream Route A editing surface: the Webview displays engine H.264 frames in `VideoViewport`/`ViewportShell`, while control commands flow through the direct scene-control WebSocket. Recent cleanup removed the generic horizontal viewport toolbar and deprecated HTTP camera update fallbacks, so AI character preview must fit the new control topology instead of restoring old local camera controls.

AI face and character generation also changes the meaning of "view switching". The user is not asking for arbitrary camera presets; they need repeatable evaluation scenes that expose whether the generated character is usable across face detail, full-body proportions, motion deformation, and voice/lip-sync fit.

Five-layer analysis:

- Responsibilities: Webview owns compact mode selection and local pending UI state; `ModelController` owns scene-control command dispatch and prediction reconciliation; shared contracts own serializable DTOs and guards; engine owns authoritative preview mode state, camera/framing presets, playback, audio/viseme synchronization, and diagnostics; Extension Host only brokers startup/resource discovery.
- Dependencies: UI depends on shared DTOs and controller interfaces; controller depends on `@neko/client` scene-control transport; engine DTO mirrors live in Rust engine types; no Webview code imports VSCode/Node APIs and no shared L0 contract imports React/DOM.
- Interfaces: A `CharacterPreviewModeRequest` command sets the requested mode against a character, viewport, and base revision. A `CharacterPreviewModeState` event reports applied mode, effective camera preset, playback status, diagnostics, and revision. `RenderFrameMeta` carries the active preview mode id when the frame reflects a preview scene state.
- Extension: New modes can be registered by adding a mode descriptor and engine preset handler without changing `ViewportShell`. Future modes such as outfit, material, lighting, or AR preview can reuse the same command/state envelope.
- Tests: Contract guards cover mode DTOs; controller tests cover command routing and stale revision behavior; Webview tests cover selector state and no-toolbar regression; engine tests cover preset application, fallback diagnostics, and render metadata alignment.

## Goals / Non-Goals

**Goals:**

- Provide four semantic preview scene modes for AI character authoring: face, full-body, motion, and voice-pack.
- Coordinate camera preset, framing, lighting/render preset, overlays, playback, and diagnostics from one mode selection.
- Keep mode changes on the direct Webview-to-engine scene-control WebSocket path.
- Preserve manual camera overrides per mode and allow reset to the engine preset.
- Degrade gracefully when a character lacks demo clips, voice packs, viseme bindings, compatible skeletons, or audio output.
- Keep the UI compact and scoped to AI character authoring without restoring the removed top horizontal viewport toolbar.

**Non-Goals:**

- Do not replace existing orbit/navigation controls for manual inspection.
- Do not build a full timeline, DAW, or animation editor in this change.
- Do not implement AI generation of voice packs, expressions, or motions; this change previews available or generated assets.
- Do not route preview frames, scene deltas, or high-frequency slider/camera events through Extension Host.
- Do not make `ViewportShell` understand Neko Model-specific preview modes directly.

## Decisions

### Decision 1: Treat preview modes as semantic scene modes, not camera buttons

Each mode applies a named authoring scene preset. `face` frames the head/shoulders and enables face-detail diagnostics. `full-body` frames the complete character and silhouette. `motion` runs a standard demo action set and highlights deformation risks. `voice-pack` coordinates audio playback, visemes, mouth shapes, and emotion/expression fit.

Alternative considered: add camera preset buttons such as front/side/top. Rejected because AI character evaluation requires synchronized playback, overlays, diagnostics, and asset fallback behavior that camera-only presets cannot express.

### Decision 2: Engine owns applied preview state and playback

The Webview sends a preview mode request through scene-control. Engine validates the selected character and current revision, applies the preset, starts/stops demo animation or voice playback when needed, and emits an authoritative state event. The Webview may display a pending selection, but it does not treat local state as applied until ack/state/frame metadata confirms it.

Alternative considered: implement mode switching entirely in Webview by changing local camera state and HTML audio. Rejected because it would split visual truth, bypass engine render metadata, and recreate the control-flow failures seen with local-only UI.

### Decision 3: Preserve per-mode manual camera overrides

Each mode has an engine preset and an optional user camera override. Switching modes uses the override if it is compatible with the current character and viewport revision; users can reset a mode to the preset. Overrides are stored as semantic viewport state, not as arbitrary component-local UI state.

Alternative considered: always reset the camera on every mode switch. Rejected because users often compare generated variants from a hand-picked angle and should not lose that inspection context.

### Decision 4: Keep UI as a focused authoring control

The selector should live in the AI character/preview area or a compact non-obstructive viewport chrome slot. It must not recreate the removed generic top `ViewportToolbar` with zoom/transform buttons. Mode labels can be concise (`Face`, `Body`, `Motion`, `Voice`) and may use icons/tooltips, but the control's meaning is preview workflow selection.

Alternative considered: restore the old top toolbar and append mode buttons. Rejected because it duplicates existing right-side navigation controls and confuses preview workflow with generic viewport manipulation.

### Decision 5: Diagnostics are part of the mode state

Each mode reports structured diagnostics such as `missing-voice-pack`, `missing-demo-clip`, `unsupported-viseme-binding`, `skeleton-incompatible`, `preview-fallback`, and `stale-revision`. The UI uses diagnostics to disable unavailable playback controls or show concise status without guessing from asset lists.

Alternative considered: infer missing capability in each Webview panel. Rejected because it would duplicate capability logic and drift from engine playback/render truth.

### Decision 6: Voice preview uses separate audio stream coordination

`voice-pack` mode uses the existing separate audio stream model when realtime audio is needed. Video frames remain H.264 on the render stream; audio playback state and viseme/emotion timing are coordinated through preview mode state and frame metadata.

Alternative considered: embed audio in the video stream. Rejected because `engine-render-viewport` already defines separate PCM audio streams and video streams must not carry embedded audio payloads.

## Risks / Trade-offs

- [Risk] Mode switching could feel slow if every selection waits for a full engine round trip. -> Mitigation: show a pending mode state immediately, but only mark it applied after ack/state or matching render metadata.
- [Risk] Motion and voice modes depend on assets that may not exist for newly generated characters. -> Mitigation: every mode has a degraded diagnostic state and still applies useful framing/lighting when playback is unavailable.
- [Risk] Camera overrides can become invalid after topology, skeleton, or character swap. -> Mitigation: overrides are keyed by character, mode, viewport, and revision compatibility; incompatible overrides are ignored with a reset diagnostic.
- [Risk] Preview state could become another duplicated toolbar state. -> Mitigation: centralize applied state in engine events and keep Webview state as request/pending/display state only.
- [Risk] Voice preview may introduce clock drift between audio and mouth shapes. -> Mitigation: use engine playback time as the authoritative clock and expose timing metadata for reconciliation.

## Migration Plan

1. Add shared TypeScript DTOs and Rust mirrors for preview mode ids, requests, states, diagnostics, playback descriptors, and guards.
2. Add engine scene-control handling for `characterPreview:setMode`, `characterPreview:resetModeCamera`, and mode state events behind a capability flag if needed.
3. Add `ModelController` methods that dispatch preview mode commands through `SceneControlSocket` and reconcile ack/state/frame metadata.
4. Add the compact AI preview mode selector to the character authoring UI without restoring the old top horizontal viewport toolbar.
5. Implement engine presets for face and full-body framing first; add motion demo playback and voice pack preview with graceful diagnostics.
6. Add focused Webview, shared-contract, and Rust engine tests, then update Chinese architecture/user documentation.

Rollback strategy: keep the selector hidden unless engine reports preview-mode capability. Existing manual navigation and character editing continue to work without preview modes, and protocol additions are versioned/additive.

## Open Questions

- Should preview camera overrides persist in `.nkc` authoring metadata, project UI state, or session-only viewport state for the first release?
- Which default demo clips should ship with Neko Model for motion mode: idle/turn/wave/walk, or a smaller initial set?
- Should voice-pack mode preview one selected voice line, a generated calibration phrase, or a fixed viseme coverage phrase by default?
