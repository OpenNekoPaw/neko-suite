## ADDED Requirements

### Requirement: Pipeline Output Contract
The engine SHALL expose pipeline output contracts that distinguish video, audio, GPU-resident frames, terminal preview frames, encoded packets, and raw terminal readback frames.

#### Scenario: GPU frame output is produced
- **WHEN** a timeline preview frame is composited through the GPU pipeline
- **THEN** the pipeline returns `VideoOutput::GpuFrame` carrying timing metadata and a `GpuFrameLease`

#### Scenario: Audio output remains separate
- **WHEN** an audio mix buffer is produced
- **THEN** the output model represents it as audio data and does not force it through video frame variants

### Requirement: GPU Frame Lease Ownership
The engine SHALL use a cloneable `GpuFrameLease` for GPU frame handles instead of exposing raw ownershipless handles to sinks.

#### Scenario: Multiple sinks hold one frame
- **WHEN** a stream sink and snapshot sink both consume the same GPU frame
- **THEN** the backing GPU resource remains valid until both leases are dropped

#### Scenario: Encoder owns in-flight frame
- **WHEN** a stream sink submits a GPU frame to an encoder
- **THEN** the encoder path holds the lease until encoding for that frame is complete

### Requirement: Stream Sink Encoding
The engine SHALL move realtime preview H.264 encoding from `PreviewPipeline` into `StreamSink`.

#### Scenario: Preview stream behavior is preserved
- **WHEN** a timeline preview stream is rendered after the migration
- **THEN** WebSocket clients receive H.264 frame data with visual output and timing equivalent to the previous path

#### Scenario: Stream sink rejects unsupported output
- **WHEN** `StreamSink` receives an output variant it does not accept
- **THEN** it returns `UnsupportedOutput` instead of silently ignoring the frame

### Requirement: Snapshot Sink Terminal Readback
The engine SHALL provide `SnapshotSink` for explicit one-frame GPU-to-CPU readback as a terminal artifact.

#### Scenario: Snapshot returns RGBA
- **WHEN** a caller submits one GPU frame to `SnapshotSink`
- **THEN** the sink returns a legal RGBA buffer for that frame

#### Scenario: Snapshot rejects second submit
- **WHEN** a caller submits a second frame to the same completed `SnapshotSink`
- **THEN** the sink returns an `AlreadyCompleted` style error

### Requirement: GPU Hot Path Fail Fast
Realtime video, scene, and puppet GPU hot paths SHALL fail with `UnsupportedCapability` when required zero-copy GPU output is unavailable.

#### Scenario: Non-macOS zero-copy is unavailable
- **WHEN** a realtime GPU stream is requested on a platform without implemented native GPU handle interop
- **THEN** the engine returns `UnsupportedCapability` and does not use GPU readback plus CPU encode as fallback

#### Scenario: Explicit terminal readback is allowed
- **WHEN** a snapshot or thumbnail request explicitly asks for a terminal readback artifact
- **THEN** the engine may read back the GPU frame without treating that path as a realtime fallback
