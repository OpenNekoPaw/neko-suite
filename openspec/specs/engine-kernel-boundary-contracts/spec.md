# engine-kernel-boundary-contracts Specification

## Purpose
TBD - created by archiving change decouple-engine-kernel-boundaries. Update Purpose after archive.
## Requirements
### Requirement: Pure Pipeline Output Contracts
The engine SHALL define pipeline output DTOs in `neko-engine-types` when those DTOs are shared across GPU producers, services, preview, export, and host-facing compatibility layers.

#### Scenario: GPU renderer imports shared output DTOs
- **WHEN** `engine-kernel/src/gpu` produces pipeline video output
- **THEN** it imports output DTOs from `neko_engine_types` or a non-service GPU-local adapter, not from `crate::services::pipeline_sink`

#### Scenario: Frame format is reused
- **WHEN** `VideoRawFrame` or `VideoPreviewFrame` stores pixel format metadata
- **THEN** it uses the existing `FrameFormat` type from `neko-engine-types`

### Requirement: Engine Types Remain Implementation-Free
`neko-engine-types` SHALL remain a pure contract crate for this boundary and MUST NOT depend on GPU, codec, runtime, host, or kernel implementation crates.

#### Scenario: Forbidden dependencies are checked
- **WHEN** the boundary checks run
- **THEN** `neko-engine-types` has no dependency on `wgpu`, FFmpeg crates, tokio runtime features, `neko-engine-kernel`, host crates, or runtime side-effect implementations

#### Scenario: Readback implementation stays in kernel
- **WHEN** a GPU frame needs terminal readback
- **THEN** `GpuReadbackTarget`, `GpuContext`, `wgpu::Texture`, and readback conversion helpers remain outside `neko-engine-types`

### Requirement: GPU Layer Does Not Depend On Services
The engine SHALL prevent the GPU infrastructure and renderer layer from importing service-layer modules.

#### Scenario: Architecture check detects GPU to service imports
- **WHEN** a source file under `engine-kernel/src/gpu` imports `crate::services`
- **THEN** the architecture check fails

#### Scenario: GPU output remains constructible
- **WHEN** panoramic or puppet renderers produce a `VideoOutput::GpuFrame`
- **THEN** the output can be constructed without referencing `engine-kernel::services`

### Requirement: Domain Layer Does Not Depend On GPU Implementation
The engine SHALL prevent domain model modules from depending directly on GPU implementation modules.

#### Scenario: Architecture check detects domain to GPU imports
- **WHEN** a source file under `engine-kernel/src/domain` imports `crate::gpu`
- **THEN** the architecture check fails

#### Scenario: Shared render-facing enums use contract types
- **WHEN** domain and GPU code need a shared concept such as blend mode
- **THEN** the shared contract lives in `neko-engine-types` or a dedicated pure contract module rather than duplicating implementation enums

### Requirement: GPU Output Handle Lifetime Semantics
`GpuOutputHandle` SHALL be documented as a platform resource identifier and MUST NOT be treated as safe ownership of the underlying GPU resource.

#### Scenario: Safe sink path holds a lease
- **WHEN** a sink submits a GPU frame to an encoder or worker
- **THEN** the safe path keeps a `GpuFrameLease` or equivalent RAII token alive for the duration of resource use

#### Scenario: Bare handle boundary is explicit
- **WHEN** kernel code extracts a bare platform handle such as IOSurface `usize`
- **THEN** that boundary is documented as lifetime-sensitive and is either protected by an in-flight lease or tracked as a follow-up fix

### Requirement: Pipeline Sink Compatibility
The engine SHALL preserve existing PipelineSink behavior while relocating pure output DTOs.

#### Scenario: Unsupported output remains rejected
- **WHEN** a sink receives an output variant it does not accept
- **THEN** it returns an unsupported output error instead of silently ignoring the item

