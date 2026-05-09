## MODIFIED Requirements

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
