## Context

Neko currently has four path classes:

- `~/.neko/`: user-level cross-project data;
- `<workspace>/neko/`: Git-trackable project facts;
- `<workspace>/.neko/`: gitignored workspace-local files;
- `<workspace>/.neko/.cache/`: rebuildable cache artifacts.

That path taxonomy is useful for files, but it has been incorrectly copied into
metadata persistence. Packages maintain whole-file JSON indexes and manifests in
both user and workspace roots, while VS Code `workspaceState` owns another copy
of conversation state. The resulting stores have different failure, concurrency,
and visibility semantics.

The reported conversation failure proves the architectural defect:

```text
VS Code conversation list -> workspaceState -> still available
conversation transcript    -> Journal JSONL -> still available
terminal persistence       -> conversations-index.json flush -> failed
```

`~/.neko/conversations-index.json` was truncated to zero bytes. Its load path
treated malformed JSON as an empty initialized index, while the revision guard
later reparsed the same file and returned `flush-failed`. A rebuildable catalog
projection therefore made a completed run appear non-durable.

The product is a local VS Code client plus local TUI and Rust Engine. It needs a
shared local metadata contract, not a daemon, remote service, or per-workspace
database fleet.

### Runtime Spike Evidence

The SQLite runtime decision was validated against the existing built-in
`Debug Dev (All)` session attached to `/Users/feng/Git/neko-test`; no standalone
VS Code, Chrome, Electron harness, or browser substitute was launched.

| Probe                         | Result                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Existing VS Code CDP endpoint | reachable, Development Host and Neko Webview identified                                                       |
| Real Extension Host inspector | Node `24.17.0`, SQLite `3.53.0`, `node:sqlite` create/insert/select succeeded                                 |
| System Node probe             | Node `25.6.1`, SQLite `3.51.2`, succeeded with an experimental warning                                        |
| Compiled TUI runtime          | Bun `1.3.10`; `node:sqlite` rejected with `ERR_UNKNOWN_BUILTIN_MODULE`                                        |
| Bun adapter                   | `bun:sqlite` create/insert/select succeeded                                                                   |
| Cross-Host file round trip    | Extension `node:sqlite` -> Bun `bun:sqlite` -> Extension readback succeeded with WAL and `integrity_check=ok` |

This proves file-format interoperability for the current runtimes. The supported
contract is therefore VS Code `^1.128.0` (verified Extension Host Node `24.17.0`),
Node `>=24.0.0`, and Bun `>=1.3.10`. Startup capability checks fail visibly when
the required SQLite module or runtime version is unavailable.

## Five-Layer Analysis

### Responsibility

- `@neko/shared` owns storage classification, workspace identity, metadata store
  ports, transaction/result contracts, migration versions, and diagnostics.
- A shared Host-neutral metadata service owns logical schema registration,
  partition routing, backup/rebuild orchestration, and domain repository access.
- VS Code Extension Host owns the `node:sqlite` adapter and lifecycle binding.
- Bun TUI owns the `bun:sqlite` adapter and lifecycle binding.
- Feature packages own their table semantics through narrow repositories; they
  do not open SQLite or query another package's tables directly.
- Domain services continue to own project facts and promotion into project
  files. ResourceCache owns artifact lifecycle and GC.

### Dependency

- Layer 0 contracts import no Node, Bun, VS Code, React, DOM, Agent, or feature
  package runtime.
- Node/Bun adapters depend inward on the store contract.
- Webviews receive DTO projections only and never receive DB paths, table names,
  SQLite errors, or cache paths.
- The Rust Engine remains compute/media authority and does not become a local
  metadata database.

### Interface

The shared surface stays narrow:

```text
LocalMetadataStore
  open()
  transaction()
  readPartitionRevision()
  migrateNamespace()
  backup()
  integrityCheck()
  dispose()

WorkspaceRegistry
  resolveWorkspaceIdentity()
  bindLocator()
  diagnoseDuplicateIdentity()
  markSeen()

Domain repositories
  ConversationCatalog
  TaskStateRepository
  ResourceMetadataRepository
  SearchProjectionRepository
  EntityProjectionRepository
  ...
```

