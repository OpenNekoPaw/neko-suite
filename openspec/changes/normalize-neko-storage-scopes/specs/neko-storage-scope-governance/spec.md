## ADDED Requirements

### Requirement: Storage scopes are classified before file placement

Neko storage placement SHALL be decided through an explicit storage-scope
classification before a package creates, writes, migrates, promotes, or cleans a
Neko-managed path. The classification MUST distinguish project facts,
project-local state, project cache, user-global data, extension-private data,
media-library/durable asset data, scratch data, valuable structured local state,
and rebuildable structured metadata.

#### Scenario: Known directory is classified

- **WHEN** a Host adapter or package asks where to store Agent runtime state,
  project cache resources, personal Skills, project facts, extension-private
  resources, or retained media
- **THEN** the system MUST return a storage classification with scope, owner,
  default location, tracking policy, cleanup policy, and migration policy
- **AND** the caller MUST NOT choose a workspace `.neko/<name>` path by string
  convention alone

#### Scenario: Unknown managed directory is rejected

- **WHEN** code attempts to create a new Neko-managed directory without a
  registered storage classification
- **THEN** the system MUST fail with a diagnostic that identifies the missing
  storage classification
- **AND** it MUST NOT silently create the directory under workspace `.neko/`

### Requirement: Project facts are separated from local state and cache

Project facts SHALL be stored under `neko/` or an owning project/domain file.
Workspace `.neko/` SHALL contain only project-local runtime state, local
overrides, private project artifacts, and project cache roots. `.neko/.cache/`
SHALL remain rebuildable derived storage and MUST NOT be required to preserve
confirmed project facts. Workspace `.neko/` and `.neko/.cache/` MUST NOT contain
a canonical SQLite database after migration; cache artifact files MAY remain.

#### Scenario: Project fact is written

- **WHEN** a package writes shared media-library variables, asset-library facts,
  entity bindings, entity requirements, visual identity drafts, or another
  confirmed project fact
- **THEN** the file MUST be written under `neko/` or the owning domain project
  file
- **AND** it MUST NOT be written under workspace `.neko/` or `~/.neko`

#### Scenario: Cache is deleted

- **WHEN** workspace `.neko/.cache/` is deleted or a cache manifest is missing
- **THEN** confirmed project facts, user-confirmed entity data, asset library
  facts, media-library settings, and domain project files MUST remain intact
- **AND** cacheable resources MUST be rebuilt or reported as cache misses with
  typed diagnostics

#### Scenario: Cache path is offered as project fact

- **WHEN** a package attempts to persist a `.neko/.cache` path, Webview URI,
  Engine token, runtime stream id, blob URL, or temporary path as project source
  identity
- **THEN** the save or promotion pipeline MUST fail with a diagnostic
- **AND** it MUST require a stable `ResourceRef`, source ref, workspace-relative
  path, `${VAR}/path`, asset ID, entity ID, or user-selected destination instead

### Requirement: User-global data is not created in workspace local storage by default

Project-independent personal data SHALL be created under `~/.neko` or another
explicit user-global root. Portable Skills SHALL use `~/.agents/skills`; their
project-local counterparts SHALL use `<workspace>/.agents/skills`. New default code paths MUST NOT create personal
Skills, personal commands, personal prompts, personal AGENTS instructions,
personal processors, user-level Agent config, or user-level Market install
records under workspace `.neko/`.

#### Scenario: Personal Skill is created

- **WHEN** the user creates or installs a personal Skill, command, or prompt
- **THEN** personal Skills MUST default to `~/.agents/skills`
- **AND** personal commands and prompts MUST default to `~/.neko/commands` and
  `~/.neko/prompts`
- **AND** project Skills MUST use `<workspace>/.agents/skills` when the user
  explicitly chooses a project target
- **AND** project commands and prompts MUST use `<workspace>/.neko/commands` and
  `<workspace>/.neko/prompts`
- **AND** `.neko/skills` MUST remain migration, rejection, or diagnostic input
  only

#### Scenario: Personal processor is registered

- **WHEN** the user registers a processor that should be available across
  projects
- **THEN** the processor registration MUST use a user-global source scope such
  as `~/.neko/processors`
- **AND** it MUST NOT be written to workspace `.neko/processors` unless the user
  explicitly chooses a current-project-only registration

#### Scenario: User config is resolved

- **WHEN** Agent resolves user-level configuration
- **THEN** the canonical user config path MUST be under `~/.neko`
- **AND** a workspace-local config MUST be treated as project/workspace
  configuration, not as personal global configuration

