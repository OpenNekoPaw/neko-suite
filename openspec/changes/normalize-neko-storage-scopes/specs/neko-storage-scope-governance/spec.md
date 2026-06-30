## ADDED Requirements

### Requirement: Storage scopes are classified before file placement

Neko storage placement SHALL be decided through an explicit storage-scope
classification before a package creates, writes, migrates, promotes, or cleans a
Neko-managed path. The classification MUST distinguish project facts,
project-local state, project cache, user-global data, extension-private data,
media-library/durable asset data, and scratch data.

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
confirmed project facts.

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
explicit user-global root. New default code paths MUST NOT create personal
Skills, personal commands, personal prompts, personal AGENTS instructions,
personal processors, user-level Agent config, or user-level Market install
records under workspace `.neko/`.

#### Scenario: Personal Skill is created

- **WHEN** the user creates or installs a personal Skill, command, or prompt
- **THEN** the default target MUST be the corresponding `~/.neko` directory
- **AND** workspace `.neko/skills`, `.neko/commands`, or `.neko/prompts` MAY be
  used only when the user explicitly chooses a project-local target

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

#### Scenario: Import fallback target is used

- **WHEN** an import flow needs to materialize a copy because the source is not a
  portable workspace-relative or `${VAR}/path` source
- **THEN** the target MUST be classified as temporary import staging, project
  asset promotion, or user-confirmed project media
- **AND** long-lived imports MUST have an explicit promotion or project fact
  record instead of living indefinitely as unclassified `.neko/imports` data

### Requirement: Deprecated and misplaced workspace directories are diagnostic paths

Deprecated or misplaced workspace-local directories SHALL be surfaced through
typed diagnostics and explicit actions. Legacy paths MAY be read only by
migration, rejection, or diagnostic flows. They MUST NOT be default success
paths for new writes.

#### Scenario: Deprecated hooks directory exists

- **WHEN** workspace `.neko/hooks` exists
- **THEN** the system MUST report a deprecated hook catalog diagnostic
- **AND** new hook loading MUST use settings-based hook configuration instead of
  silently loading `.neko/hooks`

#### Scenario: Personal data is found under workspace local storage

- **WHEN** inspection finds project-independent personal Skills, prompts,
  commands, processors, or AGENTS instructions under workspace `.neko`
- **THEN** the system MUST report a diagnostic with a suggested `~/.neko`
  migration target
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
