# engine-render-viewport Specification

## Purpose
TBD - created by archiving change implement-3d-editor-wysiwyg-rendering. Update Purpose after archive.
## Requirements
### Requirement: Engine stream uses ViewportDescriptor
The system SHALL implement `scenes:stream` so callers provide a `ViewportDescriptor` and receive a `RenderStreamDescriptor`. The descriptor MUST include `streamId`, `viewportId`, container, codec string, frame header, dimensions, fps, color space, bit depth, tone mapping, and initial scene revision.

#### Scenario: Single viewport stream starts
- **WHEN** Webview requests `scenes:stream` with one perspective `ViewportDescriptor`
- **THEN** Engine returns a `RenderStreamDescriptor` whose `viewportId` matches the requested viewport and whose stream can be opened through the video stream endpoint

#### Scenario: Multiple viewports are independently routed
- **WHEN** Webview requests streams for two different viewport ids in the same scene
- **THEN** Engine creates independent stream descriptors and each render frame metadata event carries the matching `viewportId`

### Requirement: Realtime 3D video uses raw H.264 WebCodecs only
The system SHALL use raw H.264 access units over WebSocket for the VSCode Webview realtime 3D viewport. The Webview MUST use `H264StreamClient` with WebCodecs and MUST initialize decoding from `RenderStreamDescriptor.codecString`, `container`, `frameHeader`, and optional `initData`. The realtime 3D viewport MUST NOT use fMP4, MSE, `FMP4StreamClient`, or hardcoded `avc1.*` codec defaults.

#### Scenario: Decoder is descriptor-driven
- **WHEN** `RenderStreamDescriptor.codecString` is `avc1.640028`
- **THEN** Webview configures WebCodecs with that codec string without changing client source code

#### Scenario: fMP4 descriptor is rejected for realtime 3D
- **WHEN** a 3D realtime viewport descriptor declares an fMP4 container or `frameHeader='neko-fmp4-v1'`
- **THEN** Webview rejects the stream as unsupported for 3D realtime viewport playback

### Requirement: Realtime audio uses a separate PCM stream
The system SHALL represent optional realtime audio through `AudioStreamDescriptor` and a separate audio WebSocket path. Audio MUST use `codec: 'pcm-f32le'`, `frameHeader: 'neko-pcm-v1'`, sample rate, channels, and optional master-clock metadata. Video streams MUST NOT contain embedded audio payloads.

#### Scenario: Audio stream uses separate URL
- **WHEN** `RenderStreamDescriptor.audioStream` is present
- **THEN** Webview opens the audio stream through the audio URL helper and keeps video on `/v1/streams/:stream_id`

#### Scenario: Non-PCM audio is rejected
- **WHEN** an audio descriptor declares `codec: 'aac'` or `codec: 'opus'`
- **THEN** `AudioStreamClient` rejects the descriptor instead of silently falling back

### Requirement: RenderFrameMeta aligns video and scene state
The system SHALL emit `RenderFrameMeta` for rendered frames with `streamId`, `viewportId`, `frameId`, `ptsUs`, `durationUs`, `isKeyframe`, `sceneRevision`, and `appliedSeq`. Webview overlay and pending prediction reconciliation MUST use these fields to align visual frames with scene state.

#### Scenario: Prediction clears after matching frame
- **WHEN** Webview has a pending transform prediction for command `seq=50`
- **THEN** Webview clears the prediction only after receiving an ack or render frame metadata whose `appliedSeq` includes `50`

#### Scenario: Overlay uses frame revision
- **WHEN** Webview draws selection bounds over an Engine video frame
- **THEN** it uses overlay data compatible with that frame's `viewportId` and `sceneRevision`

### Requirement: VideoViewport is the visual truth surface
The system SHALL render the Engine stream into a Webview `VideoViewport` presentation surface backed by canvas or `VideoFrame`. R3F/Three.js MAY remain as interaction aid, local prediction, or development fallback, but MUST NOT be treated as the visual truth for Route A.

