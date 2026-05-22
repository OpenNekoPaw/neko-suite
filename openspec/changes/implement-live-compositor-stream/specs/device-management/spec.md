## ADDED Requirements

### Requirement: Live Devices Feed Engine Compositor
The live device/session system SHALL provide authorized camera, audio input, MIDI, gamepad, and tracking data to the engine compositor or engine-side routing layer without requiring Webview relay for high-frequency frames or device events.

#### Scenario: Camera session becomes compositor source
- **WHEN** Extension Host grants a camera device session for neko-live
- **THEN** the live compositor can reference the authorized session as a camera source layer without the Webview constructing device control URLs independently

#### Scenario: Tracking bypasses Webview roundtrip
- **WHEN** tracking data drives live puppet, model, or overlay state
- **THEN** the engine-side compositor path can consume or receive the data without requiring Webview `postMessage` relay for every tracking frame

### Requirement: Live Output Routes Are Permission And Capability Checked
The device/session system SHALL check permissions and host capabilities before enabling live output routes such as recording, OBS virtual camera, RTMP, or monitor preview.

#### Scenario: Output route unavailable
- **WHEN** a requested live output route requires a device, permission, or backend capability that is unavailable
- **THEN** the system reports a typed diagnostic and leaves the route disabled

#### Scenario: Recording route uses compositor authority
- **WHEN** compositor recording is available and enabled
- **THEN** recording captures the engine compositor output rather than a Webview-local fallback canvas

### Requirement: Local Live Recording Remains Fallback Only
The existing Webview canvas recording path SHALL remain available only as a non-authoritative fallback until engine compositor output recording is implemented and validated.

#### Scenario: Canvas recording fallback is labeled
- **WHEN** compositor output recording is unavailable and Webview canvas recording is used
- **THEN** the UI and session diagnostics mark the recording as local fallback and exclude it from compositor parity claims
