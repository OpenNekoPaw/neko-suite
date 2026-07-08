## ADDED Requirements

### Requirement: Command and Skill catalogs are shared across Agent surfaces

Agent Webview and TUI SHALL resolve builtin slash commands, command artifacts, explicit `$skill` invocations, and Skill lifecycle controls through shared command and Skill catalog contracts. Surface-specific command effects SHALL be attached explicitly by the owning host.

#### Scenario: Workspace command artifact is installed
- **WHEN** a command artifact exists under `.neko/commands`
- **THEN** both Webview and TUI MUST discover the command through the shared command catalog
- **AND** both surfaces MUST either execute the command through a registered compatible effect or return the same unavailable-effect diagnostic

#### Scenario: User Skill is installed
- **WHEN** a Skill exists under `~/.neko/skills`
- **THEN** Webview and TUI MUST discover the Skill through the shared Skill file runtime
- **AND** explicit `$skill` or Webview invokeSkill activation MUST target the same Skill lifecycle runtime behavior

#### Scenario: Surface-local command is requested from another surface
- **WHEN** a TUI-only command is requested from Webview or an Extension-only command is requested from TUI
- **THEN** the receiving surface MUST return an unavailable surface-effect diagnostic
- **AND** it MUST NOT reinterpret the command as a generic prompt or silently no-op

### Requirement: Non-canonical Skill sources require explicit source providers

Agent Skill sources outside the standard Neko user/workspace directories SHALL be registered through explicit source providers with source scope, precedence, diagnostics, and validation. A surface MUST NOT load such sources by hard-coded path without exposing the source to the shared catalog.

#### Scenario: Codex Skill directory exists in workspace
- **WHEN** `.codex/skills` exists in the workspace
- **THEN** Neko Agent MUST NOT load it as a TUI-only implicit Skill source
- **AND** it MAY load it only if an explicit source provider is registered and visible in catalog diagnostics

#### Scenario: Source provider fails
- **WHEN** a configured Skill source provider cannot read, parse, or validate a Skill
- **THEN** the shared catalog MUST include a diagnostic for that source
- **AND** Webview and TUI MUST project that diagnostic consistently

### Requirement: Command execution proves canonical runtime path

Tests and runtime diagnostics for command and Skill execution SHALL prove that shared command catalog resolution and Skill lifecycle runtime were used.

#### Scenario: Command artifact executes
- **WHEN** a focused test executes a command artifact from Webview and TUI fixtures
- **THEN** the test MUST assert the shared catalog entry was resolved
- **AND** it MUST prove surface-local fallback parsing did not produce the successful result

#### Scenario: Skill activation executes
- **WHEN** a focused test activates a Skill through `$skill` or Webview invokeSkill
- **THEN** the test MUST assert lifecycle activation created or updated a lifecycle record
- **AND** it MUST prove legacy single active injection or surface-local Skill loading did not mask lifecycle failure
