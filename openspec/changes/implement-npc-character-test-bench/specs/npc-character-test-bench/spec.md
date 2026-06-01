## ADDED Requirements

### Requirement: NPC test bench launches project characters into isolated sessions
The system SHALL allow users to launch an NPC test session for a project character or creative entity through `/as @entity` and through delegated Dashboard actions. The launched session MUST be separate from the main Agent conversation and MUST use the current project as the scope for profile assembly, runtime context, and optional test artifacts.

#### Scenario: Slash command launches NPC session
- **WHEN** the user invokes `/as @小明` and the mention resolves to a character entity in the current project
- **THEN** the system assembles an NPC profile for that entity and opens an isolated NPC conversation session for `小明`

#### Scenario: Dashboard launches NPC session
- **WHEN** the user triggers `test-npc` for a Dashboard creative entity row
- **THEN** Dashboard delegates to the Agent-owned launch command with an `NpcTestBenchLaunchRequest` and does not import Agent runtime internals

#### Scenario: Main conversation remains separate
- **WHEN** the user exchanges messages inside the NPC test session
- **THEN** those messages are not appended to the main Agent conversation history

### Requirement: NPC profile source is projected from project facts
The system SHALL assemble `NpcProfileSource` from current project entity facts, asset bindings, visual identity drafts, relationships, occurrences, optional script dialogue samples, and user supplements. The system MUST NOT persist a separate `CharacterCard` as the source of truth.

#### Scenario: Confirmed facts become profile facts
- **WHEN** a character has confirmed identity metadata, accepted visual facts, bindings, and known relationships
- **THEN** `NpcProfileAssembler` returns profile facts with source and authority metadata suitable for prompt projection

#### Scenario: Profile snapshot is not a source of truth
- **WHEN** an NPC profile snapshot is saved inside a test artifact
- **THEN** future profile assembly still reads current project entity facts instead of treating the snapshot as authoritative character data

#### Scenario: Suggested facts are labelled
- **WHEN** profile assembly includes AI-inferred or user-supplemented facts that are not confirmed entity facts
- **THEN** those facts are marked as suggested and are rendered as uncertain in the NPC prompt

### Requirement: NPC sessions run without creative authoring tools
The system SHALL run NPC test sessions with runtime `toolPolicy: { kind: 'none' }`. NPC session tool isolation MUST be implemented as runtime policy and MUST NOT be represented as an NPC profile capability.

#### Scenario: NPC receives empty tool registry
- **WHEN** an NPC session is created
- **THEN** the model executor receives no project-read, file-write, media-generation, timeline-editing, shell, or other creative authoring tools

#### Scenario: NPC affordances are not creative tools
- **WHEN** a future NPC capability such as voice preview or emote playback is introduced
- **THEN** it is modeled as an NPC interaction affordance or host-side preview action rather than granting creative authoring tools to the NPC session

### Requirement: NPC conversation kind hides creative controls
The Agent Webview SHALL represent NPC tests as a conversation/session kind distinct from media `SessionMode`. While an NPC test is active, Webview MUST hide creative model controls, execution mode controls, and media generation controls, and MUST show NPC identity and exit controls.

#### Scenario: NPC tab hides authoring controls
- **WHEN** `conversationKind` is `npc-test`
- **THEN** the model selector, execution mode selector, and media generation bar are hidden

#### Scenario: NPC identity header is visible
- **WHEN** an NPC test session is displayed
- **THEN** the Webview shows the character identity summary and allows the user to inspect the profile snapshot used for the prompt

### Requirement: Thin profiles offer explicit handling
The system SHALL detect whether an assembled NPC profile is thin, partial, or rich. When a profile is thin, the system MUST let the user start immediately, run project-scoped enrichment, or provide manual supplements before the NPC conversation starts.

#### Scenario: Thin profile prompts for handling
- **WHEN** deterministic assembly yields only a name and aliases
- **THEN** the system offers choices to start directly, extract project evidence, or manually supplement the profile

#### Scenario: Enrichment remains project-scoped
- **WHEN** the user chooses automatic enrichment
- **THEN** enrichment reads current project evidence such as Story/script occurrences and does not pull character facts from implicit global memory

### Requirement: NPC context and artifacts are project-scoped
The system SHALL keep NPC context scoped to the current project. Active NPC conversation context MUST remain in memory unless saved as a test artifact, and saved transcript/evaluation artifacts MUST be written under the current project `.neko/npc-tests/`.

#### Scenario: Active context remains in memory
- **WHEN** the user is chatting with an NPC
- **THEN** the active NPC transcript is held in the NPC session memory and is not written to `.neko/memory.md`, global memory, or standard conversation records

#### Scenario: Test artifact saved in project
- **WHEN** the user exits an NPC session and chooses to save validation evidence
- **THEN** the system writes `.neko/npc-tests/{entityId}-{timestamp}.json` under the current project root with entity ref, profile snapshot, transcript, evaluation, version, and timestamp fields

#### Scenario: Global packs require explicit binding
- **WHEN** a reusable identity or character pack is installed globally
- **THEN** it does not affect NPC profile assembly until the user imports or binds it into the current project

### Requirement: NPC evaluation reports validation evidence
The system SHALL evaluate NPC transcripts against the profile snapshot and report persona consistency, dialogue voice fit, knowledge leakage, relationship gaps, and suggested profile improvements. Evaluation output MUST be separate from entity mutation.

#### Scenario: Knowledge leakage is reported
- **WHEN** the NPC mentions a world fact that is absent from the profile snapshot and project-derived evidence
- **THEN** the evaluation report flags the turn as knowledge leakage with a reference to the relevant transcript message

#### Scenario: Relationship gap is reported
- **WHEN** the transcript reveals an undefined or missing relationship that project evidence supports
- **THEN** the evaluation report suggests adding or confirming that relationship without automatically writing it

### Requirement: NPC suggestions require user confirmation
The system SHALL represent AI-inferred NPC improvements as suggestions until the user explicitly applies them. Applying a suggestion MUST route through entity metadata or relationship update commands owned by the entity service or provider.

#### Scenario: Suggested speech pattern does not auto-write
- **WHEN** evaluation infers that a character often says a catchphrase
- **THEN** the system presents an `NpcEvaluationSuggestion` and does not update `CharacterRecord.metadata` automatically

#### Scenario: User applies suggestion
- **WHEN** the user confirms an NPC evaluation suggestion
- **THEN** the system applies the update through `CreativeEntityService.updateMetadata()` or a relationship update command and refreshes entity projections
