# free-modeling-sessions Specification

## Purpose
TBD - created by archiving change implement-3d-editor-1b-authoring-webview-control-plane. Update Purpose after archive.
## Requirements
### Requirement: Free modeling operations run inside ModelingSession
The system SHALL require sculpting, vertex editing, Boolean, subdivide, decimate, dynamic topology, and topology-affecting mesh operations to run inside a `ModelingSession`. Each session MUST include `sessionId`, mesh or character identity, `topologyMutable`, `topologyVersion`, before hash, affected flags, and operation log metadata.

#### Scenario: Begin sculpt session
- **WHEN** the user enters sculpt mode for a character mesh
- **THEN** Engine opens a `ModelingSession`, records the current topology version and before hash, and sends session state to Webview

#### Scenario: Operation outside session is rejected
- **WHEN** Webview sends a vertex brush patch without an active matching session
- **THEN** Engine rejects the patch and requests Webview to discard related prediction state

### Requirement: Topology versions guard commands and queries
The system SHALL include topology version in modeling commands, brush patches, hit-test results, topology events, and local prediction state. Engine and Webview MUST reject or discard modeling data whose topology version does not match the active session.

#### Scenario: Stale brush patch is discarded
- **WHEN** Webview sends a brush patch for topology version 7 after Engine has advanced the mesh to version 8
- **THEN** Engine rejects the patch and emits the current topology version for resync

### Requirement: VertexBrushPatch uses a binary patch channel
The system SHALL transmit high-frequency vertex brush deltas as `VertexBrushPatch` binary payloads associated with an active modeling session. Patch metadata MUST include session id, mesh id, topology version, stroke id, affected range or sparse index set, encoding, and sequence information.

#### Scenario: Brush stroke streams patches
- **WHEN** the user paints a sculpt stroke across a mesh
- **THEN** Webview sends coalesced binary brush patches and Engine applies them without blocking the scene command ack path

#### Scenario: Patch bandwidth is bounded
- **WHEN** brush input produces patches faster than the configured budget
- **THEN** Webview coalesces or drops superseded preview patches while preserving the final stroke commit

### Requirement: TopologyChangeEvent reports mutation and invalidation
The system SHALL emit `TopologyChangeEvent` when a modeling operation changes topology. Each event MUST include mesh id, from version, to version, operation summary, and explicit invalidation or migration result for morphs, skin weights, UVs, tangents, bounds, and acceleration structures.

#### Scenario: Boolean operation invalidates morphs
- **WHEN** a Boolean operation changes vertex identity in a character mesh
- **THEN** Engine emits a topology event that marks affected morph and skin data migrated or invalidated

#### Scenario: Webview invalidates prediction cache
- **WHEN** Webview receives a topology event with a new topology version
- **THEN** Webview drops local prediction copies and requests fresh projected bounds or hit-test data

### Requirement: MeshTopologyMigrationService handles commit decisions
The system SHALL run `MeshTopologyMigrationService` when committing topology-affecting sessions. The service MUST either migrate dependent morph, skin, UV, and material projection data or explicitly mark them invalid with user-visible warnings.

#### Scenario: Vertex-only sculpt preserves morphs
- **WHEN** a modeling session only changes vertex positions without changing vertex identity
- **THEN** the migration service preserves compatible morph, skin, and UV data

#### Scenario: Unsupported migration is surfaced
- **WHEN** a topology operation cannot safely migrate skin weights
- **THEN** the system blocks silent commit or commits with an explicit invalidation warning recorded in the topology event

### Requirement: Modeling commit and cancel are transactional
The system SHALL make modeling session commit and cancel transactional. Commit MUST publish a new topology version and scene revision; cancel MUST discard uncommitted operation log entries and instruct Webview to clear prediction state.

#### Scenario: Cancel sculpt session
- **WHEN** the user cancels an active sculpt session
- **THEN** Engine restores the pre-session mesh state and Webview removes brush previews for that session

#### Scenario: Commit sculpt session
- **WHEN** the user commits an active sculpt session
- **THEN** Engine persists the mesh changes, advances topology and scene revisions, and emits the final topology event

