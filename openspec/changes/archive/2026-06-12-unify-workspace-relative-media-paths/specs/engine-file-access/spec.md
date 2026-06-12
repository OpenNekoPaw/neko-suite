## ADDED Requirements

### Requirement: Engine file access consumes resolved media sources
Engine-facing media, document, model, puppet, subtitle, and agent attachment operations SHALL consume existing local files, registered file tokens, remote URLs supported by the operation, or explicit source references that have been resolved by the host boundary.

#### Scenario: Relative workspace path is rejected at engine boundary
- **WHEN** an engine-facing media operation receives `cases/test.mp4` without a prior host resolution or file registration step
- **THEN** the supported host flow rejects the request before calling engine
- **AND** it reports that workspace-relative paths require source document context.

#### Scenario: Variable path is expanded before registration
- **WHEN** a host operation needs to register `${WORKSPACE}/cases/test.mp4`
- **THEN** it expands the variable through the source document's workspace-relative context
- **AND** file access registration receives the resulting existing local file path.

#### Scenario: Engine token remains runtime-only
- **WHEN** a resolved media file is registered for playback or range reads
- **THEN** persisted project data stores the durable media source reference
- **AND** it does not store the engine token or token URL as durable source identity.

### Requirement: Engine clients do not infer workspace roots
`neko-client` and engine compatibility helpers SHALL NOT silently anchor plain relative paths to process current working directory, repository root, or first VSCode workspace root.

#### Scenario: Host provides resolver context
- **WHEN** a package uses `neko-client` for a document-scoped media operation
- **THEN** the package resolves the source path using the document-bound host resolver before invoking engine-facing methods
- **AND** `neko-client` does not choose the workspace root on its own.

#### Scenario: Missing host context is observable
- **WHEN** a caller attempts engine playback from a plain relative path without source document context
- **THEN** the operation returns an actionable unresolved-source error
- **AND** no malformed absolute path such as `/cases/test.mp4` or `/../cases/test.mp4` is sent to engine.
