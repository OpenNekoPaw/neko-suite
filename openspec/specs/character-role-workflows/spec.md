# character-role-workflows Specification

## Purpose
Define core character role workflows, actor relationships, artifact scope, and Skill-facing primitives for character dialogue, embody-character feedback, validation, and improvement.

## Requirements
### Requirement: Core character role workflows use actor-relationship terminology
The system SHALL define core character role workflows by who plays the character. `character-dialogue` SHALL mean the Agent plays the character while the user tests the character. `embody-character` SHALL mean the user plays the character while the Agent provides project-scoped character knowledge feedback.

#### Scenario: Character dialogue describes Agent roleplay
- **WHEN** a user starts `character-dialogue` for a project character
- **THEN** the system opens an isolated character dialogue session where the Agent responds as that character and the user remains the tester

#### Scenario: Embody character describes user roleplay
- **WHEN** a user starts `embody-character` for a project character
- **THEN** the system starts an isolated Embody Character feedback session where the user embodies the character and the Agent answers as a project-aware feedback assistant

### Requirement: Character dialogue remains isolated and no-tool
The system SHALL run Character Dialogue sessions as isolated conversations with creative authoring tools disabled. Character dialogue turns MUST NOT be appended to the main Agent conversation history, `.neko/memory.md`, global memory, or standard conversation records.

#### Scenario: Character dialogue receives no tools
- **WHEN** the Agent runtime creates a Character Dialogue responder for a project character
- **THEN** the responder receives `toolPolicy: { kind: 'none' }`, an empty tool registry, and no project-read, file-write, media-generation, shell, or timeline-editing tools

#### Scenario: Main Agent history remains separate
- **WHEN** the user exchanges messages inside a Character Dialogue session
- **THEN** those messages are recorded only in the character dialogue transcript and are not appended to the ordinary Agent conversation

### Requirement: Character dialogue uses the official slash shortcut
The system SHALL keep `/as @character` as the official shortcut for starting Character Dialogue. The system SHALL use `/exit-as` to leave an active Character Dialogue session and MUST NOT expose `/exit-role`.

#### Scenario: Slash command starts character dialogue
- **WHEN** the user invokes `/as @小橘`
- **THEN** the system resolves `小橘` to a project character and starts `character-dialogue`

#### Scenario: Exit command leaves character dialogue
- **WHEN** the user invokes `/exit-as` inside an active Character Dialogue session
- **THEN** the system exits that session, extracts the transcript, runs any configured evaluation/save policy, and returns focus to the ordinary Agent conversation surface

### Requirement: Character role artifacts are project-scoped
The system SHALL save new character role transcript or validation evidence under a character-role artifact namespace in the current project. New saves MUST NOT target `.neko/npc-tests/`.

#### Scenario: New artifact uses character namespace
- **WHEN** the system saves Character Dialogue evidence after session exit
- **THEN** the artifact path is under the current project character-role evidence namespace such as `.neko/character-tests/{entityId}-{timestamp}.json`

#### Scenario: Historical NPC artifacts are not rewritten
- **WHEN** historical `.neko/npc-tests/*.json` files exist in a project
- **THEN** the migration does not rewrite those files as part of normal Character Dialogue launch or exit

### Requirement: Validation and improvement are Skill workflows
The system SHALL NOT expose character validation or character improvement as core Dashboard action ids or core Agent commands. Automated validation and improvement SHALL be implemented through Skills that compose core character role primitives.

#### Scenario: Character validation runs through Skill
- **WHEN** a user invokes the character validation Skill for a project character
- **THEN** the Skill may assemble a profile, run headless character dialogue probes, ask validation questions, evaluate stability and knowledge boundaries, and produce a report without requiring a core Dashboard `character-validation` action

#### Scenario: Character improvement runs through Skill
- **WHEN** a user invokes the character improvement Skill for a project character
- **THEN** the Skill may collect project evidence and propose profile or relationship improvements as suggestions that require explicit user confirmation before mutation

### Requirement: Core exposes narrow primitives for role Skills
The system SHALL expose or preserve narrow primitives for Skills to assemble character profiles, collect project-scoped evidence, run no-tool character dialogue probes, evaluate transcripts, save artifacts, and apply suggestions only after user confirmation.

#### Scenario: Skill composes primitives without Dashboard UI
- **WHEN** a character role Skill runs in the Agent environment
- **THEN** it can call core primitives through Agent/extension/runtime ports without importing Dashboard Webview modules or depending on Dashboard selected-row state

#### Scenario: Skill suggestions do not auto-write
- **WHEN** a character role Skill infers a personality, speech pattern, relationship, or knowledge-boundary update
- **THEN** the inferred change remains a suggestion until the user explicitly confirms an entity-owned apply command
