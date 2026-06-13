## Context

The completed `cleanup-prelaunch-legacy-surfaces` change established the policy and removed the first set of Agent and config compatibility surfaces. It did not remove the remaining repository-wide debt. A follow-up scan on 2026-06-13 shows:

| Scope | `legacy` | `fallback` | `deprecated` |
|-------|----------|------------|--------------|
| all TS/TSX excluding generated build output | 1,008 | 1,467 | 100 |
| non-test TS/TSX | 606 | 1,146 | 90 |

The biggest non-test hotspots are `neko-agent/packages`, `neko-types`, `neko-canvas`, `neko-cut`, `neko-client`, `neko-preview`, `neko-live`, `neko-assets`, and `neko-market`. `pnpm check:unused` still reports 18 unused files, 164 unused exports, dependency drift, and unlisted `jsdom` test dependency usage.

Architecture fit:

1. 是否符合现有架构？是。This change applies the existing prelaunch rule: old unpublished formats are not protected by default, while runtime resilience remains separate from compatibility.
2. 如何进一步降低耦合？By deleting old readers and aliases at package boundaries, replacing scattered fallback reads with canonical inputs, and moving remaining exceptions into machine-readable ledgers.
3. 是否易于扩展与测试？Yes, if each batch has an owner package, exact stale-surface scans, targeted tests, and cleanup guards.

五层分析:

| 层 | 设计判断 |
|----|----------|
| 职责 | Cleanup tooling classifies and guards; package owners delete or migrate their own surfaces; runtime only owns current failure resilience. |
| 依赖 | Cleanup scripts inspect packages but packages do not depend on cleanup tooling. Canonical packages remain the source of contracts. |
| 接口 | Removed legacy fields must be replaced by canonical types, manifest schemas, connection models, or explicit current bridge interfaces. |
| 扩展 | New legacy/fallback/deprecated surfaces require semantic metadata and tests before merge. |
| 测试 | Every batch pairs `rg` proof with touched package tests/builds; generated/proto work requires generated diff validation. |

## Goals / Non-Goals

**Goals:**

- Convert the remaining `legacy` / `fallback` / `deprecated` occurrences into an executable burndown ledger.
- Delete or migrate confirmed unused files, unused exports, deprecated aliases, old unpublished readers, stale fixtures, and old manifest/schema compatibility.
- Keep true runtime resilience, but reduce misleading `fallback` wording in UI/default-value helpers where it is not a compatibility or failure path.
- Make `pnpm check:unused` either pass or fail only with documented, package-owned exceptions.
- Add guards so deleted compatibility surfaces do not reappear.
- Update `adr-code-debt-cleanup-strategy.md` with the second-stage scan baseline and package-specific outcomes.

**Non-Goals:**

- Removing current AI SDK provider support for fal.ai, DashScope, Kling, or equivalent active providers.
- Removing current GPU/media/model/network failure handling.
- Blindly deleting generated proto/engine types without updating source IDL and generated artifacts.
- Completing every large schema migration in one commit if it needs package-specific generated validation.
- Renaming domain statuses like `deprecated` when they are current product states.

## Decisions

### Decision 1: Build a second-stage cleanup ledger before deleting broad surfaces

The first implementation step is to create a machine-readable repo-wide ledger for non-Agent surfaces. It records package, surface, semantic class, action, owner, replacement, removal condition, and validation commands.

Alternative considered: continue deleting by ad hoc `rg` results.

Rejected because raw search counts mix current runtime fallback, UI empty-state labels, product states, generated code, and true old compatibility.

### Decision 2: Delete dead code before old schema migrations

The first code batch addresses `pnpm check:unused`: unused files, unused exports, manifest dependency drift, and `jsdom` declarations. This shrinks the search surface and avoids migrating files that should not exist.

Alternative considered: start with storyboard/canvas schema deletion.

Rejected because deeper schema work has more coupling and should not spend effort on code that static analysis already says is unused.

### Decision 3: Split old-format deletion by package contract

Schema and manifest compatibility is handled in package-owned batches:

| Batch | Primary surfaces |
|-------|------------------|
| Shared schema/types | storyboard legacy sections/media refs, asset manifest legacy types, storage deprecated aliases, canvas legacy fields |
| Canvas | legacy anchors, cells path, group `childIds`, `LegacyNodeRenderer` fallback renderer |
| Asset/Market | legacy package type migration, legacy asset type migration, `legacyFallbackRef` metadata |
| Agent runtime | legacy workflow adapter, artifact restore legacy fallback, document legacy read mode |
| UI/default fallback naming | presentational empty states and labels using `fallback` where `default`, `placeholder`, or `emptyState` is more precise |

Alternative considered: one cross-package rewrite.

Rejected because package contracts and validation commands differ.

### Decision 4: Preserve runtime resilience with clearer names and tests

Provider/model/GPU/media/network/file failure paths remain. Where the word `fallback` describes an ordinary display default rather than failure handling, rename it to `default`, `placeholder`, `emptyState`, or `unavailable` to reduce future cleanup noise.

Alternative considered: remove all `fallback` hits.

Rejected because that would break current resilience and UI behavior.

### Decision 5: Generated/proto cleanup is gated

Generated files such as `*.engine.ts` are not manually edited. If their legacy fields are only prelaunch compatibility, the source IDL/schema must be changed and generated outputs validated in a dedicated batch.

Alternative considered: patch generated TypeScript directly.

Rejected because generated files are not the contract source.

## Risks / Trade-offs

- Old-format deletion breaks hidden fixtures -> migrate fixtures to canonical shape in the same package batch and keep a focused canonical roundtrip test.
- `knip` false positives cause accidental deletion -> require manual owner confirmation or manifest/entry modeling before deleting non-trivial files.
- Fallback renaming creates churn without behavior change -> batch by package and verify with targeted tests only.
- Generated/proto cleanup expands scope -> isolate it behind generated diff checks and do not mix with UI cleanup.
- Runtime resilience gets misclassified as compatibility -> require tests or documented smoke validation before preserving broad fallback paths.

## Migration Plan

1. Create a repo-wide cleanup scanner and ledger seeded from the current scan.
2. Resolve static-analysis dead code and dependency drift.
3. Delete low-risk deprecated aliases and re-export surfaces with import scans.
4. Migrate shared schema/type fixtures to canonical shapes, then delete old readers.
5. Migrate Canvas data and render paths to composable/port/container metadata, then delete legacy anchors/cells/group compatibility.
6. Migrate Asset/Market manifests to canonical package and asset types, then delete legacy manifest migration.
7. Migrate Agent runtime old workflow/artifact/document surfaces to canonical runtime state and artifact indexes.
8. Rename presentational fallback helpers that are not runtime resilience.
9. Re-run package tests and repository cleanup checks; update ADR with final baseline.

Rollback strategy:

- Deleted unused files can be restored only if a real entrypoint or import is added.
- Schema deletion rollback restores the reader and adds it to the ledger as an active temporary compatibility surface with owner and removal date.
- Runtime resilience changes are rolled back only when protecting tests fail.

## Open Questions

- Should `neko-types` storage layout legacy path migration be removed immediately, or kept as a one-time local workspace migration until storage layout is frozen?
- Is INP puppet import still a current feature or only legacy metadata deserialization?
- Should `deprecated` domain statuses be renamed before launch, or kept because market/entity deprecation is a real product state?
- Should generated timeline/scene legacy fields be handled in this change or split into a proto/engine contract cleanup?
