## MODIFIED Requirements

### Requirement: Panoramic Projection Probe
The system SHALL identify panoramic image and video candidates using deterministic metadata when available and heuristics only with confidence metadata. Probe output MUST include projection type, confidence, dimensions, HDR/SDR state when known, and enough file metadata to populate preview UI. User projection overrides stored in sidecar or engine-backed metadata MUST take precedence over filename and aspect-ratio heuristics.

#### Scenario: GPano metadata is explicit
- **WHEN** an image contains GPano/XMP equirectangular metadata
- **THEN** probe returns `projectionType: 'equirectangular'` with explicit confidence

#### Scenario: Aspect ratio heuristic requires confirmation
- **WHEN** an image has a 2:1 aspect ratio but no explicit panoramic metadata
- **THEN** probe returns an equirectangular candidate with heuristic confidence and the UI prompts for confirmation before persisting the decision

#### Scenario: Persisted manual override wins
- **WHEN** a sidecar or engine-backed metadata record marks an asset as `flat` or `equirectangular`
- **THEN** probe returns the manual projection type with manual confidence and does not override it using filename or aspect-ratio heuristics

#### Scenario: Flat asset remains flat
- **WHEN** an image or video does not match explicit metadata, trusted filename hints, accepted heuristics, or a persisted manual override
- **THEN** the system does not force it into panoramic preview

### Requirement: Semantic View State Requests
The system SHALL send `PanoramaViewState` across the control boundary only for low-frequency semantic operations, including default-view persistence, FOV crop thumbnails, screenshots, exports, tile/LOD requests, and Agent/Canvas preview variants. Default view state and projection decisions MUST be persisted through sidecar or engine-backed asset metadata rather than transient VSCode context.

#### Scenario: Request FOV crop thumbnail
- **WHEN** the user or consumer requests a thumbnail for a specific view
- **THEN** `neko-preview` sends a `PanoramaViewState` variant request to the engine and receives a `PreviewVariant` for the crop

#### Scenario: Persist default view
- **WHEN** the user saves the current panoramic view as default
- **THEN** the system stores the `PanoramaViewState` in metadata or sidecar state and restores it when reopening the asset

#### Scenario: Persist projection override
- **WHEN** the user confirms or changes whether an asset is flat or equirectangular
- **THEN** the system stores the projection decision in metadata or sidecar state and future manifests report manual confidence

#### Scenario: Screenshot export uses semantic state
- **WHEN** the user exports the current panoramic view as an image
- **THEN** the export request includes the current `PanoramaViewState` and produces an output matching that view

### Requirement: HDR And Proxy Variant Policy
The system SHALL route HDR/EXR decode, large-image downsampling, proxy generation, and tile manifest decisions through the engine preview policy. The Webview MUST NOT bundle HDR/EXR decoders for the default path. The engine MUST generate real proxy or variant outputs when it reports a variant URL for `proxy`, `thumbnail`, `fov-crop`, or `screenshot`.

#### Scenario: Large image receives proxy variant
- **WHEN** a panoramic image exceeds the configured safe texture threshold
- **THEN** the engine manifest includes a downsampled proxy or tile variant for Webview display

#### Scenario: HDR source exposes tone mapping metadata
- **WHEN** a panoramic HDR source is registered
- **THEN** the manifest or probe output includes HDR state and tone-mapping defaults for the viewer

#### Scenario: HDR source receives tone-mapped proxy
- **WHEN** a Radiance `.hdr` panoramic image is registered and HDR proxy support is available
- **THEN** the engine returns a tone-mapped SDR proxy or display variant while preserving HDR metadata on the manifest

#### Scenario: EXR unsupported gracefully degrades
- **WHEN** an EXR file is opened before EXR decode support is available
- **THEN** the viewer reports the unsupported format through a typed error state and does not attempt direct Webview decoding

#### Scenario: Variant request returns generated content
- **WHEN** a consumer requests `thumbnail`, `fov-crop`, `proxy`, or `screenshot` for a supported panoramic image
- **THEN** the returned `PreviewVariant` references generated engine-managed content with dimensions and MIME type matching the requested role rather than returning the unchanged source token

### Requirement: Panoramic Video Viewer
The system SHALL provide panoramic video preview after panoramic image preview is available. Panoramic video MUST use the same manifest/control model and MUST support flat fallback plus spherical presentation for equirectangular video. The spherical presentation MUST render decoded video frames through a Webview-local GPU path while media transport and stream lifecycle remain engine-backed.

#### Scenario: Open 360 video candidate
- **WHEN** a user opens a confirmed equirectangular video
- **THEN** `neko-preview` opens a panoramic video viewer using an engine-provided stream, range URL, or proxy variant

#### Scenario: Incompatible video uses Neko stream
- **WHEN** the source video or audio codec is not reliable for native Webview playback
- **THEN** the preview uses the engine-backed H.264/PCM streaming path instead of DOM media element playback as the authoritative route

#### Scenario: Video frame renders spherically
- **WHEN** the panoramic video Webview receives decoded frames from the Neko stream client
- **THEN** it presents equirectangular frames in sphere mode with local yaw, pitch, and FOV controls

#### Scenario: Flat fallback remains available
- **WHEN** WebGL2/WebGPU spherical rendering is unavailable
- **THEN** the panoramic video viewer presents a flat playback fallback or typed unavailable state without failing blank

#### Scenario: Stop cleans up streams
- **WHEN** a panoramic video preview ends, is stopped, changes source, or the Webview is disposed
- **THEN** the owner that started engine streams calls the corresponding stop/cleanup API for allocated stream IDs

### Requirement: Canvas And Agent Lightweight Consumption
The system SHALL keep Canvas and Agent panoramic handling lightweight. They MUST consume engine-generated thumbnails, FOV crops, proxy previews, or pre-rendered rotation assets through composable preview capability contracts and MUST delegate interactive panoramic viewing to `neko-preview`. Runtime URLs and tokens MUST remain Webview/Extension runtime state and MUST NOT be serialized into project or conversation artifacts.

#### Scenario: Agent shows panoramic thumbnail
- **WHEN** Agent displays a panoramic image result
- **THEN** it uses an engine-generated FOV crop or thumbnail and opens `neko-preview` for interactive spherical viewing

#### Scenario: Canvas shows panoramic node preview
- **WHEN** Canvas displays a panoramic asset node
- **THEN** it shows a flat/proxy thumbnail or pre-rendered preview through preview capabilities and delegates spherical interaction to `neko-preview`

#### Scenario: Canvas preview capability does not embed sphere renderer
- **WHEN** a Canvas block declares panoramic preview capability
- **THEN** the Canvas renderer consumes engine-issued preview variants and delegate commands without mounting a WebGL sphere viewer

#### Scenario: Runtime URLs are not persisted
- **WHEN** Canvas or Agent stores project, node, conversation, or artifact state that references a panoramic preview
- **THEN** it stores stable asset identity and preview descriptors only, not engine token URLs, blob URLs, stream IDs, or current playback/viewer state