#### Scenario: Route A displays Engine frame
- **WHEN** a valid Engine render stream is connected
- **THEN** the visible 3D model image comes from decoded Engine frames rather than an R3F PBR scene

#### Scenario: R3F fallback is not authoritative
- **WHEN** WebCodecs is unavailable and Webview falls back to a development preview
- **THEN** the UI marks Engine realtime viewport unavailable and does not use the fallback preview for export or WYSIWYG validation

### Requirement: Capture preview is a full-surface switch
The system SHALL make `scenes:capture` return a displayable Engine quality frame for Route C. Webview MUST present the capture as a full viewport replacement or explicit quality preview surface and MUST NOT blend it over the R3F canvas.

#### Scenario: Quality preview replaces the viewport surface
- **WHEN** the user triggers Engine quality preview before continuous streaming is available
- **THEN** Webview switches the viewport surface to the captured Engine frame instead of layering the frame over R3F output

### Requirement: Hit-test and overlay queries are viewport-scoped
The system SHALL route hit-test, projected bounds, gizmo anchor, active camera, and overlay queries by `viewportId`. Query results MUST include the revision they were computed against.

#### Scenario: Picking uses the correct viewport
- **WHEN** the user clicks in the secondary orthographic viewport
- **THEN** Engine performs hit-test using that viewport's camera and returns a result tagged with the queried viewport and revision

### Requirement: Render Frame Metadata Exposes Latency And Staleness
The engine and client SHALL expose enough render frame metadata timing and revision information for Webviews to detect stale, missing, or delayed metadata separately from control-command failure.

#### Scenario: Client detects stale frame metadata
- **WHEN** a viewport receives frame metadata whose viewport id, scene revision, or applied sequence is older than the active controller state
- **THEN** the client marks overlay alignment metadata stale and does not draw dependent overlays as authoritative

#### Scenario: Client distinguishes metadata delay from command failure
- **WHEN** scene-control returns an acknowledgement but the next render frame metadata is delayed by video backpressure
- **THEN** diagnostics identify frame metadata delay rather than reporting the semantic command as failed

### Requirement: Frame Metadata Supports Scene-control Migration
The render viewport metadata contract SHALL support mirroring revision, view transform, frame timestamp, viewport id, and applied sequence through scene-control metadata events without changing the semantic command authority model.

#### Scenario: Metadata event mirrors sideband fields
- **WHEN** the engine emits a scene-control metadata event for a viewport
- **THEN** the event contains the same viewport identity, revision, timestamp, view transform, and applied sequence fields needed for overlay reconciliation

#### Scenario: Sideband remains compatible
- **WHEN** frame metadata still arrives through the video stream sideband
- **THEN** existing H.264 frame decoding and overlay alignment continue to work without requiring a separate metadata connection

### Requirement: Render Metadata Backpressure Metrics Are Testable
The system SHALL provide testable hooks or diagnostics for metadata delay, dropped metadata, stale revision, and ack-before-frame conditions.

#### Scenario: Ack-before-frame is observable
- **WHEN** a command acknowledgement is received before any compatible frame metadata
- **THEN** the Webview can observe an ack-before-frame state and keep prediction handling separate from video presentation

#### Scenario: Metadata budget breach is observable
- **WHEN** metadata delay exceeds the configured interaction budget
- **THEN** the Webview or diagnostic layer can surface a metadata-budget breach suitable for QA and PR review

### Requirement: Render Frame Metadata Includes Preview Mode Alignment
The system SHALL include active AI character preview mode alignment in render frame metadata when a frame reflects a preview scene state. Metadata MUST identify the preview mode id, viewport id, scene revision, applied command sequence, and playback clock data when available.

#### Scenario: Frame reflects applied preview mode
- **WHEN** Engine renders a frame after applying `voice-pack` preview mode command sequence `120`
- **THEN** the frame metadata includes the viewport id, scene revision, applied sequence containing `120`, active preview mode `voice-pack`, and available playback clock data

