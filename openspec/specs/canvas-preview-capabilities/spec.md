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
The system SHALL persist only stable preview source metadata, selected candidate IDs, and optional stable preview preferences. The system MUST NOT persist blob URLs, engine tokens, object URLs, active playback state, hover state, current playback time, player instances, Preview session ids, active route ids, branch selections, or Webview-projected Preview URLs in `.nkc` or `node.data`.

#### Scenario: Save omits runtime token
- **WHEN** a Canvas file is saved while an audio preview is active
- **THEN** the saved file contains the asset identity and selected candidate metadata but no active playback token or current playback time

#### Scenario: Source change cleans runtime resources
- **WHEN** a preview block changes source
- **THEN** the runtime releases old object URLs or engine tokens before resolving the new source

#### Scenario: Save omits Preview session state
- **WHEN** a Canvas file is saved while a Canvas Preview panel has an active route and branch selections
- **THEN** the saved file contains stable Canvas data only
- **THEN** it does not contain Preview session ids, active route ids, branch selections, or Webview-projected Preview URLs

### Requirement: Canvas previews remain lightweight and delegated
The system SHALL keep Canvas preview behavior lightweight. Canvas MAY render DOM-native images, lightweight audio/video proxies, waveform previews, GIFs, and engine-issued turntable or rotation clips. Canvas MUST delegate real-time 3D, spherical panorama interaction, HDR tone mapping controls, video timeline editing, audio mixing, and heavy decode/transcode work to specialized extensions or the engine.

#### Scenario: Panoramic asset delegates sphere viewer
- **WHEN** a Canvas node displays a panoramic image or 360 video
- **THEN** it renders a flat proxy, FOV crop, thumbnail, or pre-rendered rotation preview and opens the panoramic viewer for spherical interaction

#### Scenario: Video editing opens specialized editor
- **WHEN** a user requests timeline-level video interaction from a Canvas video preview
- **THEN** Canvas delegates to the video preview or editing extension rather than implementing timeline scrubbing in the node

### Requirement: Preview playback has a single active runtime owner
The system SHALL manage inline or hover playback through a preview runtime that tracks active preview instances and cleanup. Playback-capable previews in one Canvas Webview MUST support limiting active audio/video playback to one active item unless a policy explicitly allows otherwise. Playback-capable Canvas Preview panels MUST scope active media handles to the owning Preview session so one session cannot stop, reuse, or dispose another session's media handles.

#### Scenario: Starting second preview stops first
- **WHEN** an audio preview is active and the user starts a video preview
- **THEN** the preview runtime stops or releases the audio preview before activating the video preview

#### Scenario: Webview dispose releases previews
- **WHEN** the Canvas Webview is disposed
- **THEN** the preview runtime releases active players, object URLs, and engine-owned preview tokens

#### Scenario: Preview session dispose releases only owned media
- **WHEN** two Canvas Preview sessions have active media handles
- **THEN** disposing one Preview session releases only that session's media handles
- **THEN** the other Preview session remains active until it is stopped or disposed

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
The system SHALL keep Canvas preview descriptors and runtime preview URLs separate from source references used by export, package, and verification operations. Runtime Preview URLs are scoped to the webview or Preview session that received them and MUST NOT be reused as source input for export, package, verification, or another Preview session.

#### Scenario: Canvas save omits cache path
- **WHEN** a Canvas file is saved after a preview has resolved through the resource cache
- **THEN** the saved node data contains stable refs and selected state
- **THEN** it does not contain `cachePath`, Webview URI, object URL, blob URL, preview token, or runtime reference image path as durable data

#### Scenario: Canvas export asks for source intent
- **WHEN** a Canvas-driven export or package operation needs a node's media content
- **THEN** it requests `final-export` or `package` content from the host
- **THEN** it does not reuse the card preview URI or thumbnail path as export input

#### Scenario: Preview session does not reuse another session URL
- **WHEN** Preview session A has resolved an image, audio, or video runtime URL
- **THEN** Preview session B requests its own runtime projection for the same stable source
- **THEN** Preview session B does not reuse session A's runtime URL

