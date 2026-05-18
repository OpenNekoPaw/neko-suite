# project-cache-search-service Specification

## Purpose
Define the shared project cache and search contract used by host-side services,
Agent mention completion, and Webview rendering so project facts, local derived
caches, and searchable resources stay aligned without leaking cache schemas
across package boundaries.

## Requirements
### Requirement: Project Search Uses A Shared Contract
The system SHALL expose project search results through a shared contract containing item identity, kind, label, source reference, project root, optional file path, aliases, normalized search text, navigation data, and freshness metadata.

#### Scenario: Agent receives typed mention candidates
- **WHEN** Agent requests project mention candidates for a query
- **THEN** the returned candidates are derived from shared project search items rather than package-specific cache JSON shapes

#### Scenario: Webview renders by item kind
- **WHEN** the Agent Webview renders project mention results
- **THEN** it can choose labels, icons, thumbnails, and navigation actions from the shared item kind and metadata without reading cache files

### Requirement: Search Covers Project Resource Partitions
The system SHALL support project search partitions for story scenes, story sections, script roles, creative entities, entity candidates, asset library records, media files, documents, and generated assets.

#### Scenario: Script roles and scenes are searchable
- **WHEN** a Fountain file defines role names and scene headings
- **THEN** project search returns matching script-role and story-scene items for those names

#### Scenario: Asset library entries are searchable
- **WHEN** `neko/assets/library.json` contains an asset entity with names, tags, aliases, variants, or file records
- **THEN** project search can return that asset entry using those fields as searchable text

#### Scenario: Media files are searchable
- **WHEN** configured media libraries contain media or document files
- **THEN** project search can return matching media or document items without requiring heavy metadata extraction first

### Requirement: Facts And Caches Remain Separate
The system SHALL keep authoritative project facts in Git-trackable project data and keep derived search indexes under local rebuildable cache storage.

#### Scenario: Cache rebuild preserves facts
- **WHEN** `.neko/.cache/` is deleted and rebuilt
- **THEN** confirmed entities, asset library records, entity bindings, visual identity drafts, and entity asset requirements remain available from Git-trackable facts

#### Scenario: Derived index is local
- **WHEN** the service persists a project search index
- **THEN** it writes derived index data under `.neko/.cache/` rather than making it the authoritative project fact

### Requirement: Lightweight Indexing Starts On Project Open
The system SHALL start lightweight project indexing after a project opens, including story files, project facts, asset library metadata, generated index metadata, and existing lightweight media search indexes.

#### Scenario: Newly opened project warms search
- **WHEN** a workspace project opens
- **THEN** the coordinator starts lightweight indexing without waiting for the first Agent mention query

#### Scenario: Heavy media work is deferred
- **WHEN** a project contains a large media library
- **THEN** project open indexing does not block on thumbnails, embeddings, OCR, waveform extraction, or full media probing

### Requirement: Search Reports Freshness And Partition Status
The system SHALL track freshness and status for each search partition and SHALL include freshness metadata in query responses.

#### Scenario: Stale cache can be returned with status
- **WHEN** a query can be answered from stale cache while a rebuild is running
- **THEN** the service may return stale results marked with stale freshness and continue rebuilding in the background

#### Scenario: Fresh-only query avoids stale results
- **WHEN** a caller requests fresh-only search
- **THEN** the service returns only fresh partition results or reports that a partition is still building or unavailable

#### Scenario: Partition failure is isolated
- **WHEN** one partition fails to index
- **THEN** project search can still return results from healthy partitions and reports the failed partition status

### Requirement: Incremental Updates Refresh Search
The system SHALL update project search indexes incrementally in response to relevant document, file, settings, asset, generated index, and entity fact changes.

#### Scenario: Unsaved story edit updates memory index
- **WHEN** a relevant open text document changes and contains a new role or scene name
- **THEN** in-memory project search results are updated after a debounce without waiting for the file to be saved

#### Scenario: Saved asset fact updates search
- **WHEN** an asset library or entity fact file changes on disk
- **THEN** the affected search partition is invalidated, refreshed, and emits a project index change event

#### Scenario: Media file event updates search
- **WHEN** a file is created or deleted inside an enabled media library
- **THEN** the media search partition updates without requiring a full project restart

### Requirement: Project Resolution Uses Context
The system SHALL resolve the search project from explicit project root, context URI, context file path, or existing project path resolver behavior before falling back to the first workspace folder.

#### Scenario: Context file selects owning project
- **WHEN** Agent requests mention candidates with a context file path inside a workspace folder
- **THEN** project search uses that owning workspace as the project root

#### Scenario: Variable path is resolved before search
- **WHEN** a search context path uses a supported variable or project-relative path form
- **THEN** the service resolves it through the existing path resolution layer before choosing the project root

#### Scenario: Multi-root fallback is explicit
- **WHEN** no context path or explicit project root is available
- **THEN** the service may fall back to the first workspace folder and marks the query context as fallback-derived

### Requirement: Query Matching Uses Normalized Names And Aliases
The system SHALL centralize query normalization and match against canonical names, display labels, aliases, tags, filenames, source names, and adapter-provided search text.

#### Scenario: Chinese role name matches substring
- **WHEN** a script contains a role named `小橘`
- **THEN** searching for `小` or `小橘` can return the matching script-role or entity-candidate item

#### Scenario: Alias matches asset
- **WHEN** an asset or entity has an alias that differs from its display label
- **THEN** searching by the alias can return that item

#### Scenario: Filename matches media
- **WHEN** a media file has no custom title
- **THEN** searching by its basename can return the media item

### Requirement: Consumers Do Not Read Cache Files Directly
Agent mention completion and Webview project search consumers SHALL use the project cache/search service or its host command/adapter instead of reading `.neko/.cache` files directly.

#### Scenario: Agent mention uses service adapter
- **WHEN** Agent needs project mention candidates
- **THEN** it calls the project search adapter with query text and context information rather than opening cache JSON files itself

#### Scenario: Webview receives projected results
- **WHEN** the Webview requests or displays project mention results
- **THEN** it receives projected result data through Extension messaging and does not receive local cache file paths as its data source

### Requirement: Search Cache Writes Are Safe And Rebuildable
The system SHALL persist derived search caches with versioning, source identity or generation metadata, and atomic write behavior.

#### Scenario: Stale persisted cache is rejected
- **WHEN** a persisted cache version or source identity no longer matches the current project state
- **THEN** the service rejects or marks that partition stale and schedules a rebuild

#### Scenario: Partial write does not corrupt previous cache
- **WHEN** a process is interrupted while persisting a derived search cache
- **THEN** the previous valid cache remains usable or the cache is treated as missing rather than partially valid
