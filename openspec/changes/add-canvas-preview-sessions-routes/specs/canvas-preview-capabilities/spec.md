## MODIFIED Requirements

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
