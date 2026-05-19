## ADDED Requirements

### Requirement: Webview roots are derived from registered local resource providers

The system SHALL derive Webview `localResourceRoots` from registered local resource root providers instead of requiring each Webview provider to assemble roots independently.

#### Scenario: Webview roots include required resource categories

- **WHEN** a media-capable Webview is configured through the local resource access service
- **THEN** the configured roots include the Webview extension asset root, workspace roots, configured media-library roots, and approved preview cache roots

#### Scenario: Root aggregation avoids broad filesystem roots

- **WHEN** local resource roots are aggregated
- **THEN** the system MUST NOT add filesystem root, user home, or system temp root unless a feature-specific provider explicitly returns a narrower child root

### Requirement: Media-library roots are authorized automatically

The system SHALL authorize local roots configured through `neko-assets` media libraries for Webviews that display local media resources.

#### Scenario: External media-library asset is displayed

- **WHEN** a user adds an external directory as a `neko-assets` media library and a Webview displays a file from that directory
- **THEN** the Webview receives a URI produced through `webview.asWebviewUri(...)` and the media-library root is included in `localResourceRoots`

#### Scenario: Media-library settings change

- **WHEN** media-library roots are added, removed, disabled, or overridden
- **THEN** active local resource providers can refresh their root list so newly projected Webview URIs match the current media-library configuration

### Requirement: Local media paths are projected through one resolver

The system SHALL provide a single Extension Host resolver for converting local media file paths to Webview-safe URIs.

#### Scenario: Authorized local path is projected

- **WHEN** a caller requests a Webview URI for a local file path under an authorized root
- **THEN** the resolver returns the `webview.asWebviewUri(...)` string for that file

#### Scenario: Remote URL is preserved

- **WHEN** a caller requests a Webview URI for an `http://` or `https://` URL
- **THEN** the resolver returns the URL unchanged

#### Scenario: Unauthorized local path is not silently authorized

- **WHEN** a caller requests a Webview URI for a local file path outside all authorized roots
- **THEN** the resolver MUST return an explicit unauthorized result or leave the path unresolved with a warning path for the caller to handle

### Requirement: Previewable transient files use controlled cache roots

The system SHALL store files intended for Webview preview under controlled cache roots rather than random system temp directories.

#### Scenario: Extension-owned preview cache is used

- **WHEN** an extension extracts or generates temporary media solely for Webview preview
- **THEN** it stores the media under an extension-owned cache rooted at `context.globalStorageUri` or another registered extension cache root

#### Scenario: Project-generated media cache is used

- **WHEN** generated media belongs to the current project and should be reusable by project workflows
- **THEN** it stores the media under a workspace `.neko/.cache` subdirectory that is registered as a local resource root

#### Scenario: System temp file is not exposed to Webview

- **WHEN** a process creates an intermediate file under the operating-system temp directory
- **THEN** the file MUST NOT be projected into a Webview unless it is first copied or regenerated under an authorized preview cache root

### Requirement: Stored references remain portable where possible

The system SHALL preserve portable path references for stored project and asset metadata while resolving to absolute local paths only at execution or display boundaries.

#### Scenario: Media-library asset is stored

- **WHEN** project or asset metadata stores a reference to a file under a configured media-library root
- **THEN** the stored reference uses the configured path-variable form when contraction is available

#### Scenario: Local resource display uses resolved path

- **WHEN** a Webview needs to display a stored path-variable reference
- **THEN** the Extension Host resolves the path-variable reference before checking authorization and projecting the Webview URI

### Requirement: Unauthorized resource handling is observable

The system SHALL make local resource authorization failures observable to developers and actionable for users.

#### Scenario: Unauthorized projection logs structured warning

- **WHEN** the resolver rejects a local path because it is outside authorized roots
- **THEN** the Extension Host logs a structured warning with the path category and caller context without exposing file contents

#### Scenario: User can fix missing media-library authorization

- **WHEN** a media file cannot be displayed because its containing directory is not an authorized root
- **THEN** the user-facing surface can present an action or message directing the user to add the directory as a media library or move the file into an approved cache/project location

### Requirement: Search and entity semantics remain upstream of local resource projection

The system SHALL consume already-resolved search source refs, entity representation paths, asset refs, or local file paths from their owning domain services and SHALL NOT make local resource access the authority for project search, creative identity, entity bindings, or representation resolution.

#### Scenario: Search result local resource is projected by host

- **WHEN** a Webview displays a local media or document path that originated from a `neko-search` result
- **THEN** the Extension Host resolves the search source ref through the search host boundary before passing the resulting local path to the local resource resolver

#### Scenario: Entity representation path is resolved before projection

- **WHEN** a Webview displays a representation for a creative entity
- **THEN** `neko-entity`, `AssetRefResolver`, or the owning domain package resolves the representation or asset ref before local resource access performs authorization and Webview URI projection

#### Scenario: Local resource service does not read semantic stores

- **WHEN** local resource access authorizes or projects a path
- **THEN** it MUST NOT read project search cache files, entity fact files, entity binding files, or asset metadata stores as semantic authorities
