## ADDED Requirements

### Requirement: Model Controls Surface Disabled Reasons
The Neko Model Webview control surface SHALL expose localized disabled or degraded reasons for controls that depend on Engine readiness, scene-control state, Engine capability, selected target context, or asset compatibility. The control surface MUST NOT present silent gray buttons for baseline editing workflows.

#### Scenario: Scene-control unavailable disables controls with reason
- **WHEN** the scene-control channel is disconnected while the video stream remains visible
- **THEN** controls that require scene commands or queries are disabled or marked degraded with a scene-control diagnostic reason

#### Scenario: Selected asset is incompatible
- **WHEN** a selected ordinary mesh lacks morph, bone, animation, or character region compatibility for a higher-level panel
- **THEN** the panel exposes an asset-compatibility diagnostic rather than silently disabling all inputs

### Requirement: Object And Inspect Controls Do Not Require Semantic Picking
The Neko Model Webview SHALL keep Object and Inspect workflows available when semantic typed picking or character region picking is unavailable, provided the scene snapshot contains selectable nodes or material data. Webview MUST use Engine-provided snapshots, queries, or Outliner selection and MUST NOT parse glTF/VRM mesh data locally for authority.

#### Scenario: Object workflow remains available
- **WHEN** Engine does not advertise `characterRegions` and semantic typed picking is unavailable
- **THEN** Object workflow remains available through Outliner selection or Engine-backed node/material query data

#### Scenario: Inspect uses snapshot data
- **WHEN** the user chooses Inspect for a selected node or material slot
- **THEN** Webview reads the mirrored Engine snapshot or query result for display
- **THEN** Webview does not parse the source GLB/VRM file to create authoritative Inspector facts

### Requirement: High-frequency Controls Stay On The Hot Path
The Neko Model Webview SHALL keep high-frequency viewport controls on the restored immediate hot path and off slow authoring acknowledgement paths. Camera, drag, light-position, transform drag, wheel, keyboard camera, and continuous slider controls MUST update local intent immediately, send latest-only Engine hot updates, and reconcile from Engine state asynchronously. Webview MUST NOT gate this path behind selection query results, capability diagnostics, LookDev readiness, static availability derivation, scene-command ACKs, or global scene-control error state while the stream remains alive.

#### Scenario: Camera update does not wait for ack
- **WHEN** the user changes the camera through orbit, pan, wheel, or keyboard navigation
- **THEN** Webview does not wait for `viewportCameraAck` before updating local intent
- **THEN** Webview does not enqueue pointer moves behind an in-flight camera acknowledgement

#### Scenario: Interaction does not restart stream
- **WHEN** interaction switches to an interactive stream profile or latest-only decode policy
- **THEN** Webview does not call `startSceneRenderStream()` again for that interaction
- **THEN** Webview does not destroy and recreate the H.264 stream

#### Scenario: LookDev switch does not restart stream
- **WHEN** the user switches PBR, Clay, Wireframe, Normal, or Depth in the active model viewport
- **THEN** Webview sends a `viewport-settings-update` command for the active viewport when the mode is supported
- **THEN** Webview does not allocate a new stream descriptor, reconnect the stream WebSocket, reset the decoder, or destroy and recreate the H.264 stream
- **THEN** Webview marks the requested mode applied only after Engine acknowledgement plus current-stream descriptor/frame metadata confirms the effective mode

#### Scenario: WebCodecs output chain remains continuous
- **WHEN** interaction starts or ends
- **THEN** Webview does not reset, close, or recreate the decoder
- **THEN** Webview does not suppress frames already submitted to WebCodecs/VideoToolbox

#### Scenario: Control diagnostic does not disable active interaction
- **WHEN** an optional hit-test, selection query, LookDev command, or capability refresh fails
- **THEN** Webview shows a diagnostic for that control or query
- **THEN** Webview keeps the active camera/drag/slider interaction loop available while the render stream is alive

### Requirement: Webview Does Not Lower GPU Performance
The Neko Model Webview SHALL NOT reduce Engine GPU performance as a default response to baseline editing control gaps. Webview MUST NOT add hot-path CPU readback, GPU-to-CPU-to-Webview frame transfer, Webview-side 3D rendering fallback, lower default stream resolution/DPR/FPS/bitrate, disable zero-copy/hardware encode, or add blocking render/encode waits to make controls appear responsive.

#### Scenario: Webview keeps Engine stream as visual path
- **WHEN** baseline editing controls are enabled
- **THEN** the visible 3D viewport remains the Engine H.264 stream
- **THEN** Webview does not introduce a Three.js/R3F/glTF-rendered fallback or per-frame CPU image transport for the visible model

#### Scenario: Performance fallback is displayed
- **WHEN** Engine reports a lower stream, encode, or GPU path
- **THEN** Webview displays the fallback reason and effective values
- **THEN** Webview does not relabel the fallback as the normal 1080p/60fps baseline

### Requirement: Webview Does Not Lower Render Quality
The Neko Model Webview SHALL NOT silently reduce perceived render quality as a default response to interaction latency or control gaps. Webview MUST NOT hide blur, jaggies, lower DPR, disabled render passes, degraded LookDev modes, or lower material quality behind successful control states.

#### Scenario: Quality diagnostics are surfaced
- **WHEN** Engine reports a lower-quality render path or unsupported LookDev mode
- **THEN** Webview surfaces the effective mode or fallback reason
- **THEN** Webview keeps the last confirmed quality state visible instead of pretending the requested quality was applied

#### Scenario: Overlay does not degrade viewport
- **WHEN** performance or diagnostic overlays are visible
- **THEN** selectable overlay panels remain interactive
- **THEN** non-panel overlay regions do not steal pointer capture or add heavy composition effects over the hot viewport surface

### Requirement: Model Control Availability Reconciles With Engine Responses
The Neko Model Webview SHALL update pending, applied, rejected, unavailable, and degraded states from Engine acknowledgements, rejections, query results, stream descriptors, render frame metadata, and diagnostics. Runtime Engine responses MUST take precedence over stale static capability assumptions.

#### Scenario: Enabled control is rejected
- **WHEN** a user invokes a control that was enabled by capability discovery but Engine rejects the command
- **THEN** Webview rolls back pending state, shows the rejection diagnostic, and marks the control degraded when appropriate

#### Scenario: Control becomes available after refresh
- **WHEN** a capability refresh or successful runtime response proves a previously unavailable control is supported
- **THEN** Webview may enable that control and clear the prior unavailable reason

### Requirement: Baseline Editing Keeps Route A Boundaries
Baseline editing controls SHALL preserve Route A boundaries. Webview MUST NOT import Three.js/R3F for the visible model surface, parse GLB/VRM mesh files for authoritative selection or material data, or commit scene facts only to local UI state.

#### Scenario: Transform edit dispatches scene command
- **WHEN** the user edits Transform for a selected ordinary node
- **THEN** Webview sends a reliable scene command and waits for Engine acknowledgement, delta, snapshot, or compatible frame metadata before treating the edit as authoritative

#### Scenario: Viewport click does not parse mesh locally
- **WHEN** the user clicks in the Engine-stream viewport to select an object
- **THEN** Webview uses Engine hit-test or query support when available
- **THEN** Webview falls back to Outliner selection when hit-test is unavailable rather than parsing mesh locally
