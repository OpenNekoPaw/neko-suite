## MODIFIED Requirements

### Requirement: Panoramic Projection Probe
The system SHALL identify panoramic image and video candidates using deterministic metadata when available and heuristics only with confidence metadata. Probe output MUST include projection type, confidence, dimensions, HDR/SDR state when known, coverage angle when known or inferred, and enough file metadata to populate preview UI. User projection and coverage overrides stored in sidecar or engine-backed metadata MUST take precedence over filename and aspect-ratio heuristics.

#### Scenario: GPano metadata is explicit
- **WHEN** an image contains GPano/XMP equirectangular metadata
- **THEN** probe returns `projectionType: 'equirectangular'` with explicit confidence

#### Scenario: GPano cropped area produces coverage
- **WHEN** an image contains GPano full-pano and cropped-area pixel metadata
- **THEN** probe returns `coverageAngle` computed from cropped/full width and height ratios

#### Scenario: Missing coverage defaults safely
- **WHEN** projection metadata has no coverage angle or contains invalid coverage values
- **THEN** the system normalizes coverage to `horizontalDeg: 360` and `verticalDeg: 180` before rendering, persisting, or generating variants

#### Scenario: Aspect ratio heuristic requires confirmation
- **WHEN** an image has a 2:1 aspect ratio but no explicit panoramic metadata
- **THEN** probe returns an equirectangular candidate with heuristic confidence and the UI prompts for confirmation before persisting the decision

#### Scenario: Half panorama filename hint is trusted only with pano context
- **WHEN** an image filename contains `halfpano`, `180pano`, or `pano180` as a delimited hint
- **THEN** the route can treat it as a panoramic image candidate without matching a bare `180` token

#### Scenario: Bare 180 filename does not route
- **WHEN** an image filename contains `180` without a pano-bearing token
- **THEN** the filename hint does not by itself route the image to panoramic preview

#### Scenario: Persisted manual override wins
- **WHEN** a sidecar or engine-backed metadata record marks an asset as `flat`, `equirectangular`, or `cylindrical`
- **THEN** probe returns the manual projection type with manual confidence and does not override it using filename or aspect-ratio heuristics

#### Scenario: Wide image is not automatically cylindrical
- **WHEN** a wide image has no sidecar override, GPano metadata, trusted panoramic filename hint, or explicit open request
- **THEN** the system does not infer `projectionType: 'cylindrical'` from aspect ratio alone

#### Scenario: Flat asset remains flat
- **WHEN** an image or video does not match explicit metadata, trusted filename hints, accepted heuristics, or a persisted manual override
- **THEN** the system does not force it into panoramic preview

### Requirement: Panoramic Image Viewer
The system SHALL provide a `neko-preview` panoramic image custom editor that renders equirectangular content in sphere, flat, and little-planet modes and cylindrical content in cylindrical and flat modes with GPU acceleration when available. The viewer MUST provide yaw, pitch, FOV, exposure, tone mapping, reset, projection-aware mode switching, coverage display, and basic metadata display controls.

#### Scenario: Open equirectangular image in sphere mode
- **WHEN** a user opens a confirmed equirectangular image in `neko-preview`
- **THEN** the Webview renders the image in sphere mode and displays projection, dimensions, HDR/SDR, coverage when non-default, and file-size metadata

#### Scenario: Open cylindrical image in cylinder mode
- **WHEN** a user opens an image with persisted `projectionType: 'cylindrical'`
- **THEN** the Webview renders the image with cylindrical sampling by default and does not expose little-planet mode for that projection

#### Scenario: Switch view mode without re-registering source
- **WHEN** the user switches between legal modes for the current projection
- **THEN** the viewer updates presentation state without re-registering the source with the engine

#### Scenario: Illegal mode is normalized
- **WHEN** a manifest, sidecar, or Webview request combines `projectionType: 'cylindrical'` with `mode: 'little-planet'`
- **THEN** the viewer and persistence layer normalize the mode to a legal cylindrical mode before rendering or saving

#### Scenario: Temporary cylinder preview before save
- **WHEN** a user opens a wide image explicitly as panorama and switches to Cylinder mode
- **THEN** the Webview can preview the image with cylindrical sampling before the projection choice is persisted

#### Scenario: WebGL unavailable fallback
- **WHEN** WebGL2/WebGPU is unavailable
- **THEN** the viewer falls back to a flat preview with an unavailable-interaction notice rather than failing with a blank panel

