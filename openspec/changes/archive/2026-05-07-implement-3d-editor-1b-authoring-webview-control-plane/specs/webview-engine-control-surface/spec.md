## ADDED Requirements

### Requirement: Route A visible content comes only from Engine frames
The system SHALL make `VideoViewport` the only visible 3D model surface in Route A. Webview MUST NOT render a persistent R3F/Three.js model scene as the main visual preview while an Engine render stream is available.

#### Scenario: Engine stream is available
- **WHEN** Webview has a valid `RenderStreamDescriptor` and WebCodecs is available
- **THEN** the visible model image comes from decoded Engine frames and no R3F model canvas is mounted as a competing visual truth

#### Scenario: Development fallback is clearly isolated
- **WHEN** Route A is unavailable and a development fallback is enabled
- **THEN** Webview marks the fallback as non-authoritative and excludes it from WYSIWYG validation, export, and command commit semantics

### Requirement: R3F is limited to prediction and development fallback
The system SHALL allow R3F/Three.js only for short-lived interaction prediction, non-PBR ghost overlays, local helper geometry, or explicitly marked development fallback. R3F prediction MUST be tagged with revision, seq, viewport id, and session or topology version when applicable.

#### Scenario: Morph prediction clears after Engine frame
- **WHEN** a morph slider prediction is visible and Engine sends a frame whose `appliedSeq` includes the morph command
- **THEN** Webview removes the R3F prediction layer and shows the Engine frame as the visual truth

#### Scenario: Prediction cannot persist across topology change
- **WHEN** Webview receives a `TopologyChangeEvent` for the predicted mesh
- **THEN** Webview discards any R3F or local geometry prediction for the old topology version

### Requirement: Legacy panels compile to Engine commands or become unavailable
The system SHALL migrate Webview Face, Expression, Bone, Shape, CSG, Text, Animation, Keyframe, and Inspector panels to emit SceneCommand, CharacterCommand, ModelingSession command, query, or Extension low-frequency file operation. Panels without an Engine-backed command path MUST be hidden, disabled, or labeled unavailable in Route A.

#### Scenario: Face editor is command-backed
- **WHEN** the user edits a face parameter in Route A
- **THEN** the panel sends a character command and does not write the parameter only into Zustand or an R3F model

#### Scenario: Unsupported panel is disabled
- **WHEN** a panel still depends on R3F-only mutation
- **THEN** Route A disables that panel until it has an Engine command mapping

### Requirement: InteractionLayer routes viewport input to Engine-scoped queries
The system SHALL route selection, hit-test, projected bounds, gizmo anchor, snap, lasso, and camera control through an `InteractionLayer` that is scoped by viewport id and scene revision. Queries MUST return the revision and viewport id they were computed against.

#### Scenario: Viewport click selects Engine node
- **WHEN** the user clicks inside `VideoViewport`
- **THEN** Webview sends a viewport-scoped hit-test query and applies selection only when the result revision is compatible

#### Scenario: Gizmo anchor follows Engine data
- **WHEN** a selected node moves after an acknowledged command
- **THEN** Webview updates the gizmo anchor from Engine query or delta data aligned with the rendered frame

### Requirement: LocalPredictionLayer has explicit lifecycle
The system SHALL centralize transform, camera, morph, IK, brush, selection, snap, and topology preview predictions in `LocalPredictionLayer`. Predictions MUST have create, update, commit, rollback, timeout, and invalidation behavior tied to ack, delta, topology event, and frame metadata.

#### Scenario: Prediction times out
- **WHEN** a prediction does not receive ack, rejection, resync, or matching frame metadata within its timeout budget
- **THEN** Webview rolls back the prediction and requests scene or modeling resync

### Requirement: Extension Host remains a low-frequency VSCode boundary
The system SHALL keep Extension Host limited to VSCode API access, resource URI conversion, workspace file operations, template resolution, import/export dialogs, and Engine discovery. Extension Host MUST NOT relay Route A video frames, SceneDelta, brush patches, or high-frequency character slider events.

#### Scenario: Character slider bypasses Extension
- **WHEN** the user drags a character morph slider
- **THEN** Webview sends the command directly to Engine and Extension Host is not on the high-frequency path
