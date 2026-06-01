## ADDED Requirements

### Requirement: Model Viewport Reports Effective Resolution And Fallback
The Engine render viewport contract SHALL report the effective resolution and frame target for Neko Model realtime viewport streams. The default target SHALL be 1080p/60fps for baseline editing, and any fallback to 720p or lower frame rate MUST be represented in descriptor data, diagnostics, or equivalent Webview-consumable metadata.

#### Scenario: Effective resolution matches target
- **WHEN** Webview starts a Neko Model baseline viewport stream and Engine can provide 1080p/60fps
- **THEN** the RenderStreamDescriptor reports effective dimensions and fps matching the target

#### Scenario: Effective resolution falls back
- **WHEN** Engine, codec, device, or host constraints require a 720p stream or lower frame target
- **THEN** Engine reports the effective dimensions or fps and provides a fallback diagnostic that Webview can surface

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