### Requirement: User content catalogs are descriptor-only rebuildable projections

Skill, Command, and Processor source files SHALL remain their editable
authorities. Shared catalog rows SHALL contain only stable Host identity,
source, portable location, fingerprint, display, enablement, version, and
diagnostic-code descriptors needed for Extension/TUI list and refresh queries.
Catalog rows MUST NOT contain Skill or Command prompt content, support-file
content, Processor manifest bodies, AGENTS instructions, config values, secrets,
or an untyped payload that can hide those values.

#### Scenario: Source-file catalog slice is refreshed

- **WHEN** a Host scans one Skill, Command, or Processor kind/source slice
- **THEN** it MUST replace only that slice in the cache-owned `catalog_items`
  partition
- **AND** sibling kinds and sources MUST remain intact
- **AND** project sources MUST use an explicit workspace partition while
  personal, builtin, Market, plugin, and extension sources use the global
  partition

#### Scenario: Catalog projection fails after a source file save

- **WHEN** a Skill, Command, or Processor source file is saved successfully but
  its catalog transaction fails
- **THEN** the source-file operation MUST remain successful
- **AND** the catalog partition MUST be marked stale with a rebuild diagnostic
- **AND** deleting or rebuilding catalog rows MUST NOT delete or rewrite the
  source files

#### Scenario: Extension and TUI observe catalog refresh

- **WHEN** either Host refreshes a source-file descriptor or its current
  provider diagnostic in a catalog slice
- **THEN** the other Host MUST read the same descriptor and diagnostic from the
  shared catalog partition
- **AND** the partition revision MUST expose the change at the next Host refresh
  boundary without watching SQLite WAL files

### Requirement: Market state and cache use distinct authorities

Installed package receipts SHALL be stored in the state-owned
`market_installations` table in the shared user database. A receipt MAY contain
the canonical package manifest, dependency/bundle reference owners, enablement,
request and lifecycle state, and the Host trust decision observed at install
time. It MUST store the install location as a portable relative or
`${VAR}/path` value and MUST NOT store an absolute install path.

Workspace trust SHALL remain owned by the Host trust system. A persisted trust
decision is installation audit context and MUST NOT override VS Code workspace
trust or fabricate a successful promotion. Download archives and extracted
cache bytes SHALL remain managed files. Market/provider descriptors or current
diagnostics that need cross-Host persistence SHALL use cache-owned catalog
projection rows and MUST NOT contain provider secrets or editable source body.

#### Scenario: Extension and TUI load installed packages

- **WHEN** either Host loads the installed package registry
- **THEN** it MUST read `market_installations` from `~/.neko/neko.db`
- **AND** it MUST expand portable install locators only at the Host boundary
- **AND** normal runtime code MUST NOT read or write `market-installed.json`

#### Scenario: Extension records workspace trust during install

- **WHEN** the Extension commits an installation receipt
- **THEN** the receipt MAY record the current VS Code workspace trust level and
  decision timestamp
- **AND** later loading the receipt MUST NOT change VS Code workspace trust
- **AND** a missing trust promotion adapter MUST fail visibly rather than return
  a fabricated trusted state

#### Scenario: Market package cache is written

- **WHEN** a Host downloads or extracts a Market package
- **THEN** archive and extracted bytes MUST remain in the managed Market cache
  file root
- **AND** the Extension cache MAY use `globalStorageUri/market-cache`
- **AND** package bytes, credentials, and provider secrets MUST NOT be stored in
  `market_installations` or `catalog_items`

### Requirement: Secrets do not enter shared metadata

Authentication and provider secrets SHALL remain in VS Code SecretStorage, a
Host system keychain, or an explicit runtime-only environment/CLI injection.
SQLite repositories, source-file catalog projections, Market receipts, Task
checkpoints, and provider diagnostics MUST NOT persist API keys, access or
refresh tokens, authorization values, client secrets, passwords, or credential
payloads.

#### Scenario: JSON-backed repository receives a nested secret

- **WHEN** a Market manifest, Task checkpoint, Search/semantic payload, Entity
  projection, or ResourceCache record contains a nested secret-bearing field
- **THEN** the shared serializer MUST reject it before the SQLite statement
  commits
- **AND** the transaction MUST roll back with a typed
  `metadata-secret-forbidden` diagnostic
- **AND** the repository MUST NOT redact the value and report a successful write