### Requirement: Viewer-local Angle Control
The system SHALL keep high-frequency panoramic view controls local to the Webview. Drag, wheel, viewport resize, and inertial updates for `yawDeg`, `pitchDeg`, and `fovDeg` MUST NOT be sent through Extension Host or engine on every frame. For partial coverage, the local controller MUST clamp yaw and pitch using the normalized coverage angle; yaw clamping MUST account for viewport aspect and actual horizontal FOV.

#### Scenario: Dragging changes local view state
- **WHEN** the user drags the panoramic viewer
- **THEN** the Webview updates local yaw and pitch and renders the new view without posting every movement to Extension Host or engine

#### Scenario: Partial coverage clamps yaw
- **WHEN** the asset coverage has `horizontalDeg` less than 360
- **THEN** the Webview clamps yaw to the range where the current viewport FOV remains inside the covered horizontal angle

#### Scenario: Wide viewport uses horizontal FOV
- **WHEN** the viewer has a non-square viewport
- **THEN** yaw clamping uses horizontal FOV derived from viewport aspect and vertical FOV rather than using vertical FOV directly

#### Scenario: Partial coverage clamps pitch
- **WHEN** the asset coverage has `verticalDeg` less than 180
- **THEN** the Webview clamps pitch to the range where the current vertical FOV remains inside the covered vertical angle

#### Scenario: Full coverage keeps wrap behavior
- **WHEN** the asset coverage is 360 by 180
- **THEN** yaw remains wrap-around and pitch remains constrained to the existing safe pitch range

#### Scenario: Reset updates local state
- **WHEN** the user triggers reset view
- **THEN** the Webview resets local yaw, pitch, roll, and FOV to the manifest default or built-in defaults

### Requirement: Semantic View State Requests
The system SHALL send `PanoramaViewState` across the control boundary only for low-frequency semantic operations, including default-view persistence, FOV crop thumbnails, screenshots, exports, tile/LOD requests, and Agent/Canvas preview variants. Default view state, projection decisions, and coverage angle decisions MUST be persisted through sidecar or engine-backed asset metadata rather than transient VSCode context. Non-persistent variant requests MAY carry projection and coverage overrides so the engine can render the current UI view without saving asset metadata.

#### Scenario: Request FOV crop thumbnail
- **WHEN** the user or consumer requests a thumbnail for a specific view
- **THEN** `neko-preview` sends a `PanoramaViewState` variant request to the engine and receives a `PreviewVariant` for the crop

#### Scenario: Request variant with unsaved projection override
- **WHEN** the user previews an image in Cylinder mode without saving the projection decision and requests FOV Crop or Export
- **THEN** the variant request includes the current projection type and coverage angle as non-persistent overrides and produces output matching the current preview

#### Scenario: Persist default view atomically
- **WHEN** the user saves the current panoramic view as default
- **THEN** the system stores projection type, coverage angle, and `PanoramaViewState` in one metadata update and restores them when reopening the asset

#### Scenario: Persist projection override
- **WHEN** the user confirms or changes whether an asset is flat, equirectangular, or cylindrical
- **THEN** the system stores the projection decision in metadata or sidecar state and future manifests report manual confidence

#### Scenario: Screenshot export uses semantic state
- **WHEN** the user exports the current panoramic view as an image
- **THEN** the export request includes the current `PanoramaViewState`, projection type, and coverage angle and produces an output matching that view

### Requirement: HDR And Proxy Variant Policy
The system SHALL route HDR/EXR decode, large-image downsampling, proxy generation, tile manifest decisions, projection-aware FOV crop generation, and screenshot generation through the engine preview policy. The Webview MUST NOT bundle HDR/EXR decoders for the default path. The engine MUST generate real proxy or variant outputs when it reports a variant URL for `proxy`, `thumbnail`, `fov-crop`, or `screenshot`.

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

#### Scenario: Cylindrical crop uses cylindrical sampling
- **WHEN** a `fov-crop` or `screenshot` request resolves to `projectionType: 'cylindrical'`
- **THEN** the engine generates the variant with cylindrical UV sampling and normalized coverage rather than equirectangular latitude sampling

#### Scenario: Partial equirectangular crop uses coverage
- **WHEN** a `fov-crop` or `screenshot` request resolves to partial equirectangular coverage
- **THEN** the engine maps longitude and latitude using the provided coverage angle rather than assuming 360 by 180 coverage
