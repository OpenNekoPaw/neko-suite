## ADDED Requirements

### Requirement: Facade Service Handles Use Traits
The engine kernel facade SHALL expose host-facing service handles through service traits instead of concrete implementation structs.

#### Scenario: KernelServices returns trait handles
- **WHEN** host-api obtains the default kernel service graph
- **THEN** controller-facing fields are typed as `Arc<dyn I*Service>` or optional equivalents
- **THEN** concrete service structs remain factory-local implementation details

#### Scenario: Concrete services remain constructible internally
- **WHEN** `ServiceFactory` creates the default service graph
- **THEN** it may instantiate concrete services inside the factory
- **THEN** it returns trait-object handles from `KernelServices`

### Requirement: Host Controllers Depend On Service Contracts
Host controllers SHALL depend on service trait contracts for injected kernel services.

#### Scenario: Controller injection avoids concrete kernel services
- **WHEN** a host controller stores a kernel service dependency
- **THEN** the field and constructor parameter use a service trait object when the trait covers the required behavior
- **THEN** the controller does not require concrete implementation types solely to call service behavior

#### Scenario: Tests can inject factory services or fakes
- **WHEN** host tests need controller dependencies
- **THEN** they can use `ServiceFactory` trait handles or explicit fake implementations
- **THEN** direct concrete service construction remains outside production host wiring

### Requirement: Facade Abstraction Regression Tests
The engine SHALL protect the trait-object facade boundary with architecture tests.

#### Scenario: KernelServices concrete handle regression is detected
- **WHEN** architecture tests inspect `engine-kernel/src/facade.rs`
- **THEN** they fail if `KernelServices` exposes concrete kernel service handles for controller-facing fields

#### Scenario: Host controller concrete handle regression is detected
- **WHEN** architecture tests inspect host-api controller sources
- **THEN** they fail if controller fields or constructors use concrete kernel service handles where service traits are available

### Requirement: Kernel Dead-Code Guardrail Remains Active
The engine kernel SHALL avoid crate-wide dead-code suppression after facade abstraction so new unused implementation code remains visible during review.

#### Scenario: Planned scaffolding uses targeted annotations
- **WHEN** kernel code is intentionally retained for a planned migration path
- **THEN** it uses a local `#[allow(dead_code)]` or module-scoped allow with a TODO describing the follow-up
- **THEN** the kernel does not restore a broad crate-level `#[allow(dead_code, unused_imports)]`

#### Scenario: Kernel self-warning count stays zero
- **WHEN** `cargo check -p neko-engine-kernel --lib --no-default-features` runs
- **THEN** `neko-engine-kernel` itself does not emit dead-code or unused-import warnings
- **THEN** pre-existing warnings in sibling runtime crates may remain tracked separately
