# engine-gpu-core-extraction-prep Specification

## Purpose
TBD - created by archiving change prepare-engine-gpu-core-extraction. Update Purpose after archive.
## Requirements
### Requirement: GPU Module Classification
The engine SHALL classify current GPU modules into explicit extraction groups before creating an `engine-gpu` crate.

#### Scenario: Extraction groups are documented
- **WHEN** preparation is complete
- **THEN** GPU core/resource/HAL modules, GPU pipeline/effect modules, GPU budget modules, and renderer companion modules are identified
- **THEN** renderer companion modules are not treated as required GPU core dependencies

#### Scenario: No engine-gpu crate is created
- **WHEN** this preparation change is complete
- **THEN** the workspace does not include a new `packages/engine-gpu` member
- **THEN** runtime behavior remains within the current kernel crate

### Requirement: Extraction-Ready GPU Modules Avoid Orchestration Dependencies
GPU modules marked as extraction-ready SHALL NOT depend on kernel orchestration modules.

#### Scenario: Core GPU modules avoid services and export
- **WHEN** architecture checks inspect extraction-ready GPU core modules
- **THEN** they fail on imports of kernel services, export orchestration, preview orchestration, host crates, or domain service implementations

#### Scenario: Renderer companion exceptions are explicit
- **WHEN** a renderer module still depends on domain or service-facing concepts
- **THEN** it is documented as a renderer companion exception
- **THEN** it is excluded from the first GPU core extraction

### Requirement: Future Re-Export Compatibility Is Prepared
The kernel SHALL retain a module shape that can later re-export GPU core types from `engine-gpu` without broad host import churn.

#### Scenario: Kernel GPU compatibility path remains stable
- **WHEN** callers import current public GPU items through `neko_engine_kernel::gpu`
- **THEN** those imports continue to compile after preparation
- **THEN** any renamed internal modules have compatibility aliases or documented migration paths

### Requirement: GPU Preparation Preserves Zero-Copy Behavior
GPU boundary preparation SHALL NOT change zero-copy resource behavior or introduce CPU fallback.

#### Scenario: GPU handle outputs remain GPU-resident
- **WHEN** renderers and export/preview paths produce GPU output frames
- **THEN** the output contract remains GPU handle based where supported
- **THEN** readback remains restricted to terminal/snapshot paths

#### Scenario: Unsupported interop remains explicit
- **WHEN** a platform cannot import or export the required native GPU handle
- **THEN** the engine returns an explicit unsupported-capability error
- **THEN** it does not silently perform CPU readback fallback

### Requirement: GPU Preparation Validation Coverage
The preparation SHALL include tests and guardrails proving that behavior and boundaries are preserved.

#### Scenario: Architecture checks pass
- **WHEN** validation runs for this change
- **THEN** architecture checks pass for extraction-ready GPU modules and documented renderer exceptions

#### Scenario: Existing GPU behavior remains covered
- **WHEN** validation runs for this change
- **THEN** targeted GPU, export, preview, stream sink, muxer sink, snapshot sink, scene renderer, puppet renderer, and panoramic renderer tests pass
