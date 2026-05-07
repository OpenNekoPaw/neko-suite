# webview-engine-control-surface Specification

## Purpose
Define how Webviews interact with engine-owned rendering and media resources: authoritative content comes from engine frames, manifests, streams, or token URLs, while Webview-local prediction and high-frequency UI controls remain bounded and explicit.
## Requirements
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

### Requirement: Panoramic Webviews Consume Engine Preview Manifests
The system SHALL require panoramic preview Webviews to consume engine-issued preview manifests, token URLs, tile templates, proxy variants, or stream descriptors for Neko-owned media content. Panoramic Webviews MUST NOT use direct local file paths or direct `asWebviewUri` media content as a parallel loading path.

#### Scenario: Webview loads manifest source
- **WHEN** a panoramic preview Webview starts
- **THEN** it receives a manifest-derived source and does not receive a raw local media file path for content loading

#### Scenario: Bundle assets may still use asWebviewUri
- **WHEN** the Webview loads its JavaScript, CSS, icons, or other extension bundle assets
- **THEN** it may use `webview.asWebviewUri` for those bundle resources while still avoiding direct `asWebviewUri` media content loading

### Requirement: High-frequency Panoramic Control Remains Webview-local
The system SHALL keep high-frequency panoramic viewer controls in the Webview. `yawDeg`, `pitchDeg`, `fovDeg`, drag, wheel, and inertial updates MUST NOT be routed through Extension Host or engine as per-frame control messages.

#### Scenario: Pointer drag bypasses Extension Host
- **WHEN** a user drags the panoramic sphere viewer
- **THEN** the Webview updates local view state and renders without sending per-frame messages to Extension Host

#### Scenario: Wheel zoom bypasses engine
- **WHEN** a user changes FOV with the mouse wheel
- **THEN** the Webview updates local FOV and does not dispatch an engine command for every wheel event

### Requirement: Low-frequency Panoramic Control Crosses Boundary Explicitly
The system SHALL send panoramic control data across Extension Host or engine boundaries only for semantic low-frequency operations. Such operations MUST use serializable DTOs such as `PanoramaViewState`, `PreviewVariant` requests, or `EnvironmentPlacement`.

#### Scenario: Save default view crosses boundary
- **WHEN** the user saves the current view as the default view
- **THEN** the Webview sends a serialized `PanoramaViewState` to persist through Extension Host or engine-backed metadata

#### Scenario: Variant request crosses boundary
- **WHEN** the Webview requests an FOV crop, screenshot, tile, or proxy variant
- **THEN** it sends a serialized variant request instead of raw renderer objects or callbacks

#### Scenario: Send to model uses placement DTO
- **WHEN** the user sends a panorama to `neko-model`
- **THEN** the request uses `EnvironmentPlacement` semantics rather than leaking Webview camera controller state

### Requirement: Extension Host Remains Low-frequency Boundary For Panoramic Preview
The system SHALL keep Extension Host responsible for VSCode APIs, custom editor registration, command routing, engine discovery, manifest registration, and lifecycle cleanup. Extension Host MUST NOT relay decoded image pixels, video frames, or high-frequency panoramic camera updates.

#### Scenario: Extension Host registers asset
- **WHEN** a panoramic custom editor resolves
- **THEN** Extension Host registers the source with the engine and sends the resulting manifest to the Webview

#### Scenario: Extension Host does not relay frames
- **WHEN** a panoramic video stream is active
- **THEN** decoded frames or encoded media chunks flow through engine/Webview stream clients rather than Extension Host `postMessage`

#### Scenario: Extension Host owns cleanup
- **WHEN** Extension Host starts or registers an engine preview resource on behalf of a Webview
- **THEN** it releases that token or stream during source change, Webview disposal, startup failure, or explicit stop

### Requirement: Cross-extension Panoramic Delegation Uses Allowed Mechanisms
The system SHALL use commands, `vscode.openWith`, extension exports accessed through local minimal interfaces, or shared contracts for panoramic cross-extension delegation. Extensions MUST NOT directly import another extension package's implementation or exported API types.

#### Scenario: Canvas opens preview
- **WHEN** Canvas delegates a panoramic asset to professional viewing
- **THEN** it uses an allowed command or `vscode.openWith` route rather than importing `neko-preview` implementation files

#### Scenario: Model receives environment placement
- **WHEN** `neko-preview` sends a panorama to `neko-model`
- **THEN** it calls an allowed command/API boundary with serializable data and does not import `neko-model` Webview or extension internals

#### Scenario: Shared types prevent API type import
- **WHEN** two extensions need the same panoramic DTO
- **THEN** the DTO lives in `@neko/shared` or is locally declared as a minimal interface rather than imported from the other extension package
