## ADDED Requirements

### Requirement: Explicit Skill triggers create lifecycle records
Explicit `$skill`, Webview `invokeSkill`, and Agent `ActivateSkill` entry points SHALL activate Skills through the Skill lifecycle runtime. They SHALL NOT directly own prompt injection, permission allow rules, ToolGuard state, or ToolSet activation.

#### Scenario: Dollar Skill activation targets domain slot
- **WHEN** the user submits `$quality-review changed files`
- **THEN** the command router SHALL dispatch a lifecycle activation request for the `domainSkill` slot
- **AND** Skill loading, validation, injection rendering, conflict policy, and request projection SHALL be owned by the lifecycle runtime.

#### Scenario: Webview invokeSkill targets lifecycle runtime
- **WHEN** Webview sends `invokeSkill` with a conversation id and Skill name
- **THEN** Extension SHALL forward a typed lifecycle activation request
- **AND** Webview SHALL NOT read Skill files or determine lifecycle slot policy itself.

#### Scenario: Agent ActivateSkill targets lifecycle runtime
- **WHEN** the Agent calls `ActivateSkill`
- **THEN** the meta tool SHALL activate or renew a lifecycle record through the same canonical lifecycle runtime
- **AND** it SHALL return lifecycle diagnostics if activation is rejected or conflicts.

### Requirement: Explicit Skill deactivation is scoped and policy checked
`DeactivateSkill`, Webview clear actions, and CLI/TUI clear commands SHALL target lifecycle records or lifecycle slots and SHALL obey clearability policy.

#### Scenario: Default DeactivateSkill clears clearable domain Skill
- **WHEN** the Agent calls `DeactivateSkill` without a record id or slot
- **AND** exactly one clearable `domainSkill` record is active
- **THEN** the runtime SHALL remove that record
- **AND** the next Agent turn projection SHALL omit its prompt and tool policy contributions.

#### Scenario: DeactivateSkill rejects locked records
- **WHEN** the Agent calls `DeactivateSkill` for a locked IDC-owned stage persona
- **THEN** the runtime SHALL return a locked deactivation diagnostic
- **AND** it SHALL leave the lifecycle record active.

#### Scenario: Webview clear action targets record id
- **WHEN** Webview renders multiple active Skill lifecycle records
- **AND** the user clears one record
- **THEN** Webview SHALL send the record id or slot-scoped clear request
- **AND** Extension SHALL NOT infer the target from display text alone.

#### Scenario: CLI clear reports ambiguity
- **WHEN** CLI/TUI clear command targets a Skill name with multiple active lifecycle records
- **THEN** the CLI/TUI SHALL show an ambiguity diagnostic
- **AND** it SHALL require a record id, slot, or selection before clearing.

### Requirement: Trigger help distinguishes activation from lifecycle clearing
Agent help text, menu labels, and i18n strings SHALL explain that `$skill` activates a lifecycle record and clear actions remove only records that are clearable by policy.

#### Scenario: Help lists Skill lifecycle controls
- **WHEN** the user opens Agent help or Skill controls
- **THEN** the UI SHALL distinguish `$skill` activation, active Skill indicators, locked records, expiring records, and clearable records
- **AND** it SHALL not imply that all active Skill records can be cleared manually.
