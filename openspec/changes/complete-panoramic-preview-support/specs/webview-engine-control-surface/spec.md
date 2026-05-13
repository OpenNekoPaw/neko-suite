## MODIFIED Requirements

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

## ADDED Requirements

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
