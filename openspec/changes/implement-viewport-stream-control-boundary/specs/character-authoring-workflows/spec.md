## ADDED Requirements

### Requirement: Model Selection Query And Store Close The Loop
Model viewport selection SHALL close through scene-control hit-test or selection command results, compatible revision checks, and model store updates before selection-dependent UI is considered authoritative.

#### Scenario: Click selection updates model store
- **WHEN** the user clicks an engine-rendered model viewport
- **THEN** Webview sends a viewport-scoped selection command or hit-test query and updates selected model state only from a compatible ack, delta, snapshot, or query result

#### Scenario: Stale selection result is rejected
- **WHEN** a hit-test or selection result references an older scene revision than the current model controller state
- **THEN** Webview does not apply the stale selection as authoritative and requests fresh state if needed

### Requirement: Model Gizmo Queries Drive Overlay State
Model gizmo overlays SHALL be driven by viewport-scoped projected bounds and gizmo anchor results stored in controller or model state.

#### Scenario: Selection requests bounds and anchor
- **WHEN** a model node becomes selected
- **THEN** Webview requests projected bounds and gizmo anchor data for the active viewport and stores results with viewport id and revision

#### Scenario: Gizmo overlay uses stored query result
- **WHEN** the overlay renderer draws a selected model gizmo
- **THEN** it uses stored projected bounds or anchor data compatible with the displayed frame metadata

### Requirement: Model Transform Drag Commits Through Scene-control
Model viewport transform drag SHALL create local prediction during pointer movement and commit or roll back through scene-control acknowledgements and authoritative state updates.

#### Scenario: Drag sends transform command
- **WHEN** the user drags a model transform gizmo
- **THEN** the model controller creates a bounded prediction and sends a `viewport:transform` or model scene command with sequence, correlation id, viewport id, and base revision

#### Scenario: Transform ack updates authoritative model state
- **WHEN** the engine acknowledges a transform drag command
- **THEN** Webview commits or clears the prediction and updates selected node transform state from ack/delta/snapshot data

#### Scenario: Transform error rolls back local drag
- **WHEN** the engine rejects a transform command
- **THEN** Webview rolls back the predicted gizmo/transform state and surfaces a diagnostic

### Requirement: Character Preview Modes Are Semantic Controls
Character preview mode changes SHALL be represented as semantic controller commands rather than inferred from video-frame changes.

#### Scenario: Face preview mode updates after ack
- **WHEN** the user switches to face preview mode
- **THEN** the model controller sends a preview-mode command and marks the UI active only after ack or authoritative preview state update

#### Scenario: Playback preview remains command-backed
- **WHEN** the user starts, stops, or changes action/voice preview playback
- **THEN** Webview sends semantic playback or asset-slot commands and does not treat video motion alone as proof that playback state changed