Generic key/value records are not the public business API. Each repository owns
typed inputs, queries, transaction boundaries, and rebuild semantics.

### Extension

- New structured local metadata declares `state` or `cache` durability and a
  global or workspace partition before schema registration.
- A package can add a table only through an owning migration namespace and
  repository contract.
- Project facts and portable files can evolve without SQLite schema becoming
  their canonical format.

### Testing

- Shared contract tests run against in-memory adapters.
- Node and Bun adapter suites run the same store contract, WAL, busy timeout,
  transaction, rollback, migration, integrity, backup, and corruption cases.
- Cross-process tests prove Extension/TUI visibility and revision refresh.
- Path-level tests poison old JSON paths and any attempted workspace DB path.
- Migration tests protect valuable user data and prove old paths cannot return
  success after cutover.
- Real `Debug Dev (All)` and compiled TUI validation cover the runtime boundary.

### Proportionality

One user-level SQLite file and two small Host adapters are proportional for a
single-user local product. No database server, daemon, tenant abstraction,
distributed lock, or remote sync protocol is introduced.

## Goals / Non-Goals

**Goals:**

- Give Extension and TUI one shared metadata authority.
- Eliminate workspace SQLite databases and whole-file JSON database substitutes.
- Separate valuable local state from rebuildable cache through explicit table
  ownership, transaction, backup, and cleanup contracts.
- Keep project facts portable, reviewable, and Git-trackable.
- Make conversation and other catalog indexes rebuildable and non-authoritative.
- Make workspace relocation, duplicate checkout identity, migration, backup,
  corruption, and orphan cleanup explicit and testable.
- Keep workspace `.neko/` small and explainable.

**Non-Goals:**

- No project database format, cloud sync, remote cache service, or multi-user
  collaboration database.
- No SQLite blobs for media, models, thumbnails, document pages, or recordings.
- No raw Journal or log replacement.
- No direct DB access from Webview, Agent prompt/tool code, or Rust Engine.
- No compatibility fallback that silently keeps JSON and SQLite as dual
  authorities.

## Decisions

### Decision 1: Keep file scope and metadata scope separate

The file layout remains classified by lifecycle, but SQLite placement is always
user-level:

| Data                            | Canonical location                                      | Role                            |
| ------------------------------- | ------------------------------------------------------- | ------------------------------- |
| Confirmed project facts         | `neko/` or owning domain file                           | Git-trackable authority         |
| User-editable local files       | `~/.neko/`, workspace `.neko/`, or portable Skill roots | config/content authority        |
| Conversation history            | `~/.neko/journals/*.jsonl`                              | append-only authority           |
| Raw logs                        | managed JSONL log roots                                 | independent diagnostic evidence |
| Valuable structured local state | `~/.neko/neko.db` state-owned tables                    | backed-up user data             |
| Rebuildable structured metadata | `~/.neko/neko.db` cache-owned tables                    | cache/read model                |
| Workspace cache artifact bytes  | workspace `.neko/.cache/` or managed user cache root    | file artifacts only             |
| Retained media/assets           | workspace/media-library path plus project fact          | durable artifact authority      |
| VS Code-only view state         | `workspaceState`                                        | tabs/selection/scroll only      |
| Secrets                         | VS Code SecretStorage/system keychain                   | secret authority                |

Workspace `.neko/` is not eliminated. It may contain the workspace identity
descriptor, editable local settings/memory/content, raw logs, and file artifacts.
It must not contain a SQLite database or a canonical metadata manifest.

Portable Skills keep the accepted cross-Host roots `${HOME}/.agents/skills` and
`<workspace>/.agents/skills`. Commands, prompts, AGENTS, config, and Processors
remain under the corresponding `${HOME}/.neko` or `<workspace>/.neko` root.
All of these files remain user-editable authorities; SQLite may later project
descriptors but never their source content.

### Decision 2: Use one user-level database, not one database per workspace

Use:

```text
~/.neko/neko.db
```

State-owned tables store non-Git, machine-local data that cannot be silently
deleted: Task/Run recovery, resumable checkpoints, and other explicitly
classified valuable local state. Cache-owned tables store rebuildable data:
conversation list/search projections, ResourceCache ledgers, media metadata,
Search/FTS, semantic evidence/coverage, Entity/Asset projections, and catalogs.

