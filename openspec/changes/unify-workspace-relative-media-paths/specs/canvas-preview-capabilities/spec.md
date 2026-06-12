## ADDED Requirements

### Requirement: Canvas media preview uses workspace-relative path context
Canvas Preview and inline Canvas media playback SHALL resolve media source paths with the source Canvas document's workspace-relative media path context before display, probe, playback, capture, or variant projection.

#### Scenario: Reopened Canvas Preview plays workspace-relative media
- **WHEN** a Canvas media node stores `cases/1080P.mp4`
- **AND** the file exists under the source Canvas document's owning workspace root
- **THEN** Canvas Preview resolves the path to that existing local file before probing or playing
- **AND** it does not send `cases/1080P.mp4` directly to `neko-client` or engine.

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
