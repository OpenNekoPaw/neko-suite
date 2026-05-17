## ADDED Requirements

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
