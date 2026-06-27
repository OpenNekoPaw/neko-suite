# agent-toml-config-authoring Specification

## Purpose
TBD - created by archiving change migrate-agent-config-to-toml. Update Purpose after archive.
## Requirements
### Requirement: TOML is the canonical Agent config authoring format

Neko Agent SHALL use `config.toml` as the canonical user-authored configuration file for user and workspace Agent configuration. User-level config SHALL be located at `~/.neko/config.toml`; workspace-level config SHALL be located at `.neko/config.toml`.

#### Scenario: User config path resolves to TOML

- **WHEN** Agent opens, creates, watches, or reports the user configuration file path
- **THEN** the path MUST be `~/.neko/config.toml`

#### Scenario: Workspace config path resolves to TOML

- **WHEN** Agent opens, creates, watches, or reports the workspace configuration file path
- **THEN** the path MUST be `.neko/config.toml`

#### Scenario: Generated default config is TOML

- **WHEN** Agent creates a default user configuration file
- **THEN** the file MUST be written as TOML
- **THEN** provider and model records MUST use TOML repeated tables or equivalent TOML-native structure rather than JSON text embedded inside TOML strings

### Requirement: TOML maps to internal runtime config objects

Neko Agent SHALL parse `config.toml` into a TOML-authored configuration contract and then convert it to the internal `UnifiedConfig` runtime object. Agent Platform, provider source resolution, conversation runtime, Webview projections, and account gateway logic SHALL consume the converted object or derived runtime maps instead of reading TOML syntax directly.

#### Scenario: Provider entry maps to runtime provider config

- **WHEN** `config.toml` contains a provider entry with TOML-friendly keys such as `connection_kind`, `protocol_profile`, and `base_url`
- **THEN** the config adapter MUST produce a `ProviderConfig` with the corresponding runtime fields such as `connectionKind`, `protocolProfile`, and `apiUrl`

#### Scenario: Model entry maps to runtime model config

- **WHEN** `config.toml` contains a model entry with TOML-friendly keys such as `provider_id` and `capabilities`
- **THEN** the config adapter MUST produce a `ModelConfig` with the corresponding runtime fields such as `providerId` and `capabilities`

#### Scenario: Runtime projection remains JSON-compatible

- **WHEN** Agent sends configuration state, provider lists, model lists, diagnostics, or account gateway state to a Webview
- **THEN** the message payload MUST remain JSON-compatible runtime data
- **THEN** the Webview MUST NOT receive TOML AST nodes or TOML parser-specific data structures

### Requirement: Legacy JSON config is not an Agent config input

Neko Agent SHALL NOT treat legacy `config.json` files as successful runtime configuration, migration input, rejection input, conflict input, or diagnostic input in the canonical Agent config path.

#### Scenario: Adjacent legacy user JSON is ignored

- **WHEN** `~/.neko/config.json` exists and `~/.neko/config.toml` does not exist
- **THEN** the canonical Agent config read result MUST be missing `~/.neko/config.toml`
- **THEN** Agent MUST NOT load the JSON file as successful explicit AI configuration for conversation runtime
- **THEN** Agent MUST NOT offer or invoke a JSON migration path

#### Scenario: Adjacent legacy workspace JSON is ignored

- **WHEN** `.neko/config.json` exists and `.neko/config.toml` does not exist
- **THEN** the canonical workspace config read result MUST be missing `.neko/config.toml`
- **THEN** Agent MUST NOT load the JSON file as successful workspace configuration

#### Scenario: JSON and TOML both exist with different content

- **WHEN** both `config.json` and `config.toml` exist in the same Agent config directory
- **THEN** Agent MUST read `config.toml`
- **THEN** Agent MUST NOT silently merge the two files
- **THEN** Agent MUST NOT choose the JSON file as a fallback if TOML is invalid

### Requirement: TOML parse and validation diagnostics are fail-visible

Neko Agent SHALL distinguish TOML syntax diagnostics from semantic configuration validation diagnostics. Syntax errors make the config file unavailable. Semantic errors MUST be scoped to config sections, providers, models, defaults, or selected runtime paths where possible.

#### Scenario: Invalid TOML blocks config read