#### Scenario: Host compatibility imports continue
- **WHEN** host-api or existing service code imports PipelineSink-related DTOs through the previous kernel compatibility path
- **THEN** those imports continue to compile during P0 migration

### Requirement: Sink Lifecycle Regression Protection
The engine SHALL protect sink lifecycle behavior from regressions during boundary refactoring.

#### Scenario: MuxerSink flush close semantics are tested
- **WHEN** MuxerSink receives `flush()` and `close()` calls in tests
- **THEN** the test either verifies distinct drain-and-continue versus terminal semantics or documents the current terminal flush behavior until it is fixed

#### Scenario: StreamSink close handles encoder buffers
- **WHEN** StreamSink is closed after frames have been submitted
- **THEN** tests verify that close behavior flushes or preserves encoder buffered frames according to the documented sink contract

### Requirement: Zero-Copy Hot Path Is Preserved
The engine SHALL preserve zero-copy GPU hot path behavior when pipeline output contracts move.

#### Scenario: Realtime GPU path avoids CPU fallback
- **WHEN** a realtime timeline, scene, puppet, or preview GPU stream uses pipeline output DTOs from `neko-engine-types`
- **THEN** the path still uses GPU-resident handles and does not introduce GPU-to-CPU readback as a fallback

#### Scenario: Unsupported zero-copy remains explicit
- **WHEN** a platform cannot provide required native GPU handle interop for a realtime path
- **THEN** the engine returns `UnsupportedCapability` instead of falling back to CPU readback and encode

### Requirement: Host-Facing Boundary Uses Facade
The engine SHALL extend kernel boundary enforcement to host-facing callers by requiring host crates to use facade or contract paths for engine access and service trait contracts for injected service behavior.

#### Scenario: Host avoids kernel internals
- **WHEN** host-api, host-http, or host-napi needs kernel services or engine capabilities
- **THEN** it imports approved facade or contract modules
- **THEN** it does not import kernel implementation modules solely for construction, wiring, access to shared DTOs, or service behavior

#### Scenario: Host service injection uses traits
- **WHEN** host-api receives service handles from `KernelServices`
- **THEN** controller-facing service dependencies use service trait objects where traits cover the required behavior
- **THEN** concrete service types are not the host-facing dependency contract

#### Scenario: Kernel compatibility is temporary and explicit
- **WHEN** a legacy public path remains available for compatibility
- **THEN** it is documented as compatibility surface
- **THEN** it has an explicit migration path toward facade or contract imports

#### Scenario: Exposed operation payload fields are enforced
- **WHEN** a timeline operation payload includes both an identifier and positional data
- **THEN** kernel domain code validates that the identifier matches the item at the supplied position before mutating state
- **THEN** mismatch leaves the original order unchanged and returns a typed kernel error

### Requirement: Kernel Public Surface Regression Protection
The engine SHALL protect the narrowed kernel public surface with architecture tests.

#### Scenario: Top-level public module regression is detected
- **WHEN** a new top-level `pub mod` is added to `engine-kernel`
- **THEN** architecture checks fail unless the module is added to the approved public surface allowlist

#### Scenario: Broad implementation re-export regression is detected
- **WHEN** a kernel compatibility module attempts to re-export an implementation crate with a glob
- **THEN** architecture checks fail
- **THEN** compatibility exports must be explicit and reviewed

### Requirement: Runtime Layers Do Not Depend Upward On Kernel
The engine boundary model SHALL prevent lower runtime crates from depending on `engine-kernel` orchestration.

#### Scenario: Runtime-device and runtime-ml avoid kernel dependency
- **WHEN** boundary checks inspect `runtime-device` and `runtime-ml`
- **THEN** those crates do not depend on `neko-engine-kernel`
- **THEN** shared runtime contracts are imported from lower-layer contract modules

#### Scenario: Kernel remains the adapter layer
- **WHEN** kernel services consume device or ML runtime capabilities
- **THEN** kernel imports the runtime crates or their contracts
- **THEN** the runtime crates do not import kernel back

