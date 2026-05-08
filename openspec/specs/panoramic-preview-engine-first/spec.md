# panoramic-preview-engine-first Specification

## Purpose
Define the engine-first panoramic preview pipeline for `neko-preview`, including manifest-backed media loading, viewer-local panoramic controls, variant requests, video reuse, Canvas/Agent lightweight consumption, and delegated built-in preview routing.
## Requirements
### Requirement: Engine-first Preview Manifest
The system SHALL register panoramic preview sources through engine-backed preview registration and return a `PreviewManifest` before the Webview loads media content. The Webview MUST consume manifest-provided token URLs, proxy variants, tile templates, or stream descriptors, and MUST NOT read Neko-owned panoramic media content directly through local file paths or direct `asWebviewUri` media URLs.

#### Scenario: Register panoramic image source
- **WHEN** `neko-preview` opens a panoramic image candidate
- **THEN** the Extension Host registers the source with the engine and sends a `PreviewManifest` to the Webview

#### Scenario: Small compatible source uses transparent passthrough
- **WHEN** the engine policy determines that a small SDR image can be served without proxy generation
- **THEN** the manifest exposes a range-capable source or proxy URL while the Webview still consumes only the manifest contract

#### Scenario: Webview has no direct media file path
- **WHEN** the panoramic Webview initializes
- **THEN** it receives no raw local media file path for content loading and cannot bypass the manifest path for Neko preview media

### Requirement: Panoramic Projection Probe
The system SHALL identify panoramic image and video candidates using deterministic metadata when available and heuristics only with confidence metadata. Probe output MUST include projection type, confidence, dimensions, HDR/SDR state when known, and enough file metadata to populate preview UI.

#### Scenario: GPano metadata is explicit
- **WHEN** an image contains GPano/XMP equirectangular metadata
- **THEN** probe returns `projectionType: 'equirectangular'` with explicit confidence

#### Scenario: Aspect ratio heuristic requires confirmation
- **WHEN** an image has a 2:1 aspect ratio but no explicit panoramic metadata
- **THEN** probe returns an equirectangular candidate with heuristic confidence and the UI prompts for confirmation before persisting the decision

#### Scenario: Flat asset remains flat
- **WHEN** an image or video does not match explicit metadata, trusted filename hints, or accepted heuristics
- **THEN** the system does not force it into panoramic preview

### Requirement: Panoramic Image Viewer
The system SHALL provide a `neko-preview` panoramic image custom editor that renders equirectangular content in sphere, flat, and little-planet modes with GPU acceleration when available. The viewer MUST provide yaw, pitch, FOV, exposure, tone mapping, reset, and basic metadata display controls.

#### Scenario: Open equirectangular image in sphere mode
- **WHEN** a user opens a confirmed equirectangular image in `neko-preview`
- **THEN** the Webview renders the image in sphere mode and displays projection, dimensions, HDR/SDR, and file-size metadata

#### Scenario: Switch view mode without re-registering source
- **WHEN** the user switches between sphere, flat, and little-planet modes
- **THEN** the viewer updates presentation state without re-registering the source with the engine

#### Scenario: WebGL unavailable fallback
- **WHEN** WebGL2/WebGPU is unavailable
- **THEN** the viewer falls back to a flat preview with an unavailable-interaction notice rather than failing with a blank panel

### Requirement: Viewer-local Angle Control
The system SHALL keep high-frequency panoramic view controls local to the Webview. Drag, wheel, and inertial updates for `yawDeg`, `pitchDeg`, and `fovDeg` MUST NOT be sent through Extension Host or engine on every frame.

#### Scenario: Dragging changes local view state
- **WHEN** the user drags the sphere viewer
- **THEN** the Webview updates local yaw and pitch and renders the new view without posting every movement to Extension Host or engine

#### Scenario: Reset updates local state
- **WHEN** the user triggers reset view
- **THEN** the Webview resets local yaw, pitch, roll, and FOV to the manifest default or built-in defaults

### Requirement: Semantic View State Requests
The system SHALL send `PanoramaViewState` across the control boundary only for low-frequency semantic operations, including default-view persistence, FOV crop thumbnails, screenshots, exports, tile/LOD requests, and Agent/Canvas preview variants.

#### Scenario: Request FOV crop thumbnail
- **WHEN** the user or consumer requests a thumbnail for a specific view
- **THEN** `neko-preview` sends a `PanoramaViewState` variant request to the engine and receives a `PreviewVariant` for the crop

#### Scenario: Persist default view
- **WHEN** the user saves the current panoramic view as default
- **THEN** the system stores the `PanoramaViewState` in metadata or sidecar state and restores it when reopening the asset

