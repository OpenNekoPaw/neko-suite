# canvas-route-storyboard-matrix Specification

## Purpose
TBD - created by archiving change introduce-canvas-route-storyboard-matrix. Update Purpose after archive.
## Requirements
### Requirement: Matrix is derived from CanvasPlaybackPlan
The Canvas Route Storyboard Matrix SHALL be derived from the active `CanvasPlaybackPlan` and MUST NOT store or persist a separate route/order model.

#### Scenario: Render matrix from active playback plan
- **WHEN** the Canvas playback route pane is visible and an active `CanvasPlaybackPlan` exists
- **THEN** the matrix renders rows, columns, and cells from the plan's effective route candidates and units
- **THEN** the matrix stores only view/session state such as view mode, active route family, fold state, filters, hover, selection, and focus

#### Scenario: Canvas graph changes refresh matrix projection
- **WHEN** Canvas nodes, containers, connections, playback metadata, selected adapter, or route source data changes
- **THEN** the matrix projection is regenerated from the updated `CanvasPlaybackPlan`
- **THEN** stale matrix rows or cells are not used as order truth

#### Scenario: Matrix state is not written to project data
- **WHEN** the user changes matrix fold state, filters, active row, hover, or selected cell
- **THEN** `.nkc` project data does not receive matrix-specific order, empty cell, column, fold, hover, filter, or alignment fields

### Requirement: Matrix rows are grouped by route family
The matrix SHALL group route candidates into route families and SHALL render divergent routes or branches within the active family by default.

#### Scenario: Fold duplicate route candidates
- **WHEN** multiple route candidates represent overlapping entry, auto-entry, scene, container, component, selection, or single-unit projections of the same graph area
- **THEN** the matrix groups them under a route family
- **THEN** the default view does not render every overlapping candidate as a separate permanent row

#### Scenario: Render divergent branches
- **WHEN** an active route family contains multiple routes with divergent playable units or branch choices
- **THEN** the matrix renders those divergent routes as separate rows
- **THEN** shared units may appear aligned across those rows

#### Scenario: Show all candidates is explicit
- **WHEN** the user enables an advanced all-candidates view
- **THEN** the matrix may show additional route candidates
- **THEN** those rows are marked by source kind or scope so subset candidates are not confused with primary branches

### Requirement: Matrix columns align by container boundary
The matrix SHALL align columns by container boundaries and stable Canvas-domain unit identity, and MUST NOT use cross-container global LCS alignment.

#### Scenario: Align at container boundaries
- **WHEN** visible routes include units from multiple containers
- **THEN** each container boundary becomes an alignment boundary for all rows
- **THEN** units from different containers are not aligned together even if labels, thumbnails, or durations match

#### Scenario: Align shared units by stable Canvas identity
- **WHEN** two rows contain the same playable Canvas node or equivalent Canvas-domain unit inside the same container
- **THEN** the matrix aligns those cells using stable identity such as `sourceNodeId`, container child id, source scene id, or source shot id
- **THEN** generated `CanvasPlaybackUnit.id` alone is not required to remain stable across routes

#### Scenario: Use empty cells for missing units
- **WHEN** an alignment slot exists in a container and a row has no playable unit for that slot
- **THEN** the matrix renders an empty cell for that row and slot
- **THEN** the empty cell is view-only and is not persisted as Canvas data

### Requirement: Matrix distinguishes playback routes from derivation graphs
The matrix SHALL render playback route projections only and MUST NOT treat workflow, derivation, reference, or asset dependency edges as playback order unless they are explicitly projected as playable route units or transitions.

#### Scenario: Multi-input generation is not a route
- **WHEN** Canvas contains nodes A, B, and C as inputs that generate video node D
- **THEN** the matrix does not render A, B, C, and D as a sequential route row solely from that derivation relationship
- **THEN** D may appear as a playable unit if the active playback plan includes D

#### Scenario: Provenance appears as detail metadata
- **WHEN** a playable generated unit has source inputs or provenance metadata
- **THEN** the matrix cell may expose those inputs in detail, badge, tooltip, or inspector metadata
- **THEN** the provenance metadata does not become playback order

### Requirement: Containers fold globally and preserve alignment
Container fold state in the matrix SHALL be global for the view and MUST preserve alignment slots or equivalent colspan across rows.

#### Scenario: Fold container across all rows
- **WHEN** the user folds a container in the matrix
- **THEN** the same container is folded in all visible route rows
- **THEN** no row keeps that container expanded independently

#### Scenario: Folded container keeps later columns aligned
- **WHEN** a folded container spans multiple expanded steps
- **THEN** the matrix renders a summary cell or equivalent placeholder that preserves the container's column span or slot occupancy
- **THEN** cells in following containers remain aligned across rows

