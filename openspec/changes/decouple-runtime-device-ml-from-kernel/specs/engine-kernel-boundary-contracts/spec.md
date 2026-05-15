## ADDED Requirements

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
