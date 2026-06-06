# npc-agent-workflows Specification

## Purpose
Capture the migrated Agent character analysis workflows that supersede earlier NPC-named workflow surfaces. Core validation and improvement are Skill-composed workflows, not Dashboard core actions.

## Requirements
### Requirement: Agent analyzes character perspective from project evidence through Embody Character
The system SHALL provide an Agent-owned Embody Character workflow that reports what a selected character knows, believes, misunderstands, and must not know within a project or story scope. The workflow MUST use project-scoped evidence and MUST NOT start an isolated Character Dialogue roleplay session.

#### Scenario: Perspective report uses selected character
- **WHEN** Dashboard or Agent invokes Embody Character for a character entity ref
- **THEN** the Agent workflow builds feedback for that character using project entity facts, occurrences, relationships, and available story context

#### Scenario: Knowledge boundaries are explicit
- **WHEN** the Embody Character feedback includes facts beyond the character's confirmed knowledge
- **THEN** the report labels those facts as inferred, unknown, mistaken, secret, or out-of-scope instead of presenting them as confirmed character knowledge

#### Scenario: Workflow remains in an isolated feedback context
- **WHEN** Embody Character analysis runs
- **THEN** the system uses the Embody Character feedback session and does not convert the ordinary Agent conversation into Character Dialogue

### Requirement: Character validation runs through Skill orchestration
The system SHALL provide character validation through Skills that check whether a selected character has enough profile, relationship, speech, motivation, and knowledge-boundary data for interactive use. The workflow MUST produce validation findings and MUST NOT mutate entity facts automatically.

#### Scenario: Sparse character produces findings
- **WHEN** validation runs for a character that only has a name and aliases
- **THEN** the report flags missing motivation, speech pattern, relationship context, knowledge boundary, and representative dialogue evidence

#### Scenario: Suggested improvements are not applied automatically
- **WHEN** validation suggests adding a speech pattern, motivation, relationship, or knowledge fact
- **THEN** the suggestion remains pending until the user explicitly confirms an entity-source update

#### Scenario: Existing evidence reduces gaps
- **WHEN** validation finds confirmed project facts or script dialogue samples for the character
- **THEN** the report uses that evidence to reduce completeness gaps and cites the source refs used for the assessment

### Requirement: Agent validates interaction flows without granting tools to Character Dialogue
The system SHALL provide a project-scoped interaction validation workflow for interactive stories, branching dialogue, or game-like scenes. The workflow MUST test whether a character response plan respects profile facts, story scope, and knowledge boundaries across simulated user/player turns.

#### Scenario: Future knowledge leak is detected
- **WHEN** an interaction test prompts a character before a later-scene secret has been revealed
- **THEN** the validation report flags any response that uses the later-scene secret as a knowledge-boundary violation

#### Scenario: Branching choices are summarized
- **WHEN** the workflow validates multiple user/player choices for the same character and scene
- **THEN** the report groups findings by branch or interaction path and identifies persona, continuity, and missing-design risks

#### Scenario: Interaction validation may use tools
- **WHEN** interaction validation needs to inspect scripts, entity facts, or prior validation artifacts
- **THEN** it may use ordinary Agent project-read tools allowed by Agent policy and MUST NOT grant tools to a live Character Dialogue responder

### Requirement: Agent improves character design through confirmed suggestions
The system SHALL provide character improvement through Skills that propose concrete additions or edits to character design based on validation findings, project evidence, and user intent. Proposed changes MUST remain suggestions until applied through entity-owned commands.

#### Scenario: Improvement proposal is structured
- **WHEN** the user asks Agent to improve a character design
- **THEN** the workflow returns structured suggestions such as motivation, backstory, speech pattern, relationships, knowledge boundary, and dialogue examples

#### Scenario: User confirmation controls write-back
- **WHEN** the user accepts a proposed character improvement
- **THEN** the system routes the change through the owning entity source or entity service and refreshes Dashboard projections after the update

#### Scenario: Rejected suggestions do not affect source of truth
- **WHEN** the user rejects or ignores a proposed improvement
- **THEN** project entity facts, bindings, relationships, and source documents remain unchanged
