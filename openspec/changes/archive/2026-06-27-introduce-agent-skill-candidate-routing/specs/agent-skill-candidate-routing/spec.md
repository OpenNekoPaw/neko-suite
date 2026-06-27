## ADDED Requirements

### Requirement: Natural-language Skill activation is Agent-owned
The system SHALL NOT resolve, display, or activate Skill candidates through Extension/Webview code before the main Agent reasons over the user message.

#### Scenario: Natural language enters Agent without Skill injection
- **WHEN** a user sends a natural-language request that resembles a Skill domain
- **THEN** the system SHALL dispatch the request to the Agent turn
- **AND** it SHALL NOT emit a `skillInjection` Webview message before the Agent calls `ActivateSkill`
- **AND** it SHALL NOT emit a `skillCandidates` Webview message.

#### Scenario: Explicit Skill activation still works
- **WHEN** the user submits `$quality-review changed files`
- **THEN** the system SHALL activate `quality-review` through the canonical Skill invocation path
- **AND** the activation SHALL still be owned by the existing Skill injection runtime.

#### Scenario: Agent tool activation still works
- **WHEN** the main Agent calls `ActivateSkill` with a valid Skill name
- **THEN** the system SHALL activate that Skill through the canonical Skill provider and injection path.

### Requirement: GetContext exposes Skill catalog metadata
The system SHALL expose registered Skill catalog metadata to the Agent without producing code-side candidate hints.

#### Scenario: Registered Skill includes metadata
- **WHEN** the Agent calls `GetContext`
- **THEN** the result SHALL include registered Skills with name, description, related Skills, domain, and media workflow metadata when available
- **AND** the result SHALL NOT include `skillCandidateHints`.

#### Scenario: User-added Skill participates through catalog metadata
- **WHEN** a user, project, market, or plugin Skill declares metadata
- **THEN** the metadata SHALL be available through Skill registry/catalog projection for Agent reasoning
- **AND** production code SHALL NOT require a Skill-specific name branch for the Agent to see the Skill.

### Requirement: Candidate protocol and UI are removed
The Webview protocol and UI SHALL NOT contain code-generated Skill candidate messages or chips.

#### Scenario: Extension cannot send Skill candidate messages
- **WHEN** Extension-to-Webview message contracts are compiled
- **THEN** `skillCandidates` SHALL NOT be part of the typed message union.

#### Scenario: Composer does not show candidate chips
- **WHEN** the chat composer renders after a natural-language request
- **THEN** it SHALL NOT render Skill candidate chips
- **AND** it MAY still render explicit Skill catalog entries through `$skill` input.

### Requirement: Runtime remains the activation guard
Skill activation SHALL remain validated by runtime boundaries rather than pre-turn routing.

#### Scenario: Invalid Skill activation fails visibly
- **WHEN** `$missing` or `ActivateSkill("missing")` is requested
- **THEN** the runtime SHALL return an explicit failure diagnostic
- **AND** it SHALL NOT silently fall back to natural-language handling.

#### Scenario: Disabled or unloadable Skill fails visibly
- **WHEN** a disabled Skill or a Skill with missing content is activated
- **THEN** the runtime SHALL reject activation with a visible error
- **AND** it SHALL NOT inject a partial prompt.
