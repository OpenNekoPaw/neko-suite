## ADDED Requirements

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
