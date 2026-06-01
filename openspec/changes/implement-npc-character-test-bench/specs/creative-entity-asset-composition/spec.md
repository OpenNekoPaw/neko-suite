## ADDED Requirements

### Requirement: Entity projections support NPC profile assembly
The system SHALL provide a deterministic NPC profile projection over project creative entity facts. The projection MUST consume existing entity identity, metadata, bindings, visual drafts, relationships, occurrences, and provider evidence through shared contracts or injected ports, and MUST NOT depend on Agent runtime, SubAgent implementation, LLMs, Dashboard, Story, Assets, React, or Webview modules.

#### Scenario: Character entity assembles NPC source
- **WHEN** a confirmed character entity has aliases, role metadata, visual facts, default voice or portrait bindings, relationships, and occurrences
- **THEN** the NPC profile assembler returns an `NpcProfileSource` containing those facts with provenance and authority metadata

#### Scenario: Entity projection avoids Agent dependency
- **WHEN** dependency boundary tests scan `@neko/entity/projections`
- **THEN** NPC profile assembly code does not import `@neko/agent`, SubAgent modules, LLM services, Dashboard Webview modules, Story implementation modules, or Assets implementation modules

### Requirement: NPC profile facts preserve source and authority
The system SHALL represent NPC profile inputs as facts with explicit source and authority. Confirmed project facts MAY be used as authoritative prompt content; suggested facts MAY be included only when labelled as uncertain and MUST NOT be written back to entity metadata without user confirmation.

#### Scenario: Confirmed entity metadata is authoritative
- **WHEN** character metadata contains confirmed role, age range, or notes
- **THEN** the assembled NPC profile facts mark those values as confirmed and identify the registry or entity metadata source

#### Scenario: AI inferred fact is suggested
- **WHEN** enrichment infers a speech pattern from script dialogue
- **THEN** the assembled NPC profile marks that speech pattern as suggested with source `agent-inferred` or `script-extraction`

#### Scenario: Suggested fact does not mutate entity
- **WHEN** the NPC profile includes a suggested backstory, relationship, or speech pattern
- **THEN** the entity fact store remains unchanged until the user applies a suggestion through an entity update action

### Requirement: NPC write-back uses entity lifecycle operations
The system SHALL route confirmed NPC evaluation suggestions through entity lifecycle operations or provider-approved relationship update commands. NPC evaluation MUST NOT directly write `characters.json`, entity fact files, binding files, or asset metadata.

#### Scenario: Metadata suggestion applies through service
- **WHEN** the user applies a suggested speech pattern or motivation
- **THEN** the system calls an entity metadata update operation and emits normal entity change metadata

#### Scenario: Relationship suggestion applies through owner
- **WHEN** the user applies a suggested relationship between two entities
- **THEN** the owning entity or relationship provider validates and writes the relationship rather than the NPC evaluator writing graph files directly

#### Scenario: Asset requirement is not used for personality
- **WHEN** evaluation suggests backstory, speech pattern, motivation, knowledge boundary, or relationship facts
- **THEN** the suggestion is represented as an NPC/entity fact suggestion and not as an `EntityAssetRequirement`
