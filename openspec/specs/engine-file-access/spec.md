# engine-file-access Specification

## Purpose
TBD - created by archiving change unify-engine-file-access. Update Purpose after archive.
## Requirements
### Requirement: Engine-Owned File Registration
The engine SHALL provide a file access registry that resolves local file sources into opaque tokens after canonicalization and allowed-root validation.

#### Scenario: Register allowed local file
- **WHEN** a client registers a local file source under an allowed root with a file access purpose
- **THEN** the engine returns an opaque token, file size, MIME type, and range-capable URL

#### Scenario: Reject path outside allowed roots
- **WHEN** a client registers a local file source outside configured allowed roots
- **THEN** the engine rejects the request and does not create a token

#### Scenario: Reuse preview compatibility route
- **WHEN** a client registers a file through the existing preview registration route
- **THEN** the registration uses the same file access registry as the general files API

### Requirement: File Source References
The engine SHALL define a source reference contract that lets actions refer to a registered token or compatibility path without transferring file bytes through TypeScript.

#### Scenario: Action receives token source
- **WHEN** an engine media action receives a token source reference
- **THEN** the action resolves the token inside the engine before opening the file

#### Scenario: Action receives legacy source path
- **WHEN** an existing client sends a legacy `source` path during migration
- **THEN** the action continues to work through the compatibility path handling

### Requirement: Range Reads
The engine SHALL serve bounded byte-range reads for registered file tokens with HTTP Range semantics.

#### Scenario: Valid range read
- **WHEN** a client requests bytes `start-end` from a registered token
- **THEN** the engine returns exactly that bounded byte range with partial-content metadata

#### Scenario: Invalid range read
- **WHEN** a client requests a range outside the file bounds
- **THEN** the engine returns a range error without reading or returning unrelated bytes

### Requirement: Container Entry Reads
The engine SHALL serve individual entries from registered ZIP-based container files without requiring clients to read the full archive.

#### Scenario: Read EPUB entry
- **WHEN** a client requests an entry path from a registered EPUB token
- **THEN** the engine extracts and returns only that entry's bytes

#### Scenario: Missing entry
- **WHEN** a client requests an entry path that is absent from the container
- **THEN** the engine returns a not-found error

### Requirement: File Token Lifecycle
The engine SHALL provide explicit token cleanup and safe automatic cleanup for registered file tokens.

#### Scenario: Explicit unregister
- **WHEN** a client unregisters a token
- **THEN** subsequent reads for that token fail with not-found semantics

#### Scenario: One-shot helper cleanup
- **WHEN** a client helper registers a file for a scoped operation
- **THEN** the helper unregisters the token when the operation completes or fails

### Requirement: Binary Read Boundary
Extension packages SHALL route media, document, model, puppet, subtitle, and agent attachment binary reads through the engine file access contract once a supported engine path exists.

#### Scenario: Disallowed Extension binary range read
- **WHEN** a package needs a subtitle or metadata byte range from a local media file
- **THEN** it uses engine file access range reads instead of Node or VSCode filesystem byte reads

#### Scenario: Allowed text configuration read
- **WHEN** a package reads workspace settings, small project JSON, preferences, lyrics, or sidecar text
- **THEN** it may use Extension-side filesystem APIs if the read belongs to VSCode document or configuration semantics

### Requirement: Engine file access receives source-intent inputs
The system SHALL register engine file tokens for export, package, verify, byte-range, and container-entry operations from source-intent resolution rather than cache projection outputs.

#### Scenario: Export engine token comes from source
- **WHEN** a final export registers a local media file with engine file access
- **THEN** the file path comes from source-intent content resolution
- **THEN** it is not a Webview URI, preview cache path, thumbnail path, or proxy path unless explicit draft/proxy mode is requested

#### Scenario: Container entry read uses original token
- **WHEN** a package operation requests an EPUB or CBZ entry through engine file access
- **THEN** the token references the original container file
- **THEN** the entry read returns bytes from that original container

### Requirement: Engine runtime tokens are not durable content refs
The system SHALL treat engine file tokens, stream identifiers, range URLs, and preview token URLs as runtime access handles that cannot be stored as durable source identity.

#### Scenario: Project save omits engine token
- **WHEN** a source read or preview operation registers an engine token
- **THEN** persisted project, Canvas, Agent, or package metadata stores the stable source ref instead of the token

#### Scenario: Offline operation cannot start from expired token alone
- **WHEN** a final export or package operation is resumed with only an expired engine token and no source ref
- **THEN** the operation reports missing-source
- **THEN** it does not infer the source from cache or token URL text

### Requirement: Bundle Locators Are Not Engine File Paths
The engine file access contract SHALL treat bundle locators as metadata references that must be resolved before engine actions consume data.

#### Scenario: Engine action receives bytes not fragment
- **WHEN** a Live2D bundle-backed `.moc3` entry is loaded
- **THEN** the engine action receives bytes, base64, or a registered file token rather than a `bundlePath#entryPath` fragment string

#### Scenario: Fragment path is rejected as local path
- **WHEN** a caller attempts to register or load `bundlePath#entryPath` as a normal local file path
- **THEN** the file access layer rejects it or requires explicit bundle resolution first

### Requirement: Container Entry Reads Can Support Bundle Resolution
When used by bundle readers, the engine file access contract SHALL resolve archive entries through registered container tokens rather than fake local file paths.

#### Scenario: Registered ZIP entry read
- **WHEN** a ZIP file is registered as an allowed container source and a safe entry path is requested
- **THEN** file access returns bounded entry bytes without exposing the entry as a fake local file path

