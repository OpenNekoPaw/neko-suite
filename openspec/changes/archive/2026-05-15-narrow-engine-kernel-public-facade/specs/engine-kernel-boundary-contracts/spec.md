## ADDED Requirements

### Requirement: Host-Facing Boundary Uses Facade
The engine SHALL extend kernel boundary enforcement to host-facing callers by requiring host crates to use facade or contract paths for engine access.

#### Scenario: Host avoids kernel internals
- **WHEN** host-api, host-http, or host-napi needs kernel services or engine capabilities
- **THEN** it imports approved facade or contract modules
- **THEN** it does not import kernel implementation modules solely for construction, wiring, or access to shared DTOs

#### Scenario: Kernel compatibility is temporary and explicit
- **WHEN** a legacy public path remains available for compatibility
- **THEN** it is documented as compatibility surface
- **THEN** it has an explicit migration path toward facade or contract imports

### Requirement: Kernel Public Surface Regression Protection
The engine SHALL protect the narrowed kernel public surface with architecture tests.

#### Scenario: Top-level public module regression is detected
- **WHEN** a new top-level `pub mod` is added to `engine-kernel`
- **THEN** architecture checks fail unless the module is added to the approved public surface allowlist

#### Scenario: Broad implementation re-export regression is detected
- **WHEN** a kernel compatibility module attempts to re-export an implementation crate with a glob
- **THEN** architecture checks fail
- **THEN** compatibility exports must be explicit and reviewed
