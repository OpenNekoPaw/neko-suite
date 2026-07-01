## MODIFIED Requirements

### Requirement: Explicit Skill invocation uses existing Skill injection
Explicit `$skill` invocation SHALL end in the canonical Skill lifecycle activation path through a typed user-explicit activation intent. The implementation SHALL NOT duplicate prompt injection, permission allow rules, tool guards, model override behavior, ToolSet activation, model selection, or activation progress rendering in Webview or Extension routing.

#### Scenario: Skill invocation activates Skill
- **WHEN** the user submits `$quality-review changed files`
- **THEN** the runtime SHALL activate the `quality-review` Skill through the canonical Skill lifecycle activation path
- **AND** Skill prompt injection, allowed tools, model override, and tool guard behavior SHALL be projected from the lifecycle record.

#### Scenario: Skill invocation performs a complete lifecycle transaction
- **WHEN** explicit `$quality-review changed files` activation succeeds
- **THEN** the activation SHALL create or renew a lifecycle record
- **AND** it SHALL project prompt sections, allowed tools, ToolGuard state, ToolSet activation, model override, permission allow rules when applicable, visible indicators, and activation progress events from the canonical lifecycle state.

#### Scenario: Skill invocation progress is not prompt content
- **WHEN** explicit Skill invocation emits activation progress events
- **THEN** those events SHALL be delivered through host/runtime protocol
- **AND** the rendered Skill system prompt SHALL NOT include UI-only activation process labels or timeline narration.

#### Scenario: Skill invocation forwards arguments
- **WHEN** the selected Skill supports arguments
- **AND** the user submits `$commit-helper fix parser`
- **THEN** the runtime SHALL pass `fix parser` as invocation arguments to the Skill injector
- **AND** argument interpolation SHALL follow the existing `$ARGUMENTS` and positional-placeholder rules.

#### Scenario: Skill invocation with prompt continuation
- **WHEN** the Skill activation result includes an injection and the invocation includes trailing prompt text
- **THEN** the system SHALL either dispatch that trailing text as the next Agent prompt using Skill execution metadata or interpolate it into the Skill according to the Skill contract
- **AND** the chosen behavior SHALL be covered by path-level tests.

#### Scenario: Skill invocation records trigger provenance
- **WHEN** explicit `$skill` invocation creates a Skill lifecycle record
- **THEN** the lifecycle or activation projection SHALL record source `user-explicit`
- **AND** Webview or CLI/TUI SHALL be able to show that the active Skill was user-triggered.
