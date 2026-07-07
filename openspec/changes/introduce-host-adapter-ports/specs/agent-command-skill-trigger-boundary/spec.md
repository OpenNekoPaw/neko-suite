## ADDED Requirements

### Requirement: Agent-driven skill activation uses structured provider requests

Agent-driven skill activation SHALL call skill providers with a structured request containing the target skill name and activation reason. Host adapters, including TUI, MUST NOT treat Agent-driven activation as a legacy string-only call.

#### Scenario: TUI activates a skill from Agent tool call

- **WHEN** `ActivateSkill` executes in TUI with `skillName` and `reason`
- **THEN** the TUI skill provider SHALL pass `request.name` to the canonical skill lifecycle activation path
- **AND** it SHALL preserve `request.reason` for diagnostics, traceability, or lifecycle metadata where supported

#### Scenario: Object activation input does not enter string-only path

- **WHEN** a TUI Agent turn calls `ActivateSkill`
- **THEN** the skill lifecycle code SHALL NOT receive the entire request object as the skill name
- **AND** validation SHALL prove the activation path does not throw string-method errors such as calling `.trim()` on the request object

