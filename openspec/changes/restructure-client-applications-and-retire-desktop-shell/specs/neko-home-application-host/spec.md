## ADDED Requirements

### Requirement: Home is the multi-session Agent control surface
`apps/neko-home` SHALL provide a Codex-style standalone Electron experience for creating, selecting, resuming, queueing, cancelling, observing, and recovering multiple Agent sessions. Home MUST NOT require a project editor instance.

#### Scenario: Multiple sessions are active
- **WHEN** the user creates or resumes more than one Agent session
- **THEN** each session MUST have explicit session and runtime identity
- **AND** its mutable configuration, message queue, tasks, logs, async work, and resource handles MUST remain instance-scoped

#### Scenario: The selected session changes
- **WHEN** the user switches the visible session
- **THEN** Home MUST change only the selected UI projection
- **AND** background sessions MUST retain their own state and lifecycle without active-session fallback

#### Scenario: A stale operation arrives
- **WHEN** a queue, cancel, resume, task, or message operation carries a missing, stale, or mismatched session identity
- **THEN** Home MUST return a typed fail-visible diagnostic
- **AND** it MUST NOT route the operation to the currently selected session

### Requirement: Home manages AIGC creation lifecycle
Home SHALL project and manage AIGC creation requests, asynchronous generation tasks, progress, diagnostics, generated outputs, provenance, validation state, retry/cancel controls, and explicit promotion or professional-tool handoff through owning package contracts.

#### Scenario: A creation task is running
- **WHEN** an Agent or user starts an image, video, audio, scene, or other supported generation
- **THEN** Home MUST show stable Task/Run identity, owning capability/provider, status, progress, and diagnostics
- **AND** task lifecycle MUST remain available independently of the currently selected Agent session

#### Scenario: Generated output completes
- **WHEN** a generation task produces an output
- **THEN** Home MUST project stable Resource/Artifact identity, provenance, validation, and available owning-package actions
- **AND** it MUST NOT treat cache paths, preview URLs, or presentation fields as durable AssetLibrary identity

#### Scenario: Precise editing is requested
- **WHEN** a generated output requires professional timeline, canvas, scene, code, or media editing
- **THEN** Home MUST issue a stable-identity handoff to Neko for VSCode or another registered professional tool
- **AND** it MUST NOT recreate the retired Desktop editor shell

### Requirement: Home composes public owners
Home SHALL consume Agent runtime, task, generated-output, asset, resource, content, Engine Core, and host capabilities through documented public package entries. It MUST NOT define parallel provider, cache, project-file, AgentSession, media-generation, or domain editor implementations.

#### Scenario: A required capability is unavailable
- **WHEN** Home requests an unregistered Agent, Engine, generation, resource, or host capability
- **THEN** the request MUST fail with a typed visible diagnostic
- **AND** it MUST NOT fall back to Desktop fixtures, empty success, or a retired implementation

### Requirement: Home preserves user-owned state
Moving standalone composition to Home SHALL preserve or explicitly migrate user settings, conversations, session/task metadata, project registry entries, credentials, trust state, installed packages, and generated artifacts. Rebuildable projections and caches MUST remain distinguishable from durable identity.

#### Scenario: Existing state is opened after migration
- **WHEN** Home starts with supported pre-migration standalone state
- **THEN** each inventoried durable category MUST be reused or migrated according to its declared policy
- **AND** no valuable user state may be silently deleted or replaced by empty successful state

#### Scenario: Storage identity is unsupported
- **WHEN** Home encounters an unknown storage schema, owner, or application identity
- **THEN** Home MUST report a fail-closed diagnostic
- **AND** it MUST not overwrite the existing state

### Requirement: Home has authoritative Electron acceptance
Home SHALL own real Electron scenarios for startup/restart, typed IPC, multi-session isolation and switching, queue/cancel/resume, background task projection, AIGC output/provenance, Engine diagnostics, professional-tool handoff, and durable-state preservation.

#### Scenario: Home functional acceptance runs
- **WHEN** the Home suite executes
- **THEN** it MUST launch `apps/neko-home`
- **AND** it MUST prove canonical handlers and instance identities were used
- **AND** it MUST reject runtime errors, active-session fallback, unknown successful IPC, and retired Desktop participation
