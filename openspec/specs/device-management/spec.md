# device-management Specification

## Purpose
TBD - created by archiving change add-device-management. Update Purpose after archive.
## Requirements
### Requirement: Shared Device Contract
The system SHALL define application-level device contracts in `@neko/shared` for device type, normalized device info, capabilities, permission state, connection state, device session, device event, and disposable listener handles. These contracts MUST NOT depend on DOM, React, or VSCode APIs.

#### Scenario: Shared device types are importable
- **WHEN** a package imports device contracts from `@neko/shared`
- **THEN** TypeScript resolves the contracts without requiring DOM, React, or VSCode type dependencies

#### Scenario: Engine DTOs are adapted rather than duplicated
- **WHEN** `DeviceManager` receives `AudioInputDevice`, `CameraDevice`, `MidiPort`, or `GamepadInfo` from `EngineClient`
- **THEN** it maps the low-level DTO into `DeviceInfo` without redefining a second wire DTO model in `@neko/shared`

### Requirement: Device Manager Discovery
The system SHALL provide a `DeviceManager` in `@neko/neko-client` that discovers audio input, camera, MIDI input, and gamepad devices through existing engine actions and returns a normalized snapshot of `DeviceInfo` records.

#### Scenario: Refresh returns normalized devices
- **WHEN** a caller invokes `DeviceManager.refresh()`
- **THEN** the manager queries the available engine-backed device groups and returns normalized device records with stable `id`, `type`, `label`, `connectionState`, and `permissionState`

#### Scenario: List uses cached snapshot
- **WHEN** a caller invokes `DeviceManager.list(type)` after a successful refresh
- **THEN** the manager returns matching devices from its current snapshot without dispatching another engine request

### Requirement: Device Permission Enforcement
The system SHALL enforce app-level device permissions before starting sensitive sessions. Audio input, camera, and XR devices MUST require explicit permission when their state is unknown or denied. MIDI input and gamepad devices MAY default to granted but MUST still surface connection errors.

#### Scenario: Permission denial blocks engine action
- **WHEN** permission policy returns `denied` for a requested camera or audio input device
- **THEN** `DeviceManager.connect()` fails with a typed permission error and does not call the underlying engine start/connect action

#### Scenario: Granted permission starts session
- **WHEN** permission policy returns `granted` for a requested audio input or camera device
- **THEN** `DeviceManager.connect()` calls the corresponding engine action and returns a `DeviceSession`

#### Scenario: Revoke disconnects active sessions
- **WHEN** a device permission is revoked through the Extension Host command
- **THEN** active sessions for that device are disconnected and listeners receive a permission or device change event

### Requirement: Device Events And Lifecycle
The system SHALL expose device lifecycle events through disposable listeners. Events MUST cover added, removed, changed, permissionChanged, and error outcomes.

#### Scenario: Listener receives device change
- **WHEN** a device snapshot changes after refresh or a backend event
- **THEN** registered listeners receive a `DeviceEvent` describing the changed device or removal

#### Scenario: Disposed listener is not called
- **WHEN** a caller disposes the listener handle returned by `onDeviceChange`
- **THEN** subsequent device events do not call that listener

### Requirement: MIDI And Gamepad Stream Clients
The system SHALL provide MIDI and gamepad clients that connect through `EngineClient`, open authorized WebSocket stream URLs, parse JSON events, and support injectable WebSocket factories for tests.

#### Scenario: MIDI event is parsed
- **WHEN** a MIDI stream WebSocket receives a JSON MIDI event from the engine
- **THEN** the MIDI client emits a typed event with timestamp, kind, channel, data bytes, and status

#### Scenario: Gamepad event is parsed
- **WHEN** a gamepad stream WebSocket receives a JSON gamepad event from the engine
- **THEN** the gamepad client emits a typed event with timestamp, gamepad id, kind, button or axis, and value

#### Scenario: WebSocket factory is injectable
- **WHEN** a unit test constructs a MIDI or gamepad client with a fake WebSocket factory
- **THEN** the client uses the fake factory and does not require a browser global `WebSocket`

### Requirement: Authorized Webview Stream Consumption
The system SHALL allow Webviews to consume stream URLs only after Extension Host or device client authorization has produced a session or stream handle. Webviews MUST NOT discover the engine port and construct device control URLs independently for device discovery, permission, or sensitive session creation.

#### Scenario: Authorized camera preview uses stream handle
- **WHEN** Extension Host grants camera access and returns a stream handle to a Webview
- **THEN** the Webview may open the stream with the existing H264 client

#### Scenario: Webview cannot bypass permission
- **WHEN** a Webview requests a sensitive device session without an authorized `DeviceSession`
- **THEN** the Extension Host rejects the request or asks for permission before calling the engine

### Requirement: Engine Internal Device Binding
The system SHALL keep low-latency MIDI and gamepad action execution inside the engine through a binding or input routing layer. Webview event observation MUST NOT be required for engine-side audio triggers, scene camera control, puppet parameter updates, or timeline actions.

#### Scenario: MIDI trigger executes without Webview roundtrip
- **WHEN** a configured MIDI event maps to an engine action
- **THEN** the engine executes the action from its device event consumer without routing the event through Webview and back

#### Scenario: Webview may observe but not own real-time action path
- **WHEN** a Webview subscribes to a gamepad event stream for diagnostics
- **THEN** engine-side bindings continue to execute independently of that Webview subscription

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

### Requirement: Live Viewport Consumes Compositor Stream
neko-live SHALL consume an engine compositor stream through ViewportShell for scene display once compositor support is available.

#### Scenario: Live displays composited stream
- **WHEN** Engine provides a compositor stream descriptor for a live scene
- **THEN** neko-live displays that stream through ViewportShell rather than rendering persistent puppet/model scene layers locally

#### Scenario: Live controls compositor layers
- **WHEN** the user changes live scene presets or layer routing
- **THEN** LiveController sends compositor scene commands and does not mutate local renderer-only state as the authority

### Requirement: Live Local Rendering Is Non-Authoritative
Any remaining neko-live local R3F or preview renderer SHALL be marked fallback/development-only once ViewportShell compositor display is available.

#### Scenario: Compositor unavailable fallback
- **WHEN** the engine compositor is unavailable and live fallback rendering is enabled
- **THEN** the UI marks the fallback as non-authoritative and excludes it from output/export parity claims