Rationale: after removing speculative history/job/status tables, the target is
18 core tables. A second connection, migration stream, revision authority,
backup, and cross-process lifecycle costs more than it isolates at this scale.
Both Hosts open one stable user path and query across workspaces.

This decision supersedes the interim workspace-visible `.neko/tasks.json`
implementation from `align-agent-tui-webview-workspace-runtime`. Its required
cross-Host visibility is preserved by `workspace_id` partitioning in the shared
user database; the JSON file is no longer the workspace task authority.

Logical storage class remains mandatory:

- state-owned transactions commit independently and are included in backup and
  user-data recovery policy;
- cache-owned rows are cleared only by table/partition allowlist and are always
  rebuildable;
- physical online backup captures the whole `neko.db`; restore protects
  state-owned rows and may mark restored cache projections stale for rebuild;
- an authority transaction and its projection update use separate transactions
  even though they share one physical database;
- clearing cache never deletes `neko.db` itself.

The long-term target is 18 core tables. It deliberately folds touch/GC fields
into resource rows, Run lifecycle into tasks, coverage into semantic sources,
and Entity/Asset graph variants into one typed projection table. Temporary job,
status, history, provider-diagnostic, and log-index tables are not created by
default. SQLite FTS virtual/shadow tables and ordinary indexes are implementation
artifacts and are not counted as core schema tables.

| #   | Table                      | Class  | Purpose / authority                                                        |
| --- | -------------------------- | ------ | -------------------------------------------------------------------------- |
| 1   | `schema_migrations`        | system | One namespaced migration ledger for the physical database                  |
| 2   | `workspaces`               | state  | Workspace identity, portable locator, last-seen, duplicate/orphan state    |
| 3   | `projection_versions`      | system | Partition/domain revision, freshness, rebuild requirement                  |
| 4   | `conversations`            | cache  | Conversation list/search projection rebuilt from Journal metadata          |
| 5   | `conversation_preferences` | state  | Pin/favorite and other explicit non-rebuildable user choices               |
| 6   | `tasks`                    | state  | Task/Run lifecycle that must survive restart                               |
| 7   | `task_checkpoints`         | state  | Minimal resumable recovery payload                                         |
| 8   | `local_drafts`             | state  | Valuable unpromoted local drafts only                                      |
| 9   | `dashboard_activities`     | state  | Retained, user-valued activity only                                        |
| 10  | `market_installations`     | state  | Installed package and trust decision state                                 |
| 11  | `resource_cache_entries`   | cache  | Source/artifact ledger, size, touch, quota, and GC eligibility             |
| 12  | `resource_cache_variants`  | cache  | Thumbnail/proxy/page/preview/generated variants                            |
| 13  | `media_metadata`           | cache  | Rebuildable probe and local availability metadata                          |
| 14  | `search_documents`         | cache  | Search/FTS source projection                                               |
| 15  | `semantic_sources`         | cache  | Source fingerprint, provider/schema version, and coverage                  |
| 16  | `semantic_evidence`        | cache  | Rebuildable semantic evidence by source range                              |
| 17  | `entity_asset_projections` | cache  | Entity occurrence/relationship/binding and Asset graph projection          |
| 18  | `catalog_items`            | cache  | Skill/Command/Processor/Market/provider descriptors and current diagnostic |

M1 creates only `schema_migrations`, `workspaces`, `projection_versions`, and
`conversations`. This is the minimum slice needed to replace the broken
conversation index and prove Extension/TUI parity. The other 14 tables are
created by later owning-domain migrations, not eagerly during M1.

The Agent owning-domain classification for M2 is narrower than the long-term
table list:

- `tasks` stores serializable Task/Run lifecycle only;
- `task_checkpoints` stores the minimal external-provider recovery payload;
- process handles, terminal handles, cancellation objects, leases, and runtime
  tokens remain Host-private memory/state and never enter the shared database;
- current Dashboard activity is an automatically derived recent-task
  projection, not explicit retained user state, so M2 does not create
  `dashboard_activities`;
