## ADDED Requirements

### Requirement: Kernel Facade Entry Point
The engine SHALL expose a stable host-facing kernel facade for service construction, lifecycle, and access.

#### Scenario: Host initializes through facade
- **WHEN** host-api, host-http, or host-napi initializes engine services
- **THEN** it uses `EngineKernelFacade`, `ServiceFactory`, `KernelServices`, or an approved equivalent facade entry point
- **THEN** it does not construct the default service graph by manually wiring concrete kernel services in host code

#### Scenario: Facade owns service graph construction
- **WHEN** the default engine service graph is created
- **THEN** GPU context, task service, timeline service, preview/export services, and related backend adapters are constructed through the facade or factory boundary
- **THEN** host layers receive typed service handles or contract interfaces

### Requirement: Host Imports Use Approved Public Paths
Host crates SHALL depend on kernel facade and contract paths instead of internal implementation modules.

#### Scenario: Host avoids internal modules
- **WHEN** architecture checks inspect host-api, host-http, and host-napi source files
- **THEN** they fail on direct imports from internal kernel modules such as `gpu`, `encoder`, `decoder`, `audio`, `media_service`, `jvi`, `export`, `preview`, or service implementation modules unless the import is on an explicit allowlist

#### Scenario: Host uses contract re-exports
- **WHEN** host code needs domain DTOs, service traits, export configs, preview configs, GPU info, or media helper contracts
- **THEN** it imports them from approved facade or contract re-export modules
- **THEN** it does not import implementation modules solely to reach shared types

### Requirement: Concrete Service Constructors Are Not Host API
Host crates SHALL NOT call concrete kernel service constructors for production service graph wiring.

#### Scenario: Constructor guardrail detects direct service construction
- **WHEN** architecture checks inspect host crates
- **THEN** they fail on production call sites such as `TaskService::new()`, `TimelineService::new(...)`, `VideoService::new(...)`, or equivalent concrete service constructors outside approved test helpers

#### Scenario: Tests use factory or fakes
- **WHEN** host tests need service instances
- **THEN** they use facade test helpers, service factory helpers, or explicit fakes
- **THEN** direct constructor exceptions are documented and scoped to tests

### Requirement: Kernel Public Surface Is Allowlisted
The engine SHALL define and enforce an allowlist for `engine-kernel` top-level public modules and re-exports.

#### Scenario: Public module allowlist is enforced
- **WHEN** architecture checks inspect `engine-kernel/src/lib.rs`
- **THEN** top-level `pub mod` declarations are limited to approved public contract, facade, error, telemetry, and compatibility modules
- **THEN** implementation modules are private or `pub(crate)` once callers migrate

#### Scenario: Compatibility modules are explicit
- **WHEN** a compatibility module remains public during migration
- **THEN** it documents its compatibility purpose
- **THEN** it exposes explicit names rather than broad implementation access

### Requirement: GPU Glob Re-export Is Removed
The kernel SHALL NOT expose reusable GPU infrastructure through a broad `neko_engine_gpu::*` glob re-export.

#### Scenario: GPU compatibility exports are explicit
- **WHEN** `engine-kernel::gpu` remains available for compatibility
- **THEN** it re-exports only explicit allowlisted GPU and renderer names
- **THEN** it does not use `pub use neko_engine_gpu::*`

#### Scenario: Host uses facade or direct crate contracts
- **WHEN** host code needs stable GPU information or capability DTOs
- **THEN** it imports them from facade/contract paths or approved direct infrastructure crates
- **THEN** it does not rely on kernel glob re-exports to discover GPU internals

### Requirement: Transport And Persisted Contracts Remain Stable
Kernel facade narrowing SHALL NOT change external transport or persisted data contracts.

#### Scenario: Existing transports remain compatible
- **WHEN** facade migration is complete
- **THEN** existing HTTP routes, WebSocket messages, N-API payloads, TypeScript client calls, and persisted project formats remain compatible

#### Scenario: Error mapping remains compatible
- **WHEN** kernel errors cross into host-api error handling
- **THEN** existing user-facing error categories and unsupported-capability behavior remain compatible

### Requirement: Facade Validation Coverage
The facade change SHALL include tests and architecture guardrails that prove host/kernel boundaries are enforced.

#### Scenario: Architecture tests cover host import boundaries
- **WHEN** validation runs for this change
- **THEN** tests fail on banned host imports from kernel internal modules
- **THEN** tests fail on direct production service constructor calls in host crates

#### Scenario: Public surface tests cover kernel exports
- **WHEN** validation runs for this change
- **THEN** tests fail on unapproved top-level `pub mod` declarations
- **THEN** tests fail on `pub use neko_engine_gpu::*` in kernel compatibility modules
