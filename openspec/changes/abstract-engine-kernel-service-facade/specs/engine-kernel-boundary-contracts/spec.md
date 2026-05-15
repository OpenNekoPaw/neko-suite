## MODIFIED Requirements

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
