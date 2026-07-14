## ADDED Requirements

### Requirement: Desktop acceptance launches the real AppHost
Desktop functional acceptance SHALL start the built Electron Desktop AppHost and operate its real Workbench and package Webview surfaces.

#### Scenario: Desktop functional scenario starts
- **WHEN** a Desktop scenario runs
- **THEN** the runner MUST launch the actual Electron main, preload, and renderer bundles with an isolated workspace and user state
- **AND** static bundle and asset existence checks alone MUST remain build smoke rather than functional acceptance.

### Requirement: Desktop scenarios validate interaction and persistence
Desktop scenarios SHALL verify user interaction, host IPC, project persistence, package Webview projection, and restart recovery through public Desktop boundaries.

#### Scenario: User edits and restarts Desktop
- **WHEN** a user opens a project, edits it through the owning package surface, saves, closes, and restarts Desktop
- **THEN** the scenario MUST assert the saved durable project state and restored UI projection
- **AND** it MUST NOT inject the restored state directly into the renderer store.

### Requirement: Desktop scenarios validate Engine and host-private behavior
Desktop functional acceptance SHALL distinguish Engine-backed behavior from Desktop host-private capability diagnostics.

#### Scenario: Engine is available
- **WHEN** a Desktop workflow requires the local Engine and the scenario declares it as a prerequisite
- **THEN** the runner MUST start or connect to the real Engine boundary and assert the expected observable result.

#### Scenario: Host-private capability is unavailable
- **WHEN** a package action is not supported by Desktop
- **THEN** the scenario MUST assert a visible typed unavailable diagnostic
- **AND** Desktop MUST NOT silently no-op or simulate the VS Code-only behavior.

### Requirement: Desktop runtime errors and evidence are gated
Desktop scenarios SHALL collect renderer exceptions, preload/main errors, IPC failures, resource failures, logs, DOM evidence, and screenshots using the shared functional report semantics.

#### Scenario: Desktop renderer throws
- **WHEN** the renderer, preload, main process, package Webview, or IPC boundary produces an unexpected error
- **THEN** the scenario MUST fail with the owning process and evidence location identified.
