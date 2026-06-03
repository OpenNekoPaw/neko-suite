## ADDED Requirements

### Requirement: Model Viewport Reports Effective Resolution And Fallback
The Engine render viewport contract SHALL report the effective resolution and frame target for Neko Model realtime viewport streams. The default target SHALL be 1080p/60fps for baseline editing, and any fallback to 720p, lower DPR, lower bitrate, lower frame target, non-zero-copy encode, or lower-quality render path MUST be represented in descriptor data, diagnostics, or equivalent Webview-consumable metadata.

#### Scenario: Effective resolution matches target
- **WHEN** Webview starts a Neko Model baseline viewport stream and Engine can provide 1080p/60fps
- **THEN** the RenderStreamDescriptor reports effective dimensions and fps matching the target

#### Scenario: Effective resolution falls back
- **WHEN** Engine, codec, device, or host constraints require a 720p stream or lower frame target
- **THEN** Engine reports the effective dimensions or fps and provides a fallback diagnostic that Webview can surface

### Requirement: Model Viewport Supports Runtime Interaction Stream Profile
The Engine render viewport contract SHALL preserve the active stream and encoder contract during high-frequency model editing. Interactive camera/drag updates MUST NOT require a new stream descriptor, WebSocket reconnect, decoder reset, or automatic GOP/bitrate reconfigure. Frontend latest-only/backpressure policy MAY change on the existing client; Engine stream profile fields are compatibility inputs only unless explicitly enabled outside the hot path.

#### Scenario: Interactive update applies without stream restart
- **WHEN** scene-control receives a latest-only hot camera or drag update
- **THEN** Engine applies the latest viewport state to the active stream when supported
- **THEN** Engine does not require Webview to destroy and recreate the stream descriptor
- **THEN** Engine does not require Webview to open a second model video stream for the same viewport

#### Scenario: Interaction idle restores frontend policy
- **WHEN** the interaction idle timer expires
- **THEN** Webview returns the existing H.264 client to the default backpressure policy without invalidating the current stream connection

#### Scenario: GOP does not change on the hot path
- **WHEN** camera orbit, viewport drag, transform drag, light drag, or continuous slider interaction starts or ends
- **THEN** Engine does not automatically switch to `GOP=1` or back to default GOP
- **THEN** the change does not cause `startSceneRenderStream()`, descriptor allocation, WebSocket reconnect, or decoder reset on the Webview hot path

### Requirement: Model Viewport Supports Live Viewport Settings
The Engine render viewport contract SHALL support live render-only viewport settings for LookDev and helper controls without changing the stream descriptor or encoder contract. At minimum, live settings SHALL support `renderMode`, `helperPassesEnabled`, and `showGrid`.

#### Scenario: LookDev mode changes without stream restart
- **WHEN** Webview sends a `viewport-settings-update` command for the active viewport
- **THEN** Engine stores the live viewport setting outside persistent scene state
- **THEN** subsequent frames use the updated render mode or helper pass state
- **THEN** Engine does not reallocate the stream descriptor, reconnect the WebSocket, or reconfigure the H.264 encoder

#### Scenario: Effective mode appears in metadata
- **WHEN** Engine renders a frame after applying live viewport settings
- **THEN** frame metadata or diagnostics identifies the effective render mode and helper pass state

### Requirement: Model Viewport Preserves GPU Performance Baseline
The Engine render viewport contract SHALL preserve the restored GPU render and encode path for baseline model editing. Interactive controls and scene-control diagnostics MUST NOT require hot-path CPU readback, GPU-to-CPU-to-Webview frame transfer, zero-copy disablement, hardware encoder disablement, or extra synchronous render/encode waits as the default path.

#### Scenario: GPU and encode path remain stable
- **WHEN** Webview enables baseline editing controls for a supported viewport
- **THEN** Engine keeps the same GPU render path, zero-copy path, hardware encoder path, coded dimensions, DPR, and target fps unless a host/device fallback is explicitly reported

#### Scenario: No CPU readback fallback is introduced
- **WHEN** high-frequency camera or drag updates are applied
- **THEN** Engine does not require per-frame CPU readback or Webview frame transfer to keep the visible viewport responsive

### Requirement: Model Viewport Preserves Render Quality Baseline
The Engine render viewport contract SHALL preserve baseline render quality for model editing. Engine MUST NOT silently disable or lower PBR material fidelity, Clay lighting, normals/tangents, sRGB or tone mapping, shadows, AO, antialiasing, texture sampling, material precision, helper pass composition, environment/background rendering, or 1080p edge clarity to satisfy a control-flow change.

#### Scenario: Quality metadata remains explicit
- **WHEN** Engine applies a render mode or LookDev setting
- **THEN** descriptor, frame metadata, or diagnostics identify the effective mode or fallback
- **THEN** Webview can distinguish an intentional quality fallback from the default quality baseline

#### Scenario: Quality fallback is not silent
- **WHEN** Engine cannot provide the baseline quality because of device or renderer constraints
- **THEN** Engine reports a structured diagnostic that Webview can surface

### Requirement: Baseline LookDev Modes Are Reflected In Render Output
The Engine render viewport SHALL expose enough capability and effective-mode metadata for Webview to know whether baseline PBR, Clay, Wireframe, Normal, and Depth modes are supported and applied. Unsupported mode requests MUST fail with structured diagnostics rather than silently falling back to PBR.

#### Scenario: Wireframe is applied
- **WHEN** Webview requests Wireframe mode for a supported model viewport
- **THEN** Engine returns descriptor or frame metadata that identifies Wireframe as the effective mode
- **THEN** Webview can mark the mode applied only after that confirmation

#### Scenario: Unsupported mode is diagnostic
- **WHEN** Webview requests a mode unsupported by the current Engine or renderer
- **THEN** Engine rejects or downgrades with a structured unsupported-mode diagnostic
- **THEN** Webview keeps the last confirmed mode visible in UI state

### Requirement: Model Viewport Provides Baseline Hit-test Or Explicit Unavailability
The Engine render viewport SHALL provide node-level or target-level hit-test/query support for ordinary model editing when available. If hit-test cannot be performed for the current viewport, asset, or renderer, Engine MUST return an explicit diagnostic so Webview can fall back to Outliner selection.

#### Scenario: Node hit-test succeeds
- **WHEN** the user clicks a visible ordinary mesh in the Engine-stream viewport and node hit-test is supported
- **THEN** Engine returns a selection result tagged with viewport id, scene revision, target node id, and ordering or depth data

#### Scenario: Hit-test unavailable is explicit
- **WHEN** the Engine cannot perform hit-test for the current viewport or asset
- **THEN** the query returns an explicit unavailable diagnostic rather than an empty success response that looks like no object was clicked

### Requirement: Render Metadata Supports Baseline Edit Reconciliation
Render frame metadata for Neko Model baseline editing SHALL include enough viewport identity, scene revision, timing, and applied sequence information for Webview to reconcile pending Transform, LookDev, light, and background edits separately from video decode or metadata delay.

#### Scenario: Ack arrives before compatible frame
- **WHEN** a Transform or light command acknowledgement arrives before a compatible rendered frame
- **THEN** metadata or diagnostics allow Webview to keep the pending visual state separate from command failure

#### Scenario: Frame reflects baseline edit
- **WHEN** Engine renders a frame after applying a baseline scene command
- **THEN** metadata identifies the compatible viewport, scene revision, and applied sequence so Webview can clear pending overlays or controls