- generated draft refs are rebuildable projections, while confirmed visual
  drafts already belong to `neko/visual-identity-drafts.json`, so M2 does not
  create `local_drafts` without a future owner that demonstrates valuable
  unpromoted state.

This delayed creation follows the schema rule: a target table is not created
merely because it appears in the 18-table long-term design.

Rejected alternatives:

- per-workspace databases: complicate discovery, relocation, multi-root access,
  Extension/TUI parity, and cross-project queries;
- two user-level databases: duplicate connection, migration, revision, backup,
  and contention handling before measured size or recovery evidence requires
  the physical split;
- `globalStorageUri` database: TUI cannot use it as a stable shared root.

Split into separate state/cache files only after measured evidence shows that
FTS/cache size makes backup or vacuum unacceptable, cache maintenance blocks
state writes, or recovery cannot protect state-owned tables. A future split is
an explicit migration, not a runtime fallback.

### Decision 3: Partition every workspace-scoped row by stable identity

Introduce a gitignored descriptor:

```json
{
  "version": 1,
  "workspaceId": "<uuid>"
}
```

at workspace `.neko/workspace.json`.

The UUID identifies a local checkout and survives path rename/move. The user DB
stores locator history only as portable `${VAR}/path` values resolved through
the existing path system. Absolute paths are runtime observations, not durable
identity.

The descriptor is an automatically managed checkout anchor, not user-authored
configuration and not a startup single point of failure. Identity resolution
opens the user database and computes the portable locator before creating a new
UUID. It then reconciles the descriptor and registry through one canonical
resolver:

| Descriptor / registry state                                                 | Required result                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| descriptor exists, matching UUID and locator                                | mark the registered workspace seen                           |
| descriptor missing, exactly one current-locator match                       | atomically restore the descriptor with that UUID             |
| descriptor exists, registered UUID has moved, old locator is no longer live | append the new locator and preserve the UUID                 |
| descriptor exists at a new locator while the old locator is still live      | diagnose a copied checkout and require explicit clone/rebind |
| descriptor missing with multiple current-locator matches                    | fail visibly and require explicit recovery                   |
| descriptor missing with no registry match                                   | create and register a new checkout UUID                      |

When historical startup behavior has already registered multiple non-orphan
identities at the same locator, clone/rebind is not the correct recovery
operation. The Host must require an explicit canonical-identity selection. That
state-owned transaction marks every exact conflicting registration orphaned,
keeps all of their state/cache partitions addressable, and marks the selected
descriptor identity seen. It does not merge partitions, create a third UUID, or
delete rows. Current-locator lookup excludes orphaned registrations; audit and
recovery continue to address those registrations by UUID and through the orphan
registry.

The current locator is unique among non-orphan workspace registrations. A
registry conflict is diagnosed before any conversation/task/cache partition is
created or rebuilt. The resolver never chooses an active-workspace fallback,
never assigns an existing partition from content/path similarity alone, and
never creates a third UUID to hide ambiguity. Recreating the descriptor writes
only the versioned identity file; it does not recreate optional workspace
configuration, memory, project facts, or other user-authored `.neko` content.

Every workspace-scoped repository row carries `workspace_id`. Global catalog
rows use an explicit global partition instead of a missing/implicit active
workspace.

If the same workspace UUID is observed at two live locators, initialization
fails with a duplicate-identity diagnostic. It must not merge or overwrite the
two checkouts silently. Copy/import flows need an explicit clone/rebind action.

The Node Host recovery service executes those actions against the descriptor
and workspace registry. Rebind keeps the UUID, appends the validated portable
locator to history, and clears orphan state. Clone backs up the copied
descriptor, replaces it atomically with a new UUID, and registers a new empty
workspace identity; it does not copy or merge the source workspace's state or
cache partitions. If registry commit fails, the descriptor is restored from the
validated prior value and the backup remains available for manual recovery.
Canonical selection requires the descriptor to own the selected UUID and the
caller to name the exact conflicting UUID set. A changed conflict set fails the
transaction visibly so a stale prompt cannot orphan a newly registered
workspace.

### Decision 4: Project facts and unified entities remain files

