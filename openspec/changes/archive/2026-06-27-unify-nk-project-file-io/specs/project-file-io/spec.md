## ADDED Requirements

### Requirement: Shared project file store

The system SHALL provide a shared project file store for JSON `nk*` project files that coordinates load, save, save-as, backup, revert, dirty-state updates, diagnostics, and serialized writes through host-authorized file operations.

#### Scenario: File-backed project saves to disk

- **WHEN** a file-backed `.nkv`, `.nkc`, `.nks`, `.nkp`, `.nkm`, or `.nka` document is saved
- **THEN** the project file store MUST write the encoded document to the target project file through host-authorized file operations
- **AND** the durable project facts MUST be recoverable by reopening the same file without relying on VS Code editor state, Webview state, cache files, or runtime handles

#### Scenario: Memory-backed project is updated

- **WHEN** a memory-backed project session is updated without a target file
- **THEN** the project file store MUST update the in-memory document state
- **AND** it MUST NOT imply that the document has been durably saved until save-as or equivalent target selection succeeds

#### Scenario: Concurrent saves are serialized

- **WHEN** multiple save requests target the same project document concurrently
- **THEN** the project file store MUST serialize writes for that document
- **AND** the final on-disk content MUST reflect a complete encoded document rather than interleaved partial writes

### Requirement: Domain-owned format codec registry

The system SHALL load and save each supported `nk*` format through a registered domain-owned codec that defines format id, file extensions, current version, validation, migration, defaults, and serialization behavior.

#### Scenario: Registered codec loads a project file

- **WHEN** the project file store opens a supported `nk*` file
- **THEN** it MUST select the matching registered codec by format or extension
- **AND** it MUST return the codec's document data, validation diagnostics, migration metadata, and compatibility state

#### Scenario: Unsupported format is opened

- **WHEN** the project file store opens a file whose extension or format id has no registered codec
- **THEN** it MUST return an `invalid-format` diagnostic
- **AND** it MUST NOT guess a domain model by parsing arbitrary JSON

#### Scenario: Future-version file is opened

- **WHEN** a registered codec reports that a project file was written by a newer unsupported format version
- **THEN** the project file store MUST fail closed or mark the document read-only according to the codec compatibility result
- **AND** it MUST expose an `unsupported-version` diagnostic to the caller

### Requirement: Portable source path persistence

The system SHALL persist durable source paths only as workspace-relative paths, configured `${VAR}/path` values, allowed remote source refs, stable `ResourceRef` or source refs, asset/entity IDs, or provenance fields.

#### Scenario: Workspace-local source is saved

- **WHEN** a project source path points to a file inside the owning workspace or project folder
- **THEN** the save pipeline MUST contract it to a workspace-relative path before writing durable project content

#### Scenario: Configured media-root source is saved

- **WHEN** a project source path points inside a configured media library or path-variable root
- **THEN** the save pipeline MUST contract it to `${VAR}/path` before writing durable project content

#### Scenario: Non-portable absolute source is saved

- **WHEN** a project source path is an absolute local path that cannot be contracted to workspace-relative or `${VAR}/path`
- **THEN** the save pipeline MUST return a `non-portable-path` diagnostic
- **AND** it MUST NOT silently persist the absolute local path as a durable project fact

#### Scenario: Project folder is moved with local media

- **WHEN** a project folder and its project-local media files are moved together to a new local path
- **THEN** reopening the project MUST resolve workspace-relative source paths relative to the new owning workspace or document context

#### Scenario: Media library root changes between machines

- **WHEN** a project file contains `${VAR}/path` source references and the user configures `VAR` to a different local root on another machine
- **THEN** reopening the project MUST resolve those sources through the configured variable root

### Requirement: Source resolution diagnostics

The system SHALL resolve durable source references with explicit diagnostics instead of guessing missing, ambiguous, unauthorized, or unresolved paths.

#### Scenario: Variable is missing

- **WHEN** a project file references `${VAR}/path` and `VAR` is not configured in the active workspace or environment
- **THEN** source resolution MUST return an `unresolved-variable` diagnostic naming the missing variable
- **AND** it MUST NOT replace the reference with a guessed neighboring file

#### Scenario: Source is outside authorized roots

- **WHEN** a durable source reference resolves outside the allowed workspace, media-library, document, or host-authorized roots
- **THEN** source resolution MUST return an `unauthorized-root` diagnostic
- **AND** it MUST NOT project a Webview URI or Engine file token for that source

#### Scenario: Source file is missing

- **WHEN** a durable source reference resolves to a local path that does not exist
- **THEN** source resolution MUST return a `missing-source` diagnostic
- **AND** the project document MUST remain loadable so the user can relink, move the source into managed storage, configure a variable root, or run an explicit recovery action

### Requirement: Host-mediated Add, Link, and Create Asset

The system SHALL convert dragged, pasted, selected, generated, linked, or externally referenced sources into durable project references through Extension Host mediated Add, Link, and Create Asset flows.

#### Scenario: Durable workspace or asset source is added

- **WHEN** a user adds a file or asset that already belongs to the owning workspace, project folder, asset library, OSS-backed asset storage, allowed remote source, or configured `${VAR}` root
- **THEN** the Webview MUST send an add or link intent to Extension Host
- **AND** Extension Host MUST return a durable workspace-relative path, `${VAR}/path`, stable source ref, `ResourceRef`, asset/entity ID, or allowed remote ref before the source is written into the project document
- **AND** the source MUST NOT be copied solely because it was added to a domain document

#### Scenario: Unmanaged local file is rejected until made durable

