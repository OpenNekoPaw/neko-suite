## ADDED Requirements

### Requirement: Scene surfaces default to storyboard table review
The Canvas Webview SHALL render Scene expanded or overlay creator surfaces with a storyboard table as the default view. Each row MUST represent a direct Shot child in canonical Scene container order.

#### Scenario: Scene opens in storyboard table view
- **WHEN** a Scene container is opened in an expanded or overlay creator surface
- **THEN** the default view is the storyboard table view
- **THEN** direct Shot children are listed in canonical Scene container order

#### Scenario: Scene retains creative view
- **WHEN** the user switches the Scene surface to creative view
- **THEN** the surface renders a visual card or rail view of the Scene children without changing Scene child membership or Shot data

### Requirement: Storyboard table exposes creator review columns
The Scene storyboard table SHALL include a default creator review profile with columns for Shot, Image, Duration, Camera, Visual / Action, Characters, Dialogue / SFX, Tags / Style, and Status.

#### Scenario: Default review columns render
- **WHEN** a Scene storyboard table is rendered
- **THEN** it shows the default creator review columns
- **THEN** it does not show advanced media refs, provider ids, confidence scores, source refs, or cost estimates unless those columns are enabled by a field profile

#### Scenario: Row data comes from Shot nodes
- **WHEN** a storyboard table row displays visual description, duration, camera metadata, dialogue, or status
- **THEN** the value is read from the referenced Shot node data
- **THEN** edits to editable row fields write back to the referenced Shot node data instead of table-owned copies

### Requirement: Scene table image cells reuse Canvas preview resolution
The Scene storyboard table SHALL render image cells through the Canvas node-card preview/resource resolution path. Image cells MUST NOT use Agent Webview media components, durable cache paths, or ad hoc raw file-path rendering as the authoritative source.

#### Scenario: Generated image appears in table cell
- **WHEN** a Shot has a selected generated image or generated image value
- **THEN** the Scene table image cell resolves and renders it through the same preview descriptor path used by Canvas Shot cards

#### Scenario: Referenced image appears in table cell
- **WHEN** a Shot has a runtime reference image, reference image path, reference image resource ref, or stable resource ref
- **THEN** the Scene table image cell uses the Canvas preview resolver boundary to render the best available thumbnail
- **THEN** the table does not persist the resolved Webview URL or cache path into Canvas data

#### Scenario: Missing image shows unavailable state
- **WHEN** a Shot has no renderable generated or referenced image
- **THEN** the Scene table image cell shows a bounded unavailable state
- **THEN** it does not reuse another Shot's previous thumbnail

### Requirement: Scene view tools control presentation only
The Scene creator surface SHALL expose view-mode, field, filter, and sort tools as presentation controls. These controls MUST NOT change Shot business data unless the user edits an explicit row field.

#### Scenario: Field profile toggles columns
- **WHEN** the user enables a professional column from the field picker
- **THEN** the table shows that column using existing node data or diagnostics
- **THEN** no duplicated table-owned copy of the data is written to `.nkc`

#### Scenario: Review filter narrows visible rows
- **WHEN** the user applies a filter such as missing image, missing dialogue, failed generation, ungenerated, has diagnostics, current character, or current scene tag
- **THEN** the table narrows the visible rows according to that predicate
- **THEN** the underlying Scene child order and Shot data remain unchanged

### Requirement: Shot detail defaults to creator refinement fields
The Shot creator detail surface SHALL show creator-relevant fields by default and keep machine-facing production metadata in collapsed advanced or diagnostic sections.

#### Scenario: Shot detail opens with creator fields
- **WHEN** a Shot is opened in a creator detail or overlay surface
- **THEN** the default visible content includes preview, duration, shot scale, camera angle, camera movement, visual description, character action, characters, emotion, dialogue, voice-over, sound cue, visual style, generation prompt, and concise image/source status

#### Scenario: Shot advanced sections are collapsed
- **WHEN** a Shot with source media refs, generated media refs, image-prep plan, visual occurrences, character candidates, continuity diagnostics, or batch execution plan is opened
- **THEN** those machine-facing sections are collapsed by default
- **THEN** the user can expand them without losing access to the underlying data

### Requirement: Other Canvas objects use content-shaped creator surfaces
Canvas creator-facing presentations SHALL match each object type's content shape rather than applying storyboard table UI globally.

#### Scenario: Gallery remains visual first
- **WHEN** a Gallery container opens in a creator surface
- **THEN** it defaults to a visual grid suitable for image comparison
- **THEN** it may expose a list or review mode for labels, status, references, and Shot usage

#### Scenario: Group summarizes mixed content
- **WHEN** a Group container opens in a creator surface
- **THEN** it summarizes child types, counts, and statuses
- **THEN** it may expose a type-grouped list without duplicating child business data

#### Scenario: Script uses Fountain outline
- **WHEN** a Script node opens in a creator surface
- **THEN** it presents a Fountain scene outline or linked-scene table
- **THEN** it does not depend on deprecated `.nks` or `.story` assumptions

#### Scenario: Document supports source review
- **WHEN** a Document node represents a page-based or comic source
- **THEN** its creator surface can present page/source review rows and a visual page grid for provenance inspection

### Requirement: Long creator text remains bounded
Creator-facing table and detail surfaces SHALL keep long text bounded so cells, buttons, controls, and neighboring content do not overlap.

#### Scenario: Long visual description is bounded
- **WHEN** a Shot row contains a long visual description, prompt, dialogue, or diagnostic message
- **THEN** the text wraps, clamps, scrolls internally, or opens in an expanded cell affordance
- **THEN** it does not overlap adjacent cells, the table toolbar, or playback controls

### Requirement: Runtime presentation state is not persisted as Canvas data
The system SHALL keep creator presentation runtime state separate from durable Canvas data. It MUST NOT persist resolved Webview URLs, object URLs, cache paths, table scroll offsets, open popovers, active filters, or active row focus as Shot, Scene, or Canvas business data.

#### Scenario: Save omits presentation runtime state
- **WHEN** a Canvas file is saved after a Scene table resolves images and the user changes view tools
- **THEN** the saved Canvas data contains stable node data and resource refs
- **THEN** it does not contain resolved Webview URLs, object URLs, cache paths, table scroll offsets, open popovers, or active row focus
