## ADDED Requirements

### Requirement: Canvas Preview sessions are isolated by source Canvas document
The system SHALL manage Canvas Preview panels as Preview sessions keyed by source Canvas document by default. Opening Preview for a Canvas document that already has a session MUST reveal and refresh that session. Opening Preview for a different Canvas document MUST create or reveal a distinct session.

#### Scenario: Reopen same Canvas Preview
- **WHEN** the user opens Preview twice from the same Canvas document
- **THEN** the system reveals the existing Preview session for that document
- **THEN** the system refreshes that session from the current Canvas snapshot

#### Scenario: Open previews for two Canvas documents
- **WHEN** the user opens Preview from Canvas A and then opens Preview from Canvas B
- **THEN** the system maintains two distinct Preview sessions
- **THEN** each session keeps its own source Canvas URI and panel lifecycle state

### Requirement: Preview messages carry session identity
The system SHALL include session identity, source Canvas URI, and revision on Preview messages that route or replace Preview state. The Extension Host MUST reject stale or mismatched Preview messages.

#### Scenario: Message targets wrong session
- **WHEN** a Preview message contains a session id that does not match the receiving Preview panel
- **THEN** the Extension Host drops the message
- **THEN** no Canvas highlight, route state, playback plan, or media state is updated from that message

#### Scenario: Message uses stale revision
- **WHEN** a state-replacing Preview message has a revision older than the session's accepted revision
- **THEN** the Extension Host drops the message
- **THEN** the Preview session keeps the newer accepted state

#### Scenario: Equal revision is idempotent
- **WHEN** the session manager accepts the same revision more than once for a session
- **THEN** it keeps the existing accepted session state
- **THEN** it does not create duplicate pending messages or duplicate route resets

### Requirement: Preview session resources are scoped to the owning webview
The system SHALL generate Preview runtime URLs, local resource roots, variant requests, and media playback handles for the owning Preview session webview. Runtime Preview URLs MUST NOT be reused across Preview sessions.

#### Scenario: Session plan uses its own webview projection
- **WHEN** a Preview playback plan is generated for a session
- **THEN** all runtime Preview URLs in that plan are projected for that session's webview
- **THEN** the plan does not reuse runtime Preview URLs generated for another Preview panel

#### Scenario: Closing one Preview releases only its media
- **WHEN** Preview session A and Preview session B both have active media handles
- **THEN** closing Preview session A releases only session A's media handles
- **THEN** Preview session B remains playable

#### Scenario: Existing session refreshes resource roots
- **WHEN** an existing Preview session is revealed and refreshed
- **THEN** the Extension Host configures resource access for that session's source Canvas before generating the Preview-specific playback plan

### Requirement: Canvas editor close lifecycle marks or disposes Preview sessions
The system SHALL handle Preview sessions when the owning Canvas editor closes. A visible Preview session MUST become stale and display non-blocking stale state. A hidden Preview session MUST be disposed immediately. A stale Preview session MUST expire after the configured grace period unless it is reattached.

#### Scenario: Visible Preview becomes stale
- **WHEN** the owning Canvas editor closes while its Preview panel is visible
- **THEN** the Preview session is marked stale
- **THEN** the Preview UI displays non-blocking stale state in the Preview chrome

#### Scenario: Hidden Preview is disposed
- **WHEN** the owning Canvas editor closes while its Preview panel is hidden
- **THEN** the Preview session is disposed
- **THEN** its pending messages, resource variant requests, and media handles are released

#### Scenario: Stale Preview expires
- **WHEN** a Preview session remains stale beyond the configured grace period
- **THEN** the system disposes the session
- **THEN** the system releases session-owned media handles and pending runtime resources

### Requirement: Canvas playback plans expose route candidates
The system SHALL allow `CanvasPlaybackPlan` to expose transient route candidates for playable chains. Route candidates MUST NOT be persisted into `.nkc` files.

#### Scenario: Multiple entries produce multiple routes
- **WHEN** a playback plan has multiple valid playable entries
- **THEN** the plan exposes multiple route candidates
- **THEN** each candidate identifies its entry unit and ordered unit ids

