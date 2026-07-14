## 1. Shared Storage And Identity Contracts

- [x] 1.1 Add `NekoStorageScope`, `NekoStorageClass`, state/cache durability, owner, tracking, cleanup, migration, backup, and diagnostic contracts in `@neko/shared`.
- [x] 1.2 Update the canonical classification table for project facts, user-editable files, valuable local state, rebuildable metadata, artifact files, raw logs/Journals, extension-private files, media-library data, and scratch data.
- [x] 1.3 Replace workspace and dual-database layout entries with the canonical user-level `~/.neko/neko.db` path and logical `state`/`cache` ownership.
- [x] 1.4 Define `WorkspaceIdentity`, portable locator, duplicate identity, clone/rebind, and orphan lifecycle contracts.
- [x] 1.5 Add a versioned `.neko/workspace.json` parser/writer contract with UUID validation and fail-visible mismatch diagnostics.
- [x] 1.6 Add unit tests for classification, layout resolution, path contraction, workspace moves, duplicate identities, and retired workspace DB diagnostics.

## 2. Local Metadata Store And Runtime Adapters

- [x] 2.1 Define the Host-neutral `LocalMetadataStore`, migration namespace, transaction, partition revision, integrity, backup, and dispose contracts.
- [x] 2.2 Define narrow domain repository contracts instead of exposing generic SQL/table access to feature packages.
- [x] 2.3 Implement the VS Code Extension Host `node:sqlite` adapter with WAL, foreign keys, busy timeout, bounded transactions, migration, backup, and typed diagnostics.
- [x] 2.4 Implement the compiled TUI `bun:sqlite` adapter against the same contracts and schema.
- [x] 2.5 Add identical Node/Bun adapter contract suites and a cross-process file compatibility test.
- [x] 2.6 Establish and enforce the minimum VS Code release, Node LTS target, Bun version, `@types/node`, bundle target, and startup capability diagnostics.
- [x] 2.7 Add worker execution for bulk FTS/semantic migration or rebuild paths that would block the Extension Host.
- [x] 2.8 Add macOS/Windows/Linux and x64/arm64 packaging checks for Extension, Node CLI, and compiled Bun TUI.

## 3. User Database Schemas And Lifecycle

- [x] 3.1 Create one schema ownership and namespaced migration registry for `~/.neko/neko.db`; M1 MUST create only `schema_migrations`, `workspaces`, `projection_versions`, and `conversations`, with a documented long-term target of 18 core tables.
- [x] 3.2 Add the workspace registry, portable locator history, last-seen state, partition revision, and orphan markers.
- [x] 3.3 Add state-safe backup/restore and integrity diagnostics for `neko.db`; backup failure MUST block destructive migration, and the one durability configuration MUST protect state-owned transactions.
- [x] 3.4 Add allowlisted rebuild, partition drop, quota, GC, and vacuum policy for cache-owned `neko.db` tables without deleting the DB or touching state/facts/Journals/artifacts.
- [x] 3.5 Add lifecycle tests for concurrent Extension/TUI opens, transaction rollback, busy timeout, crash/reopen, migration failure, corruption, backup recovery, and orphan cleanup.
- [x] 3.6 Add path-level guards proving no canonical SQLite database is created under workspace `.neko`, workspace `.neko/.cache`, or `globalStorageUri`.

## 4. Conversation And Agent State Migration

- [x] 4.1 Extend Journal metadata events so conversation title, workspace identity, source, timestamps, model selection, and catalog fields are rebuildable.
- [x] 4.2 Implement `ConversationCatalog` in the cache-owned `conversations` table in `neko.db` and make Extension/TUI list/search/resume queries use it.
- [x] 4.3 Keep VS Code `workspaceState` limited to Host UI projection such as tabs, active selection, and scroll state.
- [x] 4.4 Migrate `conversations-index.json` with backup, zero-byte/malformed recovery, Journal projection including deletion tombstones, count verification, and explicit unrecoverable-field reporting.
- [x] 4.5 Change terminal durability so Journal/valuable-state commits are authoritative and catalog failure produces stale/rebuild diagnostics rather than `conversation-durability-failed`.
- [x] 4.6 Migrate Task, Run, recovery checkpoint, retained Dashboard activity, and valuable unpromoted draft state into state-owned `neko.db` tables after owning-package classification.
- [x] 4.7 Add revision-based Extension refresh and TUI boundary refresh without watching SQLite WAL files as a business protocol.
- [x] 4.8 Poison legacy conversation/task/activity JSON paths after verified migration and prove no dual-read/dual-write fallback remains.

