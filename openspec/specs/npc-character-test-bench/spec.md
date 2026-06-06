# npc-character-test-bench Specification

## Purpose
Capture the migrated Character Dialogue test-bench primitives that supersede the earlier NPC test-bench terminology.

## Requirements
### Requirement: Character Dialogue launches project characters into isolated sessions
The system SHALL allow users to launch a Character Dialogue session for a project character or creative entity through `/as @entity` and through delegated Dashboard `character-dialogue` actions. The launched session MUST be separate from the main Agent conversation and MUST use the current project as the scope for profile assembly, runtime context, and optional character role artifacts.

#### Scenario: Slash command launches Character Dialogue
- **WHEN** the user invokes `/as @小明` and the mention resolves to a character entity in the current project
- **THEN** the system assembles a profile for that entity and opens an isolated Character Dialogue session for `小明`

#### Scenario: Dashboard launches Character Dialogue
- **WHEN** the user triggers `character-dialogue` for a Dashboard creative entity row
- **THEN** Dashboard delegates to the Agent-owned launch command with a Character Dialogue launch request and does not import Agent runtime internals

#### Scenario: Main conversation remains separate
- **WHEN** the user exchanges messages inside the Character Dialogue session
- **THEN** those messages are not appended to the main Agent conversation history

### Requirement: Character profile source is projected from project facts
The system SHALL assemble the roleplay profile source from current project entity facts, asset bindings, visual identity drafts, relationships, occurrences, optional script dialogue samples, and user supplements. The system MUST NOT persist a separate character card as the source of truth.

#### Scenario: Confirmed facts become profile facts
- **WHEN** a character has confirmed identity metadata, accepted visual facts, bindings, and known relationships
- **THEN** the profile assembler returns profile facts with source and authority metadata suitable for prompt projection

#### Scenario: Profile snapshot is not a source of truth
- **WHEN** a profile snapshot is saved inside a character role artifact
- **THEN** future profile assembly still reads current project entity facts instead of treating the snapshot as authoritative character data

#### Scenario: Suggested facts are labelled
- **WHEN** profile assembly includes AI-inferred or user-supplemented facts that are not confirmed entity facts
- **THEN** those facts are marked as suggested and are rendered as uncertain in the character prompt

### Requirement: Character Dialogue sessions run without creative authoring tools
The system SHALL run Character Dialogue sessions with runtime `toolPolicy: { kind: 'none' }`. Character Dialogue tool isolation MUST be implemented as runtime policy and MUST NOT be represented as a character profile capability.

#### Scenario: Character responder receives empty tool registry
- **WHEN** a Character Dialogue session is created
- **THEN** the model executor receives no project-read, file-write, media-generation, timeline-editing, shell, or other creative authoring tools

#### Scenario: Character affordances are not creative tools
- **WHEN** a future character capability such as voice preview or emote playback is introduced
- **THEN** it is modeled as an interaction affordance or host-side preview action rather than granting creative authoring tools to the Character Dialogue session

### Requirement: Character Dialogue conversation kind hides creative controls
The Agent Webview SHALL represent Character Dialogue as a conversation/session kind distinct from media `SessionMode`. While Character Dialogue is active, Webview MUST hide creative model controls, execution mode controls, and media generation controls, and MUST show character identity and exit controls.

#### Scenario: Character Dialogue tab hides authoring controls
- **WHEN** `conversationKind` is `character-dialogue`
- **THEN** the model selector, execution mode selector, and media generation bar are hidden

#### Scenario: Character identity header is visible
- **WHEN** a Character Dialogue session is displayed
- **THEN** the Webview shows the character identity summary and allows the user to inspect the profile snapshot used for the prompt

### Requirement: Thin profiles offer explicit handling
The system SHALL detect whether an assembled character profile is thin, partial, or rich. When a profile is thin, the system MUST let the user start immediately, run project-scoped enrichment, or provide manual supplements before the Character Dialogue session starts.

#### Scenario: Thin profile prompts for handling
- **WHEN** deterministic assembly yields only a name and aliases
- **THEN** the system offers choices to start directly, extract project evidence, or manually supplement the profile

#### Scenario: Enrichment remains project-scoped
- **WHEN** the user chooses automatic enrichment
- **THEN** enrichment reads current project evidence such as Story/script occurrences and does not pull character facts from implicit global memory

### Requirement: Character Dialogue context and artifacts are project-scoped
The system SHALL keep Character Dialogue context scoped to the current project. Active Character Dialogue context MUST remain in memory unless saved as a character role artifact, and saved transcript/evaluation artifacts MUST be written under the current project `.neko/character-tests/`.

#### Scenario: Active context remains in memory
- **WHEN** the user is chatting inside Character Dialogue
- **THEN** the active transcript is held in session memory and is not written to `.neko/memory.md`, global memory, or standard conversation records

#### Scenario: Character role artifact saved in project
- **WHEN** the user exits Character Dialogue and chooses to save validation evidence
- **THEN** the system writes `.neko/character-tests/{entityId}-{timestamp}.json` under the current project root with entity ref, profile snapshot, transcript, evaluation, version, and timestamp fields

#### Scenario: Historical NPC artifacts remain historical
- **WHEN** historical `.neko/npc-tests/*.json` files exist
- **THEN** new Character Dialogue saves do not rewrite them or use that directory as the active artifact target

#### Scenario: Global packs require explicit binding
- **WHEN** a reusable identity or character pack is installed globally
- **THEN** it does not affect profile assembly until the user imports or binds it into the current project

### Requirement: Character dialogue evaluation reports validation evidence
The system SHALL evaluate Character Dialogue transcripts against the profile snapshot and report persona consistency, dialogue voice fit, knowledge leakage, relationship gaps, and suggested profile improvements. Evaluation output MUST be separate from entity mutation.

#### Scenario: Knowledge leakage is reported
- **WHEN** the character mentions a world fact that is absent from the profile snapshot and project-derived evidence
- **THEN** the evaluation report flags the turn as knowledge leakage with a reference to the relevant transcript message

#### Scenario: Relationship gap is reported
- **WHEN** the transcript reveals an undefined or missing relationship that project evidence supports
- **THEN** the evaluation report suggests adding or confirming that relationship without automatically writing it

### Requirement: Character suggestions require user confirmation
The system SHALL represent AI-inferred character improvements as suggestions until the user explicitly applies them. Applying a suggestion MUST route through entity metadata or relationship update commands owned by the entity service or provider.

#### Scenario: Suggested speech pattern does not auto-write
- **WHEN** evaluation infers that a character often says a catchphrase
- **THEN** the system presents an evaluation suggestion and does not update `CharacterRecord.metadata` automatically

#### Scenario: User applies suggestion
- **WHEN** the user confirms an evaluation suggestion
- **THEN** the system applies the update through `CreativeEntityService.updateMetadata()` or a relationship update command and refreshes entity projections
