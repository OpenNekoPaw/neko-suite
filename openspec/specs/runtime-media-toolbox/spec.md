# runtime-media-toolbox Specification

## Purpose
TBD - created by archiving change shrink-engine-kernel-domain-helpers. Update Purpose after archive.
## Requirements
### Requirement: Runtime Media Owns CPU Media Toolbox
`runtime-media` SHALL own CPU-only media probe, diff, subtitle extraction, JPEG encoding, sidecar, and project parsing utilities that do not require GPU, codec pools, kernel service state, or host transport.

#### Scenario: Host media diff uses runtime toolbox through compatibility path
- **WHEN** host-api requests image, audio, video, model, canvas, or timeline diff through existing controller actions
- **THEN** the callable implementation comes from `runtime-media`
- **THEN** existing `neko_engine_kernel::contracts::media` imports remain source-compatible as compatibility re-exports

#### Scenario: Runtime media remains below kernel
- **WHEN** dependency checks inspect `runtime-media`
- **THEN** it does not depend on `neko-engine-kernel`, host crates, GPU crates, renderer crates, or kernel service modules

### Requirement: Runtime Media Provides Timeline Diff Inputs
`runtime-media` SHALL provide JVI/NKV project parsing DTOs and loaders required by timeline diff so timeline diff can run without importing kernel internals.

#### Scenario: Timeline diff parses project data without kernel
- **WHEN** timeline diff compares two JVI/NKV project files
- **THEN** project DTOs, loaders, and converters are resolved from `runtime-media`
- **THEN** no `crate::jvi` or `neko_engine_kernel::jvi` dependency is required

#### Scenario: JVI parser remains file-format scoped
- **WHEN** JVI DTOs are moved out of kernel
- **THEN** they remain in `runtime-media` unless a separate cross-crate contract requires promotion to `engine-types`

### Requirement: Runtime Media Preserves Existing Media API Semantics
Moving media helpers SHALL preserve existing function names, result structures, serde shapes, and error behavior for host-facing media diff and probe workflows.

#### Scenario: Existing diff response shape is preserved
- **WHEN** a caller invokes `diff_media` for a supported media category
- **THEN** returned `DiffResult`, `ContentDiff`, and category-specific payloads serialize with the same field names as before migration

#### Scenario: Unsupported media category remains explicit
- **WHEN** a caller invokes media diff for an unsupported or invalid category/path
- **THEN** the function returns an explicit error instead of panicking or silently falling back

### Requirement: Runtime Media Architecture Guard
The project SHALL include architecture checks preventing CPU media toolbox implementation modules from returning to `engine-kernel`.

#### Scenario: Kernel media implementation directory is rejected
- **WHEN** a source directory named `engine-kernel/src/media_service` is present after migration
- **THEN** architecture tests fail unless the directory contains only an explicitly documented compatibility shim

#### Scenario: Runtime media forbidden dependencies are rejected
- **WHEN** `runtime-media/Cargo.toml` or runtime-media source imports forbidden engine orchestration crates
- **THEN** architecture tests fail