## 5. Search, Cache, Entity, Asset, And Media Projections

- [x] 5.1 Migrate ResourceCache manifests, variants, cache files, touch, quota, and GC metadata into workspace-partitioned cache-owned `neko.db` rows without adding separate touch/GC history tables.
- [x] 5.2 Migrate proxy, thumbnail, document page, generated draft projection, and media probe metadata while keeping artifact bytes as files.
- [x] 5.3 Migrate Search/FTS, semantic source/evidence/coverage, and freshness projections; route only resumable analysis work through the shared `tasks` tables instead of adding domain job/history tables.
- [x] 5.4 Migrate asset graph, Entity occurrence/relationship/candidate projection, and binding availability/reverse lookup metadata.
- [x] 5.5 Prove confirmed entities, bindings, asset library facts, requirements, visual drafts, settings, and domain project files remain file authorities.
- [x] 5.6 Add promotion tests proving valuable local drafts become owning project facts before cache projection success is reported.
- [x] 5.7 Poison legacy manifest/search/asset-graph/semantic sidecar success paths after migration.

## 6. User Content, Catalog, Market, And Provider Boundaries

- [x] 6.1 Route personal Skills, Commands, Prompts, AGENTS, config, and Processors to canonical user-editable file roots; keep their contents out of SQLite.
- [x] 6.2 Add shared catalog projections for Skill/Command/Processor descriptors while preserving source files as authority.
- [x] 6.3 Classify Market install/trust state into state-owned `neko.db` tables and Market catalog/download/provider projections into cache-owned tables or extension-private artifact storage as appropriate.
- [x] 6.4 Keep secrets in VS Code SecretStorage/system keychain and add a boundary test preventing SQLite persistence.
- [x] 6.5 Reject or diagnose deprecated `.neko/hooks` and misplaced project-independent personal content.
- [x] 6.6 Add Extension/TUI parity tests for catalogs, install state, provider diagnostics, and source-file updates.

## 7. Workspace Files, Artifacts, Recordings, And Hygiene

- [x] 7.1 Implement Host-side inspection for workspace `.neko`, legacy DB/manifests, misplaced facts, personal content, large caches, logs, recordings, imports, temp files, and deprecated directories.
- [x] 7.2 Ensure `.neko/` stays gitignored while `neko/` project facts remain trackable.
- [x] 7.3 Keep raw logs/Journals independent from SQLite; add optional index/aggregate projection without making DB rows the only evidence.
- [x] 7.4 Classify preview recordings separately from retained media and add explicit save/promote flows with project provenance.
- [x] 7.5 Classify temp/import staging and require promotion for long-lived user-valued artifacts.
- [x] 7.6 Add cleanup behavior that deletes only rebuildable/scratch data and skips pinned, active, promoted, debug-retained, outside-root, and valuable state.
- [x] 7.7 Add cleanup/migration reports with deleted, migrated, rebuilt, promoted, skipped, quarantined, and user-action-required entries.

## 8. Migration And Recovery

- [x] 8.1 Implement a migration planner that inventories sources, classifies authority/rebuildability, and requires explicit approval before mutating valuable user data.
- [x] 8.2 Back up and transactionally import legacy JSON indexes/manifests with identity/count verification and resumable diagnostics.
- [x] 8.3 Quarantine missing/empty/truncated/malformed rebuildable stores and rebuild from Journal, project facts, source refs, and artifacts.
- [x] 8.4 Preserve and report unrecoverable fields instead of filling defaults or treating corrupt data as empty success.
- [x] 8.5 Add clone/rebind and orphan-workspace recovery actions with portable locator updates.
- [x] 8.6 Add poison tests proving retired JSON/workspace DB paths cannot return normal success after cutover.

## 9. Documentation And User-Facing Diagnostics

