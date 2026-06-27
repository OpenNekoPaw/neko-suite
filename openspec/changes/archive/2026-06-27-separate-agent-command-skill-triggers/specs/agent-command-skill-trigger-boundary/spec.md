## ADDED Requirements

### Requirement: Distinct command and Skill triggers

The system SHALL treat `/`, `$`, and `@` as distinct Agent input trigger namespaces. `/` SHALL resolve Agent, host, plugin, or command-artifact commands. `$` SHALL resolve explicit Skill invocation. `@` SHALL resolve file, entity, asset, or contextual references.

#### Scenario: Slash command resolves only command namespace
- **WHEN** the user enters `/status`
- **THEN** the system SHALL route the input through the command runtime
- **AND** it SHALL NOT attempt Skill activation for a Skill named `status`.

#### Scenario: Dollar Skill resolves only Skill namespace
- **WHEN** the user enters `$status`
- **THEN** the system SHALL route the input through the Skill invocation runtime
- **AND** it SHALL NOT execute a slash command named `status`.

#### Scenario: At mention remains context reference
- **WHEN** the user enters `@scene.md`
- **THEN** the system SHALL resolve the token as a context reference candidate
- **AND** it SHALL NOT route the token as a command or Skill invocation.

### Requirement: Slash catalog excludes ordinary Skills by default

The slash command catalog SHALL list builtin commands, plugin slash commands, and explicitly authored command artifacts. It SHALL NOT expose ordinary enabled Skills as default slash entries after `$` Skill invocation is available.

#### Scenario: Slash menu lists commands
- **WHEN** the user opens the `/` menu
- **THEN** the menu SHALL include available builtin Agent commands and plugin slash commands
- **AND** it SHALL exclude ordinary Skills that have no command-artifact contract.

#### Scenario: Slash command artifact remains command
- **WHEN** a command artifact is intentionally authored as a slash command
- **THEN** the `/` menu SHALL show that artifact as a command entry
- **AND** the entry SHALL be distinguishable from ordinary Skill invocation in the catalog metadata.

### Requirement: Dollar catalog lists enabled Skills

The Skill invocation catalog SHALL list enabled Skills that can be explicitly invoked with `$<skill-name>`. The catalog SHALL use Skill identity as the canonical target instead of requiring a separate slash command field.

#### Scenario: Dollar menu lists enabled Skills
- **WHEN** the user opens the `$` menu
- **THEN** the menu SHALL include enabled builtin, personal, project, and market Skills visible to the current session
- **AND** each entry SHALL dispatch by canonical Skill name or id.

#### Scenario: Disabled Skill hidden or diagnostic
- **WHEN** a Skill is disabled
- **THEN** the `$` menu SHALL hide it or mark it unavailable according to the chosen UI projection
- **AND** direct `$skill` submission for that disabled Skill SHALL return a visible disabled-Skill diagnostic.

#### Scenario: Skill filter searches name and description
- **WHEN** the user types `$char`
- **THEN** the Skill menu SHALL filter candidates by Skill name and description
- **AND** selecting a candidate SHALL insert or dispatch the `$skill` invocation without changing unrelated input text.

### Requirement: Explicit Skill invocation uses existing Skill injection

Explicit `$skill` invocation SHALL end in the existing Skill application and injection path. The implementation SHALL NOT duplicate prompt injection, permission allow rules, tool guards, model override behavior, or ToolSet activation in Webview or Extension routing.

#### Scenario: Skill invocation activates Skill
- **WHEN** the user submits `$quality-review changed files`
- **THEN** the runtime SHALL activate the `quality-review` Skill through the canonical Skill application path
- **AND** Skill prompt injection, allowed tools, model override, and tool guard behavior SHALL be owned by the existing Skill injection runtime.

#### Scenario: Skill invocation forwards arguments
- **WHEN** the selected Skill supports arguments
- **AND** the user submits `$commit-helper fix parser`
- **THEN** the runtime SHALL pass `fix parser` as invocation arguments to the Skill injector
- **AND** argument interpolation SHALL follow the existing `$ARGUMENTS` and positional-placeholder rules.

#### Scenario: Skill invocation with prompt continuation
- **WHEN** the Skill activation result includes an injection and the invocation includes trailing prompt text
- **THEN** the system SHALL either dispatch that trailing text as the next Agent prompt using Skill execution metadata or interpolate it into the Skill according to the Skill contract
- **AND** the chosen behavior SHALL be covered by path-level tests.

### Requirement: Command and Skill conflicts are namespace-safe

The system SHALL allow the same token to exist separately in the command and Skill namespaces without ambiguous routing. Prefix determines the namespace.

#### Scenario: Same name command and Skill
- **WHEN** `/review` is a command and `$review` is a Skill
- **THEN** `/review` SHALL execute the command path
- **AND** `$review` SHALL execute the Skill invocation path.

#### Scenario: Unknown slash command
- **WHEN** the user submits `/missing`
- **THEN** the system SHALL return an unknown command diagnostic
- **AND** it SHALL NOT send `/missing` as a normal chat prompt.

#### Scenario: Unknown dollar Skill
- **WHEN** the user submits `$missing`
- **THEN** the system SHALL return an unknown Skill diagnostic
- **AND** it SHALL NOT send `$missing` as a normal chat prompt.

### Requirement: Legacy slash-backed Skill migration is explicit

Legacy slash-backed Skill aliases SHALL be treated as prelaunch migration paths, not canonical behavior. If retained temporarily, they SHALL be visible in diagnostics or tests as aliases and SHALL NOT mask failures in the canonical `$skill` path.

#### Scenario: Legacy slash Skill alias retained
- **WHEN** a legacy slash-backed Skill alias remains available
- **THEN** the system SHALL mark or test it as a legacy alias
- **AND** canonical `$skill` invocation tests SHALL prove the legacy slash path did not produce the successful result.

#### Scenario: New ordinary Skill registered
- **WHEN** a new ordinary Skill is registered without an explicit command-artifact contract
- **THEN** the system SHALL expose it through `$` Skill invocation
- **AND** it SHALL NOT automatically create a `/skill` command entry.

### Requirement: Help and UI teach trigger meanings

Agent help text, menu labels, and i18n strings SHALL present `/`, `$`, and `@` as separate entry types with clear meanings.

#### Scenario: Help command renders trigger sections
- **WHEN** the user requests command help
- **THEN** the help content SHALL show `/` commands separately from `$` Skills
- **AND** it SHALL keep `@` described as the context-reference trigger.

#### Scenario: Webview input shows trigger-specific menus
- **WHEN** the user types `/`, `$`, or `@` at a valid trigger boundary
- **THEN** the Webview SHALL open the corresponding command, Skill, or mention menu
- **AND** keyboard navigation SHALL operate on only the active menu.

### Requirement: Runtime-sensitive validation

The trigger boundary SHALL be validated with path-level tests and VS Code Webview runtime smoke for Webview interaction. Browser-only validation SHALL NOT be sufficient for final acceptance of Extension Webview behavior.

#### Scenario: Path-level runtime tests
- **WHEN** tests validate `$skill` invocation
- **THEN** they SHALL assert that the canonical Skill invocation path was hit
- **AND** they SHALL assert that builtin command and legacy slash Skill paths were not used.

#### Scenario: Webview runtime smoke
- **WHEN** the Webview input trigger UI is changed
- **THEN** validation SHALL include VS Code Extension Development Host Webview runtime smoke or an equivalent `vscode-extension-debugger` verification
- **AND** regular browser, Vite, Chrome, or Playwright-only checks SHALL be recorded only as supplemental evidence.
