## ADDED Requirements

### Requirement: ViewportShell Owns Semantic Input Delegation
Engine-stream Webviews SHALL route semantic viewport input through `ViewportShell` and the active `ISceneController` unless a domain explicitly declares one delegated interaction layer as the sole semantic input owner.

#### Scenario: Pointer drag uses controller path
- **WHEN** a user starts a semantic drag over an engine-stream viewport
- **THEN** ViewportShell delegates the event to the active scene controller and does not require a separate per-editor DOM event system

#### Scenario: Interaction layer cannot double-handle events
- **WHEN** an interaction layer is promoted to handle a semantic event
- **THEN** the same pointer or key event is not also handled by another controller path for the same operation

### Requirement: Control Channel Degraded State Is Visible
Webviews SHALL expose a degraded or unavailable state when scene-control is disconnected, rejects semantic commands, or cannot return required query/snapshot data.

#### Scenario: Control socket disconnects
- **WHEN** the scene-control channel disconnects while the video stream remains visible
- **THEN** semantic controls that require engine state are disabled or marked degraded instead of silently mutating local UI state

#### Scenario: Query failure blocks authoritative overlay
- **WHEN** projected bounds, gizmo anchor, hit-test, or snapshot query fails
- **THEN** the Webview does not draw the dependent overlay as authoritative and surfaces a diagnostic or retry state

### Requirement: Webview Tests Assert Semantic State
Webview controller tests SHALL assert command dispatch, ack/error handling, store updates, overlay state, and prediction lifecycle for semantic viewport workflows.

#### Scenario: Toolbar action test asserts ack and store
- **WHEN** a test exercises a toolbar action that sends a scene command
- **THEN** the test verifies the command envelope, ack/error handling, and authoritative store or controller update

#### Scenario: Video-only assertion is insufficient
- **WHEN** a Webview test covers a semantic editing or control workflow
- **THEN** it does not pass by asserting only that the video surface received a frame

### Requirement: Prediction Remains Bounded While Waiting For Video
Webview prediction overlays SHALL remain bounded, labeled, and revertible while command acknowledgements and video frame metadata arrive at different times.

#### Scenario: Prediction remains pending after ack
- **WHEN** a command ack arrives before compatible frame metadata
- **THEN** the predicted overlay stays pending or stale-marked rather than becoming silently authoritative

#### Scenario: Prediction times out
- **WHEN** compatible ack, delta, snapshot, or frame metadata does not arrive within the configured timeout
- **THEN** the prediction rolls back and the Webview requests authoritative refresh or enters a degraded state