#### Scenario: VS Code account token is saved

- **WHEN** the VS Code Auth extension stores or refreshes an account token
- **THEN** it MUST delegate persistence to VS Code SecretStorage
- **AND** the token MUST NOT be copied into `neko.db`, user config, Market cache,
  or Webview state

#### Scenario: TUI has no system-keychain credential adapter

- **WHEN** the TUI receives a provider credential from an environment variable
  or explicit process argument and no system-keychain adapter is configured
- **THEN** the credential MUST remain runtime-only
- **AND** the TUI MUST NOT fall back to a plaintext `~/.neko/auth.json` store

### Requirement: Structured local metadata uses one user-level SQLite database

Structured local metadata shared by Extension and TUI SHALL use user-level
SQLite at `~/.neko/neko.db`. Valuable non-Git state and rebuildable cache/read
models MUST declare distinct logical `state` or `cache` ownership while sharing
one physical schema, connection, migration, backup, and concurrency boundary.
State and cache writes that represent different durability outcomes MUST use
separate transactions. Cache cleanup MUST use table/partition allowlists and
MUST NOT delete the database file.

Workspace-scoped rows MUST carry an explicit `workspaceId`. New canonical paths
MUST NOT create `<workspace>/.neko/neko-local.db`,
`<workspace>/.neko/.cache/neko-cache.db`, package-local SQLite databases, or
whole-file JSON stores that duplicate the shared metadata authority.

#### Scenario: Extension and TUI open shared metadata

- **WHEN** Extension and TUI list conversations, resume tasks, query catalogs,
  or read a workspace-scoped projection
- **THEN** both Hosts MUST use repositories backed by the same user-level store
  and schema
- **AND** the query MUST be partitioned by explicit `workspaceId` or an explicit
  global partition
- **AND** neither Host MAY treat its own in-memory list, VS Code Memento, or a
  package JSON manifest as the shared authority

#### Scenario: Initial database schema is created

- **WHEN** M1 initializes a new `~/.neko/neko.db`
- **THEN** it MUST create only `schema_migrations`, `workspaces`,
  `projection_versions`, and `conversations` as core tables
- **AND** later core tables MUST be added only by their owning repository
  migrations
- **AND** the long-term target MUST remain 18 core schema tables unless a
  later accepted design change demonstrates another stable responsibility

#### Scenario: Valuable local state is persisted

- **WHEN** the system persists Task/Run recovery, a resumable checkpoint,
  valuable unpromoted draft state, retained Dashboard activity, conversation
  preferences, or another non-rebuildable machine-local record
- **THEN** the record MUST be written transactionally to state-owned tables in
  `neko.db`
- **AND** it MUST be included in backup, migration, repair, and user-data
  protection policy
- **AND** cleanup MUST NOT delete it as cache

#### Scenario: Agent Task is shared across Hosts

- **WHEN** Extension or TUI persists a serializable workspace Task/Run record
- **THEN** it MUST write the state-owned `tasks` partition for the explicit
  `workspaceId`
- **AND** the other Host MUST observe the same record through the Task repository
- **AND** workspace `.neko/tasks.json` and VS Code Memento MUST NOT remain task
  authorities after migration

#### Scenario: Host-private recovery state is classified

- **WHEN** Agent persists recovery state for an external provider task
- **THEN** only the minimal serializable recovery payload MUST be written to
  `task_checkpoints`
- **AND** terminal handles, process handles, cancellation objects, leases, and
  runtime tokens MUST remain Host-private and MUST NOT enter SQLite

#### Scenario: Optional state table has no owning records

- **WHEN** current Dashboard activity is only a rebuildable recent-task
  projection or a generated draft is reproducible or already promoted to a
  project fact
- **THEN** M2 MUST NOT eagerly create `dashboard_activities` or `local_drafts`
- **AND** a later owning migration MAY create the table only after defining
  non-rebuildable user value, repository behavior, and migration evidence

#### Scenario: Rebuildable metadata is persisted

- **WHEN** the system persists conversation catalog/search, ResourceCache
  ledger, media metadata, FTS, semantic coverage, Entity/Asset projection,
  catalog, provider diagnostic, or GC/rebuild metadata
- **THEN** the record MUST be written to cache-owned tables in `neko.db` through
  its owning repository
- **AND** its authority source and rebuild operation MUST be defined
- **AND** deleting its partition MUST NOT delete project facts, Journals,
  retained artifacts, valuable local state, or user-editable files

