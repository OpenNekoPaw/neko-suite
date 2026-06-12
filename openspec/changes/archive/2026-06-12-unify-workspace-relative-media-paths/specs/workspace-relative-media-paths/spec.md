## ADDED Requirements

### Requirement: Workspace-relative paths have document-bound meaning
The system SHALL interpret unqualified local media paths in workspace-scoped documents as relative to the owning document's workspace root before trying legacy document-relative resolution.

#### Scenario: Relative media path resolves from owning workspace
- **WHEN** a workspace-scoped document stores `cases/1080P.mp4`
- **AND** the document belongs to workspace root `/work/project`
- **THEN** host resolution treats the durable source as `/work/project/cases/1080P.mp4`
- **AND** it does not use the process current working directory as the base.

#### Scenario: Document-relative fallback preserves legacy files
- **WHEN** a legacy document stores `../cases/test.mp4`
- **AND** the file exists relative to the document directory but not relative to the owning workspace root
- **THEN** host resolution MAY use the document-directory fallback
- **AND** the fallback is reported as legacy-compatible resolution.

### Requirement: New durable media paths remain portable
The system SHALL persist new local media paths inside the owning workspace as plain workspace-root-relative paths when possible.

#### Scenario: Workspace media is saved without variable prefix
- **WHEN** a user imports or links `/work/project/cases/test.mp4` into a document owned by `/work/project`
- **THEN** the saved durable path is `cases/test.mp4`
- **AND** the saved durable path is not `${WORKSPACE}/cases/test.mp4` unless a caller explicitly requires variable-form interchange.

#### Scenario: External media uses configured variable when available
- **WHEN** a user links `/Volumes/media/music/a.wav`
- **AND** a configured path variable maps `MEDIA` to `/Volumes/media`
- **THEN** the saved durable path is `${MEDIA}/music/a.wav`
- **AND** the saved durable path does not contain the absolute filesystem prefix.

### Requirement: Runtime boundaries resolve before execution or projection
The system SHALL resolve durable local media paths to typed runtime outcomes before Webview projection, engine probing, playback, export, indexing, or metadata extraction.

#### Scenario: Engine does not receive unresolved workspace path
- **WHEN** a Webview requests playback for `cases/1080P.mp4`
- **THEN** the Extension Host resolves it through the owning document context
- **AND** the engine-facing request receives an existing local file path, registered file token, or explicit unresolved error
- **AND** the engine-facing request does not receive the raw relative string.

#### Scenario: Webview receives display resource not filesystem authority
- **WHEN** a Webview needs to display a local media source
- **THEN** the Extension Host returns a Webview-safe URI, preview descriptor, or media session descriptor
- **AND** the Webview does not choose the workspace root or call filesystem APIs.

### Requirement: Workspace variables are compatibility inputs
The system SHALL support `${WORKSPACE}/...` and `${PROJECT}/...` as read-time compatibility paths and boundary-safe interchange forms without requiring them as canonical storage for new workspace-local media.

#### Scenario: Workspace variable resolves through owning workspace
- **WHEN** a stored or transferred path is `${WORKSPACE}/cases/test.aac`
- **AND** the owning workspace root contains `cases/test.aac`
- **THEN** host resolution resolves to that existing file
- **AND** the durable canonical form for a future save MAY be `cases/test.aac`.

#### Scenario: Unknown variable fails before engine call
- **WHEN** a stored path references `${MISSING}/clip.mp4`
- **AND** no configured path variable defines `MISSING`
- **THEN** host resolution reports an unresolved variable diagnostic
- **AND** no engine probe or playback call is attempted with the unresolved string.

### Requirement: Multi-root resolution is deterministic
The system SHALL resolve ambiguous workspace-relative media paths with deterministic precedence: owning workspace root first, then other open workspace roots in VSCode order, then source document directory as legacy fallback.

#### Scenario: Same relative file exists in two roots
- **WHEN** a document in workspace root `/work/a` stores `cases/clip.mp4`
- **AND** both `/work/a/cases/clip.mp4` and `/work/b/cases/clip.mp4` exist
- **THEN** resolution selects `/work/a/cases/clip.mp4`
- **AND** the resolver MAY emit an ambiguity diagnostic for observability.

#### Scenario: Source document root is missing
- **WHEN** a media path must be resolved but no owning workspace or source document context is available
- **THEN** the resolver reports missing context
- **AND** it does not fall back to the repository working directory or first workspace silently.

### Requirement: Slash-prefixed portable paths are migration inputs
The system SHALL treat slash-prefixed paths that are not existing local files as migration candidates for portable media references rather than passing them directly to execution layers.

#### Scenario: Slash-prefixed non-file resolves as portable candidate
- **WHEN** a persisted media path is `/cases/test.mp4`
- **AND** `/cases/test.mp4` is not an existing file
- **AND** `cases/test.mp4` exists under the owning workspace root
- **THEN** host resolution selects the workspace file
- **AND** engine playback receives only the existing local file path.

#### Scenario: Slash-prefixed existing absolute file remains absolute
- **WHEN** a persisted media path is `/Volumes/media/test.mp4`
- **AND** that path exists and is authorized
- **THEN** host resolution may treat it as an absolute source
- **AND** save-time contraction attempts to replace it with a configured variable path.

### Requirement: Durable source, display URL, and playable source are distinct
The system SHALL keep durable media identity separate from Webview display URLs and playable engine inputs.

#### Scenario: Preview URL is not persisted as source
- **WHEN** a Webview displays a local media source through a `vscode-resource`, Webview URI, blob URL, or preview URL
- **THEN** saved project data preserves the durable source path or stable resource reference
- **AND** it does not save the runtime display URL as the source path.

#### Scenario: Playable path is validated independently of display URL
- **WHEN** a preview surface has a valid display URL
- **AND** playback is requested for audio or video
- **THEN** the host resolves or registers a playable source separately
- **AND** playback failure is reported explicitly when no playable source can be resolved.
