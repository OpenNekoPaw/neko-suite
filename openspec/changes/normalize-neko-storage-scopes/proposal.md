## Why

Neko workspace roots are accumulating unrelated `.neko/` directories: project
cache, Agent runtime state, logs, Dashboard activity, recordings, temp imports,
personal content, and deprecated catalogs are all visible as one workspace-local
bucket. At the same time, Extension and TUI maintain overlapping local indexes
through whole-file JSON stores.

The current conversation path demonstrates the failure mode: the VS Code
conversation list remains available from `workspaceState`, while a truncated
`~/.neko/conversations-index.json` causes terminal persistence to report
`conversation-durability-failed`. A rebuildable cross-Host projection has become
a second authority and a hard durability dependency.

Storage placement and structured local metadata therefore need one canonical
design before more Agent, Dashboard, Assets, Search, Entity, Market, and media
flows depend on incompatible workspace-local JSON files.

## What Changes

- Keep Git-trackable project facts under `neko/` or owning domain project files.
- Keep user-editable config, AGENTS, memory, Skills, Commands, Processors,
  conversation Journals, raw logs, and large artifacts as files.
- Introduce one user-level `~/.neko/neko.db` shared by Extension and TUI. Valuable
  machine-local state and rebuildable catalogs/indexes remain logically
  classified as `state` and `cache`, but use one schema, connection, migration,
  backup, and concurrency boundary.
- Keep the long-term schema at 18 core tables. M1 creates only
  `schema_migrations`, `workspaces`, `projection_versions`, and `conversations`;
  later tables are added only with an owning repository and demonstrated need.
- Do not create workspace SQLite databases. Workspace-scoped rows in both
  logical storage classes are partitioned by explicit `workspaceId`.
- Add a stable workspace identity contract. A lightweight gitignored workspace
  identity descriptor may anchor a checkout, while database locators use
  portable `${VAR}/path` values and never use an absolute path as identity.
- Make the user-level workspace registry the recovery copy for the checkout
  descriptor: deleting `.neko/workspace.json` at a uniquely registered locator
  restores the same UUID, moving a checkout preserves its UUID, and ambiguous
  move/copy conflicts fail visibly instead of generating another identity.
- Define a Host-neutral `LocalMetadataStore` contract with separate adapters:
  - VS Code Extension Host uses `node:sqlite`;
  - the compiled Bun TUI uses `bun:sqlite`.
- Move structured local metadata into the shared user database, including
  conversation list/search projections, Task/Run recovery, Dashboard activity,
  ResourceCache ledgers, media metadata, Search/FTS, semantic coverage, Entity
  occurrence/relationship projections, asset graph projections, catalogs, and
  provider diagnostics.
- Preserve canonical facts outside SQLite:
  - confirmed entities, bindings, asset facts, requirements, and visual drafts
    remain project files;
  - conversation messages remain Journal JSONL;
  - raw diagnostic logs remain append-only files;
  - media bytes remain managed artifacts.
- Make shared projections rebuildable and non-authoritative. Conversation
  deletion is represented by an authoritative Journal metadata tombstone so a
  catalog rebuild cannot resurrect deleted conversations. A cache/index
  failure MUST produce a typed diagnostic and rebuild path; it MUST NOT turn a
  successfully journaled conversation into `conversation-durability-failed`.
- Preserve the versioned tool-result envelope from Journal event projection
  through history hydration, and isolate an unrecoverable conversation behind a
  typed diagnostic so one historical record cannot prevent Extension startup.
- Add explicit migration from legacy JSON indexes/manifests. Old paths are read
  only by migration, rejection, or diagnostics and cannot remain a successful
  fallback.
- Close the prelaunch legacy Agent Task migration window after the verified
  local cutover. Extension and TUI steady-state composition no longer scans,
  parses, backs up, or retires legacy Task files or VS Code Memento keys, and
  no migration command remains exposed; SQLite is the only Task state path.
- Retain workspace `.neko/` only for lightweight local descriptors, editable
  project-local files, logs, and file artifacts that are intentionally colocated
  with the checkout. `.neko/.cache/` may still contain cache artifact bytes, but
  no SQLite database or canonical metadata manifest.
- Add workspace hygiene, classification, migration, repair, backup, cleanup,
  orphan-workspace GC, and diagnostics.
- **BREAKING** for prelaunch internal storage: workspace SQLite paths, global
  whole-file metadata indexes, and package-local JSON database substitutes are
  retired after explicit migration.

Non-goals:

- Do not create a daemon, cloud sync, tenant model, or remote database service.
- Do not move confirmed project facts into user-level SQLite.
- Do not store Journal contents, raw logs, user-editable files, secrets, or large
  binary artifacts as SQLite blobs.
- Do not use VS Code `workspaceState`, `globalStorageUri`, an absolute path,
  Webview URI, Engine token, cache path, or runtime handle as cross-Host durable
  workspace identity.
- Do not silently delete valuable local recordings, imported assets, trust
  state, Market install records, user configuration, or confirmed project facts.

## Capabilities

### New Capabilities

- `neko-storage-scope-governance`: Defines canonical storage scopes, user-level
  SQLite ownership, workspace partition identity, file/DB boundaries,
  migration/rebuild/backup behavior, fail-visible diagnostics, and validation
  for local state, caches, generated resources, logs, entities, conversations,
  tasks, catalogs, media, and project facts.

### Modified Capabilities

- None. Existing specs cover project file IO, Agent content access, TOML config,
  and external processors, but no accepted capability owns the shared local
  metadata database and Extension/TUI parity contract.

## Impact

- Shared contracts and runtime adapters:
  - `packages/neko-types/src/types/storage.ts`
  - shared `LocalMetadataStore`, workspace identity, schema migration, backup,
    and diagnostic contracts
  - Node Extension Host and Bun TUI SQLite adapters
- Agent:
  - replacement of `conversations-index.json`, file Task stores, workspace
    runtime snapshots, Dashboard activity projections, and shared recovery
    metadata
  - Journal metadata completeness and conversation catalog rebuild
- Assets, Preview, ContentAccess, Search, Entity, and ResourceCache:
  - replacement of JSON manifests/indexes with workspace-partitioned cache rows
    in `neko.db`
  - cache artifacts remain files and project facts remain owning JSON/domain
    formats
- Market, Skills, Commands, and Processors:
  - source files remain portable; catalog/install/runtime metadata receives an
    explicit state or cache classification
- VS Code and TUI:
  - shared catalog queries, revision-based refresh, runtime capability checks,
    packaging validation, and no direct Webview database access
- Documentation and quality gates:
  - update the SQLite ADR, storage architecture, migration documentation,
    `Debug Dev (All)` validation, TUI validation, and corruption/rebuild tests