#### Scenario: Workspace database path is requested

- **WHEN** new code requests a SQLite database under workspace `.neko/` or
  `.neko/.cache/`
- **THEN** the storage layout MUST fail with a retired-workspace-database
  diagnostic
- **AND** it MUST direct structured metadata to the appropriate logical table
  class in `~/.neko/neko.db` instead of creating a compatibility database

### Requirement: Workspace identity is stable and path-independent

Every workspace partition in user-level metadata SHALL be anchored by a stable
local checkout identity. The canonical descriptor SHALL be a versioned,
gitignored `.neko/workspace.json` containing a non-empty UUID `workspaceId`.
Absolute paths, VS Code handles, active workspace selection, cache paths, and
Webview/runtime identifiers MUST NOT be durable workspace identity.

#### Scenario: Workspace is moved or renamed

- **WHEN** a workspace with an existing `.neko/workspace.json` is opened at a
  new locator
- **THEN** the Host MUST bind the new portable locator to the same `workspaceId`
- **AND** existing state/cache partitions MUST remain addressable
- **AND** the persisted locator MUST use the shared relative or `${VAR}/path`
  contract rather than an absolute path identity

#### Scenario: Workspace descriptor is deleted at a registered locator

- **WHEN** `.neko/workspace.json` is missing and the portable current locator
  matches exactly one user-database workspace registration
- **THEN** the Host MUST atomically recreate the descriptor with that existing
  `workspaceId`
- **AND** existing state and cache partitions MUST remain addressable
- **AND** the Host MUST NOT generate or register a new UUID
- **AND** optional config, memory, project facts, and other user-authored files
  MUST NOT be synthesized as part of identity recovery

#### Scenario: Workspace move is distinguished from a copied checkout

- **WHEN** a descriptor UUID is opened at a new portable locator
- **THEN** the Host MUST inspect the registered current locator before mutation
- **AND** it MAY rebind automatically only when the prior locator is no longer
  live
- **AND** when both locators are live it MUST fail visibly and require an
  explicit clone/rebind decision

#### Scenario: Workspace locator registry is ambiguous

- **WHEN** a descriptor is missing or conflicts with multiple registrations for
  the same current locator
- **THEN** initialization MUST return a typed duplicate-identity diagnostic
- **AND** it MUST NOT create another UUID, rebuild conversation projections, or
  select an active-workspace fallback

#### Scenario: Ambiguous locator is explicitly resolved

- **WHEN** historical registrations bind multiple non-orphan workspace UUIDs to
  the current locator and the user explicitly selects the descriptor UUID as
  canonical
- **THEN** one state-owned transaction MUST verify the exact conflict set, mark
  the other registrations orphaned, and mark the selected workspace seen
- **AND** current-locator lookup MUST exclude orphaned registrations
- **AND** state/cache partitions owned by the orphaned UUIDs MUST remain
  addressable for later recovery
- **AND** the action MUST NOT merge partitions, delete rows, or create another
  UUID

#### Scenario: Duplicate checkout identity is detected

- **WHEN** the same `workspaceId` is observed at two live workspace locators
- **THEN** initialization MUST fail visibly with a duplicate workspace identity
  diagnostic
- **AND** the system MUST require an explicit clone/rebind action
- **AND** it MUST NOT merge, overwrite, or silently regenerate either checkout

#### Scenario: Copied checkout is explicitly cloned

- **WHEN** the user chooses clone for a checkout whose descriptor duplicates a
  source workspace identity
- **THEN** the Host MUST back up and atomically replace the copied descriptor
  with the approved new UUID
- **AND** it MUST register the validated portable locator as a new empty
  workspace identity without copying or merging source state/cache partitions
- **AND** registry failure MUST roll back the new row and restore the prior
  descriptor while retaining its backup

#### Scenario: Orphaned workspace is explicitly rebound

- **WHEN** the user chooses rebind for an orphaned workspace at a new locator
- **THEN** the Host MUST keep the workspace UUID, append the validated portable
  locator to history, update last-seen state, and clear the orphan marker
- **AND** the descriptor identity MUST remain unchanged

### Requirement: SQLite runtime adapters preserve one store contract

The shared metadata service SHALL be Host-neutral. VS Code Extension Host SHALL
bind a `node:sqlite` adapter and the compiled Bun TUI SHALL bind a `bun:sqlite`
adapter. Agent Core, Webviews, and feature domain packages MUST NOT import either
runtime module directly.

