## MODIFIED Requirements

### Requirement: Natural-language Skill activation is Agent-owned
The system SHALL NOT resolve, display, or activate Skill candidates through Extension/Webview code before the main Agent reasons over the user message. Natural-language Skill discovery SHALL NOT create Skill lifecycle records, apply Skill injections, update active Skill compatibility state, or emit Skill injection Webview messages.

#### Scenario: Natural language enters Agent without Skill injection
- **WHEN** a user sends a natural-language request that resembles a Skill domain
- **THEN** the system SHALL dispatch the request to the Agent turn
- **AND** it SHALL NOT emit a `skillInjection` Webview message before the Agent calls `ActivateSkill`
- **AND** it SHALL NOT create a `domainSkill` lifecycle record
- **AND** it SHALL NOT update a legacy single active Skill state
- **AND** it SHALL NOT emit a `skillCandidates` Webview message.

#### Scenario: Explicit Skill activation still works
- **WHEN** the user submits `$quality-review changed files`
- **THEN** the system SHALL activate `quality-review` through a typed user-explicit Skill activation intent
- **AND** the activation SHALL be owned by the canonical Skill lifecycle runtime.

#### Scenario: Agent tool activation still works
- **WHEN** the main Agent calls `ActivateSkill` with a valid Skill name
- **THEN** the system SHALL activate that Skill through a typed agent-tool Skill activation intent
- **AND** the activation SHALL be owned by the canonical Skill lifecycle runtime.

#### Scenario: Natural-language discovery may inform Agent context only
- **WHEN** the runtime computes Skill catalog or matching metadata from natural language
- **THEN** that metadata MAY be exposed to the Agent as non-activating context
- **AND** it SHALL NOT apply Skill prompt injection or tool policy before the Agent explicitly activates a Skill.
