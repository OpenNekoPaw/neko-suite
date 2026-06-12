## MODIFIED Requirements

### Requirement: Canvas media playback resolves persisted media references before engine calls

Canvas Preview and inline Canvas media playback MUST resolve persisted media references in the Extension Host before calling `neko-client` or `neko-engine`.

#### Scenario: Reopened Canvas media uses document-relative path

- **GIVEN** a Canvas document contains a media node whose persisted asset path is `../cases/test.mp4`
- **AND** the file exists relative to the Canvas document
- **WHEN** the media is previewed after reopening the Canvas
- **THEN** the Extension Host resolves the path to an existing local file before calling `probeMedia` or `startPlayback`
- **AND** the engine never receives the unresolved relative string.

#### Scenario: New Canvas media import stores workspace-root-relative path

- **GIVEN** a Canvas document belongs to a VSCode workspace root
- **AND** the user imports a media file inside that workspace root
- **WHEN** the Canvas document is saved
- **THEN** the persisted media asset path is relative to the workspace root, such as `cases/test.mp4`
- **AND** the persisted media asset path does not use `${WORKSPACE}/cases/test.mp4` as the canonical new format.

#### Scenario: Reopened Canvas media contains slash-prefixed portable path

- **GIVEN** a Canvas document contains a persisted asset path `/../cases/test.mp4`
- **AND** `/../cases/test.mp4` is not an existing local file
- **AND** the corresponding media exists relative to a workspace or Canvas document root
- **WHEN** the media is previewed after reopening the Canvas
- **THEN** the Extension Host treats the path as a Canvas portable reference candidate
- **AND** resolves it against the owning workspace and Canvas document roots
- **AND** only passes an existing normalized local file to the media engine.

#### Scenario: Preview display URL is not used as playback source

- **GIVEN** Preview enrichment has a safe `previewUrl` for display
- **AND** the source media is audio or video
- **WHEN** the Preview panel starts playback
- **THEN** the message sent to the Extension Host includes a playable local asset path when one is available
- **AND** the Extension Host still validates the path before using `neko-client`.

#### Scenario: Preview media playback is scoped to the owning Canvas session

- **GIVEN** the Canvas Preview panel starts audio or video playback
- **WHEN** the Preview media runtime sends `media:probe` or `media:play`
- **THEN** the message includes the Preview `sessionId`, `sourceCanvasUri`, and `revision`
- **AND** the Extension Host resolves the media path using that source Canvas URI
- **AND** the Preview panel receives either a stream-ready response or a visible error response.
