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
- **AND** the project document MUST remain loadable so the user can relink or import the missing source

### Requirement: Host-mediated import and register-source

The system SHALL convert dragged, pasted, selected, generated, or externally referenced files into durable project sources through Extension Host mediated import, register-source, or generated-output promotion flows.

#### Scenario: Workspace file is dragged into a Webview

- **WHEN** a user drags a workspace file into a Webview editor and adds it to a project
- **THEN** the Webview MUST send an add-source intent to Extension Host
- **AND** Extension Host MUST register the existing source and return a durable workspace-relative or `${VAR}/path` reference before the source is written into the project document

#### Scenario: External file is dragged into a Webview

- **WHEN** a user drags an external local file into a Webview editor
- **THEN** Extension Host MUST import the file into a project/media-library location or register it under a configured variable root before it becomes a durable project source
- **AND** if neither operation can be completed, the editor MUST receive a diagnostic instead of saving only the browser `File.name`

#### Scenario: Generated output is added to a project

- **WHEN** a generated media output is added to a durable project file
- **THEN** the output MUST be promoted through a generated-output or ingest flow that returns a stable source ref
- **AND** the project file MUST NOT persist scratch paths, temporary paths, provider runtime IDs, or unpromoted cache artifact paths

### Requirement: Runtime and cache handles are not project identity

The system SHALL prevent runtime handles and cache artifacts from being persisted as durable project source identity.

#### Scenario: Webview URI is present during save

- **WHEN** a document contains a Webview URI, blob URL, preview URL, Engine token, stream ID, range URL, or WebSocket URL in a source-bearing field during save
- **THEN** the save pipeline MUST return a `runtime-handle-persisted` diagnostic
- **AND** it MUST NOT write that runtime handle as a durable source

#### Scenario: Cache path is present during save

- **WHEN** a document contains a cache artifact path, preview proxy path, thumbnail path, or legacy `cachePath` value as source identity during save
- **THEN** the save pipeline MUST return a `cache-source-persisted` diagnostic
- **AND** it MUST require a stable source ref, `ResourceRef`, import, or relink action before that source is treated as durable

#### Scenario: Cache is deleted

- **WHEN** `.neko/.cache` or equivalent managed cache artifacts are deleted
- **THEN** project files with valid durable source references MUST remain loadable
- **AND** derived previews, thumbnails, proxies, or metadata MUST be rebuildable or reported as cache misses without corrupting project facts

### Requirement: Webview and Extension boundary

The system SHALL keep durable project file I/O, path contraction, source authorization, and import/register-source decisions in Extension Host or shared host adapters, while Webviews operate through typed messages and projected DTOs.

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
- **THEN** the migration notes, tests, or diagnostics MUST state that the field is rebuilt, reimported, ignored, or intentionally discarded
- **AND** the migration MUST NOT silently delete valuable durable source, user setting, trust, entitlement, plugin install, or generated asset data

#### Scenario: Valuable absolute path legacy data is encountered

- **WHEN** an existing prelaunch project file contains absolute local paths that represent valuable user media
- **THEN** migration or load MUST preserve enough information to relink, import, or configure a variable root
- **AND** it MUST return diagnostics if the path cannot be made portable automatically
