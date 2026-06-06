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
The system SHALL send panoramic control data across Extension Host or engine boundaries only for semantic low-frequency operations. Such operations MUST use serializable DTOs such as `PanoramaViewState`, `PreviewVariant` requests, projection metadata requests, or `EnvironmentPlacement`.

#### Scenario: Save default view crosses boundary
- **WHEN** the user saves the current view as the default view
- **THEN** the Webview sends a serialized `PanoramaViewState` to persist through Extension Host or engine-backed metadata

#### Scenario: Projection override crosses boundary
- **WHEN** the user confirms or changes the asset projection type
- **THEN** the Webview sends a serialized projection decision and does not mutate manifest state locally as the authoritative source

#### Scenario: Variant request crosses boundary
- **WHEN** the Webview requests an FOV crop, screenshot, tile, or proxy variant
- **THEN** it sends a serialized variant request instead of raw renderer objects or callbacks

#### Scenario: Send to model uses placement DTO
- **WHEN** the user sends a panorama to `neko-model`
- **THEN** the request uses `EnvironmentPlacement` semantics rather than leaking Webview camera controller state

### Requirement: Extension Host Remains Low-frequency Boundary For Panoramic Preview
The system SHALL keep Extension Host responsible for VSCode APIs, custom editor registration, command routing, engine discovery, manifest registration, metadata persistence requests, and lifecycle cleanup. Extension Host MUST NOT relay decoded image pixels, video frames, encoded media chunks, or high-frequency panoramic camera updates.

#### Scenario: Extension Host registers asset
- **WHEN** a panoramic custom editor resolves
- **THEN** Extension Host registers the source with the engine and sends the resulting manifest to the Webview

#### Scenario: Extension Host persists semantic metadata only
- **WHEN** a Webview saves a default panorama view or projection override
- **THEN** Extension Host sends a low-frequency metadata request or command and does not store the decision only in transient UI context

#### Scenario: Extension Host does not relay frames
- **WHEN** a panoramic video stream is active
- **THEN** decoded frames or encoded media chunks flow through engine/Webview stream clients rather than Extension Host `postMessage`

#### Scenario: Extension Host owns cleanup
- **WHEN** Extension Host starts or registers an engine preview resource on behalf of a Webview
- **THEN** it releases that token, generated variant, or stream during source change, Webview disposal, startup failure, or explicit stop

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

### Requirement: Panoramic Video Frames Bypass Extension Host
The system SHALL route panoramic video media frames through direct Webview-to-engine stream clients or manifest stream descriptors. Extension Host MUST broker stream start/stop and URLs only, and MUST NOT carry frames through `postMessage`.

#### Scenario: Webview connects to stream URL
- **WHEN** panoramic video playback starts
- **THEN** Extension Host returns stream descriptor data and the Webview connects directly to the engine stream endpoint

#### Scenario: Decoded frames stay in Webview
- **WHEN** the Webview decodes H.264 panoramic video frames
- **THEN** it uploads or draws those frames locally for spherical or flat presentation without sending them back to Extension Host

### Requirement: Generated Preview Resources Are Runtime-owned
The system SHALL treat generated preview variants, token URLs, blob URLs, stream IDs, and temporary files as runtime-owned resources. Stable project or conversation state MUST store asset identity and preview descriptors only.

#### Scenario: Generated token is released
- **WHEN** a Webview or consumer unregisters a preview asset
- **THEN** the engine invalidates source and generated variant tokens owned by that asset

#### Scenario: Canvas stores descriptor only
- **WHEN** Canvas persists a node with panoramic preview capability
- **THEN** it does not serialize engine token URLs, blob URLs, stream IDs, or current viewer state

#### Scenario: Agent stores descriptor only
- **WHEN** Agent persists conversation or task artifact state containing a panoramic preview card
- **THEN** it does not serialize engine token URLs, blob URLs, stream IDs, or current viewer state

### Requirement: ViewportShell Owns Semantic Input Delegation
Engine-stream Webviews SHALL route semantic viewport input through `ViewportShell` and the active `ISceneController` unless a domain explicitly declares one delegated interaction layer as the sole semantic input owner.

#### Scenario: Pointer drag uses controller path
- **WHEN** a user starts a semantic drag over an engine-stream viewport
- **THEN** ViewportShell delegates the event to the active scene controller and does not require a separate per-editor DOM event system

#### Scenario: Interaction layer cannot double-handle events
- **WHEN** an interaction layer is promoted to handle a semantic event
- **THEN** the same pointer or key event is not also handled by another controller path for the same operation

