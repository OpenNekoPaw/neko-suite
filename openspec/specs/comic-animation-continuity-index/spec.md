# comic-animation-continuity-index Specification

## Purpose
TBD - created by archiving change add-comic-animation-incremental-indexing. Update Purpose after archive.
## Requirements
### Requirement: Story continuity records are shared evidence contracts
The system SHALL define shared `PlotEvent`, `CharacterStateChange`, and `ContinuityConstraint` contracts for comic-to-animation continuity evidence. Each record MUST include stable source evidence references, ordering or applicability metadata, confidence when available, and enough identity refs to support later retrieval.

#### Scenario: Plot event records source evidence
- **WHEN** Agent extracts a story event from a comic panel
- **THEN** the event records a stable source range reference, participants when known, an order index, confidence when available, and evidence refs

#### Scenario: Character state change records temporal evidence
- **WHEN** a character changes outfit, injury state, location, knowledge, relationship, goal, emotion, appearance, or voice state
- **THEN** the state change records the affected character ref, dimension, before/after values when available, source range ref, and confidence

### Requirement: Story continuity can be queried as bounded snapshots
The system SHALL define `StoryContinuityQuery` and `StoryContinuitySnapshot` contracts. A query MUST support story position, character refs, location refs, include flags, and optional lookback limit. A snapshot MUST return bounded events, character states, constraints, unresolved questions, and diagnostics.

#### Scenario: Agent queries current scene continuity
- **WHEN** Agent prepares a storyboard for a scene
- **THEN** it can query continuity by current scene or story position
- **THEN** the returned snapshot includes recent plot events, relevant character state changes, blocking constraints, and diagnostics

#### Scenario: Omitted lookback is bounded
- **WHEN** Agent sends a continuity query without `lookbackLimit`
- **THEN** the runtime does not perform an unbounded full-project scan
- **THEN** it applies the default scene or chapter boundary and a system maximum result limit

### Requirement: Continuity query is read-only
The system SHALL treat `StoryContinuityIndex` queries as read-only retrieval. Query execution MUST NOT confirm entities, merge memories, overwrite continuity facts, or mutate source evidence.

#### Scenario: MentionResolver consumes continuity snapshot
- **WHEN** MentionResolver needs context for a pronoun or title
- **THEN** it may consume a `StoryContinuitySnapshot`
- **THEN** it still uses its own confidence gate and review path before binding an entity candidate

#### Scenario: Canvas displays continuity diagnostics
- **WHEN** Canvas receives a snapshot containing blocking constraints
- **THEN** it can display diagnostics for review
- **THEN** it does not mutate PlotEvent or CharacterStateChange records directly from display state

### Requirement: Continuity facts remain separate from AI summaries
The system SHALL persist continuity facts with provenance instead of relying on chat context or ungrounded AI summaries. AI-generated continuity candidates MUST be stored as candidate or reviewable records until accepted by the appropriate workflow.

#### Scenario: AI extracts an uncertain event
- **WHEN** AI extracts a plot event with low confidence or conflicting evidence
- **THEN** the event is marked with diagnostics or review state
- **THEN** it is not treated as a blocking confirmed continuity constraint

#### Scenario: Generated media does not overwrite source continuity
- **WHEN** a generated video or image suggests a character state not present in source evidence
- **THEN** the generated artifact may be stored as derived evidence
- **THEN** it does not overwrite source-backed character state without explicit review or approval