- **WHEN** `config.toml` contains invalid TOML syntax
- **THEN** the canonical config read result MUST be a TOML parse diagnostic
- **THEN** Agent MUST NOT treat the file as missing
- **THEN** Agent MUST NOT fall back to a JSON config file or a hard-coded provider/model

#### Scenario: Unsupported config version blocks config read

- **WHEN** `config.toml` declares a schema version newer than the Agent implementation supports
- **THEN** Agent MUST return a fail-closed unsupported version diagnostic
- **THEN** Agent MUST NOT attempt best-effort loading as a lower version

#### Scenario: Duplicate provider IDs are diagnosed

- **WHEN** `config.toml` contains multiple provider entries with the same provider ID
- **THEN** Agent MUST surface a duplicate provider diagnostic
- **THEN** provider resolution MUST NOT silently choose one duplicate entry

#### Scenario: Invalid selected model blocks conversation

- **WHEN** `config.toml` selects a default chat model that is missing, disabled, mismatched with the selected provider, or unsupported for chat
- **THEN** Agent conversation runtime MUST return a visible precondition diagnostic
- **THEN** it MUST NOT select another model automatically

#### Scenario: Unselected invalid provider is scoped

- **WHEN** `config.toml` contains an invalid provider that is not selected by the current conversation or default chat configuration
- **THEN** Agent MAY project that provider as unavailable with diagnostics
- **THEN** it MUST NOT block a conversation that selects a different valid provider and model

### Requirement: Config authoring preserves existing provider source semantics

The TOML authoring format SHALL preserve existing explicit-config, account-gateway, gateway, local, and direct provider semantics. Changing the file format SHALL NOT change account gateway priority rules, OAuth secret boundaries, model capability filtering, or fail-visible selected provider/model behavior.

#### Scenario: Explicit TOML AI config has priority

- **WHEN** `config.toml` contains explicit AI provider and model configuration
- **THEN** Agent provider resolution MUST treat it as the explicit config source
- **THEN** it MUST evaluate that source before OAuth account gateway sources

#### Scenario: Non-AI TOML config does not disable account gateway

- **WHEN** `config.toml` contains only MCP, auth, UI, or other non-AI settings
- **THEN** Agent provider resolution MUST treat explicit AI config as absent
- **THEN** it MAY use the OAuth-backed Neko account gateway when an entitled account catalog is available

#### Scenario: Account gateway remains runtime-only

- **WHEN** OAuth account gateway models are available
- **THEN** Agent MUST expose them through runtime provider/model snapshots
- **THEN** it MUST NOT persist account gateway credentials or account catalog snapshots into `config.toml`

### Requirement: Programmatic config writes target TOML

Neko-managed commands that create or update Agent configuration SHALL write TOML after this migration. Programmatic writes MUST keep the generated TOML parseable and convertible to `UnifiedConfig`.

#### Scenario: Provider settings update writes TOML

- **WHEN** Agent updates a user-owned provider endpoint, credential reference, enabled state, or model setting through a Neko-managed command
- **THEN** the resulting persisted user config MUST be `config.toml`
- **THEN** the updated file MUST parse through the canonical TOML reader

#### Scenario: Scalar settings update writes TOML

- **WHEN** Agent updates scalar settings such as max tokens, temperature, streaming, or execution mode through a Neko-managed command
- **THEN** the resulting persisted user config MUST be `config.toml`
- **THEN** unrelated provider and model entries MUST remain represented in the converted runtime config

### Requirement: Documentation and UI name TOML as the config surface

User-facing documentation, commands, diagnostics, onboarding copy, and settings UI labels SHALL identify TOML as the Agent configuration surface after the migration. Legacy JSON SHALL NOT be exposed as a supported Agent configuration or migration surface.

#### Scenario: Invalid syntax message says TOML

- **WHEN** a user config file has syntax errors
- **THEN** the visible diagnostic MUST refer to invalid TOML or TOML parse failure
- **THEN** it MUST NOT describe the canonical config error as invalid JSON

#### Scenario: Open config action opens TOML

- **WHEN** the user selects an action to open Agent configuration
- **THEN** the action MUST open or create `config.toml`
- **THEN** it MUST NOT create a new `config.json`
