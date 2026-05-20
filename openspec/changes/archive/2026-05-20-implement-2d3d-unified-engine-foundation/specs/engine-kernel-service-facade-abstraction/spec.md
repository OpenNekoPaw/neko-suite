## MODIFIED Requirements

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

#### Scenario: Export receives render service ports
- **WHEN** the kernel service graph is used to create export backends
- **THEN** scene and puppet render capabilities are passed as trait-object service ports where the traits cover the required methods
- **THEN** concrete service structs remain factory-local or explicitly documented temporary adapter details

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

#### Scenario: Export tests can inject render fakes
- **WHEN** export tests need scene or puppet render behavior
- **THEN** they can inject fake service-port implementations or backend adapters
- **THEN** they do not need to construct full scene or puppet runtime worlds for orchestration tests

### Requirement: Facade Abstraction Regression Tests
The engine SHALL protect the trait-object facade boundary with architecture tests.

#### Scenario: KernelServices concrete handle regression is detected
- **WHEN** architecture tests inspect `engine-kernel/src/facade.rs`
- **THEN** they fail if `KernelServices` exposes concrete kernel service handles for controller-facing fields

#### Scenario: Host controller concrete handle regression is detected
- **WHEN** architecture tests inspect host-api controller sources
- **THEN** they fail if controller fields or constructors use concrete kernel service handles where service traits are available

#### Scenario: Export concrete handle regression is detected
- **WHEN** architecture tests inspect export backend/factory wiring
- **THEN** they fail if production export orchestration stores concrete scene or puppet service handles where trait-object render service ports are available
