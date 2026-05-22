## ADDED Requirements

### Requirement: Live Compositor Scene Contract
The system SHALL define live compositor scene contracts for stable layer ids, source references, transforms, opacity, blend mode, visibility, presets, tracking overlay configuration, output routes, diagnostics, revision, and source metadata without depending on React, DOM, VSCode, or renderer implementation types.

#### Scenario: Scene contract is serializable
- **WHEN** a live compositor scene is serialized for Webview, Extension Host, or Engine command payloads
- **THEN** it contains only JSON-serializable DTO fields and stable ids rather than Webview objects, GPU handles, or VSCode URIs

#### Scenario: Layer references are stable
- **WHEN** a command updates, reorders, hides, or removes a compositor layer
- **THEN** the command targets a stable layer id and does not rely on transient array indexes

### Requirement: Live Compositor Stream Descriptor
The engine SHALL start a live compositor monitor stream that returns a `RenderStreamDescriptor` compatible with existing H.264 WebCodecs clients and emits `RenderFrameMeta` with live scene revision, viewport id, applied command sequence, timestamp, and compositor diagnostics.

#### Scenario: Compositor stream starts
- **WHEN** neko-live requests a compositor stream for a valid live scene and viewport id
- **THEN** Engine returns a descriptor whose stream can be consumed through the existing `/v1/streams/:stream_id` path

#### Scenario: Frame metadata aligns with live scene
- **WHEN** Engine emits a compositor frame after applying `scene:live:*` command sequence `70`
- **THEN** the frame metadata includes the live scene revision and applied sequence information that lets Webview clear matching predictions

### Requirement: Live Source Layer Adaptation
The engine SHALL adapt supported live visual sources into generic compositor layers before final composition. Supported source kinds SHALL include at least solid/background media, puppet, scene/model, camera/device preview, and overlay diagnostics, while unsupported sources MUST produce explicit diagnostics.

#### Scenario: Supported source becomes compositor layer
- **WHEN** a live scene contains a supported puppet or scene/model source layer
- **THEN** Engine converts that source into a generic compositable layer with transform, opacity, blend mode, z-order, and visibility applied

#### Scenario: Unsupported source fails explicitly
- **WHEN** a live scene references a source kind that the compositor cannot render
- **THEN** Engine records an unsupported-source diagnostic and excludes or substitutes that layer according to the declared fallback policy

### Requirement: Live Scene Command Routing
The system SHALL route live preset, layer, tracking overlay, and output route mutations through revision-aware `ViewportCommand` envelopes using `domain: "scene"` and `scene:live:*` actions.

#### Scenario: Layer update uses scene command
- **WHEN** the user changes a live layer's transform, opacity, visibility, or routing
- **THEN** `LiveController` sends a `scene:live:*` command with sequence, correlation id, source, payload, and base revision where required

#### Scenario: Stale live command is rejected
- **WHEN** a live scene command carries a stale base revision that conflicts with newer compositor state
- **THEN** Engine rejects the command and leaves authoritative compositor state unchanged

### Requirement: Live Output Route Planning
The system SHALL represent monitor preview, recording, OBS virtual camera, and RTMP output routes as explicit compositor output route descriptors with capability status and diagnostics.

#### Scenario: Unsupported output is explicit
- **WHEN** the user enables an output route that is not implemented or not available on the host
- **THEN** the system returns an unsupported diagnostic and does not silently switch to Webview canvas capture as if it were compositor output

#### Scenario: Monitor output uses compositor stream
- **WHEN** monitor preview is available for a live scene
- **THEN** the preview output uses the engine compositor stream rather than a persistent local R3F visual truth

### Requirement: Live Compositor Latency Diagnostics
The system SHALL expose compositor latency diagnostics for command-to-frame, tracking-to-frame, encode, decode, and presentation timing where data is available.

#### Scenario: Latency sample is recorded
- **WHEN** a live compositor frame is presented after a tracked input or command
- **THEN** diagnostics include enough timing data to evaluate the configured live latency budget

#### Scenario: Latency validation gates fallback removal
- **WHEN** latency diagnostics exceed the accepted budget or are unavailable
- **THEN** local renderer removal remains blocked and the UI keeps fallback/parity limitations visible