#### Scenario: Adapter contract is verified

- **WHEN** Node and Bun adapters are validated
- **THEN** both MUST pass the same migration, transaction, rollback, WAL,
  busy-timeout, revision, integrity, backup, corruption, and dispose contract
- **AND** a cross-Host test MUST prove that each adapter can read records written
  by the other from the same database

#### Scenario: Unsupported Host runtime starts

- **WHEN** a VS Code Extension Host, Node CLI, or Bun TUI lacks the required
  SQLite API or verified runtime version
- **THEN** startup MUST fail with an explicit unsupported-runtime diagnostic
- **AND** it MUST NOT fall back to JSON, create a second database path, or report
  storage initialization success

### Requirement: Projection failure does not redefine authoritative durability

Each SQLite repository SHALL declare whether it owns valuable local state or a
rebuildable projection. Project facts, Journal events, retained artifacts, and
valuable state transactions determine authoritative durability. Cache projection
updates MUST NOT redefine those operations as failed after their authority is
durable.

#### Scenario: Conversation catalog update fails after Journal commit

- **WHEN** terminal conversation events have been durably appended to Journal
  but the conversation catalog transaction fails
- **THEN** the run MUST remain journal-durable
- **AND** the system MUST return a typed stale-catalog/rebuild diagnostic
- **AND** it MUST schedule or expose a catalog rebuild
- **AND** it MUST NOT emit `conversation-durability-failed` for the completed
  Journal write

#### Scenario: Journal tool result is hydrated for conversation resume

- **WHEN** a persisted Journal contains a successful or failed tool result with
  object, scalar, null, or absent result data
- **THEN** Journal projection MUST emit one versioned structured result envelope
  containing explicit boolean `success`
- **AND** conversation-history hydration MUST preserve the result outcome and
  sanitized data without inferring success from payload shape
- **AND** an end-to-end projection-to-hydration test MUST cover the same public
  path used by Extension resume

#### Scenario: One persisted conversation cannot be hydrated

- **WHEN** a Journal record is malformed or violates the supported history
  contract during Host startup
- **THEN** the Host MUST preserve the Journal and expose a typed per-conversation
  recovery diagnostic
- **AND** unrelated conversations, new conversation creation, and Extension/TUI
  startup MUST remain available
- **AND** the Host MUST NOT silently present the failed conversation as restored
  or replace its history with an empty success

#### Scenario: Deleted conversation catalog is rebuilt

- **WHEN** a conversation deletion has durably appended its Journal metadata
  tombstone and the conversation catalog is later rebuilt
- **THEN** the rebuild MUST exclude the tombstoned conversation
- **AND** an older active metadata event MUST NOT resurrect it
- **AND** deleting only the cache-owned catalog row MUST NOT be treated as an
  authoritative conversation deletion

#### Scenario: Confirmed project fact projection fails

- **WHEN** a confirmed entity, binding, asset, requirement, or domain project
  file is saved successfully but a Search/Entity/Asset projection update fails
- **THEN** the project fact save MUST remain successful
- **AND** the affected projection MUST be marked stale with a rebuild diagnostic
- **AND** the UI MUST NOT present the stale projection as fresh

#### Scenario: Raw evidence aggregate is rebuilt

- **WHEN** a Host requests an optional aggregate over Journal or raw log JSONL
  files
- **THEN** it MUST stream the source files and project only file/entry/malformed
  counts, timestamp ranges, and event categories unless another accepted design
  explicitly authorizes more data
- **AND** clearing the optional aggregate sink MUST NOT delete or mutate the
  JSONL evidence
- **AND** rerunning the projection from the raw files MUST rebuild the aggregate
- **AND** this projection MUST NOT require a dedicated log-index table

### Requirement: Legacy metadata migration is explicit and recoverable

Legacy JSON indexes/manifests and workspace database paths SHALL be migration,
rejection, or diagnostic inputs only. Migration MUST validate and back up source
data, import through one transaction, verify identity/counts, and emit a report.
Normal success paths MUST poison retired stores after cutover.

#### Scenario: Migration sources are planned

- **WHEN** a Host prepares migration from a workspace storage inspection report
- **THEN** every source MUST be classified by authority, rebuildability, and a
  proposed migrate, rebuild, promote, quarantine, or skip action
- **AND** project facts, user-editable content, valuable local state, artifacts,
  and unknown sources MUST require explicit per-source approval before mutation
