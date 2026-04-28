## ADDED Requirements

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
