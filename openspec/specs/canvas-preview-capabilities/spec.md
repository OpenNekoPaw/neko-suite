# canvas-preview-capabilities Specification

## Purpose
Defines lightweight Canvas preview capabilities, resolver boundaries, runtime
resource ownership, and compact node-card preview descriptors for asset,
generation, collection, and summary surfaces.
## Requirements
### Requirement: Preview behavior is declared through composable capabilities
The system SHALL represent Canvas preview behavior through composable block or node capabilities for asset identity, preview variants, playback, delegation, generation candidates, collection previews, and node summaries. Preview behavior MUST NOT depend solely on hardcoded node type branches. Migrated Shot, Gallery, and Media presets MUST declare lightweight preview capabilities for their primary visual surfaces.

#### Scenario: Image asset preview composes capabilities
- **WHEN** an image asset block is rendered
- **THEN** it uses asset identity, preview, and optional delegate capabilities rather than a dedicated image node preview branch

#### Scenario: Model asset delegates interaction
- **WHEN** a 3D model asset block is rendered in Canvas
- **THEN** it uses screenshot or turntable preview capabilities and delegates interactive editing to the model extension

#### Scenario: Shot preview uses generation capabilities
- **WHEN** a migrated Shot node displays generated image candidates
- **THEN** it renders the selected candidate and candidate controls from generation preview capability metadata bound to Shot data

#### Scenario: Gallery preview uses collection capabilities
- **WHEN** a migrated Gallery node displays cells
- **THEN** each cell preview is resolved from collection preview metadata and cell data rather than a Gallery-only preview branch

#### Scenario: Media preview uses asset identity capability
- **WHEN** a migrated Media node displays an image, video, or audio asset
- **THEN** the preview source is resolved from asset identity and preview capability metadata bound to the media data fields

### Requirement: Preview variants are resolved through a resolver contract
The system SHALL resolve previewable assets to typed preview variants through a resolver that can request host or engine-provided thumbnails, proxies, posters, waveforms, turntables, rotation clips, FOV crops, or fallback icons. Webview renderers MUST treat variant URLs and tokens as opaque runtime resources.

#### Scenario: Video poster resolves before render
- **WHEN** a video preview block becomes visible
- **THEN** the preview resolver supplies a poster or proxy variant before the renderer displays the playable preview surface

#### Scenario: Unknown asset falls back
- **WHEN** no specialized preview variant exists for an asset
- **THEN** the renderer displays a bounded fallback preview with file metadata and delegate actions when available

### Requirement: Preview runtime state is not persisted
The system SHALL persist only stable preview source metadata, selected candidate IDs, and optional stable preview preferences. The system MUST NOT persist blob URLs, engine tokens, object URLs, active playback state, hover state, current playback time, or player instances in `.nkc` or `node.data`.

#### Scenario: Save omits runtime token
- **WHEN** a Canvas file is saved while an audio preview is active
- **THEN** the saved file contains the asset identity and selected candidate metadata but no active playback token or current playback time

#### Scenario: Source change cleans runtime resources
- **WHEN** a preview block changes source
- **THEN** the runtime releases old object URLs or engine tokens before resolving the new source

### Requirement: Canvas previews remain lightweight and delegated
The system SHALL keep Canvas preview behavior lightweight. Canvas MAY render DOM-native images, lightweight audio/video proxies, waveform previews, GIFs, and engine-issued turntable or rotation clips. Canvas MUST delegate real-time 3D, spherical panorama interaction, HDR tone mapping controls, video timeline editing, audio mixing, and heavy decode/transcode work to specialized extensions or the engine.

#### Scenario: Panoramic asset delegates sphere viewer
- **WHEN** a Canvas node displays a panoramic image or 360 video
- **THEN** it renders a flat proxy, FOV crop, thumbnail, or pre-rendered rotation preview and opens the panoramic viewer for spherical interaction

#### Scenario: Video editing opens specialized editor
- **WHEN** a user requests timeline-level video interaction from a Canvas video preview
- **THEN** Canvas delegates to the video preview or editing extension rather than implementing timeline scrubbing in the node

### Requirement: Preview playback has a single active runtime owner
The system SHALL manage inline or hover playback through a preview runtime that tracks active preview instances and cleanup. Playback-capable previews in one Canvas Webview MUST support limiting active audio/video playback to one active item unless a policy explicitly allows otherwise.

#### Scenario: Starting second preview stops first
- **WHEN** an audio preview is active and the user starts a video preview
- **THEN** the preview runtime stops or releases the audio preview before activating the video preview

#### Scenario: Webview dispose releases previews
- **WHEN** the Canvas Webview is disposed
- **THEN** the preview runtime releases active players, object URLs, and engine-owned preview tokens

### Requirement: Node summary previews are separate from asset previews
The system SHALL provide node summary descriptors for rendering compact previews of CanvasNodes inside containers, minimap-like summaries, Agent context, and child-node slots. Containers MUST NOT fully render child node components a second time to create summaries. Migrated core presets MUST provide stable summary descriptors that can be consumed by child-node slots and structured extraction.

