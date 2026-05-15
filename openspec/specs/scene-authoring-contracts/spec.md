# scene-authoring-contracts Specification

## Purpose
TBD - created by archiving change implement-3d-editor-wysiwyg-rendering. Update Purpose after archive.
## Requirements
### Requirement: Shared 3D scene contracts
The system SHALL define shared 3D scene contracts for `SceneCommand`, `SceneCommandAck`, `SceneSnapshot`, `SceneDelta`, `ViewportDescriptor`, `RenderStreamDescriptor`, `AudioStreamDescriptor`, and `RenderFrameMeta` in the project contract layer. Engine, client, extension, and Webview code MUST consume these shared contracts for 3D scene behavior instead of ad hoc local scene types or `Record<string, unknown>`.

#### Scenario: Typed scene snapshot replaces unknown record
- **WHEN** Webview requests a 3D scene snapshot through the client API
- **THEN** the response is typed as `SceneSnapshot` from the shared contract layer and not as `Record<string, unknown>`

#### Scenario: Contract roundtrip is validated
- **WHEN** Rust and TypeScript serialize and deserialize a shared scene delta fixture
- **THEN** the roundtrip preserves revision, node ids, patch fields, and optional omitted fields

### Requirement: Scene commands use reliable envelopes
The system SHALL wrap every high-frequency 3D editing command in `SceneCommandEnvelope` with monotonic `seq`, `baseRevision`, optional `transactionId`, optional `phase`, and optional `coalesceKey`. The Engine MUST answer each command with `SceneCommandAck` containing `seq`, `appliedSeq`, `baseRevision`, `revision`, and `status`.

#### Scenario: Transform command receives ack
- **WHEN** Webview sends a transform command with `seq=42` and a current `baseRevision`
- **THEN** Engine applies or rejects the command and returns an ack for `seq=42` with the resulting revision

#### Scenario: Stale command is rejected
- **WHEN** Webview sends a command whose `baseRevision` is older than the Engine can safely apply
- **THEN** Engine returns `status: 'rejected'` with an error reason and Webview rolls back or resyncs the pending edit

### Requirement: Control WebSocket provides the scene control plane
The system SHALL provide `/v1/scenes/control` as the direct Webview-to-Engine control WebSocket for 3D editing. The WebSocket MUST support hello, subscribe, command, query, resync, requestKeyframe, ready, ack, delta, queryResult, snapshot, renderFrameMeta, error, and heartbeat messages.

#### Scenario: Webview bypasses Extension for high-frequency edits
- **WHEN** the user drags a 3D transform gizmo
- **THEN** Webview sends transform updates directly to `/v1/scenes/control` and Extension Host does not relay those high-frequency updates

#### Scenario: Reconnect requires resync
- **WHEN** the control WebSocket reconnects after a disconnect
- **THEN** Webview sends hello with its last known revision and Engine returns either missing deltas or a full snapshot

### Requirement: SceneDelta uses patch semantics
The system SHALL model `SceneDelta` as a patch with `revision`, optional `appliedSeq`, and optional dirty fields. Missing fields MUST mean "unchanged"; missing fields MUST NOT mean reset. Reset behavior MUST be represented by explicit commands or snapshot resync.

#### Scenario: Missing material patch preserves material
- **WHEN** Webview receives a `SceneDelta` with `updatedTransforms` but no `updatedMaterials`
- **THEN** Webview updates transforms and preserves existing material state unchanged

#### Scenario: Removed node cascades locally
- **WHEN** Webview receives `removedNodes` containing a parent node id
- **THEN** Webview removes the node and its local mirrored subtree from the revision-tagged scene mirror

### Requirement: Object handles compile to commands
The system SHALL expose object-style authoring handles such as `SceneDocument`, `SceneNodeHandle`, `MaterialHandle`, `CameraHandle`, and `SceneTransaction`, but these handles MUST only produce commands or queries. They MUST NOT directly mutate ECS components, GPU resources, or authoritative Webview store state.

#### Scenario: SceneNodeHandle setTransform sends command
- **WHEN** UI code calls `SceneNodeHandle.setTransform()`
- **THEN** the handle emits a `SceneCommandEnvelope` and waits for ack before committing authoritative state

#### Scenario: Stale handle detects revision mismatch
- **WHEN** a handle created at revision 10 is used after the scene mirror has advanced beyond a compatible revision
- **THEN** the handle detects staleness and either refreshes or rejects the operation before sending an unsafe command

### Requirement: Snapshot and delta revision ordering
The system SHALL maintain monotonic scene revisions. Webview MUST discard stale deltas, request resync when it detects a revision gap it cannot reconcile, and only commit pending local edits after compatible ack or snapshot reconciliation.

#### Scenario: Old delta is discarded
- **WHEN** Webview has scene revision 20 and receives a delta for revision 18
- **THEN** Webview ignores the stale delta and keeps revision 20 as its authoritative mirror

#### Scenario: Gap triggers resync
- **WHEN** Webview has scene revision 20 and receives a delta that requires revision 23 without receiving 21 or 22
- **THEN** Webview sends a resync request instead of applying the incompatible delta

### Requirement: Scene Blend Contracts Use Shared Animation DTOs
Scene authoring contracts SHALL reuse shared runtime animation blend DTOs for common blend and crossfade state while preserving scene-specific behavior.

#### Scenario: Scene blend state exposes compatible data
- **WHEN** scene services return animation blend state
- **THEN** the returned data remains compatible with existing scene callers
- **THEN** internally common blend layer and crossfade concepts come from the shared animation contract or a compatibility wrapper over it

#### Scenario: Scene-only playback state remains scene-owned
- **WHEN** scene animation exposes playback state that has no puppet equivalent
- **THEN** that state remains in runtime-scene
- **THEN** the shared animation contract is not expanded solely for scene-only data