Confirmed assets, entities, bindings, requirements, visual drafts, settings,
and `.nk*` documents remain project facts. SQLite receives only projections:

| Fact                    | SQLite projection                                            |
| ----------------------- | ------------------------------------------------------------ |
| confirmed entity        | name/alias search, occurrence, relationship, candidate match |
| entity binding          | availability, orphan diagnostic, reverse lookup              |
| asset library           | graph, availability, media metadata, search                  |
| domain project file     | FTS, semantic coverage, source fingerprint                   |
| visual/requirement fact | aggregation, reminders, search projection                    |

Unconfirmed but valuable local drafts belong in state-owned tables; disposable
or reproducible candidates belong in cache-owned tables. Promotion into a
confirmed entity or asset always writes the owning project fact first.

### Decision 5: Journals and logs remain independent files

Conversation Journal JSONL remains the transcript and event authority. It must
record enough metadata events to rebuild title, workspace association, source,
model selection, timestamps, and visible conversation catalog fields.
Deletion appends a versioned metadata tombstone to the same Journal before the
catalog row is removed. Rebuild uses the latest valid metadata lifecycle state
and excludes tombstoned conversations; deleting only a catalog row is invalid
because it would allow a later rebuild to resurrect the conversation.

Journal tool results keep one versioned structured envelope through event
projection, conversation resume, and model-history hydration. Successful,
failed, object, string, null, and undefined result data preserve explicit
`success` semantics rather than relying on the payload shape. Hydration errors
at the user-data boundary are recorded per conversation with the Journal left
unchanged; they do not abort Host activation or suppress unrelated valid
conversations. Contract/programming errors outside persisted user data remain
fail-visible.

Raw operational/audit logs remain append-only files so they are available when
SQLite is locked or corrupt. SQLite may index log metadata or aggregates, but a
database row cannot be the only diagnostic evidence.

The initial optional projection is a streaming Host-side JSONL aggregate over
Journal and log roots. It records file/entry/malformed counts, timestamp range,
and event categories without copying raw line content. An optional cache sink
may consume the result, but clearing that sink and rerunning the projector from
the files produces the same aggregate; no dedicated log-index table is added.

### Decision 6: Use Node and Bun Host adapters

The Extension adapter uses `node:sqlite`; the compiled TUI adapter uses
`bun:sqlite`. Both implement the same store contract and schema migrations.
Business packages do not import either runtime module.

Implementation uses:

- VS Code `^1.128.0`, whose Extension Host was verified with Node `24.17.0`;
- Node `>=24.0.0`, `@types/node ^24`, and Node 24 CLI bundle targets;
- Bun `>=1.3.10` and its dedicated adapter for the compiled executable;
- explicit unsupported-runtime diagnostics instead of JSON or alternate DB
  fallback;
- validate macOS/Windows/Linux, x64/arm64, Extension Development Host, packaged
  VSIX, Node CLI, and Bun executable behavior.

This adapter boundary also contains upstream API maturity changes and prevents
SQLite runtime details from leaking into domain packages.

### Decision 7: SQLite sharing does not imply UI-state sharing

Extension and TUI share conversation/task/catalog records, not active UI state.
Open tabs, selected conversation, scroll position, and panel state remain
Host-owned.

Repositories increment a partition revision in the same transaction as each
visible metadata change. Extension refreshes on activation/focus, after local
commits, and through a bounded revision observer. TUI queries on command/session
boundaries. Neither Host watches raw `-wal` files as a business protocol.

### Decision 8: Durability follows authoritative data, not cache projection

A conversation terminal save succeeds when authoritative Journal events and any
required state-owned transaction are durable. Updating the cache-owned catalog
projection uses a later transaction. Its failure returns a typed stale/rebuild
diagnostic and cannot report the journaled conversation as unsaved.

Conversation deletion follows the same ordering: the Journal tombstone is the
authoritative delete commit, and catalog removal is a subsequent cache
projection transaction. Catalog removal failure marks the projection stale and
must not redefine the tombstoned conversation as an unsuccessful deletion.

The same rule applies to Search, Entity, Asset, and ResourceCache projections:
project facts or retained artifacts remain successful even if a derived index
is stale. The UI must display the stale/rebuild state rather than fabricate a
successful fresh projection.