- [x] 9.1 Update storage architecture, SQLite ADR, path/cache docs, and Chinese documentation for one user-level DB, logical state/cache ownership, and workspace partition identity.
- [x] 9.2 Update user-facing diagnostics/help for unsupported runtime, duplicate identity, migration, backup, corruption, rebuild, stale projection, and cleanup.
- [x] 9.3 Document DB inspection/export/repair commands without exposing raw SQLite paths or errors to Webviews.
- [x] 9.4 Document that Remote SSH/Container uses the remote Host user database and does not imply cross-machine synchronization.

## 10. Validation And Quality Gates

- [x] 10.1 Run focused shared, Node adapter, Bun adapter, workspace identity, repository, migration, and corruption tests.
- [x] 10.2 Run focused Agent, TUI, Market, Assets/ResourceCache, Search, Entity, Dashboard, Live/Audio, and processor tests touched by migration.
- [x] 10.3 Run `pnpm build`, `pnpm test`, and `pnpm check` for the shared cross-package contract change.
- [x] 10.4 Run `pnpm check:legacy-debt` and `pnpm check:unused` after retiring JSON/workspace DB paths.
- [x] 10.5 Run `Debug Dev (All)` through `vscode-extension-debugger` for startup, Extension/TUI cross-Host visibility, reload, multi-window conflict, corruption diagnostic, and no `conversation-durability-failed` after Journal success.
- [x] 10.6 Run the compiled Bun TUI against the same user database, including list/resume/write/rebuild and concurrent Extension access.
- [x] 10.7 Run packaging/install smoke on supported VS Code, Node, Bun, OS, and architecture targets.
- [x] 10.8 Apply `neko-agent-evaluation` to affected Agent persistence/resume paths and `neko-quality-review` before completion.
- [x] 10.9 Record validation commands, migration evidence, unresolved runtime matrix gaps, and remaining user-data risks.

## 11. Recovery Regressions Discovered During Real Workspace Cleanup

- [x] 11.1 Add an end-to-end regression from Journal tool-result event projection through Extension history hydration, covering success/failure and object/scalar/null/undefined data.
- [x] 11.2 Emit one canonical versioned tool-result envelope from Journal projection and prove the real failing Journal replays without `missing boolean success`.
- [x] 11.3 Isolate persisted conversation hydration failures behind typed per-conversation diagnostics so `ChatViewProvider` and the Extension can still activate.
- [x] 11.4 Extend the workspace registry with current-locator lookup and reject multiple live registrations for one locator without silently generating another UUID.
- [x] 11.5 Implement one descriptor/registry resolver that restores a deleted descriptor, preserves identity across a move, distinguishes a live copied checkout, and creates a UUID only for a genuinely new locator.
- [x] 11.6 Wire Extension and TUI storage bootstrap through the resolver; keep optional config/memory/user-authored files non-generated and poison active-workspace/path fallback.
- [x] 11.7 Add focused Node/Bun/Agent/Extension tests for descriptor deletion, move, copy, ambiguity, valid/invalid Journal resume, and startup availability.
- [x] 11.8 Add explicit canonical selection for historical same-locator identity conflicts, keep non-selected partitions as orphans, and correct the user diagnostic so Clone/Rebind is not suggested for locator ambiguity.
- [x] 11.9 Complete the one-time approved legacy Task cutover: import and verify records with valid owner scope, preserve and report terminal records with unverifiable scope without guessing, then close the migration window instead of retaining a product migration command.
- [x] 11.10 Back up and recover the real `neko-test` registry only after verifying its descriptor, integrity, exact conflict set, and absence of non-selected state-owned Task/checkpoint rows.
- [x] 11.11 Run the real Journal replay, focused Agent Evaluation, `Debug Dev (All)` runtime acceptance, strict OpenSpec validation, and scoped quality review; record the retained orphan partition and legacy Task partial-recovery report without merging, guessing, or deleting user data.
- [x] 11.12 Remove the closed legacy Agent Task migration and JSON/Memento persistence path end to end from Agent exports, Extension bootstrap/commands, TUI composition/slash commands, fixtures, and tests; add source-level canonical-path guards and clean only explicitly authorized local test migration artifacts after verifying SQLite integrity and row counts.