#### Scenario: Summary cell selects container
- **WHEN** the user clicks a folded container summary cell
- **THEN** Canvas selection and viewport focus target the container
- **THEN** the PreviewStage current playable unit is not changed unless the summary resolves to a specific playable unit by explicit user action

### Requirement: Matrix supports preview navigation and selection
The matrix SHALL support route preview navigation without mutating Canvas order in Preview Mode.

#### Scenario: Click playable cell
- **WHEN** the user clicks a playable matrix cell
- **THEN** the Canvas Webview selects the corresponding source node or container
- **THEN** the Canvas viewport focuses or reveals the source object
- **THEN** the PreviewStage jumps to that unit and updates the current playback session
- **THEN** Canvas order metadata is not changed

#### Scenario: Click route row
- **WHEN** the user clicks a route row header
- **THEN** the playback session switches to that route or branch
- **THEN** the matrix, PreviewStage, and playback controls use the selected route

#### Scenario: Click step column
- **WHEN** the user clicks a step column header
- **THEN** the matrix highlights or selects comparable cells at that step across visible route rows
- **THEN** the column itself is not treated as a persistent Canvas entity

### Requirement: Matrix filtering preserves alignment
The matrix SHALL distinguish row/range filtering from unit-property highlighting so filtering does not accidentally break column alignment.

#### Scenario: Filter by route family
- **WHEN** the user filters by route family, route row, scene, or container range
- **THEN** the matrix may hide nonmatching rows or whole container ranges
- **THEN** remaining visible rows keep valid alignment

#### Scenario: Highlight unit diagnostics
- **WHEN** the user filters or searches by media availability, diagnostic, generation status, or node kind
- **THEN** the matrix highlights, badges, focuses, or lists matching cells
- **THEN** individual alignment slots are not hidden by default

### Requirement: Matrix sends selected route to Cut through draft handoff
The matrix SHALL provide a fast send-to-Cut action for the selected route row and MUST create the Cut draft from the current Canvas playback route projection, not from serialized matrix view state.

#### Scenario: Send selected route to Cut
- **WHEN** the user activates Send to Cut from a matrix row
- **THEN** the system resolves the route id and source canvas revision from the current playback session and active plan
- **THEN** the system creates or requests a `CanvasCutDraftPayload` for that route
- **THEN** Cut import receives the draft through the existing Cut import path

#### Scenario: Stale matrix cannot import
- **WHEN** the matrix was rendered from a stale plan or the selected route no longer exists in the current plan
- **THEN** send-to-Cut returns a fail-visible diagnostic
- **THEN** Cut import is not called with stale visible cells

#### Scenario: Hidden or folded cells do not alter import order
- **WHEN** a route row has hidden, filtered, or folded cells in the matrix view
- **THEN** send-to-Cut still uses the selected route from `CanvasPlaybackPlan`
- **THEN** empty cells, folded summaries, and filter state are not serialized into the Cut draft

### Requirement: Route Edit Mode gates write operations
The matrix SHALL default to Preview Mode, and any write operation SHALL require explicit Route Edit Mode and route through Canvas graph commands, undo history, and risk policy.

#### Scenario: Preview mode blocks writes
- **WHEN** the matrix is in Preview Mode
- **THEN** cell click, row click, column click, fold, filter, and hover interactions do not mutate Canvas graph order

#### Scenario: Insert into empty cell uses semantic anchor
- **WHEN** Route Edit Mode supports inserting into an empty cell
- **THEN** the insertion anchor resolves to the same container and the current row's previous and next playable units
- **THEN** the operation does not persist or rely on `[row, col]` coordinates

#### Scenario: Whole-column clear is not supported
- **WHEN** the user requests a whole-column clear
- **THEN** the matrix does not execute a column clear operation
- **THEN** any batch operation must be expressed through a domain dimension such as container, route family, step range, or explicit selection set

#### Scenario: Destructive row or cell operation requires confirmation
- **WHEN** Route Edit Mode supports deleting a cell, removing a unit from a container, disconnecting a branch, or clearing a route row
- **THEN** the system presents a confirmation or capability gate appropriate to the risk
- **THEN** the operation writes through Canvas graph commands and is undoable

### Requirement: Compact route strip remains a presentation fallback
The existing compact route strip MAY remain as an alternate presentation, but it SHALL use the same selected route and playback session state as the matrix.

#### Scenario: Switch to compact route strip
- **WHEN** the route pane is too small for the matrix or the user selects compact view
- **THEN** the compact route strip renders the selected route from the current `CanvasPlaybackPlan`
- **THEN** switching between compact and matrix view does not change Canvas order or selected route facts

#### Scenario: Compact route strip cannot become separate truth
- **WHEN** a user selects or seeks through the compact route strip
- **THEN** the same `PlaybackSession` current route, current unit, and playhead are updated
- **THEN** no separate compact route ordering is stored
