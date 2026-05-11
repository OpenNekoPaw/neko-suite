# story-video-readiness-table Specification

## Purpose

Define Story's scene-level AI video readiness table. Story owns script facts, scene readiness, character visual readiness, missing-input signals, and scene-level handoff actions, while Canvas remains the formal shot-level storyboard workspace.

## Requirements

### Requirement: Story exposes a scene-level AI video readiness table
The system SHALL present the Story storyboard table as a scene-level AI video readiness table. The table MUST use script scenes as its primary rows and MUST NOT expose shot-level editing, candidate switching, drag ordering, or batch generation queue controls.

#### Scenario: Scene readiness rows are shown
- **WHEN** a user opens the Story table for an indexed screenplay
- **THEN** the table displays one row per script scene with scene title, summary, estimated duration, character visual readiness, creator status, and allowed scene actions

#### Scenario: Shot editing stays out of Story
- **WHEN** a scene has been imported into Canvas with multiple ShotNodes
- **THEN** the Story table displays Canvas progress as a scene summary and does not render editable shot rows or candidate image controls

### Requirement: Story computes readiness in the Extension Host
The system SHALL compute `StorySceneVideoReadiness` in the Story Extension Host before sending data to the Story Webview. The Webview MUST render readiness data and send user actions, but MUST NOT call VSCode, Canvas, Assets, or Agent APIs directly.

#### Scenario: Readiness payload is sent to Webview
- **WHEN** Story refreshes preview data for an active script document
- **THEN** the Extension sends each scene's readiness status, missing inputs, character visual statuses, and downstream workflow statuses to the Webview

#### Scenario: External services are unavailable
- **WHEN** Assets, Canvas, or Agent APIs are unavailable during readiness computation
- **THEN** Story still sends script-derived readiness data and marks unavailable downstream fields as unknown or not available

### Requirement: Story identifies characters from structured and registered narrative mentions
The system SHALL keep Fountain `character` elements as the structured character source and MUST additionally detect conservative narrative mentions from the project character registry. Registry mention matching MUST use canonical names, display names, aliases, or script-facing names and MUST record the match source.

#### Scenario: Fountain character line is indexed
- **WHEN** a scene contains a standard Fountain character element
- **THEN** Story includes that character in the scene readiness characters with a structured match source

#### Scenario: Chinese narrative mention is indexed
- **WHEN** a scene action paragraph mentions a name that exists in `characters.json` as a canonical name, display name, alias, or script-facing name
- **THEN** Story includes that character in the scene readiness characters with a registry mention source

#### Scenario: Unregistered text is ignored
- **WHEN** a scene action paragraph contains a word that is not in the character registry and is not a Fountain character element
- **THEN** Story does not treat that word as a character readiness entry

### Requirement: Story models character visual readiness explicitly
The system SHALL represent each scene character with explicit visual readiness, separate from thumbnail presence. Character visual readiness MUST include character name, optional character ID, match source, status, optional thumbnail URI, optional asset references, and optional missing reason.

#### Scenario: Bound character has visual asset
- **WHEN** a scene character resolves to a registry record with a usable asset binding or thumbnail
- **THEN** Story marks the character visual readiness as bound and displays the thumbnail when available

#### Scenario: Character is recognized but lacks visual asset
- **WHEN** a scene character is recognized but has no usable visual asset binding or thumbnail
- **THEN** Story marks the character visual readiness as missing and exposes an action path to generate or complete the character design

#### Scenario: Character cannot resolve to registry
- **WHEN** a scene character appears in the script but cannot be resolved to the character registry
- **THEN** Story marks the character visual readiness as unresolved rather than silently hiding the character

### Requirement: Story exposes missing inputs as creator-facing readiness signals
The system SHALL compute scene missing inputs as structured readiness signals. Missing inputs MUST be suitable for UI display and Agent handoff, including missing character visuals, unresolved characters, missing location/environment hints, missing duration confidence, and missing Canvas handoff.

#### Scenario: Missing character visual blocks ready status
- **WHEN** a scene contains at least one required character whose visual readiness is missing or unresolved
- **THEN** Story marks the scene readiness as needs-input and lists the missing character visual input

#### Scenario: Scene is ready for handoff
- **WHEN** a scene has sufficient script structure, estimated duration, and all required character visuals are bound or intentionally skipped
- **THEN** Story marks the scene readiness as ready or in-progress according to Agent and Canvas workflow state

### Requirement: Story actions follow scene readiness and workflow state
The system SHALL expose scene-level actions based on readiness and workflow state. Actions MUST include analyze, start video creation, generate storyboard, send to Canvas, open Canvas, retry failed, and skip/restore where applicable.

#### Scenario: Pending ready scene can start creation
- **WHEN** a scene is ready and has not started the video creation workflow
- **THEN** Story exposes a primary start video creation action

#### Scenario: Imported scene opens Canvas
- **WHEN** a scene has a Canvas binding or execution summary
- **THEN** Story exposes an open Canvas action that opens the Canvas file and selects or focuses the linked SceneGroup when possible

#### Scenario: Skipped scene can be restored
- **WHEN** a scene is marked skipped
- **THEN** Story hides generation actions and exposes a restore action

### Requirement: Story thumbnail affordances indicate readiness without becoming an asset browser
The system SHALL use character thumbnails in Story as readiness affordances. Story MAY display small thumbnails and hover previews, but MUST NOT implement full asset gallery browsing, candidate comparison, or shot result review in the Story table.

#### Scenario: Thumbnail indicates bound visual
- **WHEN** a character visual readiness includes a thumbnail URI
- **THEN** Story displays the thumbnail as part of the character readiness badge

#### Scenario: Missing thumbnail still shows status
- **WHEN** a character has no thumbnail URI
- **THEN** Story still displays the character name and explicit visual readiness status rather than leaving the character column blank

### Requirement: Story sends enriched character and scene context to Agent
The system SHALL send Agent context for character and scene actions with stable story IDs and available visual references. Payloads MUST remain backward compatible with existing `story-selection` context by making new fields optional.

#### Scenario: Character context includes visual references
- **WHEN** a user sends a character readiness badge to Agent
- **THEN** the context payload includes character name, source script URI, optional character ID, optional asset entity IDs, optional thumbnail reference, and readiness status

#### Scenario: Scene context includes missing inputs
- **WHEN** a user asks Agent to analyze or generate a scene from the readiness table
- **THEN** the context payload includes scene ID, source script URI, selected text range, readiness status, and missing input summaries
