# canvas-render-refresh-tiering Specification

## Purpose
TBD - created by archiving change optimize-canvas-render-refresh-tiering. Update Purpose after archive.
## Requirements
### Requirement: Canvas separates runtime viewport from persisted document edits

The system SHALL treat active pan and zoom as runtime Webview state during editor interaction and SHALL NOT update persisted Canvas document data for every viewport frame.

#### Scenario: Pan updates runtime viewport only

- **WHEN** the user pans the Canvas viewport during a pointer gesture
- **THEN** the active viewport transform updates for rendering
- **THEN** `CanvasData.nodes`, `CanvasData.connections`, and semantic Canvas metadata remain unchanged

#### Scenario: Wheel zoom updates runtime viewport only

- **WHEN** the user zooms the Canvas viewport with the wheel
- **THEN** the active viewport zoom and pan update for rendering
- **THEN** the system does not treat the wheel frame as a semantic document edit

#### Scenario: Loaded document seeds runtime viewport

- **WHEN** a Canvas document is loaded with an existing `viewport` field
- **THEN** the runtime viewport initializes from that field
- **THEN** later runtime viewport changes do not require writing that field on every frame

### Requirement: Runtime viewport changes do not trigger document persistence per frame

The system SHALL prevent pure runtime viewport movement from scheduling document save, history, operation audit, or full Canvas status synchronization per interaction frame.

#### Scenario: Pure viewport pan does not schedule save

- **WHEN** only the runtime viewport pan changes
- **THEN** the Webview does not post a document `save` message for that change

#### Scenario: Pure viewport zoom does not create history

- **WHEN** only the runtime viewport zoom changes
- **THEN** the history stack and operation audit do not receive a document edit entry

#### Scenario: Semantic edit still saves

- **WHEN** a node, connection, content block, or semantic Canvas metadata changes
- **THEN** the Webview schedules the normal debounced document save

### Requirement: Viewport snapshots are non-semantic and deduplicated

The system SHALL store optional final viewport snapshots as UI state rather than semantic document edits, and SHALL deduplicate snapshot writes.

#### Scenario: Idle writes one viewport snapshot

- **WHEN** the runtime viewport changes and then becomes idle
- **THEN** the viewport snapshot writer records at most one latest snapshot for that idle window

#### Scenario: Blur or close flushes pending snapshot

- **WHEN** the editor blurs or closes while a viewport snapshot write is pending
- **THEN** the system flushes the pending latest snapshot once
- **THEN** duplicate flush sources do not write the same snapshot repeatedly

#### Scenario: Snapshot write does not mark document dirty

- **WHEN** the system stores a viewport snapshot
- **THEN** the Canvas document is not marked dirty solely because of that snapshot

### Requirement: Canvas root subscriptions are dependency-scoped

The Canvas Webview SHALL subscribe UI regions to the smallest required store slices instead of rerendering the full workbench for unrelated store updates.

#### Scenario: Selection changes do not recompute document-only selectors

- **WHEN** only the selected node or connection IDs change
- **THEN** document-only derived values that depend on nodes and connections are not recomputed solely because of selection identity changes

#### Scenario: Viewport changes do not rerender document panels

- **WHEN** only the runtime viewport changes
- **THEN** panels and controls that depend only on document data do not rerender from that viewport change

#### Scenario: Semantic node changes rerender affected regions

- **WHEN** a committed node edit changes document data
- **THEN** Canvas regions that depend on node data update normally

### Requirement: Drag, resize, and rotation use transient previews

The system SHALL use transient interaction state for drag, resize, and rotation during pointer movement and SHALL commit document data on gesture end.

#### Scenario: Drag previews without per-frame document commit

- **WHEN** the user drags a node
- **THEN** the node visual position updates during the gesture
- **THEN** the persisted node position is committed when the drag ends

#### Scenario: Resize previews without per-frame document commit

- **WHEN** the user resizes a node
- **THEN** the node visual size updates during the gesture
- **THEN** the persisted node size is committed when the resize ends

#### Scenario: Gesture end records one history entry

- **WHEN** a drag, resize, or rotation gesture completes with a changed value
- **THEN** the system records one history and operation audit entry for the committed change

### Requirement: Derived render projections are throttled and dependency-aware

The system SHALL recompute derived render projections from narrow dependencies and SHALL throttle or freeze expensive projections during high-frequency interactions on large canvases.

#### Scenario: Connection projection uses structural dependencies

- **WHEN** nodes, connections, visible node IDs, expanded containers, or render bounds change
- **THEN** the connection projection may recompute
- **THEN** unrelated runtime-only state does not force a full connection projection recompute

#### Scenario: Large canvas throttles viewport-derived projections

- **WHEN** a Canvas has more than the configured throttling threshold of nodes and the user pans or zooms
- **THEN** viewport culling and minimap updates are throttled during the gesture

#### Scenario: Dense graph freezes nonessential edge following

- **WHEN** a Canvas has a dense connection graph and the user drags or resizes a node
- **THEN** the renderer may freeze nonessential connection lines during the gesture
- **THEN** connection geometry reconciles after the gesture commits

### Requirement: Heavy content supports low-cost interaction rendering

The system SHALL allow heavy Canvas node content to enter a low-cost rendering mode during fast viewport or transform interactions, while keeping durable resource references stable.

#### Scenario: Static heavy content may render as shell during fast interaction

- **WHEN** a static image, document, markdown, table, gallery, or rich container preview enters fast interaction mode
- **THEN** the renderer may preserve a shell or frozen visual instead of recalculating expensive content

#### Scenario: Low-cost mode exits on idle or timeout

- **WHEN** interaction becomes idle or the configured maximum shell duration expires
- **THEN** the renderer restores the full content rendering mode

#### Scenario: Realtime content can opt out

- **WHEN** a video playback node, realtime 3D/Live2D viewport, streaming preview, or other live-feedback node renders during fast interaction
- **THEN** it may opt out of heavy-content freezing

### Requirement: Canvas grid rendering avoids per-frame SVG dot regeneration

The system SHALL render the Canvas background grid through a lower-cost renderer that avoids regenerating many SVG dot elements on every viewport frame.

#### Scenario: Grid responds to runtime viewport

- **WHEN** pan or zoom changes the runtime viewport
- **THEN** the grid updates its visual alignment and density without requiring document data changes

#### Scenario: Grid respects theme tokens

- **WHEN** Canvas theme colors or grid token values change
- **THEN** the grid renderer updates its colors or style according to those tokens

