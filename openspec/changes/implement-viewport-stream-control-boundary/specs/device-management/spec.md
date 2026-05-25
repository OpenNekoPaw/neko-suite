## ADDED Requirements

### Requirement: Live Control Buttons Close Through Compositor Scene State
Live preset, tracking overlay, output route, and layer controls SHALL close through scene-control command acknowledgements and authoritative live compositor scene state updates.

#### Scenario: Preset button updates after ack
- **WHEN** the user selects a live preset from the viewport toolbar
- **THEN** LiveController sends a `scene:live:*` command and updates active preset UI only after ack or authoritative live scene state update

#### Scenario: Tracking overlay toggle is command-backed
- **WHEN** the user toggles tracking overlay visibility
- **THEN** the UI reflects the new state only after the live command applies or the controller receives updated compositor scene state

#### Scenario: Output route failure is explicit
- **WHEN** the user enables an unsupported or unavailable output route
- **THEN** the system returns an explicit diagnostic and does not silently treat Webview canvas capture as authoritative compositor output

### Requirement: Live Video Playback Does Not Prove Control Success
Live compositor video playback SHALL not be sufficient evidence that live scene controls, output route controls, or recording controls succeeded.

#### Scenario: Video continues while control fails
- **WHEN** the live compositor stream continues decoding but scene-control rejects a command
- **THEN** the UI shows the command error or degraded state instead of assuming the control succeeded

#### Scenario: Local fallback remains non-authoritative
- **WHEN** live falls back to local preview or Webview canvas recording
- **THEN** the UI and diagnostics mark the path non-authoritative for compositor output, preview parity, and control-flow acceptance

### Requirement: Live Control Channel Degradation Is Visible
Live Webview SHALL distinguish compositor stream availability from scene-control availability.

#### Scenario: Compositor stream active but control disconnected
- **WHEN** the live compositor stream is active and scene-control is disconnected
- **THEN** preset, output route, tracking overlay, and layer controls are disabled or degraded while the video surface may continue displaying

#### Scenario: Control restored resyncs scene
- **WHEN** scene-control reconnects after a degraded state
- **THEN** LiveController requests or receives authoritative live scene state before re-enabling semantic controls
