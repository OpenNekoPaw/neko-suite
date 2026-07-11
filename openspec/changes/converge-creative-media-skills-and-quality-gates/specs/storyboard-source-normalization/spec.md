## ADDED Requirements

### Requirement: Storyboard accepts normalized source profiles
The system SHALL support Storyboard creation from prompt, text, script, document, comic, image sequence, and an existing Storyboard revision through explicit source profiles. Each profile MUST produce the same canonical Storyboard contract or a visible unsupported/invalid-source diagnostic.

#### Scenario: Prompt creates a Storyboard
- **WHEN** a user supplies a natural-language creative prompt without an existing script
- **THEN** the Storyboard workflow SHALL derive scenes and shots using the prompt source profile
- **AND** the result SHALL conform to the canonical Storyboard contract.

#### Scenario: Script creates a Storyboard
- **WHEN** a user supplies screenplay or structured script content
- **THEN** the Storyboard workflow SHALL preserve scene boundaries, dialogue context, and narrative order in canonical scene and shot records.

#### Scenario: Document routes by extracted content
- **WHEN** a document contains text, images, or both
- **THEN** Content extraction SHALL return stable text/media references
- **AND** the Storyboard workflow SHALL select the appropriate text, visual, or mixed source profile without treating the document archive path as a media asset.

### Requirement: Comic interpretation remains a specialized profile
Comic, manga, and webtoon Storyboard creation SHALL preserve specialized OCR, panel segmentation, reading-order, speech-bubble association, and cross-panel continuity behavior under `from-comic`. These rules MUST NOT be applied by default to prompt, prose, or screenplay sources.

#### Scenario: Webtoon reading order is analyzed
- **WHEN** a vertical webtoon source is processed
- **THEN** the comic profile SHALL determine panel and dialogue order from the visual source
- **AND** it SHALL record source trace back to the originating page or region.

#### Scenario: Plain script avoids comic assumptions
- **WHEN** a plain script is processed
- **THEN** the workflow SHALL NOT invent panel coordinates, speech bubbles, or comic reading-order evidence.

### Requirement: Canonical Storyboard records stable intent and provenance
Each canonical Storyboard SHALL include stable scene/shot identities, ordering, visual intent, narrative or dialogue context when present, camera/shot guidance, duration guidance, stable resource references, source trace, and a revision identity. It MUST NOT persist cache paths, Webview URIs, provider task handles, or Engine session handles as durable identity.

#### Scenario: Storyboard is handed to Canvas
- **WHEN** Canvas creates a visual projection of a Storyboard
- **THEN** Canvas SHALL reference canonical scene/shot identities and stable resources
- **AND** Canvas node or render URIs SHALL remain projections rather than Storyboard truth.

#### Scenario: Storyboard is handed to Cut
- **WHEN** a validated Storyboard is converted into a Cut draft
- **THEN** the handoff SHALL identify the Storyboard revision used
- **AND** the Cut project SHALL NOT become a second writable Storyboard truth.

### Requirement: Existing Storyboards are refined revision-safely
The existing-storyboard profile SHALL create a new revision when shots are split, merged, reordered, rewritten, or re-referenced. Quality evidence and downstream plans bound to the previous revision MUST become stale when affected intent changes.

#### Scenario: Shot order changes
- **WHEN** the user reorders shots in an existing Storyboard
- **THEN** the system SHALL produce a new Storyboard revision
- **AND** downstream animation or quality artifacts for the old order SHALL NOT be treated as current.