### Decision 9: Keep extension-private files separate, but do not add another DB

`globalStorageUri` remains valid for VS Code-only artifact bytes and state that
has no TUI or user-level meaning. This change does not create a SQLite database
there. Structured metadata that participates in shared repositories goes into
the user database; VS Code-only tab/view state remains Memento.

Market installation receipts use the state-owned `market_installations` table.
Each receipt contains the installed package identity, manifest needed for
uninstall/update behavior, dependency/bundle reference owners, enablement and
request state, a portable `${VAR}/path` install locator, and the Host trust
decision observed when the install was committed. Absolute install paths are
runtime projections and are rejected by the repository.

The trust receipt is audit context, not a second workspace-trust authority. VS
Code continues to own workspace trust through `workspace.isTrusted` and its
trust-management flow; TUI applies an explicit restricted local policy. A Host
without a trust adapter cannot fabricate promotion success. Legacy
`market-installed.json` and package-local trust JSON are migration inputs only.

Downloaded archives and extracted cache bytes remain files: the Extension uses
`globalStorageUri/market-cache`, while TUI uses the managed user cache root.
They do not enter SQLite. Market-provided Skill/Processor descriptors and
current provider diagnostics may use cache-owned `catalog_items`; source files,
provider configuration, and secrets remain outside SQLite.

All JSON-backed metadata repositories share one secret-field guard before
serialization. Nested `apiKey`, access/refresh/auth/session/Engine token,
authorization, client secret, password, or credential fields fail with a typed
diagnostic and roll back the transaction. VS Code account tokens remain behind
`SecretStorage`; TUI accepts runtime environment/CLI credentials and does not
fall back to a plaintext `~/.neko/auth.json` token store.

### Decision 10: Migration is explicit and converges to one path

Legacy JSON indexes and manifests are migration inputs only. Migrators validate,
back up, import in a transaction, compare counts/identity, and emit a report.
After cutover, the old path is poisoned for normal reads/writes.

Poisoning applies to Host composition, not only file adapters. Agent
conversation and Task JSON constructors throw retired-store diagnostics,
ResourceCache requires a LocalMetadata manifest store, Search/Entity adapters
do not query legacy sidecars as fallback, workspace/package-local SQLite paths
are rejected before file creation, and Agent Platform Market requires an
injected InstallManager backed by LocalMetadataInstalledRegistry instead of
constructing `market-installed.json`.

A shared migration planner first converts the read-only workspace inspection
report into per-source authority, rebuildability, and proposed-action records.
Rebuildable projection and scratch mutations may proceed directly. Project
facts, user-editable content, valuable local state, artifacts, and unknown
sources require explicit approval for each source; there is no global approval
that authorizes every item in a plan. Journal and raw-log sources are always
non-mutating inputs and cannot be approved into a mutable state.

The prelaunch Agent Task migration window is closed after the real local source
was explicitly approved, backed up, imported, verified, and retired. That
one-time cutover imported 13 Tasks with verifiable owner scope and preserved six
terminal Tasks with unverifiable owner scope in the migration backup; it did not
synthesize ownership or import checkpoints. The cutover evidence remains in the
change verification record rather than in a permanent runtime migration path.

Extension and TUI steady-state composition now construct only the SQLite Task
repositories. They do not inventory `tasks.json`, VS Code Memento Task keys, or
migration backups; they expose no review command, slash command, approval port,
source adapter, owner-reconstruction parser, backup writer, or source-retirement
operation. Legacy Task identifiers are absent from normal production source, and
architecture guards prove the canonical Host path cannot regress to a hidden
dual-read or migration branch. Generic workspace hygiene may still classify an
explicitly observed retired path without reading it as Task state.

The local test environment may delete the retired Task files and Memento backup
keys after SQLite row counts and database integrity have been verified. This is
an explicitly authorized prelaunch cleanup, not a general policy for deleting
valuable user data. Database schema migrations and migration/recovery paths for
other still-supported sources remain independently owned and are not removed by
this Task-specific convergence.

