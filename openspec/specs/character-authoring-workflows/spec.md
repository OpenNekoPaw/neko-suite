# character-authoring-workflows Specification

## Purpose
TBD - created by archiving change implement-3d-editor-1b-authoring-webview-control-plane. Update Purpose after archive.
## Requirements
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

### Requirement: Model Selection Query And Store Close The Loop
Model viewport selection SHALL close through scene-control hit-test or selection command results, compatible revision checks, and model store updates before selection-dependent UI is considered authoritative.

#### Scenario: Click selection updates model store
- **WHEN** the user clicks an engine-rendered model viewport
- **THEN** Webview sends a viewport-scoped selection command or hit-test query and updates selected model state only from a compatible ack, delta, snapshot, or query result

#### Scenario: Stale selection result is rejected
- **WHEN** a hit-test or selection result references an older scene revision than the current model controller state
- **THEN** Webview does not apply the stale selection as authoritative and requests fresh state if needed

### Requirement: Model Gizmo Queries Drive Overlay State
Model gizmo overlays SHALL be driven by viewport-scoped projected bounds and gizmo anchor results stored in controller or model state.

#### Scenario: Selection requests bounds and anchor
- **WHEN** a model node becomes selected
- **THEN** Webview requests projected bounds and gizmo anchor data for the active viewport and stores results with viewport id and revision

#### Scenario: Gizmo overlay uses stored query result
- **WHEN** the overlay renderer draws a selected model gizmo
- **THEN** it uses stored projected bounds or anchor data compatible with the displayed frame metadata

### Requirement: Model Transform Drag Commits Through Scene-control
Model viewport transform drag SHALL create local prediction during pointer movement and commit or roll back through scene-control acknowledgements and authoritative state updates.

#### Scenario: Drag sends transform command
- **WHEN** the user drags a model transform gizmo
- **THEN** the model controller creates a bounded prediction and sends a `viewport:transform` or model scene command with sequence, correlation id, viewport id, and base revision

#### Scenario: Transform ack updates authoritative model state
- **WHEN** the engine acknowledges a transform drag command
- **THEN** Webview commits or clears the prediction and updates selected node transform state from ack/delta/snapshot data

#### Scenario: Transform error rolls back local drag
- **WHEN** the engine rejects a transform command
- **THEN** Webview rolls back the predicted gizmo/transform state and surfaces a diagnostic

### Requirement: Character Preview Modes Are Semantic Controls
Character preview mode changes SHALL be represented as semantic controller commands rather than inferred from video-frame changes.

#### Scenario: Face preview mode updates after ack
- **WHEN** the user switches to face preview mode
- **THEN** the model controller sends a preview-mode command and marks the UI active only after ack or authoritative preview state update

#### Scenario: Playback preview remains command-backed
- **WHEN** the user starts, stops, or changes action/voice preview playback
- **THEN** Webview sends semantic playback or asset-slot commands and does not treat video motion alone as proof that playback state changed

### Requirement: AI Character Authoring Provides Preview Evaluation Modes
The system SHALL integrate AI character preview modes into character authoring workflows so generated characters can be evaluated through face, full-body, motion, and voice-pack scenes before export or use in animation.

#### Scenario: Generated character enters preview workflow
- **WHEN** an AI-generated character is loaded into Neko Model authoring
- **THEN** the character authoring UI exposes preview evaluation modes for face, full-body, motion, and voice-pack checks when the engine reports preview-mode capability

#### Scenario: Preview workflow does not replace editing commands
- **WHEN** the user edits morphs, materials, bones, IK, or expressions while a preview mode is active
- **THEN** those edits still compile to character or scene commands and reconcile through engine revisions rather than mutating only Webview-local state

### Requirement: AI Preview Modes Use Character Assets And Bindings
The system SHALL resolve preview mode content from character authoring assets, including skeleton, morphs, expression presets, animation clips, voice packs, viseme bindings, materials, and metadata. Missing or incompatible assets MUST be reported as preview diagnostics without corrupting character authoring data.

#### Scenario: Motion mode resolves compatible clips
- **WHEN** motion preview mode starts for a character with registered compatible demo animation clips
- **THEN** Engine selects the requested clip or a deterministic default clip and plays it against the character's authoritative rig bindings

#### Scenario: Voice mode resolves voice pack binding
- **WHEN** voice-pack preview mode starts for a character with a registered voice pack and compatible viseme bindings
- **THEN** Engine resolves the voice pack, audio stream, viseme timing, and expression mapping through character authoring metadata or AssetDatabase descriptors

#### Scenario: Preview leaves source assets immutable
- **WHEN** preview mode applies camera presets, lighting presets, demo clips, voice playback, or diagnostics
- **THEN** it does not mutate source template assets, imported files, or generated asset data unless the user performs an explicit authoring edit command

### Requirement: AI Preview State Participates In Character Undo Boundaries
The system SHALL keep preview mode selection and playback control separate from destructive character authoring edits. Undo and redo MUST operate on acknowledged character edits and MUST NOT replay transient preview mode selection as if it were a morph, material, skeleton, or asset edit.

#### Scenario: Undo skips preview selection
- **WHEN** the user switches preview modes and then undoes the last morph edit
- **THEN** Engine undoes the morph edit while leaving preview mode state governed by the active preview session policy

#### Scenario: Reset camera override is a viewport state operation
- **WHEN** the user resets a preview mode camera override
- **THEN** the operation updates preview viewport state and does not appear as a character geometry or material edit in the character undo history

### Requirement: Model Controller Uses ISceneController
Model editor viewport interactions SHALL be mediated by a `ModelController` implementation of `ISceneController`.

#### Scenario: Model pointer selection delegates through controller
- **WHEN** a user clicks the model viewport
- **THEN** ViewportShell delegates the event to ModelController, which sends an engine-mediated hit-test or selection command

#### Scenario: Model toolbar extensions are supplied by controller
- **WHEN** ViewportToolbar renders for a model scene
- **THEN** model-specific camera, material preview, or gizmo controls are supplied through controller toolbar descriptors

### Requirement: Character Prediction Uses Viewport Metadata
Character morph, IK, bone, and transform predictions in the model editor SHALL reconcile through ViewportProtocol events and frame metadata.

#### Scenario: IK prediction clears on frame
- **WHEN** a model IK command is acknowledged and a matching frame metadata event arrives
- **THEN** the model controller clears the local IK prediction and displays the engine frame as visual truth