### Requirement: Canvas media preview uses workspace-relative path context
Canvas Preview and inline Canvas media playback SHALL resolve media source paths with the source Canvas document's workspace-relative media path context before display, probe, playback, capture, or variant projection.

#### Scenario: Reopened Canvas Preview plays workspace-relative media
- **WHEN** a Canvas media node stores `cases/1080P.mp4`
- **AND** the file exists under the source Canvas document's owning workspace root
- **THEN** Canvas Preview resolves the path to that existing local file before probing or playing
- **AND** it does not send `cases/1080P.mp4` directly to `neko-client` or engine.

#### Scenario: Reopened Canvas Preview plays document-relative legacy media
- **WHEN** a reopened Canvas media node stores a legacy path such as `../cases/test.mp4`
- **AND** the file exists relative to the source Canvas document
- **THEN** Canvas Preview resolves the path to that existing local file before probing or playing
- **AND** it does not send the unresolved relative string directly to `neko-client` or engine.

#### Scenario: Slash-prefixed portable media path resolves through source context
- **WHEN** a reopened Canvas media node stores a portable path such as `/../cases/test.mp4`
- **AND** that value is not an existing absolute local file
- **AND** the corresponding media exists relative to the owning workspace or source Canvas document
- **THEN** Canvas Preview treats the value as a portable media reference candidate
- **AND** it resolves the path through the source Canvas context before probing or playing.

#### Scenario: Preview session supplies source context
- **WHEN** a Canvas Preview session sends `media:probe` or `media:play`
- **THEN** the message carries enough session identity to recover the source Canvas URI and revision
- **AND** the Extension Host resolves media paths against that source Canvas context.

#### Scenario: Canvas image display and media playback share source resolution
- **WHEN** a Canvas media source can be displayed as an image/poster
- **AND** the same source can be played as audio or video
- **THEN** display URL projection and playable source resolution use the same durable source reference and path context
- **AND** a display URL alone is not treated as the playable engine source.

### Requirement: Canvas save normalizes resolvable local media paths
Canvas save and import flows SHALL persist resolvable local media paths in portable form without writing runtime Webview URLs or engine handles.

#### Scenario: New Canvas media import saves workspace-relative path
- **WHEN** a user imports a local media file inside the owning workspace
- **THEN** the media node stores a workspace-root-relative path such as `cases/test.mp4`
- **AND** runtime fields such as Webview URLs, blob URLs, and playback handles are omitted from durable Canvas data.

#### Scenario: Canvas preserves unresolved legacy value visibly
- **WHEN** a legacy media path cannot be resolved to an existing local file
- **THEN** Canvas keeps the durable value for migration compatibility
- **AND** Preview shows an unavailable or diagnostic state instead of passing the unresolved value to engine.

### Requirement: Canvas playback Preview uses a stage-first player shell
The system SHALL render Canvas playback Preview as a stage-first player shell when a `CanvasPlaybackPlan` is available. The main stage MUST display the active playback unit's primary content, and playback controls MUST NOT be placed in a fixed top toolbar as the default layout.

#### Scenario: Playback plan opens player shell
- **WHEN** Canvas Preview receives a `CanvasPlaybackPlan` with playable units
- **THEN** the Preview displays a primary stage for the active unit
- **THEN** transport controls and route progress are placed in the bottom control area

#### Scenario: Stage overlay replaces fixed top bar
- **WHEN** the active unit has a title, kind, warning, branch state, or metadata action
- **THEN** the Preview may show compact overlay affordances inside the stage
- **THEN** it does not reserve a persistent top narrow bar for default playback metadata

### Requirement: Canvas playback Preview renders multiple content kinds in the main stage
The system SHALL render active playback units through stage renderers selected by `CanvasPlaybackUnit.kind` and `CanvasPlaybackUnit.renderMode`. Stage renderers MUST support media, image preview sources, text or Fountain-derived script excerpts, storyboard shot or scene summaries, narrative summaries, and generic node fallback states without changing playback route construction.

#### Scenario: Media unit renders media stage
- **WHEN** the active playback unit has kind `media` or render mode `media-playback`
- **THEN** the stage uses host-resolved preview variants or media playback affordances for the unit
- **THEN** unresolved media shows an explicit unavailable state instead of hiding the stage