Legacy conversation Journals that predate metadata events remain read-only
during catalog migration. The projector may combine their message summary with
an imported legacy catalog row for list/resume, but it does not append inferred
metadata to the Journal. Fields that cannot be reconstructed from Journal
metadata are reported explicitly. New conversation writes continue to append
complete metadata events, so the read-only compatibility is limited to
authoritative pre-migration Journals and does not restore a legacy JSON success
path.

Every JSON index/manifest importer follows the same commit protocol: copy the
source to a non-overwriting backup, parse and normalize from that stable copy,
write through one owning repository transaction, verify the expected identities
and counts inside or immediately after that transaction, and only then rename
the legacy source to a migrated path. Transaction or verification failure rolls
back destination rows and leaves both the original source and backup available;
rerunning the importer preserves already-verified identities and completes the
retirement step instead of duplicating records.

Corrupt rebuildable indexes are quarantined and rebuilt from facts/Journals.
Corrupt valuable-state sources require backup and recovery diagnostics; they are
never treated as empty success. No migration deletes Journals, logs, settings,
trust state, retained artifacts, or project facts.

Rebuild semantics remain domain-owned rather than passing through a generic
payload recovery service: Conversation projects Journal metadata, Entity/Asset
projects owning project facts, Search and semantic repositories project stable
source refs, and ResourceCache providers regenerate derivatives from retained
source artifacts. Missing sources start the same rebuild path without inventing
a quarantine file; empty, truncated, malformed, or unknown-schema files are
backed up and quarantined first. Artifact filenames alone are not sufficient to
reconstruct a resource identity, so unverifiable fields are reported instead of
being guessed.

Every partial migration report carries the owning record identity, the exact
unrecoverable field names, and a reason, while the immutable backup preserves
the original bytes. A required projection DTO may use an explicit null/empty
unknown representation only when the same migration report records the lost
field; it cannot substitute a guessed path, identity, model, source, or metadata
value and count that field as recovered.

### Decision 11: Workspace hygiene remains explicit

Workspace `.neko/` stays gitignored while `neko/` stays trackable. Inspection
classifies legacy DBs/manifests, personal content, logs, cache artifacts,
recordings, temp imports, and deprecated hooks. Cleanup can delete only data
classified as rebuildable/scratch or explicitly confirmed by the user.

Placement inspection is conservative at ownership boundaries. The Host scanner
can diagnose the structurally deprecated `.neko/hooks` directory directly, but
it does not infer that commands, prompts, processors, Skills, or AGENTS content
is personal from location alone. The owning content scanner must provide an
explicit `intendedScope: personal` observation before a
`misplaced-personal-content` diagnostic is emitted; legal project-local content
therefore remains valid.

The inspection result is one read-only typed report covering retired workspace
databases and manifests, misplaced project facts, explicit personal-content
observations, cache size, raw logs, preview recordings, import staging,
temporary storage, and deprecated directories. Size calculation does not follow
symbolic links. Each entry records whether later mutation requires explicit user
action, so inventory cannot be mistaken for cleanup approval.

Git hygiene uses `git check-ignore --no-index` as the semantic authority rather
than reimplementing ignore matching. Inspection reports the exact rule that
hides `neko/` project facts. An explicit ensure action may append one managed
`.neko/` block and then revalidate it, but it never removes or rewrites an
existing rule that hides project facts.

### Decision 12: Recording promotion is an Asset-owned project fact commit

Live recordings written under workspace `.neko/recordings` remain explicitly
classified as non-authoritative previews. The Live Webview offers a separate
save-to-project action. Audio files produced by an explicit save or completed
recording are already durable bytes but still require project registration.

Both Hosts call one shared recording-promotion command contract. The Assets
extension owns the implementation: it copies preview bytes when necessary,
rejects retained destinations under workspace `.neko`, then imports and flushes
the destination through `AssetLibrary`. The Asset fact records recording id,
producer, recorded time, and preview authority. If fact registration fails after
the bytes are durable, the bytes are preserved and the operation fails visibly
with their destination for recovery; it is not reported as promoted success.

### Decision 13: Explicit media import promotes long-lived bytes immediately