- **AND** rebuildable projection and scratch sources MAY proceed without user
  approval only when their classification proves they are rebuildable
- **AND** Journal and raw-log sources MUST remain non-mutating and MUST NOT be
  made mutable through approval

#### Scenario: Agent Task migration window is closed after verified cutover

- **WHEN** Extension or TUI starts after the prelaunch legacy Agent Task cutover
- **THEN** it MUST construct Task persistence only from the workspace-partitioned
  SQLite repositories
- **AND** it MUST NOT scan, parse, back up, import, rename, or delete legacy Task
  files, VS Code Memento Task keys, or migration backup keys
- **AND** it MUST NOT expose a Host command, TUI slash command, approval port, or
  public migration API for the retired Task sources
- **AND** architecture tests MUST prove legacy Task path/key/command identifiers
  are absent from normal production source and cannot return success
- **AND** generic workspace hygiene MAY report an explicitly observed retired
  path without loading it as Task state

#### Scenario: Authorized local migration artifacts are cleaned

- **WHEN** the prelaunch local environment has verified the imported SQLite Task
  count, zero imported checkpoints, and `integrity_check=ok`, and cleanup has
  explicit user authorization
- **THEN** the retired Task file copies and Memento migration backup keys MAY be
  deleted as local test data
- **AND** the canonical SQLite Task rows MUST remain unchanged
- **AND** this authorization MUST NOT become a general automatic cleanup rule for
  valuable user data

#### Scenario: Legacy Journal lacks conversation metadata

- **WHEN** catalog migration reads a pre-metadata Journal together with a
  legacy catalog row or a projectable Journal summary
- **THEN** it MAY create a cache-owned list/resume projection from those
  read-only inputs
- **AND** it MUST NOT append inferred metadata to or otherwise mutate the
  Journal during migration
- **AND** fields unavailable from Journal metadata MUST be reported explicitly
- **AND** steady-state list/resume MAY combine the migrated catalog row with
  Journal history without reading the retired JSON source as fallback

#### Scenario: Legacy import transaction fails

- **WHEN** a backed-up legacy index or manifest fails destination write,
  identity verification, or count verification
- **THEN** the destination transaction MUST roll back
- **AND** the original source and its backup MUST remain available
- **AND** the source MUST NOT be renamed to its migrated path
- **AND** a retry MUST be able to preserve already-verified identities and
  complete without duplicate records

#### Scenario: Corrupt rebuildable index is discovered

- **WHEN** a legacy conversation index, cache manifest, search index, or other
  rebuildable source is missing, empty, truncated, or malformed
- **THEN** the migration/recovery path MUST quarantine or preserve the source
- **AND** it MUST rebuild verified fields from Journal/project facts/artifacts
- **AND** unrecoverable fields MUST be reported explicitly
- **AND** malformed data MUST NOT be treated as an initialized empty success
- **AND** the owning domain MUST rebuild from its canonical authority: Journal
  metadata for conversations, project facts for Entity/Asset projections,
  portable source refs for Search/semantic projections, or retained source
  artifacts for generated ResourceCache variants
- **AND** the recovery path MUST NOT infer a business identity from an artifact
  filename when that identity cannot be verified
- **AND** every partially recovered record MUST report its stable identity, the
  exact unrecoverable fields, and a reason while the backup preserves the source
  bytes
- **AND** null or empty values required by a projection schema MUST remain
  explicitly unknown in the report and MUST NOT be counted as recovered defaults

#### Scenario: Valuable legacy state is migrated

- **WHEN** Task/Run recovery, trust/install state, retained activity, or another
  valuable local record is imported into state-owned `neko.db` tables
- **THEN** the source MUST be backed up before mutation
- **AND** the migration MUST verify the committed result before retiring the old
  path
- **AND** failure MUST preserve the original data and return a typed diagnostic

#### Scenario: Retired store is requested after cutover

- **WHEN** normal Host composition requests a conversation/Task JSON store,
  ResourceCache manifest store, Search/Entity sidecar fallback, Market installed
  JSON registry, or workspace/package-local SQLite database
- **THEN** construction MUST fail with a retired-path diagnostic or require the
  canonical LocalMetadata repository dependency
- **AND** it MUST NOT create the retired file, return an empty success, or query
  the retired source as a fallback
- **AND** explicit migration and diagnostic entry points MAY still read the
  legacy source under the backup/quarantine protocol

### Requirement: Extension-private data is separated from user-authored global data