### Requirement: Control Channel Degraded State Is Visible
Webviews SHALL expose a degraded or unavailable state when scene-control is disconnected, rejects semantic commands, or cannot return required query/snapshot data.

#### Scenario: Control socket disconnects
- **WHEN** the scene-control channel disconnects while the video stream remains visible
- **THEN** semantic controls that require engine state are disabled or marked degraded instead of silently mutating local UI state

#### Scenario: Query failure blocks authoritative overlay
- **WHEN** projected bounds, gizmo anchor, hit-test, or snapshot query fails
- **THEN** the Webview does not draw the dependent overlay as authoritative and surfaces a diagnostic or retry state

### Requirement: Webview Tests Assert Semantic State
Webview controller tests SHALL assert command dispatch, ack/error handling, store updates, overlay state, and prediction lifecycle for semantic viewport workflows.

#### Scenario: Toolbar action test asserts ack and store
- **WHEN** a test exercises a toolbar action that sends a scene command
- **THEN** the test verifies the command envelope, ack/error handling, and authoritative store or controller update

#### Scenario: Video-only assertion is insufficient
- **WHEN** a Webview test covers a semantic editing or control workflow
- **THEN** it does not pass by asserting only that the video surface received a frame

### Requirement: Prediction Remains Bounded While Waiting For Video
Webview prediction overlays SHALL remain bounded, labeled, and revertible while command acknowledgements and video frame metadata arrive at different times.

#### Scenario: Prediction remains pending after ack
- **WHEN** a command ack arrives before compatible frame metadata
- **THEN** the predicted overlay stays pending or stale-marked rather than becoming silently authoritative

#### Scenario: Prediction times out
- **WHEN** compatible ack, delta, snapshot, or frame metadata does not arrive within the configured timeout
- **THEN** the prediction rolls back and the Webview requests authoritative refresh or enters a degraded state

### Requirement: Preview Mode Commands Use Direct Scene-control WebSocket
The system SHALL route AI character preview mode requests, camera override resets, playback controls, and preview state subscriptions through the direct Webview-to-engine scene-control WebSocket path. Extension Host MUST NOT relay high-frequency preview state, playback timing, render frame metadata, or preview mode command traffic.

#### Scenario: Mode request bypasses Extension Host
- **WHEN** the user selects an AI character preview mode in the Neko Model Webview
- **THEN** Webview sends the preview mode command to Engine through `SceneControlSocket` or the active scene-control transport without posting the command through Extension Host

#### Scenario: Playback timing bypasses Extension Host
- **WHEN** motion or voice-pack preview emits playback timing, viseme timing, or preview state updates
- **THEN** those updates flow through engine WebSocket events and render/audio metadata rather than Extension Host `postMessage`

### Requirement: Preview Mode UI Is Controller-mediated
The system SHALL expose preview mode UI through Neko Model controller methods and shared serializable contracts. `ViewportShell` MUST remain domain-agnostic and MUST NOT import Neko Model preview mode implementation details.

#### Scenario: Selector delegates to ModelController
- **WHEN** the AI preview selector changes mode
- **THEN** it calls a `ModelController` preview mode operation that serializes and dispatches the engine command

#### Scenario: ViewportShell remains generic
- **WHEN** preview mode support is added to Neko Model
- **THEN** shared `ViewportShell` code does not branch on AI preview mode ids or import Neko Model Webview modules

### Requirement: Preview Mode Fallbacks Are Explicit
The system SHALL mark preview mode degraded states explicitly when scene-control, engine streaming, audio streaming, demo playback, or required character bindings are unavailable. Webview MUST NOT silently replace engine preview with a local-only R3F/HTML audio state as authoritative output.

#### Scenario: Engine preview unavailable
- **WHEN** the engine stream or scene-control channel is unavailable
- **THEN** the preview selector is disabled or marked unavailable and does not claim that an authoritative preview mode has been applied

#### Scenario: Local fallback is non-authoritative
- **WHEN** a development fallback preview is shown while AI preview modes are unavailable
- **THEN** the UI marks the fallback as non-authoritative and excludes it from export, WYSIWYG validation, and applied preview state semantics

### Requirement: Preview Mode Pending State Reconciles With Engine Events
The system SHALL distinguish requested, pending, applied, rejected, and resynced preview mode states. Webview MUST reconcile pending preview UI through scene-control acknowledgements, preview mode state events, and render frame metadata.

#### Scenario: Pending mode becomes applied
- **WHEN** Webview sends a preview mode request and Engine acknowledges it with an applied revision
- **THEN** Webview marks the mode as applied only after the acknowledgement, matching preview state event, or compatible render frame metadata confirms it

