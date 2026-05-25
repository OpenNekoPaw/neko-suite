## ADDED Requirements

### Requirement: Puppet Viewport Bone Drag Closes Through Native Commands
Puppet viewport bone dragging SHALL use pointer move/up state, local prediction overlays, revision-aware native puppet commands, and ack/error reconciliation.

#### Scenario: Bone drag starts from selected bone
- **WHEN** the user begins dragging a selected puppet bone handle in the viewport
- **THEN** the puppet scene controller records drag state with bone id, start position, viewport id, and base native revision

#### Scenario: Bone drag sends native command
- **WHEN** the user moves or commits a puppet bone drag
- **THEN** the controller sends a native puppet command with sequence, base revision, transaction id, and transform payload rather than only moving a local overlay

#### Scenario: Bone drag rejection rolls back prediction
- **WHEN** the native puppet command is rejected because of stale revision or invalid bone id
- **THEN** the prediction overlay is rolled back and the puppet store requests or applies an authoritative snapshot

### Requirement: Puppet Bone Hit Testing Aligns With Viewport Metadata
Puppet bone selection SHALL use coordinate data compatible with the active viewport frame metadata and native puppet snapshot.

#### Scenario: Local bone hit uses view transform
- **WHEN** the puppet controller performs local bone hit testing
- **THEN** it transforms pointer and bone coordinates consistently with the active `ViewportFrameMeta.viewTransform`

#### Scenario: Stale snapshot cannot select authoritatively
- **WHEN** the puppet snapshot revision is older than the active frame or command revision
- **THEN** bone selection is marked stale or refreshed before being treated as authoritative

### Requirement: Puppet BlendShape And Driver Controls Use Ack-backed State
Puppet BlendShape, driver, onion-skin, and vertex edit controls SHALL update authoritative UI state through native command acknowledgements or snapshot refreshes.

#### Scenario: BlendShape slider waits for command result
- **WHEN** the user changes a native BlendShape slider
- **THEN** Webview sends a revision-aware native command and reconciles the displayed value with ack/error or authoritative snapshot state

#### Scenario: Driver command is not local-only
- **WHEN** the user changes a ControlDriver or tracking input value
- **THEN** the value is not considered committed until the native command path applies or rejects it

### Requirement: Puppet Preview Stream Does Not Replace Control Authority
Puppet preview video or delta streams SHALL not be treated as proof that editing commands succeeded without matching command acknowledgement or authoritative snapshot state.

#### Scenario: Preview changes without ack
- **WHEN** puppet preview frames or deltas continue after a native command is sent
- **THEN** the UI does not mark the command committed unless the command ack or authoritative state update is received

#### Scenario: Control failure is visible while preview continues
- **WHEN** puppet control rejects commands but the preview stream remains connected
- **THEN** Webview displays a control degraded or command error state
