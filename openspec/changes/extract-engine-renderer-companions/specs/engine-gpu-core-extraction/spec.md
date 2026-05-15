## MODIFIED Requirements

### Requirement: GPU Core Crate Boundary
The engine SHALL provide a dedicated `neko-engine-gpu` crate for extraction-ready GPU infrastructure implementation while keeping domain-specific renderers in companion crates.

#### Scenario: GPU crate owns approved GPU core implementation
- **WHEN** GPU core extraction is complete
- **THEN** preparation-approved GPU context, resource, HAL, platform interop, readback, compositor, effect, and budget modules live under `packages/neko-engine/packages/engine-gpu`
- **THEN** `engine-kernel` consumes those capabilities instead of owning their implementation files

#### Scenario: Renderer companions remain outside GPU core
- **WHEN** extraction classifies scene, puppet, or panoramic renderer modules
- **THEN** they live outside `engine-gpu` in renderer companion crates once P2 extraction is complete
- **THEN** `engine-gpu` does not import scene renderer, puppet renderer, panoramic renderer, preview renderer companion, or export renderer companion internals

#### Scenario: Kernel no longer owns extracted renderer implementation
- **WHEN** a renderer module has moved to a companion crate
- **THEN** `engine-kernel` may keep an explicit compatibility shim for existing imports
- **THEN** `engine-kernel` does not keep a second copy of the moved renderer implementation
