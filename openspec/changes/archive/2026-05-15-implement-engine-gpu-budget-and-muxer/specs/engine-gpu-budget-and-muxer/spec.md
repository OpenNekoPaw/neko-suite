## ADDED Requirements

### Requirement: GPU Budget Permits
The engine SHALL require GPU pipelines to acquire a budget permit before render-loop GPU work.

#### Scenario: Interactive proceeds under pressure
- **WHEN** an interactive preview requests a GPU permit while the system is under pressure
- **THEN** the permit response is `Proceed`

#### Scenario: Transcode pauses under pressure
- **WHEN** a transcode or GPU preview-provider pipeline requests a permit while interactive frame-time pressure persists
- **THEN** the permit response is `Paused`

### Requirement: Hysteresis-Based Resume
The engine SHALL use sustained high and low frame-time thresholds to avoid pause/resume jitter.

#### Scenario: Resume after recovery
- **WHEN** interactive EMA remains below the recovery threshold for the configured recovery window
- **THEN** paused pipelines are notified to resume

### Requirement: Export Fairness
The engine SHALL queue export GPU work fairly under interactive pressure without degrading it to CPU execution.

#### Scenario: Export under pressure
- **WHEN** an export pipeline requests a permit while interactive preview is active under pressure
- **THEN** export work is queued fairly between interactive frames
- **AND** export does not use CPU fallback as a load reduction mechanism

### Requirement: MuxerSink Export
The engine SHALL route export frame submission through `MuxerSink`.

#### Scenario: Export submits GPU frame
- **WHEN** export produces `VideoOutput::GpuFrame`
- **THEN** `MuxerSink` accepts it and forwards encoding/muxing work to its bounded worker channel

#### Scenario: Flush waits for file completion
- **WHEN** `ExportService` calls `MuxerSink::flush()`
- **THEN** the call returns only after encoder flush and mux finalize are acknowledged

### Requirement: GPU Preview Busy Response
GPU preview providers SHALL return a retryable busy artifact when budget policy pauses them.

#### Scenario: Preview provider paused
- **WHEN** a PanoramicRenderer preview request receives a paused permit
- **THEN** the provider returns an unavailable artifact with `GpuBusy` and retry timing
