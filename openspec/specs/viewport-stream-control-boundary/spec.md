# viewport-stream-control-boundary Specification

## Purpose
TBD - created by archiving change implement-viewport-stream-control-boundary. Update Purpose after archive.
## Requirements
### Requirement: Viewport Video Metadata And Control Channels Are Separated
The system SHALL treat H.264 video frames, viewport frame metadata, and scene-control commands as distinct responsibilities even when video frames and frame metadata are transported on the same WebSocket.

#### Scenario: Video frame is not semantic authority
- **WHEN** an engine-rendered video frame is displayed in a model, puppet, or live viewport
- **THEN** the frame is used as visual output only and is not treated as the source of selection, transform, preview mode, output route, playback, bone, or BlendShape authority

#### Scenario: Control operation uses scene-control
- **WHEN** a user performs selection, transform, preview mode, output route, tracking overlay, bone, or BlendShape operation
- **THEN** the operation is represented by a scene-control command or query with ack/error/delta/snapshot reconciliation

### Requirement: Semantic Control Flow Is The Acceptance Gate
The system SHALL require control-flow proof for semantic viewport operations instead of accepting video-frame changes alone as completion evidence.

#### Scenario: Button control is accepted only after state update
- **WHEN** a viewport toolbar or panel button sends a semantic command
- **THEN** the workflow is accepted only after the command receives ack or error and the relevant controller or store reflects the authoritative outcome

#### Scenario: Video change alone fails acceptance
- **WHEN** a test observes that decoded video pixels changed after a command
- **THEN** the test still fails if command ack/error, delta/snapshot, controller/store update, or overlay/prediction reconciliation is missing

### Requirement: Frame Metadata Backpressure Is Diagnosed And Migratable
The system SHALL diagnose frame metadata latency and SHALL support a staged migration from video-sideband metadata to scene-control metadata events when video backpressure breaks overlay alignment.

#### Scenario: Metadata delay is reported
- **WHEN** frame metadata arrives late, references an old revision, or is missing while control acks continue
- **THEN** the client exposes a stale or delayed metadata diagnostic distinct from command failure

#### Scenario: Scene-control metadata is the first migration target
- **WHEN** video-sideband metadata delay exceeds the configured interaction budget
- **THEN** the implementation migrates revision, view transform, frame timestamp, and applied sequence metadata first to scene-control metadata events before introducing an independent metadata WebSocket

#### Scenario: Independent metadata WebSocket is reserved
- **WHEN** scene-control metadata events cannot satisfy required frequency or isolation
- **THEN** the system may introduce a dedicated metadata WebSocket without changing the rule that scene-control remains semantic authority

### Requirement: ViewportShell And SceneController Own Interaction Entry
The system SHALL use `ViewportShell + ISceneController` as the default semantic input entrypoint for engine-stream viewports.

#### Scenario: Shell delegates pointer input
- **WHEN** a pointer event occurs over a viewport surface
- **THEN** ViewportShell filters chrome targets, captures the pointer where needed, converts the event to shared input DTOs, and delegates semantic handling to the active scene controller

#### Scenario: InteractionLayer remains render-only by default
- **WHEN** an overlay or `InteractionLayer` renders selection bounds, gizmos, bone handles, or tracking diagnostics
- **THEN** it does not independently consume pointer or key events unless it has been explicitly promoted as the sole delegated interaction layer for that domain path

#### Scenario: Duplicate event ownership is rejected
- **WHEN** a domain promotes an interaction layer to handle semantic events
- **THEN** the same event MUST NOT also be routed through a second shell/controller semantic path

### Requirement: Prediction Lifecycle Is Reconciled By Control And Metadata
The system SHALL reconcile local viewport predictions using command ack/error, delta/snapshot updates, frame metadata, timeout, and revision invalidation.

#### Scenario: Ack arrives before video frame
- **WHEN** a command ack arrives before a new video frame or frame metadata
- **THEN** the local prediction remains visible or marked pending until authoritative state or compatible frame metadata commits or invalidates it

#### Scenario: Error rolls back prediction
- **WHEN** scene-control rejects a predicted command
- **THEN** the prediction is rolled back and the UI exposes an error or degraded diagnostic

#### Scenario: New frame metadata reconciles prediction
- **WHEN** compatible frame metadata arrives with matching revision or applied sequence
- **THEN** the prediction is committed, hidden, or invalidated according to the controller policy

