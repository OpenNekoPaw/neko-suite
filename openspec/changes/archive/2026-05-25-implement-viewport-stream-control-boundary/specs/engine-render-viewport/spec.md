## ADDED Requirements

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
