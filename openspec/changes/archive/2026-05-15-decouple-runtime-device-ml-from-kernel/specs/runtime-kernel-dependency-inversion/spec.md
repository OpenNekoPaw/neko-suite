## ADDED Requirements

### Requirement: Runtime Crates Do Not Depend On Kernel
`runtime-device` and `runtime-ml` SHALL NOT depend on `neko-engine-kernel` for service traits, errors, DTOs, or helper APIs.

#### Scenario: Cargo dependency inversion is removed
- **WHEN** architecture checks inspect `runtime-device/Cargo.toml` and `runtime-ml/Cargo.toml`
- **THEN** neither crate declares a dependency on `neko-engine-kernel`
- **THEN** the runtime crates still compile independently with their supported feature sets

#### Scenario: Source imports avoid kernel
- **WHEN** architecture checks inspect source files under `runtime-device/src` and `runtime-ml/src`
- **THEN** they fail on imports from `neko_engine_kernel` or kernel compatibility modules
- **THEN** runtime code imports shared contracts from `neko_engine_types` or runtime-local contract modules

### Requirement: Runtime Contracts Live Below Kernel
Shared device and ML contracts SHALL live in implementation-free lower-layer modules that can be used without kernel orchestration.

#### Scenario: Pure contracts are lower-layer
- **WHEN** device or ML service traits, request DTOs, response DTOs, or boundary errors are needed by both runtime implementations and kernel adapters
- **THEN** they live in `neko-engine-types` or a runtime crate public contract module
- **THEN** they do not require GPU, codec, host, kernel, ONNX, cpal, gilrs, midir, or FFmpeg implementation dependencies unless they are runtime-local implementation contracts

#### Scenario: Implementation stays in runtime crates
- **WHEN** a device or ML capability requires hardware access, model loading, ONNX execution, audio capture, camera capture, MIDI, gamepad polling, or file decoding
- **THEN** that implementation remains in the owning runtime crate
- **THEN** `engine-types` does not gain implementation dependencies to host that behavior

### Requirement: Kernel Adapts Runtime Errors At The Boundary
The kernel SHALL remain responsible for mapping runtime-device and runtime-ml failures into existing kernel-facing error categories.

#### Scenario: Runtime error crosses into kernel
- **WHEN** a runtime-device or runtime-ml operation fails inside a kernel service or facade adapter
- **THEN** the kernel maps the lower-level error into the existing kernel error model
- **THEN** host-facing error categories and unsupported-capability behavior remain compatible

#### Scenario: Runtime test avoids kernel
- **WHEN** runtime-device or runtime-ml unit tests instantiate runtime services directly
- **THEN** they do so without constructing `EngineKernelFacade`, `KernelServices`, or concrete kernel service implementations

### Requirement: Host Access Remains Facade-Oriented
The dependency inversion SHALL NOT cause host production code to bypass the kernel facade for default service graph wiring.

#### Scenario: Host receives facade services
- **WHEN** host-api initializes default engine services
- **THEN** it receives device and ML service access through approved facade or contract paths
- **THEN** production host code does not manually wire runtime-device/runtime-ml implementations as a replacement for the kernel service factory

#### Scenario: Transport behavior remains stable
- **WHEN** the runtime dependency inversion is complete
- **THEN** existing HTTP routes, WebSocket messages, N-API payloads, TypeScript client calls, and persisted project formats remain compatible
