## ADDED Requirements

### Requirement: Engine-owned viewport truth
The system SHALL define professional media and scene rendering output as Engine-owned viewport session state rather than Electron WebContents, HTML video, canvas, or WebCodecs renderer state.

#### Scenario: Desktop viewport summary
- **WHEN** the desktop renderer requests the desktop snapshot
- **THEN** it receives a viewport summary that identifies Engine ownership, current MVP availability, and diagnostic status

#### Scenario: Web UI controls viewport
- **WHEN** a user interacts with playback or viewport controls in the desktop renderer
- **THEN** the action is represented as an intent for AppHost/Engine handling rather than direct mutation of renderer-owned media truth

### Requirement: Professional output capabilities remain outside Web UI truth
The system SHALL reserve 10-bit color, HDR, color management, frame timing, texture leases, and final export truth for Engine/native viewport or Engine export paths.

#### Scenario: Renderer displays placeholder
- **WHEN** the MVP desktop renderer does not yet have a native viewport binding
- **THEN** it displays an explicit placeholder/diagnostic and does not claim production 10-bit/HDR viewport support

#### Scenario: Webview preview remains non-authoritative
- **WHEN** VSCode or Electron Web UI displays a stream, thumbnail, or preview projection
- **THEN** that projection is treated as display/runtime state and not as the durable media/color/rendering truth

### Requirement: Viewport resources use leases or descriptors
The system SHALL represent viewport render targets, streams, thumbnails, and previews with short-lived descriptors or leases instead of durable file paths or renderer handles.

#### Scenario: Viewport resource projected to renderer
- **WHEN** the AppHost exposes a viewport-related resource to the renderer
- **THEN** it uses a descriptor suitable for display and keeps native surface, texture, token, and cache details outside persistent project data
