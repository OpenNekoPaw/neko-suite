# canvas-preview-capabilities Specification

## Purpose
TBD - created by archiving change canvas-block-container-architecture. Update Purpose after archive.
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