Extension-private caches SHALL use VS Code `globalStorageUri` or another
extension-private root for no-workspace runtime resources, VS Code extension
state, and implementation-owned data that users should not hand-edit. Such data
MUST NOT be stored in project facts and MUST NOT be treated as user-authored
`~/.neko` configuration.

#### Scenario: No-workspace resource is generated

- **WHEN** a processor, Agent tool, preview, or content-access flow generates a
  resource without a workspace scope
- **THEN** the Host MUST allocate the resource under extension-private storage
  such as `globalStorageUri/resources`
- **AND** downstream project handoff MUST receive a diagnostic or require
  explicit promotion before treating the resource as durable project data

#### Scenario: Extension Market cache is written

- **WHEN** the VS Code Market extension writes package cache or extension-owned
  installation state
- **THEN** the data MUST be classified as extension-private or explicitly mapped
  to user-global Market state
- **AND** the implementation MUST NOT mix extension-private cache files with
  editable user config or workspace project facts

### Requirement: Recordings and imports use intent-specific destinations

Recording, import, and generated media outputs SHALL be placed according to
intent. Preview-only outputs MAY use project-local or extension-private runtime
storage with retention and cleanup diagnostics. User-retained media MUST be
promoted, linked, or saved to a user-selected workspace/media-library root and
recorded through project facts or the owning project format.

#### Scenario: Preview recording is created

- **WHEN** Live or Audio creates a local preview recording that is not a retained
  project asset
- **THEN** the output MAY be written under workspace `.neko/recordings` or
  extension-private recording storage
- **AND** the result MUST be marked as preview/runtime data with cleanup or save
  diagnostics

#### Scenario: Retained recording is saved

- **WHEN** the user saves a recording as project media or asset-library content
- **THEN** the file MUST be written or moved to a workspace path, media-library
  root, or user-selected durable destination
- **AND** project facts MUST record a stable source identity and provenance
- **AND** the retained asset MUST NOT rely on hidden workspace `.neko/recordings`
  as the durable success contract
- **AND** the owning Asset service MUST reject a retained destination under
  workspace `.neko`, persist the recording id, producer, and recorded time, and
  flush the project fact before reporting promoted success
- **AND** if project fact persistence fails after durable bytes are written, the
  bytes MUST be preserved and the result MUST expose a recovery diagnostic
  rather than report successful promotion

#### Scenario: Import fallback target is used

- **WHEN** an import flow needs to materialize a copy because the source is not a
  portable workspace-relative or `${VAR}/path` source
- **THEN** the target MUST be classified as temporary import staging, project
  asset promotion, or user-confirmed project media
- **AND** long-lived imports MUST have an explicit promotion or project fact
  record instead of living indefinitely as unclassified `.neko/imports` data
- **AND** an import that is immediately registered in AssetLibrary or referenced
  by an owning editor MUST use an explicit `promote` or `extract-promote` plan
  and a durable destination such as workspace `media/imports`
- **AND** an external absolute source path that cannot be contracted to a
  workspace-relative or `${VAR}/path` value MUST NOT be persisted in the project
  fact; the import MAY retain content hash and source filename provenance

### Requirement: Deprecated and misplaced workspace directories are diagnostic paths

Deprecated or misplaced workspace-local directories SHALL be surfaced through
typed diagnostics and explicit actions. Legacy paths MAY be read only by
migration, rejection, or diagnostic flows. They MUST NOT be default success
paths for new writes. Location alone MUST NOT classify legal project-local
commands, prompts, processors, Skills, or AGENTS content as personal. A
misplaced-personal-content diagnostic MUST require the owning content scanner to
provide an explicit personal-scope observation.

#### Scenario: Host inspects workspace local storage

- **WHEN** Extension or TUI inspects workspace `.neko`
- **THEN** it MUST return one typed read-only report for retired databases and
  manifests, misplaced facts, explicit personal observations, large caches,
  logs, recordings, imports, temporary storage, and deprecated directories
- **AND** the report MUST distinguish entries that require explicit user action
  from rebuildable or retention-policy entries
- **AND** cache size calculation MUST NOT follow symbolic links outside the
  inspected workspace
- **AND** inspection MUST NOT move, delete, or rewrite user files

#### Scenario: Deprecated hooks directory exists

- **WHEN** workspace `.neko/hooks` exists
- **THEN** the system MUST report a deprecated hook catalog diagnostic
- **AND** new hook loading MUST use settings-based hook configuration instead of
  silently loading `.neko/hooks`