#### Scenario: Disconnected playable components produce routes
- **WHEN** a Canvas contains multiple disconnected playable components
- **THEN** playback projection exposes route candidates for those components up to the configured cap

#### Scenario: Saved Canvas omits route candidates
- **WHEN** a Canvas file is saved after Preview route candidates have been computed
- **THEN** the saved `.nkc` data does not contain route candidates, active route id, branch selections, runtime Preview URLs, or media handles

### Requirement: Effective route resolution is shared and deterministic
The system SHALL provide a shared effective route resolver for `CanvasPlaybackPlan`. Consumers MUST use this resolver instead of reimplementing precedence between route candidates and legacy entry IDs.

#### Scenario: Route candidates win
- **WHEN** a playback plan contains non-empty route candidates
- **THEN** effective route resolution returns validated and deterministically sorted route candidates

#### Scenario: Empty route candidates diagnose unplayable plan
- **WHEN** a playback plan explicitly contains an empty route candidate list
- **THEN** effective route resolution returns no routes
- **THEN** it returns a diagnostic explaining that no route candidates are available

#### Scenario: Missing route candidates use legacy entry
- **WHEN** a playback plan does not contain route candidates but contains legacy entry unit ids
- **THEN** effective route resolution derives one compatibility route from the first entry using existing first-transition traversal behavior

### Requirement: Route candidate generation is bounded
The system SHALL cap generated route candidates to a deterministic maximum. When route discovery exceeds the cap, the resolver MUST keep the first candidates after deterministic ordering and MUST emit a truncation diagnostic.

#### Scenario: Route candidate cap is exceeded
- **WHEN** a Canvas contains more discovered playable route candidates than the configured cap
- **THEN** the resolver keeps only the first candidates after deterministic ordering
- **THEN** it returns a diagnostic with the number of truncated candidates

#### Scenario: Candidate order is stable
- **WHEN** route candidates are generated repeatedly from unchanged Canvas data
- **THEN** the route candidate order remains stable
- **THEN** truncation keeps the same candidates across runs

### Requirement: Preview UI supports route switching
The Preview UI SHALL display a route switcher when more than one effective route exists. Switching routes MUST reset active unit, elapsed time, active media surface, and branch selections for the Preview playback state.

#### Scenario: Multiple routes show switcher
- **WHEN** a Preview session loads a playback plan with multiple effective routes
- **THEN** the Preview UI displays a route switcher
- **THEN** the user can choose the active route without changing Canvas data

#### Scenario: Single route hides switcher
- **WHEN** a Preview session loads a playback plan with zero or one effective route
- **THEN** the Preview UI does not display a route switcher

#### Scenario: Route switch resets runtime state
- **WHEN** the user switches from one route to another
- **THEN** Preview resets active unit, elapsed time, active media surface, and branch selections
- **THEN** Preview starts from the selected route's entry unit

### Requirement: Single-node playback is a valid route
The system SHALL treat a single playable unit as a valid route. Preview controls MUST handle this route without special-case graph requirements.

#### Scenario: Selected shot previews as one route
- **WHEN** the user opens Preview from a selected playable Shot with no outgoing playable transitions
- **THEN** the effective routes include a single-unit route for that Shot
- **THEN** Preview displays the Shot content and disables previous and next controls

#### Scenario: Single media node plays
- **WHEN** the user opens Preview from a selected playable media node
- **THEN** Preview displays the media unit
- **THEN** play advances according to the unit duration or media-ended policy and stops at route end

### Requirement: Branch choices remain runtime route state
The system SHALL keep branch choices as runtime state inside the active route. Route candidate generation MUST NOT enumerate every possible branch path.

#### Scenario: Interactive branch pauses playback
- **WHEN** the active unit has multiple enabled outgoing transitions in interactive mode
- **THEN** Preview pauses automatic advancement
- **THEN** Preview displays branch buttons for the current unit

#### Scenario: Branch choice updates active route history
- **WHEN** the user selects a branch choice
- **THEN** Preview records the selected transition in runtime branch selections
- **THEN** Preview appends or rewrites the active route history from the current unit

#### Scenario: Route candidates ignore branch combinations
- **WHEN** a Canvas graph has branching transitions
- **THEN** route candidate generation does not create one route for every possible branch combination
