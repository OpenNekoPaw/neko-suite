## ADDED Requirements

### Requirement: Effective Agent config snapshot is shared by TUI and Webview

Agent Webview and TUI SHALL consume the same effective Agent config snapshot for a workspace. The snapshot SHALL define user-global provider/model sources, workspace-local defaults, runtime scalar policy, MCP merge results, diagnostics, and session-only overrides.

#### Scenario: Workspace scalar is resolved
- **WHEN** a workspace `.neko/config.toml` defines a runtime scalar such as `temperature`, `maxTokens`, `thinkingBudget`, or `executionMode`
- **THEN** both TUI and Webview MUST resolve that scalar through the shared effective snapshot policy
- **AND** they MUST NOT diverge because TUI read raw workspace TOML while Webview read only user config scalars

#### Scenario: Workspace default model references user model source
- **WHEN** workspace config selects a default LLM model
- **THEN** the selected provider and model MUST resolve against the available user-global or account-backed provider/model sources
- **AND** both TUI and Webview MUST report the same selected model or the same diagnostic
- **AND** neither surface MUST silently fall back to a hard-coded model

#### Scenario: Runtime settings update is session-only
- **WHEN** Webview or TUI updates model selection, execution mode, or LLM parameters from runtime controls
- **THEN** the update MUST affect the current session snapshot or session state only
- **AND** it MUST NOT rewrite user or workspace TOML unless the user invokes an explicit config authoring command

### Requirement: Config diagnostics block both surfaces consistently

Config errors that block Agent execution SHALL block both Webview and TUI through the same diagnostic model.

#### Scenario: Invalid workspace config blocks startup
- **WHEN** workspace `.neko/config.toml` exists but has invalid TOML, unsupported version, invalid selected model, or unreadable content
- **THEN** Webview and TUI MUST surface a safe diagnostic for the same failure category
- **AND** neither surface MUST continue with user-only defaults, stale previous snapshots, or empty runtime values

#### Scenario: Missing optional workspace config is not an error
- **WHEN** user config is valid and workspace `.neko/config.toml` is missing
- **THEN** Webview and TUI MUST use the same user-global defaults and MCP entries
- **AND** they MUST NOT create or normalize workspace config automatically

### Requirement: Skill source config no longer defines a separate TUI-only catalog

Config-driven Skill source behavior SHALL be interpreted by the shared Skill file runtime or an explicit Skill source provider. A `skillsDir` or equivalent compatibility setting MUST NOT make TUI see a different default catalog from Webview.

#### Scenario: Standard Skill directories exist
- **WHEN** `~/.neko/skills`, `~/.neko/commands`, `.neko/skills`, or `.neko/commands` exist
- **THEN** both TUI and Webview MUST include them according to the shared source precedence policy
- **AND** TUI MUST NOT require `skillsDir` to point at `.neko/skills` before project Skills become visible

#### Scenario: Non-standard Skill directory is configured
- **WHEN** config references a non-standard Skill directory
- **THEN** the shared snapshot MUST either register it as an explicit source with diagnostics and precedence
- **AND** or reject it with a visible unsupported-source diagnostic
- **AND** the directory MUST NOT be silently loaded by TUI only