#### Scenario: Rejected mode rolls back UI
- **WHEN** Engine rejects a preview mode request
- **THEN** Webview clears the pending state, displays the diagnostic, and restores the last applied mode from engine state

### Requirement: Neko Live Uses ViewportShell For Compositor Visual Truth
neko-live SHALL use `ViewportShell` with a `LiveController` as the visual truth surface when an engine compositor stream descriptor is available.

#### Scenario: Compositor stream is available
- **WHEN** neko-live receives a valid engine compositor `RenderStreamDescriptor`
- **THEN** it displays decoded compositor frames through `ViewportShell` and does not mount persistent local R3F or puppet renderers as competing visual truth

#### Scenario: LiveController supplies controls
- **WHEN** `ViewportToolbar` renders for a live compositor scene
- **THEN** live scene preset, layer routing, tracking overlay, and output controls are supplied through `LiveController` toolbar descriptors or adjacent domain panels

### Requirement: Neko Live Fallback Is Isolated
Any remaining neko-live local R3F, puppet, or canvas preview SHALL be isolated behind a fallback flag and visibly marked as non-authoritative whenever compositor stream parity is unavailable.

#### Scenario: Compositor unavailable
- **WHEN** the compositor stream cannot start and local fallback rendering is enabled
- **THEN** the UI marks the fallback as non-authoritative and does not use it for output/export parity validation

#### Scenario: Fallback removal waits for parity
- **WHEN** compositor stream parity, output route diagnostics, and latency validation have not passed
- **THEN** persistent local renderer removal remains blocked

### Requirement: Live High-Frequency Traffic Avoids Extension Host
neko-live SHALL keep high-frequency compositor frames, decoded video frames, tracking updates, and shell-local navigation out of Extension Host `postMessage` traffic. Extension Host remains responsible for setup, permissions, resource URI conversion, lifecycle, and VSCode operations.

#### Scenario: Compositor frames bypass Extension Host
- **WHEN** a live compositor stream is active
- **THEN** encoded frames flow through the engine stream endpoint and Webview stream client rather than Extension Host `postMessage`

#### Scenario: Setup remains host-owned
- **WHEN** neko-live needs workspace resources, device permission, or VSCode UI operations
- **THEN** Extension Host brokers those low-frequency operations without becoming the frame or pointer-move transport

### Requirement: Shared ViewportShell Is The Engine Visual Surface
Engine-stream Webviews SHALL use ViewportShell as the shared visual truth surface for model, puppet, and live scenes once the relevant domain controller is available.

#### Scenario: Model uses ViewportShell
- **WHEN** neko-model has a valid engine stream and ModelController
- **THEN** it renders through ViewportShell rather than mounting an independent visual truth surface for the same scene

#### Scenario: Puppet uses ViewportShell
- **WHEN** neko-puppet reaches the engine-stream integration phase
- **THEN** it renders through ViewportShell and keeps any Canvas2D preview path explicitly marked as fallback or local prototype

### Requirement: InteractionLayer Uses ViewportProtocol
Webview interaction layers SHALL route engine-mediated viewport operations through ViewportProtocol instead of ad-hoc per-editor command formats.

#### Scenario: Gizmo drag sends viewport command
- **WHEN** a user drags a transform gizmo in a migrated editor
- **THEN** the interaction layer sends a `ViewportCommand` with sequence, correlation id, source, and base revision where required

#### Scenario: Local wheel zoom bypasses engine
- **WHEN** a user performs shell-local wheel zoom
- **THEN** the Webview updates local shell state without involving Extension Host or Engine per wheel event

### Requirement: Prediction Layer Is Centralized
Webview prediction behavior for transform, camera, selection, morph, IK, and overlay feedback SHALL use a central lifecycle tied to viewport command acknowledgements and frame metadata.

#### Scenario: Rejected command clears prediction
- **WHEN** a predicted viewport or scene command is rejected
- **THEN** the prediction layer removes or rolls back the predicted overlay and triggers resync if necessary

#### Scenario: Topology change invalidates prediction
- **WHEN** a topology or scene reset event invalidates predicted overlay geometry
- **THEN** the prediction layer discards predictions that reference the old topology or revision

### Requirement: Extension Host Remains Low-Frequency
Extension Host SHALL broker setup, resource URLs, editor lifecycle, and VSCode operations but MUST NOT relay high-frequency viewport frames, pointer move streams, or per-frame shell-local navigation.

#### Scenario: Pointer move bypasses Extension Host
- **WHEN** a user drags within ViewportShell
- **THEN** high-frequency local prediction and engine command traffic do not pass through VSCode `postMessage` unless a domain explicitly requires a low-frequency host operation