#### Scenario: Scene displays Shot summary
- **WHEN** a Scene content tree includes a child-node slot
- **THEN** the slot renders Shot summaries from node preview descriptors rather than mounting full Shot node components

#### Scenario: Agent extracts node summary
- **WHEN** Agent requests structured content for selected Canvas nodes
- **THEN** the extraction can use node summary descriptors without requiring Webview-specific preview URLs to be persisted

#### Scenario: Summary reflects selected candidate
- **WHEN** a Shot or Gallery cell selected candidate changes
- **THEN** the node summary descriptor updates from authoritative data and remains free of runtime-only preview URLs or engine tokens

#### Scenario: Container summary supports heterogeneous children
- **WHEN** a migrated Scene contains Shot, Media, Gallery, Text, or Group children
- **THEN** the child-node slot can render compact summaries for each child through descriptor metadata

### Requirement: Generation previews support candidate browsing
The system SHALL support preview capabilities that present generated candidates and selected candidate state from authoritative node data. Candidate navigation MUST update selected candidate state through normal node data updates.

#### Scenario: Shot image candidate changes
- **WHEN** a user selects another generated image candidate for a Shot
- **THEN** the selected candidate state updates in the Shot data and the preview re-renders from that authoritative state

#### Scenario: Gallery cell candidate changes
- **WHEN** a user selects another candidate for a Gallery cell
- **THEN** the cell's candidate selection updates through the Gallery collection data path

### Requirement: Node card previews use preview descriptors and fixed render forms
The system SHALL represent compact node-card previews with a discriminated `CardPreviewSource` that uses the fixed render forms `asset-thumbnail`, `media-poster`, `waveform`, `text`, `icon`, and `none`. Asset-based card previews MUST reuse `PreviewSourceDescriptor` and runtime preview resolution instead of ad hoc asset path helpers.

#### Scenario: Media card resolves through preview descriptor
- **WHEN** a Media child node renders as an image or video card
- **THEN** its card policy emits a `PreviewSourceDescriptor` with the appropriate preview role and asset identity, and `CardPreviewSlot` resolves the runtime URL before rendering

#### Scenario: Shot card uses role-matched inline variant
- **WHEN** a Shot child node has a selected generation candidate with a safe inline data URL
- **THEN** its card policy exposes that URL through a role-matched `PreviewSourceDescriptor.variants[].sourcePath`, and `CardPreviewSlot` renders the safe variant before requesting resolver fallback

#### Scenario: New semantic preview reuses existing visual form
- **WHEN** a model or panoramic asset node needs a compact card summary
- **THEN** its policy maps the node to an existing render form and preview role without adding a new `CardPreviewSlot` branch

#### Scenario: Text preview stays runtime-free
- **WHEN** a Text or Annotation child node renders in a card
- **THEN** its policy emits a `text` render form with a bounded excerpt and no runtime URL resolution

### Requirement: Card preview runtime boundaries remain non-persistent
The system SHALL keep node-card preview runtime URLs, resolver outputs, object URLs, engine tokens, hover playback state, and player instances out of persisted Canvas data. Card preview sources MUST persist or derive only stable source metadata and selected candidate state.

#### Scenario: Save omits resolved card preview URL
- **WHEN** a Canvas file is saved after a node card preview resolves a runtime URL
- **THEN** the saved data contains stable preview source metadata or selected candidate IDs but no resolved Webview URL, object URL, or engine token

#### Scenario: Unsafe inline variant uses resolver fallback
- **WHEN** a card preview descriptor contains a role-matched variant whose `sourcePath` is not accepted by `isSafeWebviewUrl`
- **THEN** `CardPreviewSlot` ignores the unsafe fast path and uses the preview resolver fallback when a resolvable source is available

### Requirement: Canvas preview resolution uses preview intent
The system SHALL resolve Canvas node, card, storyboard, and media preview visuals through an intent-aware preview request rather than durable cache paths or package/export source paths.

#### Scenario: Shot reference preview uses resource ref
- **WHEN** a Shot node has a reference image resource reference
- **THEN** Canvas requests `interactive-preview` content for the relevant preview role
- **THEN** the runtime preview uses a projected URI or safe inline URL without persisting the resolved runtime path

#### Scenario: Missing preview resource does not reuse previous thumbnail
- **WHEN** a Canvas preview request cannot resolve or materialize the requested resource
- **THEN** Canvas displays an explicit unavailable state
- **THEN** it does not reuse the previous sequential thumbnail or another shot's cached image

### Requirement: Canvas preview data remains separate from offline source data
The system SHALL keep Canvas preview descriptors and runtime preview URLs separate from source references used by export, package, and verification operations.

#### Scenario: Canvas save omits cache path
- **WHEN** a Canvas file is saved after a preview has resolved through the resource cache
- **THEN** the saved node data contains stable refs and selected state
- **THEN** it does not contain `cachePath`, Webview URI, object URL, blob URL, preview token, or runtime reference image path as durable data

#### Scenario: Canvas export asks for source intent
- **WHEN** a Canvas-driven export or package operation needs a node's media content
- **THEN** it requests `final-export` or `package` content from the host
- **THEN** it does not reuse the card preview URI or thumbnail path as export input
