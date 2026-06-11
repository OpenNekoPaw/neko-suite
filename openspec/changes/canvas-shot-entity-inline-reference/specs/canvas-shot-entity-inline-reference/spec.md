## ADDED Requirements

### Requirement: Storyboard delivery injects entity references before import
The system SHALL process available `EntityMemoryContribution` data before assembling a one-click Send to Canvas payload. The delivery path MUST inject `entityRef` for matched existing entities or `candidateId` for matched/created candidates before calling `canvas.importStoryboard`. If entity processing times out or fails, the system MAY import with `characterName` only but MUST emit unlinked or ambiguous diagnostics.

#### Scenario: Matched existing entity is imported inline
- **WHEN** Agent output includes a storyboard character and entity contribution resolves it to an existing entity
- **THEN** the Canvas storyboard payload includes `characters[].entityRef`
- **THEN** `canvas.importStoryboard` creates scene/shot nodes without creating entity facts

#### Scenario: Candidate result is imported with candidateId
- **WHEN** entity contribution creates or matches an open candidate for a storyboard character
- **THEN** the Canvas storyboard payload includes `characters[].candidateId`
- **THEN** future candidate confirmation can locate the shot character without name matching

#### Scenario: Contribution timeout degrades explicitly
- **WHEN** contribution processing exceeds the configured timeout
- **THEN** storyboard import may continue with `characterName` only
- **THEN** the affected characters carry unlinked or ambiguous diagnostics rather than promising automatic confirm backfill

### Requirement: Decision mapping uses stable keys before names
The system SHALL map entity contribution decisions to storyboard shot characters using stable keys in this order: `storyboardCharacterId` or `StoryboardShotCharacter.characterId`, shot id plus character id, shot number plus character index, source provenance, and finally name. Name fallback MUST NOT write automatically when multiple shot characters, candidates, or entities could match.

#### Scenario: Character id maps candidate to shot
- **WHEN** a decision includes a candidate id and a storyboard character id
- **THEN** delivery writes the candidate id to the matching shot character

#### Scenario: Same name creates ambiguous diagnostic
- **WHEN** two shot characters share a name and no stable mapping key distinguishes them
- **THEN** delivery does not write a candidate id by name
- **THEN** the Canvas payload includes an ambiguity diagnostic for user resolution

### Requirement: Canvas import remains storyboard-only
Canvas SHALL import storyboard payloads by creating scene and shot nodes and writing shot-level fields. Canvas import MUST NOT confirm entities, create entity candidates, write entity binding files, or automatically project `entity`, `representation-slot`, `occurrence`, or `generated-asset` node subgraphs.

#### Scenario: Import creates only scene and shot graph
- **WHEN** a storyboard payload includes characters with `entityRef` or `candidateId`
- **THEN** Canvas creates scene/shot nodes and stores those inline refs on shot character data
- **THEN** Canvas does not create entity graph nodes as an import side effect

### Requirement: Canvas host exposes entity message routes
The Canvas Extension Host SHALL expose narrow Webview message routes for entity summary reads, candidate confirmation, and Inspector triggers. Routes MUST validate payloads, call Entity Facade or Dashboard commands, and return bounded results to the Webview.

#### Scenario: Hover Card requests entity summary
- **WHEN** the Canvas Webview sends an entity summary request for a shot character
- **THEN** the Extension Host resolves the summary through the entity facade or Dashboard source
- **THEN** the Webview receives a bounded summary suitable for Hover Card display

#### Scenario: Candidate confirm routes through facade
- **WHEN** a user confirms a candidate from the Hover Card
- **THEN** Canvas Extension Host invokes `neko.entity.confirmCandidate`
- **THEN** the Webview receives success or diagnostic state without directly calling VSCode APIs

### Requirement: Shot character rows show reference state
Canvas SHALL render shot character rows with confirmed, candidate, unlinked, and ambiguous states based on inline `entityRef`, `candidateId`, and diagnostics. The rendering MUST keep entity facts read-only in Canvas and MUST route edits or confirmations through commands.

#### Scenario: Confirmed character row shows entity state
- **WHEN** a shot character has `entityRef`
- **THEN** Canvas displays confirmed state, optional thumbnail summary, and entity actions

#### Scenario: Candidate character row shows review state
- **WHEN** a shot character has `candidateId` but no `entityRef`
- **THEN** Canvas displays candidate state and actions to confirm, bind to existing, ignore, or inspect

### Requirement: Candidate confirmation backfills shot entity refs
Canvas SHALL listen for entity change events and update shot characters whose `candidateId` matches a changed candidate ref that contains a confirmed `entityRef`. Backfill MUST clear the `candidateId` after setting `entityRef` and MUST be retryable if the Canvas document is temporarily unavailable.

#### Scenario: Confirm event updates shot character
- **WHEN** `CreativeEntityChangeEvent.changedRefs[]` contains `{ kind: "candidate", id: candidateId, entityRef }`
- **THEN** Canvas updates every open shot character with the matching `candidateId`
- **THEN** the character becomes confirmed and no longer stores that candidate id

#### Scenario: Backfill failure is recoverable
- **WHEN** candidate confirmation succeeds but Canvas cannot update the open document
- **THEN** the confirmed entity fact remains valid
- **THEN** Canvas can retry backfill or allow manual association later
