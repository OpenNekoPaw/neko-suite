## ADDED Requirements

### Requirement: AI Character Preview Modes
The system SHALL provide semantic AI character preview modes for `face`, `full-body`, `motion`, and `voice-pack`. Each mode MUST describe its camera preset, framing target, render/lighting preset, optional overlay set, optional playback requirement, and fallback diagnostics as serializable contract data.

#### Scenario: Face mode evaluates facial detail
- **WHEN** the user selects `face` preview mode for a generated character
- **THEN** the system frames the head and shoulders, applies the face-detail render preset, and enables diagnostics relevant to expressions, eyes, mouth, hairline, and face material detail

#### Scenario: Full-body mode evaluates silhouette
- **WHEN** the user selects `full-body` preview mode for a generated character
- **THEN** the system frames the complete character, applies the full-body render preset, and enables diagnostics relevant to proportions, outfit silhouette, accessories, and stance

#### Scenario: Motion mode evaluates deformation
- **WHEN** the user selects `motion` preview mode for a generated character with compatible demo clips
- **THEN** the system frames the character for motion review, starts the selected or default demo action set, and reports deformation, clipping, skeleton, or skinning diagnostics when available

#### Scenario: Voice-pack mode evaluates audio and mouth fit
- **WHEN** the user selects `voice-pack` preview mode for a generated character with a compatible voice pack
- **THEN** the system coordinates audio playback, viseme or mouth-shape playback, expression/emotion state, and timing diagnostics against the engine preview clock

### Requirement: Preview Mode Selection Is Revision-aware
The system SHALL apply preview mode changes through a revision-aware command containing character id, viewport id, requested mode id, base revision, correlation id, and source metadata. Engine MUST acknowledge, reject, or resync the command before the Webview treats the mode as authoritative.

#### Scenario: Current revision applies mode
- **WHEN** Webview sends a preview mode request with a compatible base revision
- **THEN** Engine applies the mode, emits a preview mode state with the new revision, and subsequent render frame metadata identifies the active preview mode

#### Scenario: Stale revision rejects mode
- **WHEN** Webview sends a preview mode request with a stale base revision that conflicts with the active character or scene
- **THEN** Engine rejects the request with a stale-revision diagnostic and Webview requests or waits for a resync before retrying

### Requirement: Per-mode Camera Overrides
The system SHALL preserve optional user camera overrides per character, viewport, and preview mode. Mode switching MUST use the mode preset unless a compatible override exists, and the user MUST be able to reset the current mode camera back to the engine preset.

#### Scenario: Manual camera adjustment is preserved
- **WHEN** the user adjusts the camera while in `face` mode and later returns to `face` mode for the same character and compatible viewport state
- **THEN** the system restores the compatible face-mode camera override instead of forcing the default face preset

#### Scenario: Camera override can be reset
- **WHEN** the user resets the camera for the active preview mode
- **THEN** Engine clears the compatible override and reapplies the preview mode camera preset

#### Scenario: Incompatible override is ignored
- **WHEN** a saved preview camera override targets an incompatible character, topology, skeleton, or viewport revision
- **THEN** Engine ignores the override, applies the mode preset, and reports a camera-override-reset diagnostic

### Requirement: Preview Mode Diagnostics
The system SHALL expose structured preview diagnostics for missing assets, unsupported bindings, fallback rendering, stale revisions, playback failures, and timing drift. Diagnostics MUST be part of the preview mode state rather than inferred only from Webview-local asset lists.

#### Scenario: Missing motion clip is explicit
- **WHEN** the user selects `motion` mode and no compatible demo clip is available
- **THEN** the system applies motion framing when possible and reports a missing-demo-clip diagnostic without starting playback

#### Scenario: Missing voice pack is explicit
- **WHEN** the user selects `voice-pack` mode and no compatible voice pack is available
- **THEN** the system applies voice preview framing when possible and reports a missing-voice-pack diagnostic without pretending audio preview is active

#### Scenario: Unsupported viseme binding is explicit
- **WHEN** a voice pack is available but the character lacks compatible viseme or mouth-shape bindings
- **THEN** the system reports an unsupported-viseme-binding diagnostic and does not mark lip-sync preview as fully available

### Requirement: Preview Mode UI Scope
The system SHALL expose preview mode selection as a compact AI character authoring control. The control MUST NOT restore the removed generic top horizontal viewport toolbar or duplicate existing orbit, zoom, transform, and navigation controls.

#### Scenario: Selector changes semantic mode
- **WHEN** the user chooses `face`, `full-body`, `motion`, or `voice-pack` from the AI preview selector
- **THEN** Webview dispatches a semantic preview mode request rather than a generic local camera-only action

#### Scenario: Old top toolbar remains absent
- **WHEN** Neko Model renders the engine-stream viewport with AI preview modes enabled
- **THEN** the old horizontal toolbar containing generic viewport controls remains absent unless a separate approved change reintroduces it

### Requirement: Preview Playback Lifecycle
The system SHALL define preview playback states for idle, loading, playing, paused, unavailable, failed, and stopped. Motion and voice-pack modes MUST stop, pause, or hand off playback deterministically when the mode changes, the character changes, the scene revision invalidates playback, or the viewport is disposed.

#### Scenario: Motion playback stops on mode change
- **WHEN** motion preview playback is active and the user switches to `face` mode
- **THEN** Engine stops or hands off the motion demo according to the preview policy and emits a mode state that no longer reports motion playback as active

#### Scenario: Voice playback cleans up on dispose
- **WHEN** the viewport is disposed while voice-pack preview playback is active
- **THEN** Engine releases preview audio resources and emits no further playback events for that disposed viewport

#### Scenario: Playback failure is recoverable
- **WHEN** preview playback fails because a clip, decoder, audio device, or binding becomes unavailable
- **THEN** the mode state reports failed playback with diagnostics and leaves the editor in a usable non-playing preview state
