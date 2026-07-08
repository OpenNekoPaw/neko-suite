## ADDED Requirements

### Requirement: Desktop scanner is wrapped as provider adapter

Desktop SHALL expose its current workspace scanner through a ResourceSourceProvider-compatible adapter. The adapter MUST preserve existing desktop tree behavior while marking the provider as temporary bootstrap.

#### Scenario: Desktop starts with workspace scanner

- **WHEN** Desktop creates a workspace file tree snapshot
- **THEN** it MUST be able to create a provider-compatible snapshot for the same tree
- **AND** the provider kind MUST be `bootstrap-temporary`

#### Scenario: Provider adapter returns diagnostics

- **WHEN** the workspace tree is truncated or provider validation fails
- **THEN** the adapter MUST expose diagnostics instead of silently hiding the provider state

### Requirement: Desktop does not own canonical resource semantics

Desktop SHALL treat the workspace scanner provider as a host adapter boundary. New resource sources for Assets, Market, Skills, Search, Generations, and Entity facts MUST be contributed by owning packages or plugin providers in follow-up work.

#### Scenario: New resource source is needed

- **WHEN** a package needs to add a new resource source to Desktop
- **THEN** it MUST implement the shared provider contract instead of adding a desktop-only parser as the canonical path