#### Scenario: Personal data is found under workspace local storage

- **WHEN** inspection finds project-independent personal Skills, prompts,
  commands, processors, or AGENTS instructions under workspace `.neko`
- **THEN** the system MUST report a diagnostic with `~/.agents/skills` as the
  personal Skill target or the corresponding `~/.neko` target for other content
- **AND** the migration MUST require explicit action unless the data is known to
  be safe to move

#### Scenario: Project fact is found under workspace local storage

- **WHEN** inspection finds project facts, confirmed entity data, asset facts, or
  shared media-library declarations under workspace `.neko`
- **THEN** the system MUST report a diagnostic with the owning `neko/` or project
  file target
- **AND** it MUST NOT silently treat the `.neko` file as the source of truth for
  new project fact writes

### Requirement: Cleanup is safe, scoped, and auditable

Cleanup operations SHALL be scope-aware. They MAY remove rebuildable cache and
scratch data according to cache policy. They MUST NOT delete valuable local user
data, project facts, retained recordings, promoted assets, user config, trust
state, Market install records, or non-rebuildable artifacts without explicit
user confirmation and diagnostics.

#### Scenario: Rebuildable cache cleanup runs

- **WHEN** cleanup targets workspace `.neko/.cache` entries that are rebuildable,
  stale, over budget, or unpinned
- **THEN** the system MAY delete cache files and manifest entries according to
  ResourceCache policy
- **AND** it MUST skip pinned, session-active, promoted, non-rebuildable,
  debug-retained, and outside-root entries
- **AND** general workspace cleanup MUST require explicit candidates and
  allowlisted roots rather than infer that the whole `.neko` tree is disposable
- **AND** valuable state, project facts, retained artifacts, and the managed
  root itself MUST always produce protected skip results

#### Scenario: Cleanup encounters recordings

- **WHEN** cleanup finds files under workspace `.neko/recordings`
- **THEN** it MUST classify them as preview/runtime recordings or retained media
  candidates
- **AND** it MUST NOT delete them automatically unless they match an explicit
  stale preview policy or the user confirms deletion

#### Scenario: Cleanup result is reported

- **WHEN** cleanup, migration, or promote completes
- **THEN** the system MUST report which files were deleted, migrated, promoted,
  skipped, or diagnosed
- **AND** the report MUST include residual risks for files that remain misplaced
  or require user action
- **AND** the common maintenance report MUST itemize deleted, migrated, rebuilt,
  promoted, skipped, quarantined, and user-action-required outcomes with stable
  aggregate counts
- **AND** user-action-required entries MUST NOT be collapsed into ordinary
  skipped counts

### Requirement: Workspace ignore and managed directory guardrails are enforced

Neko workspaces SHALL keep workspace `.neko/` runtime/cache data out of Git by
default while keeping `neko/` project facts trackable. Agent file tools and
workspace scanners MUST treat managed runtime/cache directories as hidden unless
access is explicitly mediated by Host services and structured refs.

#### Scenario: Neko workspace hygiene is initialized

- **WHEN** Neko initializes or inspects a workspace
- **THEN** it MUST ensure or diagnose that workspace `.neko/` runtime/cache
  directories are ignored by Git or equivalent project hygiene rules
- **AND** it MUST NOT ignore `neko/` project facts by default
- **AND** an explicit ensure action MAY append a managed `.neko/` ignore rule
  and MUST verify it through Git semantics after the write
- **AND** an existing rule that hides `neko/` project facts MUST be reported
  with its matched rule rather than silently removed or overridden

#### Scenario: Agent scans workspace files

- **WHEN** Agent file tools list, grep, or read ordinary workspace files
- **THEN** managed directories such as `.neko/.cache`, `.neko/logs`,
  `.neko/state`, and temp/cache roots MUST be hidden by default
- **AND** Agent Draft/Plan/Task creation documents MUST use visible
  `neko/creations/<creation-id>/brief.md`, `plan.md`, and `checklist.md`
  paths rather than hidden managed runtime directories
- **AND** access to cache-backed media MUST go through structured refs and Host
  content access instead of path scanning

#### Scenario: Misconfigured ignore would hide project facts

- **WHEN** inspection detects that `neko/` project facts are ignored while
  workspace `.neko/` runtime data is not ignored
- **THEN** the system MUST report a workspace hygiene diagnostic
- **AND** it MUST suggest keeping `.neko/` ignored and `neko/` trackable
