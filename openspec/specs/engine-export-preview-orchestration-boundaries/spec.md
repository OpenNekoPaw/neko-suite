# engine-export-preview-orchestration-boundaries Specification

## Purpose
TBD - created by archiving change decouple-engine-export-preview-orchestration. Update Purpose after archive.
## Requirements
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

### Requirement: Preview Orchestration Backend Boundary
Preview orchestration SHALL route preview requests through focused backend contracts that isolate concrete renderers and provider implementations.

#### Scenario: Preview can inject a fake backend
- **WHEN** preview routing is tested with a fake render backend or provider backend
- **THEN** it can verify routing decisions and unavailable-preview behavior without constructing renderer internals

#### Scenario: Default preview behavior is preserved
- **WHEN** production preview code uses the default backend adapters
- **THEN** existing image, video, scene, puppet, document, and panoramic preview routing behavior remains compatible
- **THEN** no HTTP, WebSocket, N-API, TypeScript, or persisted project format changes are required

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

### Requirement: Export and preview orchestration are separated by content intent
The system SHALL keep export orchestration and preview orchestration separated by explicit content access intent so preview backends may use derived variants while export backends use source-backed inputs.

#### Scenario: Preview orchestration requests preview variant
- **WHEN** preview orchestration needs a poster, thumbnail, proxy, FOV crop, or screenshot
- **THEN** it requests preview-intent content or a preview variant
- **THEN** the result is treated as runtime preview data

#### Scenario: Export orchestration requests source
- **WHEN** export orchestration needs a media, model, document, or generated asset input
- **THEN** it requests final-export source content
- **THEN** it does not consume the preview orchestration's runtime URL, preview token, or derived cache artifact

### Requirement: Export-preview tests cover cache/source separation
The system SHALL include tests or architecture guardrails that prove preview cache artifacts do not become export inputs by default.

#### Scenario: Guard rejects thumbnail export input
- **WHEN** an export backend receives a thumbnail, preview, Webview URI, or cache-only reference as its sole input
- **THEN** validation fails or the resolver returns missing-source

#### Scenario: Guard allows explicit draft proxy input
- **WHEN** an export request explicitly uses draft/proxy quality mode
- **THEN** validation allows proxy-backed input
- **THEN** diagnostics record that the export intentionally used proxy media