#### Scenario: Shot unit renders storyboard stage
- **WHEN** the active playback unit has kind `shot`
- **THEN** the stage displays available shot visual content, generated preview imagery, action/dialogue/script text, or a bounded storyboard fallback
- **THEN** route controls continue to operate independently from the chosen shot renderer

#### Scenario: Generic unit renders fallback stage
- **WHEN** the active playback unit has kind `node` or `container` without a specialized renderer
- **THEN** the stage displays a node summary or selected-node preview fallback
- **THEN** Canvas highlighting can still identify the source node

### Requirement: Canvas playback Preview uses one segmented route timeline
The system SHALL expose route position and elapsed playback through one segmented timeline/progress rail. The segmented timeline MUST replace separate duplicate stage-progress and numeric timeline rows in the default playback layout.

#### Scenario: Segment maps to playback unit
- **WHEN** a route contains multiple playback units
- **THEN** the timeline renders one segment per route unit
- **THEN** the active segment indicates current unit progress and completed segments indicate elapsed route progress

#### Scenario: Segment navigation jumps to unit
- **WHEN** the user activates a timeline segment
- **THEN** playback stops or seeks according to the active advance policy
- **THEN** the active unit changes to the segment's playback unit

#### Scenario: Interactive branch route remains bounded
- **WHEN** playback pauses at an interactive branch before a target is chosen
- **THEN** the segmented timeline represents the current chosen route
- **THEN** unchosen branches are exposed as choices rather than prefilled route segments

### Requirement: Canvas playback Preview keeps transport controls in the bottom control area
The system SHALL place previous, play or pause, next, current time, total time, and route progress controls in a bottom control area. Media-specific controls such as volume or playback speed MUST be shown only when the active unit or route policy supports them.

#### Scenario: Timer playback shows time controls
- **WHEN** the playback plan advances by timer
- **THEN** the bottom controls show play or pause, previous, next, current time, total time, and timeline progress

#### Scenario: User-input playback disables unsupported auto-play
- **WHEN** the playback plan advances by user input
- **THEN** the bottom controls do not present unsupported automatic playback as available
- **THEN** branch or next-step choices remain reachable through the player UI

#### Scenario: Media-ended playback keeps media controls scoped
- **WHEN** the active unit advances by media-ended policy and exposes media playback capabilities
- **THEN** media-specific controls are associated with the media unit stage or bottom control area
- **THEN** generic storyboard and node units do not display irrelevant volume controls

### Requirement: Canvas playback Preview exposes metadata and diagnostics as secondary surfaces
The system SHALL expose Info, Branches, Diagnostics, adapter/mode/policy, and resource-reference details through secondary surfaces such as drawers, popovers, or compact overlays. These details MUST NOT occupy a permanent right-side inspector column in the default player layout.

#### Scenario: User opens diagnostics
- **WHEN** the playback plan contains diagnostics
- **THEN** the player exposes a diagnostics affordance
- **THEN** activating it reveals diagnostic details without replacing or permanently shrinking the main stage

#### Scenario: Branch choices appear at playback decision point
- **WHEN** the active playback unit has multiple enabled outgoing choices in interactive mode
- **THEN** the player displays branch choices as playback decisions near the stage or controls
- **THEN** selecting a choice updates the active route and notifies Canvas through the existing bridge message contract

#### Scenario: Technical metadata stays secondary
- **WHEN** the user needs adapter, behavior mode, advance policy, source node ID, or resource reference details
- **THEN** the player makes those details available through an inspector affordance
- **THEN** the default stage remains focused on preview content

### Requirement: Canvas playback player layout preserves runtime resource boundaries
The Canvas playback player SHALL keep layout state, current playback position, route history, resolved preview URLs, media element state, object URLs, and diagnostics drawer state out of persisted Canvas data. The player MUST continue to consume durable node IDs, unit IDs, resource references, and host-resolved runtime preview outputs through bridge messages.

#### Scenario: Save omits player runtime state
- **WHEN** the user saves a Canvas document while the Preview player is open and mid-playback
- **THEN** the saved `.nkc` contains stable Canvas data and optional playback metadata
- **THEN** it does not contain current time, active route history, drawer state, resolved Webview URIs, object URLs, or media element state