- **WHEN** a user drags or selects a local file from `Downloads`, `Desktop`, temp folders, or another unmanaged absolute path
- **THEN** the source handling pipeline MUST NOT auto-copy it, silently import it, or persist the absolute path
- **AND** the editor MUST receive a diagnostic with recovery actions such as moving the file into the workspace/project folder or asset library, configuring a `${VAR}` root, or cancelling the add
- **AND** the project document MUST NOT save only the browser `File.name` as source identity

#### Scenario: Byte-only input is created as an asset before Add

- **WHEN** a Webview `File`, blob, byte payload, paste screenshot, or AI/generated byte output is added to a durable project file
- **THEN** Extension Host MUST create a durable file or asset object first through a host-owned Create Asset flow
- **AND** the resulting durable source ref, `ResourceRef`, asset/entity ID, workspace-relative path, or `${VAR}/path` MAY then be added to the project document
- **AND** the project file MUST NOT persist scratch paths, temporary paths, provider runtime IDs, unpromoted cache artifact paths, blob URLs, or inline large binary payloads as source identity

#### Scenario: Domain Add handler stores references instead of parsed binary payloads

- **WHEN** a durable media, audio, image, subtitle, LUT, PSD, model, puppet, or archive-backed source is added to a domain project
- **THEN** the domain Add handler MUST persist only portable source refs, asset refs, derived editable records, locators, and provenance required by that domain
- **AND** parsing, probing, thumbnailing, proxy generation, subtitle conversion, PSD layer extraction, LUT parsing, model loading, or puppet bundle resolution MUST run through ContentAccess, Engine file access, cache services, or explicit conversion flows
- **AND** the project file MUST avoid embedding large binary payloads that belong in workspace, asset-library, or OSS-backed storage

### Requirement: Runtime and cache handles are not project identity

The system SHALL prevent runtime handles and cache artifacts from being persisted as durable project source identity.

#### Scenario: Webview URI is present during save

- **WHEN** a document contains a Webview URI, blob URL, preview URL, Engine token, stream ID, range URL, or WebSocket URL in a source-bearing field during save
- **THEN** the save pipeline MUST return a `runtime-handle-persisted` diagnostic
- **AND** it MUST NOT write that runtime handle as a durable source

#### Scenario: Cache path is present during save

- **WHEN** a document contains a cache artifact path, preview proxy path, thumbnail path, or legacy `cachePath` value as source identity during save
- **THEN** the save pipeline MUST return a `cache-source-persisted` diagnostic
- **AND** it MUST require a stable source ref, `ResourceRef`, explicit Create Asset recovery, or relink action before that source is treated as durable

#### Scenario: Cache is deleted

- **WHEN** `.neko/.cache` or equivalent managed cache artifacts are deleted
- **THEN** project files with valid durable source references MUST remain loadable
- **AND** derived previews, thumbnails, proxies, or metadata MUST be rebuildable or reported as cache misses without corrupting project facts

### Requirement: Webview and Extension boundary

The system SHALL keep durable project file I/O, path contraction, source authorization, and Add/Link/Create Asset decisions in Extension Host or shared host adapters, while Webviews operate through typed messages and projected DTOs.

#### Scenario: Webview requests save

- **WHEN** a Webview editor requests a document save or sends document edits
- **THEN** it MUST communicate through a typed message or document host contract
- **AND** it MUST NOT import `vscode`, Node filesystem modules, Extension implementation modules, or write `nk*` files directly

#### Scenario: Extension projects runtime access

- **WHEN** a Webview needs to preview media or other project content
- **THEN** Extension Host MUST project an authorized Webview URI, Engine stream descriptor, Engine file-access token, or compatible preview descriptor from a durable source reference
- **AND** the projected runtime access MUST be separate from the saved project document

### Requirement: Consistent diagnostics

The system SHALL expose machine-readable project-file diagnostics for parse, validation, migration, path, source, backup, and write failures so editors can present consistent recovery actions.

#### Scenario: Invalid JSON is opened

- **WHEN** a project file contains invalid JSON
- **THEN** the project file store MUST return an `invalid-json` diagnostic
- **AND** it MUST NOT replace the file with a default empty project without an explicit user recovery action

#### Scenario: Migration fails

- **WHEN** a codec migration fails for a supported older project format
- **THEN** the project file store MUST return a `migration-failed` diagnostic
- **AND** it MUST preserve the original file content unless the user explicitly chooses a recovery or migration write

#### Scenario: Backup fails

- **WHEN** VS Code requests a custom editor backup and backup persistence fails
- **THEN** the project file store MUST return a `backup-failed` diagnostic
- **AND** the owning editor MUST keep dirty state or otherwise expose that the latest edits are not safely backed up

### Requirement: Prelaunch project format migration safety

The system SHALL make prelaunch breaking changes to `nk*` draft formats explicit, diagnosable, and recoverable.

#### Scenario: Runtime-only legacy field is removed

- **WHEN** a prelaunch migration removes a legacy field that stored only cache or runtime state
- **THEN** the migration notes, tests, or diagnostics MUST state that the field is rebuilt, relinked, moved into managed storage, ignored, or intentionally discarded
- **AND** the migration MUST NOT silently delete valuable durable source, user setting, trust, entitlement, plugin install, or generated asset data

#### Scenario: Valuable absolute path legacy data is encountered

- **WHEN** an existing prelaunch project file contains absolute local paths that represent valuable user media
- **THEN** migration or load MUST preserve enough information to relink, move into managed storage, create an asset, or configure a variable root
- **AND** it MUST return diagnostics if the path cannot be made portable automatically