#### Scenario: Overlay rejects stale preview frame
- **WHEN** Webview receives overlay or preview diagnostics for a different viewport, revision, or preview mode than the presented frame
- **THEN** Webview treats the overlay data as stale and does not draw it as current preview truth

### Requirement: Preview Mode Audio Stays On Separate Audio Stream
The system SHALL keep voice-pack preview video and audio transport separate. Realtime viewport video MUST remain on the render stream, while preview audio uses an audio stream descriptor or explicit unavailable diagnostic.

#### Scenario: Voice preview provides audio descriptor
- **WHEN** voice-pack preview starts and realtime audio is available
- **THEN** Engine provides or references a PCM audio stream descriptor associated with the preview session while keeping H.264 video frames on the render stream

#### Scenario: Audio unavailable is diagnostic
- **WHEN** voice-pack preview starts but no compatible audio stream can be created
- **THEN** Engine reports an audio-unavailable diagnostic and does not embed audio payloads into the H.264 video stream

### Requirement: Preview Mode Camera Presets Are Engine-applied
The engine SHALL apply preview mode camera and framing presets before rendering authoritative preview frames. Camera preset application MUST be revision-aware and MUST emit enough frame metadata for Webview overlays and pending state reconciliation.

#### Scenario: Face preset affects next authoritative frame
- **WHEN** Engine applies `face` preview mode for a viewport
- **THEN** the next authoritative frame for that viewport is rendered with the face preview camera/framing state and metadata that identifies the applied preview mode revision

#### Scenario: Camera reset applies preset
- **WHEN** Engine handles a reset camera override command for the active preview mode
- **THEN** it clears the compatible override, reapplies the mode preset, and emits render metadata aligned with the reset command sequence

### Requirement: Viewport Protocol Engine DTOs
The engine SHALL define Rust DTOs corresponding to `ViewportCommand`, `ViewportEvent`, and frame metadata contracts and align them with ActionRouter envelopes.

#### Scenario: Engine deserializes viewport command
- **WHEN** the engine receives a supported viewport command envelope
- **THEN** it deserializes protocol fields, validates `protocolVersion`, routes by domain/action, and preserves `seq` for acknowledgement

#### Scenario: Engine rejects incompatible protocol version
- **WHEN** the engine receives a viewport command with an unsupported protocol version
- **THEN** it returns or logs a compatibility error without mutating scene state

### Requirement: Viewport Controller Routing
The engine SHALL register a shared `viewport_controller` in ActionRouter for engine-mediated viewport commands.

#### Scenario: Select routes through viewport controller
- **WHEN** Webview sends `viewport:select` with viewport id and scene id
- **THEN** ActionRouter routes it to the viewport controller and returns hit-test or selection acknowledgement data

#### Scenario: Transform routes through viewport controller
- **WHEN** Webview sends `viewport:transform` with current base revision
- **THEN** the viewport controller applies or rejects the transform using authoritative engine scene state

### Requirement: Viewport Frame Metadata
Engine-rendered viewport frames SHALL carry metadata that aligns video frames with viewport id, scene revision, applied command sequence, timestamp, and overlay transform data.

#### Scenario: Frame metadata includes transform
- **WHEN** Engine emits a viewport frame
- **THEN** metadata includes a viewport identity, scene revision, frame timestamp, applied command sequence information, and a view transform or projection data usable for overlays

#### Scenario: Prediction clears on matching frame
- **WHEN** a frame metadata event indicates that command sequence `50` was applied
- **THEN** Webview prediction for that command can be cleared even if a separate acknowledgement arrived earlier or later

### Requirement: Multi-Viewport Isolation
Viewport protocol handling SHALL preserve scene id and viewport id isolation across multiple viewports.

#### Scenario: Secondary viewport selection is scoped
- **WHEN** a user selects an object in a secondary viewport
- **THEN** hit-test and selection results are tagged with that viewport id and do not apply to a different viewport unless explicitly synchronized