#### Scenario: Resource failure is localized to stage
- **WHEN** a stage renderer cannot resolve a preview image, audio source, video poster, or media URL
- **THEN** the player shows an unavailable state for that unit
- **THEN** route navigation, diagnostics, and source node highlighting remain usable

### Requirement: Canvas playback Preview supports internationalized player text
The system SHALL render Canvas playback Preview visible player text through VSCode localization resources. The Extension Host MUST produce localized labels, status messages, control text, empty states, and metadata labels, and the Webview MUST consume them as injected runtime data instead of directly calling VSCode APIs.

#### Scenario: Preview opens with localized shell text
- **WHEN** Canvas Preview creates the playback Webview
- **THEN** the Webview document uses the current VSCode locale attributes
- **THEN** title, status, transport controls, inspector labels, timeline labels, and unavailable states use localized text

#### Scenario: Webview localization respects sandbox boundaries
- **WHEN** the Preview Webview needs dynamic player text
- **THEN** it reads from the Extension Host injected localization dictionary
- **THEN** it does not import or call VSCode APIs from the Webview context

### Requirement: Narrative Preview remains separate from Canvas lightweight previews
The system SHALL keep immersive interactive narrative playback in a separate Narrative Preview panel. Canvas node previews MUST remain lightweight editor affordances and MUST NOT store or own Narrative Preview runtime state such as current node, history, variable snapshots, active renderer instances, player state, resolved asset URLs, or choice hover state.

#### Scenario: Canvas scene node shows compact preview
- **WHEN** a `narrative-scene` node renders inside Canvas
- **THEN** it displays compact scene metadata such as title, Fountain excerpt, asset availability, or thumbnail preview
- **THEN** it does not mount the full Narrative Preview runtime inside the node card

#### Scenario: Canvas save omits narrative runtime state
- **WHEN** the user saves a `.nkc` document while Narrative Preview is open and mid-playthrough
- **THEN** the saved Canvas data contains stable graph, metadata, and preview descriptors
- **THEN** it does not contain the current playthrough state, runtime renderer handles, or resolved Webview URLs

### Requirement: Narrative scene nodes delegate scene editing to Story
The system SHALL treat `narrative-scene` Canvas nodes as graph nodes that reference standard `.fountain` scene content. Double-click or explicit edit actions MUST delegate scene text editing to the Story/Fountain editor, while Canvas retains branch graph editing and compact preview responsibilities.

#### Scenario: Double-click opens Fountain scene editor
- **WHEN** the user double-clicks a `narrative-scene` node with a `.fountain` scene reference
- **THEN** Canvas asks the Extension Host to open the referenced scene in the Story/Fountain editor
- **THEN** Canvas does not replace that editor with an embedded custom story-language editor

#### Scenario: Missing Fountain reference shows remediation
- **WHEN** a `narrative-scene` node has no scene reference or points to an unavailable `.fountain` file
- **THEN** Canvas shows a bounded missing-scene preview state and creation or relink actions
- **THEN** the node remains part of the graph without inventing `.nks`, `.story`, or `.nkstory` content

### Requirement: Narrative Preview uses Canvas preview descriptors only for editor summaries
The system SHALL allow Canvas card preview descriptors to summarize narrative nodes for containers, minimap-like views, Agent context, and compact node cards. Those descriptors MUST remain independent from the immersive renderer registry used by Narrative Preview.

#### Scenario: Agent extracts narrative node summary
- **WHEN** Agent requests structured content for selected narrative Canvas nodes
- **THEN** extraction can use node summary descriptors containing graph role, scene reference, choice labels, conditions, and ending metadata
- **THEN** it does not require resolved runtime Preview URLs or renderer instances

#### Scenario: Renderer choice does not alter Canvas summary data
- **WHEN** the user switches Narrative Preview from illustrated text to visual novel rendering
- **THEN** Canvas card summaries remain derived from stable node metadata
- **THEN** the renderer selection is kept in Preview state or graph metadata rather than stored as runtime card data
