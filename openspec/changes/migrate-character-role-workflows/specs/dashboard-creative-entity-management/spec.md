## ADDED Requirements

### Requirement: Dashboard exposes only core character role actions
Dashboard SHALL expose only `character-dialogue` and `embody-character` as core character role actions for character creative entities. Dashboard MUST NOT expose `test-npc`, `character-perspective`, `validate-character`, or `improve-character` as core action ids.

#### Scenario: Character detail shows core role actions
- **WHEN** Dashboard renders the detail view for a confirmed or candidate character entity whose source supports Agent role workflows
- **THEN** the detail action list includes localized `character-dialogue` and `embody-character` actions

#### Scenario: Character row remains compact
- **WHEN** Dashboard renders a character entity row
- **THEN** the row may include `character-dialogue` when the source can launch it and MUST NOT include validation or improvement actions as first-level row actions

#### Scenario: Non-character entities do not expose role actions
- **WHEN** Dashboard renders an entity whose kind is not `character`
- **THEN** the source omits or disables `character-dialogue` and `embody-character` with a clear reason

### Requirement: Dashboard delegates character dialogue to Agent-owned command
Dashboard SHALL delegate `character-dialogue` through shared action contracts and host commands. Dashboard Webview MUST NOT import Agent runtime internals, assemble character prompts, create dialogue sessions, or persist character role artifacts.

#### Scenario: Source maps character dialogue action
- **WHEN** Dashboard action handling receives `character-dialogue` for a valid character ref
- **THEN** the owning source or host adapter converts it into the Agent-owned Character Dialogue launch request and invokes `neko.agent.characterDialogue`

#### Scenario: Agent panel receives focus for dialogue
- **WHEN** `neko.agent.characterDialogue` is invoked from Dashboard
- **THEN** the Agent panel is focused and the character dialogue controller starts or reports a validation error

### Requirement: Dashboard delegates embody character to Agent-owned feedback session
Dashboard SHALL delegate `embody-character` to an Agent-owned Embody Character feedback session that treats the user as embodying the character and the Agent as a project-aware knowledge feedback assistant. The action MUST NOT start an isolated Character Dialogue roleplay session and MUST NOT route through the ordinary creative Agent message pipeline.

#### Scenario: Embody character starts feedback session
- **WHEN** Dashboard action handling receives `embody-character` for a valid character ref
- **THEN** the owning source or host adapter invokes `neko.agent.embodyCharacter` with entity ref, optional scope refs, and optional prompt so the Agent Extension starts an isolated Embody Character feedback session

#### Scenario: Embody character does not create dialogue tab
- **WHEN** the Agent command bridge handles `neko.agent.embodyCharacter`
- **THEN** it creates an `embody-character` feedback session and does not create a `character-dialogue` roleplay tab

## REMOVED Requirements

### Requirement: Dashboard exposes test-npc action for character entities
**Reason**: The public action id and label are replaced by `character-dialogue` / `角色对话`.
**Migration**: Update Dashboard source capabilities, action descriptors, Webview action dispatch, and tests to use `character-dialogue`.

### Requirement: Dashboard exposes character-perspective action for character entities
**Reason**: The public action id and label are replaced by `embody-character` / `代入角色`, with clarified actor relationship.
**Migration**: Update Dashboard source capabilities, action descriptors, Webview action dispatch, and tests to use `embody-character`.

### Requirement: Dashboard exposes validate-character action for character entities
**Reason**: Automated validation is no longer a core Dashboard action and is moved to Skill orchestration.
**Migration**: Remove `validate-character` from Dashboard action unions, source capabilities, descriptors, i18n, and tests. Use the character validation Skill for automated checks.

### Requirement: Dashboard exposes improve-character action for character entities
**Reason**: Character improvement is no longer a core Dashboard action and is moved to Skill orchestration.
**Migration**: Remove `improve-character` from Dashboard action unions, source capabilities, descriptors, i18n, and tests. Use the character improvement Skill for improvement suggestions.
