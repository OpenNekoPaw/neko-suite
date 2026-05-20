## MODIFIED Requirements

### Requirement: Export Orchestration Backend Boundary
Export orchestration SHALL depend on focused backend contracts instead of directly constructing every concrete GPU, codec, sink, scene, or puppet implementation.

#### Scenario: Export can inject a fake backend
- **WHEN** export orchestration is tested with a fake render or sink backend
- **THEN** it can exercise job setup, progress, cancellation, and error propagation without constructing a GPU context or FFmpeg muxer

#### Scenario: Default export behavior is preserved
- **WHEN** production export code uses the default backend adapters
- **THEN** it uses the existing GPU export, encode, mux, and sink implementations
- **THEN** existing submit, flush, close, cancel, and progress behavior remains compatible

#### Scenario: Export can inject scene and puppet render ports
- **WHEN** a GPU export pipeline is created for a timeline that may contain Scene3D or Puppet elements
- **THEN** export backend construction can provide scene and puppet render service ports without direct service construction inside the pipeline

### Requirement: Concrete Implementation Imports Are Guarded
The engine SHALL include architecture guardrails that prevent export and preview orchestration from regressing to direct implementation coupling where a backend boundary exists.

#### Scenario: Export guardrail detects service implementation coupling
- **WHEN** architecture checks inspect `engine-kernel/src/export`
- **THEN** they fail if export orchestration imports `crate::services::impls`
- **THEN** any allowed exception must be documented as a temporary adapter boundary

#### Scenario: Preview guardrail detects renderer implementation coupling
- **WHEN** architecture checks inspect `engine-kernel/src/preview`
- **THEN** they fail if preview orchestration imports renderer internals that should be accessed through a backend adapter
- **THEN** provider registry contracts remain the preferred routing surface

#### Scenario: Export pipeline does not construct domain services
- **WHEN** architecture checks inspect GPU export pipeline code
- **THEN** they fail if the pipeline constructs SceneService or PuppetService directly instead of receiving injected service ports or documented adapter handles

### Requirement: Zero-Copy And Sink Semantics Are Preserved
Export and preview decoupling SHALL NOT introduce CPU readback fallback or alter sink lifecycle semantics.

#### Scenario: Unsupported GPU interop remains explicit
- **WHEN** a backend cannot consume a native GPU handle
- **THEN** it returns an explicit unsupported-capability error
- **THEN** it does not silently copy through CPU memory as a fallback

#### Scenario: Sink lifecycle behavior remains covered
- **WHEN** validation runs for this change
- **THEN** targeted tests cover MuxerSink flush/close behavior, StreamSink close flush behavior, SnapshotSink terminal behavior, and unsupported output errors

#### Scenario: Mixed domain export preserves zero-copy policy
- **WHEN** Scene3D and Puppet layers are exported in the same GPU frame
- **THEN** each layer follows the existing GPU-handle composition policy
- **THEN** the mixed export path does not introduce a CPU composition fallback
