## MODIFIED Requirements

### Requirement: Host Transport Uses Kernel Contracts For Runtime DTOs
Host transport crates SHALL consume engine runtime DTOs through explicit `engine-kernel::contracts` re-exports when those DTOs are part of engine API payloads.

#### Scenario: Host HTTP scene control uses contracts scene module
- **WHEN** `host-http` scene control or scene modeling routes need scene command, delta, topology, or brush patch DTOs
- **THEN** imports resolve through `neko_engine_kernel::contracts::scene`
- **THEN** `host-http` does not depend directly on `neko-runtime-scene`

#### Scenario: Scene contract surface is explicit
- **WHEN** a host transport route needs an additional runtime-scene DTO
- **THEN** the DTO is explicitly re-exported from `contracts::scene`
- **THEN** architecture tests reject direct host-http imports from `neko_runtime_scene`

#### Scenario: Runtime scene remains below kernel
- **WHEN** kernel contracts re-export scene DTOs
- **THEN** runtime-scene does not gain a dependency on engine-kernel or host crates
- **THEN** the dependency direction remains runtime-scene -> engine-kernel -> host
