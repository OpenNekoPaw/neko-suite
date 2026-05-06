## ADDED Requirements

### Requirement: Native plugin preflight enforces governance before fetch or activation
The install runtime SHALL apply native plugin governance during preflight and activation. Plugin preflight MUST verify publisher trust eligibility, platform target compatibility, entitlement authorization, and high-sensitive permission disclosure before downloading or activating a plugin.

#### Scenario: Unverified plugin is blocked in preflight
- **WHEN** an install request targets a registry package with `type = 'plugin'` and the final manifest is not core or verified publisher eligible
- **THEN** preflight blocks installation
- **THEN** the runtime does not request a download URL or stage any plugin artifact

#### Scenario: Plugin target triple mismatch is blocked before download
- **WHEN** a plugin manifest target triple is incompatible with the current engine platform
- **THEN** preflight blocks the install or selects no artifact for download
- **THEN** the user receives an incompatible platform diagnostic

### Requirement: Workspace Trust state is read from local trust authority
The install runtime SHALL read Workspace Trust decisions from a Neko-owned local trust authority keyed by workspace fingerprint. Project-contained trust files MAY provide provenance hints, but MUST NOT be authoritative for trusted activation.

#### Scenario: Project file claims trusted
- **WHEN** an opened workspace contains a project-local trust file claiming `trusted`
- **THEN** the runtime checks the local machine trust store before treating the workspace as trusted
- **THEN** absent local trust authority results in restricted or limited behavior according to provenance

#### Scenario: User promotes workspace
- **WHEN** the user explicitly promotes a restricted workspace to trusted
- **THEN** the runtime records that decision in the local trust authority
- **THEN** subsequent activation decisions for that workspace use the local trust entry

### Requirement: Sideload installs are physically isolated from market installs
The install runtime SHALL store copied local installs under `${NEKO_HOME}/local` and persist them in a local install registry separate from market installed records. Market uninstall, cache eviction, update, entitlement, and bundle reference flows MUST NOT treat sideload assets as registry packages.

#### Scenario: Local install is copied into local root
- **WHEN** the user installs a reusable local asset by copy
- **THEN** the runtime stores it under `${NEKO_HOME}/local/<type>/...`
- **THEN** it records the asset in the local installed registry with a Local source marker

#### Scenario: Market update ignores local asset
- **WHEN** update checks run for installed packages
- **THEN** sideload assets do not appear in the Updates tab as registry updates
- **THEN** no entitlement refresh is requested for the sideload asset

#### Scenario: Bundle cannot depend on sideload content
- **WHEN** a bundle content graph references a sideload asset id or local-only source
- **THEN** the runtime rejects the bundle graph for registry installation
- **THEN** the diagnostic explains that sideload assets must be published before bundle inclusion

### Requirement: Native plugin sideload activation requires Developer Mode and trusted workspace
The install runtime SHALL allow local native plugin records only for development, and activation MUST require active Developer Mode plus a trusted workspace. Restricted and limited workspaces MUST block native plugin sideload activation.

#### Scenario: Trusted workspace with active Developer Mode can load local plugin
- **WHEN** a local native plugin is explicitly enabled, Developer Mode is active, and the workspace trust level is `trusted`
- **THEN** the runtime may pass the plugin to the engine PluginManager
- **THEN** engine-side integrity, compatibility, and loading gates still run before `dlopen`

#### Scenario: Restricted workspace blocks local plugin despite Developer Mode
- **WHEN** Developer Mode is active but the workspace trust level is `restricted`
- **THEN** local native plugins are not activated
- **THEN** the runtime reports Workspace Trust as the blocking reason

### Requirement: Shader and model sideload activation validates format and resources
The install runtime SHALL validate shader and model sideload assets before activation. Validation MUST include format parsing, compatibility checks, configured resource limits, and source warnings for non-market artifacts.

#### Scenario: Local shader binary fails validation
- **WHEN** a local shader binary cannot be validated by the configured shader validator
- **THEN** activation fails before registration with the consuming shader runtime
- **THEN** the local install record remains visible with a blocked or invalid status

#### Scenario: Local model exceeds resource policy
- **WHEN** a local model's metadata or probe result exceeds configured runtime resource limits
- **THEN** activation is blocked or requires an explicit trusted-workspace override for non-native assets
- **THEN** the UI receives a diagnostic containing the resource reason
