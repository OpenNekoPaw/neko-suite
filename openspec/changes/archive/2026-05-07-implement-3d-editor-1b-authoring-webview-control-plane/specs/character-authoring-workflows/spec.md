## ADDED Requirements

### Requirement: Users can create characters from templates
The system SHALL allow users to create editable character instances from workspace or neko-market templates. Template creation MUST produce a `.nkc` override asset, register referenced data in AssetDatabase, and instantiate an Engine scene character instance.

#### Scenario: Create character from template
- **WHEN** the user chooses a character template from the library
- **THEN** the system creates a project-local `.nkc` override, resolves its `.nkcdata` references, and displays the Engine-rendered character in `VideoViewport`

### Requirement: Morph sliders are command-driven with local prediction
The system SHALL drive morph sliders through `CharacterCommand(type='morph:set')`. Webview prediction MUST be short-lived and MUST be cleared or corrected by ack, `SceneDelta`, or matching `RenderFrameMeta`.

#### Scenario: Morph slider updates the Engine character
- **WHEN** the user drags a face morph slider
- **THEN** Webview sends coalesced morph commands to Engine and the authoritative visible result comes from subsequent Engine video frames

#### Scenario: Rejected morph command rolls back prediction
- **WHEN** Engine rejects a morph command because the morph name is invalid
- **THEN** Webview clears the local prediction and restores the slider from the resynced character state

### Requirement: Material layer edits use character authoring commands
The system SHALL edit character material layers through commandized authoring operations. Material edits MUST update `.nkc` override data or character material descriptors and MUST flow through AssetDatabase before reaching GPU resources.

#### Scenario: Skin material color changes
- **WHEN** the user changes a character skin material color in Inspector
- **THEN** Engine stores the change in character authoring data, marks the material dirty, and the next Engine frame reflects the new material

### Requirement: Expression presets compile to character commands
The system SHALL compile expression preset operations into one or more character commands instead of applying presets directly to a Webview VRM object.

#### Scenario: Expression preset is applied
- **WHEN** the user selects a smile expression preset
- **THEN** Webview sends the preset as character commands and does not mutate an R3F-only expression manager as the authoritative state

### Requirement: Bone and IK controls are Engine-authored
The system SHALL express bone pose, IK handle, and skeleton binding edits as Engine-authored commands. Webview MUST use prediction overlays for interaction feedback and MUST not persist skeleton edits outside Engine authoring state.

#### Scenario: IK handle drag
- **WHEN** the user drags an IK handle in the viewport
- **THEN** Webview renders a prediction overlay, sends an IK command, and commits only the Engine-acknowledged pose

### Requirement: Inspector schema is generated from character and component schemas
The system SHALL build the character Inspector from `LayeredCharacterDescription` schema, ComponentSchemaRegistry, and AssetDatabase descriptors. Inspector controls MUST compile edits to scene or character commands.

#### Scenario: Character control appears in Inspector
- **WHEN** a selected character exposes a `head.eyeSize` morph control in its schema
- **THEN** Inspector renders the control and sends `CharacterCommand(type='morph:set')` when the user edits it

#### Scenario: Unsupported field is read-only
- **WHEN** a schema field has no command mapping
- **THEN** Inspector displays it as read-only or hides it instead of writing directly to Webview state

### Requirement: Character undo and redo use command history
The system SHALL make character undo and redo operate on acknowledged commands or explicit override diffs. Undo and redo MUST not replay Webview prediction snapshots.

#### Scenario: Undo morph edit
- **WHEN** the user undoes an acknowledged morph slider edit
- **THEN** Engine applies the inverse authoring change and emits a new revision and delta
