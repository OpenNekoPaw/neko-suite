## ADDED Requirements

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