Model, puppet, Live2D bundle, and glTF ZIP imports are immediately registered in
AssetLibrary and referenced by owning editors, so they are not temporary after
the import command succeeds. Their canonical plan actions are `promote` and
`extract-promote`, with durable bytes under workspace `media/imports`. The old
`.neko/imports` path remains inspection/migration input only.

External source paths that cannot be contracted to workspace-relative or
`${VAR}/path` values are not written into project facts. Provenance retains the
content hash and source filename while the durable ref points to
`media/imports`. Truly temporary paths remain reportable staging and cannot be
returned as durable project refs.

### Decision 14: Workspace cleanup is explicit-candidate and allowlist driven

ResourceCache continues to own quota GC for its typed variants. General
workspace cleanup accepts only explicitly classified candidates and explicit
managed roots; it does not recursively infer that all `.neko` content is safe.
Only `rebuildable` and `scratch` candidates can be removed. Candidate
classification protection is evaluated before location, then lifecycle flags,
root containment, managed-root protection, and file existence are checked.
Every candidate produces a deleted or skipped entry with a stable reason.

Cleanup, migration, rebuild, promotion, and repair share one maintenance report
contract. It has exactly seven outcomes: deleted, migrated, rebuilt, promoted,
skipped, quarantined, and user-action-required. Domain reports retain their
specific counts and diagnostics, while this common layer provides itemized
source/target/reason fields and stable aggregate counts. Protected valuable,
project-fact, retained, or outside-root cleanup requests map to
user-action-required rather than ordinary skipped.

## Risks / Trade-offs

- User DB corruption affects multiple workspaces and both logical storage
  classes. Online backup, integrity diagnostics, authoritative files, and cache
  rebuild reports reduce but do not eliminate this blast radius.
- One database uses one durability configuration. It MUST choose the state-safe
  policy; cache throughput cannot weaken state-owned transaction durability.
- Workspace identity introduces a lightweight local descriptor and duplicate
  checkout handling. Without it, path moves make durable local state ambiguous.
- The user DB can grow across projects. Repositories need per-workspace quotas,
  orphan retention, targeted deletion, vacuum policy, and observable size.
- `node:sqlite` is synchronous. Transactions must remain short; bulk FTS,
  semantic rebuild, and large migrations run in a worker rather than blocking
  the Extension Host.
- Remote SSH/Container has a different user home and therefore a different local
  DB. This change provides Host-local parity, not cross-machine synchronization.
- Existing workspaces may contain valuable files under `.neko`. Migration must
  inspect and report before moving or deleting them.

## Migration Plan

1. Update shared storage classification and remove workspace database paths from
   layout contracts.
2. Add workspace identity descriptor, registry, portable locator, duplicate
   detection, and migration tests.
3. Add `LocalMetadataStore` plus Node and Bun adapters; prove the same contract,
   schema, WAL, transaction, backup, and corruption behavior.
4. Establish and enforce supported VS Code, Node LTS, and Bun runtime versions.
5. Create `neko.db`, one namespaced migration registry, and explicit state/cache
   table ownership.
6. Make Journal metadata, including deletion tombstones, sufficient for
   conversation catalog rebuild, migrate `conversations-index.json`, and switch
   Extension/TUI list queries to one `ConversationCatalog`.
7. Migrate Task/Run recovery and valuable local activity/draft state into
   state-owned `neko.db` tables.
8. Migrate resource manifests, media metadata, generated projections, Search,
   semantic coverage, Entity/Asset projections, catalogs, and diagnostics into
   cache-owned `neko.db` tables.
9. Poison legacy JSON and workspace DB paths after migration evidence passes.
10. Add workspace inspection, orphan GC, backup/repair, user-confirmed cleanup,
    and documentation.

Rollback disables migration/cutover before re-enabling a previous canonical
path. It must not introduce dual-read/dual-write fallback. Restoring backed-up
valuable data is an explicit recovery operation.

## Open Questions

- Should `workspaceId` be accompanied by a future Git-trackable logical
  `projectId` for grouping separate checkouts of the same project? It is not
  required for the local checkout partition in this change.
- Which Dashboard activity and generated draft fields are valuable state versus
  rebuildable projection? Owning packages must classify them before migration.