#### Scenario: Screenshot export uses semantic state
- **WHEN** the user exports the current panoramic view as an image
- **THEN** the export request includes the current `PanoramaViewState` and produces an output matching that view

### Requirement: HDR And Proxy Variant Policy
The system SHALL route HDR/EXR decode, large-image downsampling, proxy generation, and tile manifest decisions through the engine preview policy. The Webview MUST NOT bundle HDR/EXR decoders for the default path.

#### Scenario: Large image receives proxy variant
- **WHEN** a panoramic image exceeds the configured safe texture threshold
- **THEN** the engine manifest includes a downsampled proxy or tile variant for Webview display

#### Scenario: HDR source exposes tone mapping metadata
- **WHEN** a panoramic HDR source is registered
- **THEN** the manifest or probe output includes HDR state and tone-mapping defaults for the viewer

#### Scenario: EXR unsupported gracefully degrades
- **WHEN** an EXR file is opened before EXR decode support is available
- **THEN** the viewer reports the unsupported format through a typed error state and does not attempt direct Webview decoding

### Requirement: Panoramic Video Viewer
The system SHALL provide panoramic video preview after panoramic image preview is available. Panoramic video MUST use the same manifest/control model and MUST support flat fallback plus spherical presentation for equirectangular video.

#### Scenario: Open 360 video candidate
- **WHEN** a user opens a confirmed equirectangular video
- **THEN** `neko-preview` opens a panoramic video viewer using an engine-provided stream, range URL, or proxy variant

#### Scenario: Incompatible video uses Neko stream
- **WHEN** the source video or audio codec is not reliable for native Webview playback
- **THEN** the preview uses the engine-backed H.264/PCM streaming path instead of DOM media element playback as the authoritative route

#### Scenario: Stop cleans up streams
- **WHEN** a panoramic video preview ends, is stopped, changes source, or the Webview is disposed
- **THEN** the owner that started engine streams calls the corresponding stop/cleanup API for allocated stream IDs

### Requirement: Send To Model Environment Placement
The system SHALL allow panoramic image assets to be sent from `neko-preview` to `neko-model` as environment inputs using `EnvironmentPlacement` semantics. Preview camera yaw/pitch MUST NOT be treated as model environment rotation.

#### Scenario: Use as skybox
- **WHEN** the user chooses "Use as Skybox in 3D" from a panoramic preview
- **THEN** `neko-preview` sends the source asset and `EnvironmentPlacement` to `neko-model` through an allowed cross-extension mechanism

#### Scenario: Preview view does not mutate model rotation
- **WHEN** the user has looked around the panorama before sending it to `neko-model`
- **THEN** the model environment rotation remains the explicit `EnvironmentPlacement.rotationDeg` value rather than the viewer's current yaw or pitch

### Requirement: Canvas And Agent Lightweight Consumption
The system SHALL keep Canvas and Agent panoramic handling lightweight. They MUST consume engine-generated thumbnails, FOV crops, proxy previews, or pre-rendered rotation assets through composable preview capability contracts and MUST delegate interactive panoramic viewing to `neko-preview`.

#### Scenario: Agent shows panoramic thumbnail
- **WHEN** Agent displays a panoramic image result
- **THEN** it uses an engine-generated FOV crop or thumbnail and opens `neko-preview` for interactive spherical viewing

#### Scenario: Canvas shows panoramic node preview
- **WHEN** Canvas displays a panoramic asset node
- **THEN** it shows a flat/proxy thumbnail or pre-rendered preview through preview capabilities and delegates spherical interaction to `neko-preview`

#### Scenario: Canvas preview capability does not embed sphere renderer
- **WHEN** a Canvas block declares panoramic preview capability
- **THEN** the Canvas renderer consumes engine-issued preview variants and delegate commands without mounting a WebGL sphere viewer

### Requirement: Built-in Preview Delegation
The system SHALL optimize built-in/native preview behavior only after dedicated panoramic preview is available. Built-in preview commands or route contributions MUST delegate panoramic candidates to the manifest-backed `neko-preview` viewer rather than implementing a separate content loader.

#### Scenario: Explicit open as panorama
- **WHEN** the user invokes "Open as Panorama" on an image or video file
- **THEN** VSCode opens the corresponding `neko-preview` panoramic viewer and the viewer uses engine-first manifest loading

#### Scenario: High-confidence route opens panoramic viewer
- **WHEN** a file has `.hdr`, `.exr`, GPano metadata, or trusted panoramic filename hints
- **THEN** the optimized route opens `neko-preview` panoramic preview without duplicating direct Webview media loading

#### Scenario: Heuristic route asks first
- **WHEN** the only signal is a low-confidence aspect-ratio heuristic
- **THEN** the system asks for user confirmation or provides an explicit command rather than silently replacing normal image preview

