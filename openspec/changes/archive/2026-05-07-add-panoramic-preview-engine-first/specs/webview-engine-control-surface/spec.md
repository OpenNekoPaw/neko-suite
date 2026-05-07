## ADDED Requirements

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
