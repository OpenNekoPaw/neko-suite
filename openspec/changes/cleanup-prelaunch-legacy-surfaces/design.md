## Context

`adr-code-debt-cleanup-strategy.md` was written while the repository still treated many old shapes as potential published compatibility contracts. The current project assumption is stricter: there is no launched service or required old user-data compatibility window. That means old formats, old message fields, old compatibility re-exports, and prelaunch migration helpers are not protected by default.

Current raw search counts are high when using VSCode-like case-insensitive occurrence matching across `*.ts` and `*.tsx`:

| Term | Files | Occurrences |
|------|-------|-------------|
| `legacy` | 209 | 1057 |
| `fallback` | 380 | 1467 |
| `deprecated` | 60 | 110 |

These counts are useful triage signals but not deletion lists. They include tests, product states named `deprecated`, real runtime resilience, AI SDK provider bridges that still execute current features, old schema compatibility code, and unused shims.

The cleanup design should therefore be more aggressive about old unpublished formats, but more precise about current runtime behavior. The target model is:

```text
input boundary
  validate or migrate current accepted shape once
        |
        v
runtime/domain code
  canonical model only, no scattered legacy/fallback branching
        |
        v
host/UI adapters
  presentation, protocol, VSCode/Webview bridge only
```

五层分析:

| 层 | 设计判断 |
|----|----------|
| 职责 | Cleanup policy owns classification; package owners own deletion/migration of their surfaces. Runtime owns resilience, not old-format compatibility. |
| 依赖 | Guard scripts and ADR/LCD metadata may inspect packages, but packages must not depend back on cleanup tooling. |
| 接口 | Canonical runtime/domain contracts replace deprecated fields and re-export shims. Boundary normalizers are allowed only where multiple current inputs still exist. |
| 扩展 | Future legacy/deprecated additions require owner, replacement, remove condition, and tests before merge. |
| 测试 | Each cleanup batch pairs deletion with `rg` proof, package tests/builds, and boundary guards when Webview/Extension/Runtime surfaces are touched. |

## Goals / Non-Goals

**Goals:**

- Update cleanup governance to reflect the prelaunch rule: no old-format compatibility by default.
- Produce a classified inventory from `legacy`, `fallback`, and `deprecated` hits instead of treating raw search counts as proof of dead code.
- Delete confirmed unused shims and dead files first.
- Migrate deprecated imports and old protocol fields to canonical contracts, then remove the old surfaces.
- Move old-format canonicalization to a single input boundary when current data still needs normalization.
- Preserve current feature bridges such as AI SDK legacy provider wrappers only when tests prove they are still on the active execution path.
- Preserve true runtime fallback for provider, network, GPU, model, media, and file availability failures.
- Update ADR and LCD metadata so remaining compatibility surfaces are explicit, test-backed, and have removal triggers.

**Non-Goals:**

- Removing current provider support for fal.ai, DashScope, Kling, or other media providers that still execute through bridge adapters.
- Removing runtime resilience that handles real failure modes in current features.
- Rewriting every package in one pass. Cleanup is staged by risk and package ownership.
- Changing user-facing product concepts that happen to use the word `deprecated` as a current status value.
- Deleting Rust/proto fields blindly without checking generated TypeScript, tests, and route contracts.

## Decisions

### Decision 1: Default old unpublished compatibility to delete

Any code whose only purpose is to read or emit an old unpublished shape is a cleanup candidate. This includes old schema fallback, deprecated field readers, compatibility re-export modules, and old message fields.

Alternative considered: keep existing ADR behavior and preserve old formats until a future breaking change.

Rejected because the project has not launched a compatibility-sensitive service. Keeping old branches now makes future code harder to reason about and creates accidental APIs before the canonical model is stable.

### Decision 2: Classify by semantics, not search terms

The cleanup scan should classify hits into:

| Class | Default action |
|-------|----------------|
| `delete-now` | Delete after `rg` proves no imports/callers and package tests pass. |
| `migrate-now` | Update callers to canonical API, then delete old surface. |
| `current-bridge` | Keep only with owner, replacement, remove trigger, and protecting tests. |
| `runtime-resilience` | Keep if it handles real runtime failure or optional capability absence. |
| `boundary-canonicalizer` | Keep only at input boundary and only for current accepted inputs. |
| `test-only` | Keep if asserting migration/guard behavior; delete stale tests with removed surfaces. |
| `domain-status` | Keep if it is a current business state such as marketplace/entity status. |
| `false-positive-word` | No cleanup action; optionally rename if wording causes repeated confusion. |

Alternative considered: search and delete all `legacy` / `deprecated` / `fallback` strings.

Rejected because it would break active provider bridges, runtime resilience, and current domain states.

### Decision 3: Runtime code uses one canonical model

Runtime and domain code should not contain scattered `oldField ?? newField`, `legacyFoo ?? canonicalFoo`, or broad `catch -> fallback` branches for old formats. If multiple current inputs still exist, they must be normalized once at the boundary and then passed as canonical values.

Alternative considered: keep defensive reads everywhere for convenience.

Rejected because broad fallback makes behavior non-local, hides bad inputs, and makes tests unable to distinguish old-format compatibility from real runtime degradation.

### Decision 4: Keep current bridges only with executable sunset metadata

AI SDK legacy bridge wrappers remain because fal.ai, DashScope, and Kling still route through them today. They are not old-format compatibility; they are current provider support behind a bridge. Each remaining bridge must stay in LCD metadata with provider-specific removal triggers and tests.

Alternative considered: delete all bridge code because the name says `legacy`.

Rejected because bridge removal would remove current functionality before native or configured provider paths are proven.

### Decision 5: Phase cleanup from lowest risk to deepest contracts

Cleanup should proceed in batches:

1. Correct ADR/LCD facts and scan baselines.
2. Delete unreferenced re-export shims and dead files.
3. Fix `knip` false positives and dependency drift.
4. Migrate deprecated TypeScript imports and re-export modules.
5. Remove old message/protocol fields after all callers use canonical content blocks.
6. Remove old unpublished schema/config/canvas/asset/market normalizers and fixtures.
7. Re-run broad package and repository validation.

Alternative considered: start with proto/schema deletion.

Rejected because schema deletion has a larger blast radius and should follow precise caller migration.

## Risks / Trade-offs

- Removing old-format code could break local fixtures or tests that still use outdated shapes -> migrate or delete those fixtures in the same batch and keep fixture roundtrip tests for the canonical shape.
- Search-term counts may encourage over-deletion -> require semantic classification and package owner review for non-shim removals.
- Keeping provider bridges may look inconsistent with aggressive cleanup -> classify them as `current-bridge`, not old-format compatibility, and require sunset tests.
- Removing deprecated fields can reveal hidden callers across packages -> use `rg`, TypeScript build, package tests, and staged commits.
- Updating ADR/LCD metadata without code cleanup could become paperwork -> every active entry must have a concrete test or removal task.

## Migration Plan

1. Refresh `adr-code-debt-cleanup-strategy.md` with the prelaunch no-backcompat policy and current scan counts.
2. Extend cleanup/LCD validation to require a semantic class for remaining `legacy`, `fallback`, and `deprecated` surfaces in `neko-agent`.
3. Delete Agent Webview unreferenced re-export shims:
   - `message-helpers.ts`,
   - `media-extractors.ts`,
   - `tool-constants.ts`.
4. Fix `knip.config.ts` entries for known Vite/runtime entry false positives and split package dependency drift into the owning package.
5. Migrate low-risk deprecated re-export modules and imports where current callers are fully inside the repo.
6. Inventory larger old-format compatibility surfaces in `neko-types`, Canvas, Asset, Market, Config, Proto, and Engine, then schedule package-specific deletion batches.
7. Preserve and test current runtime bridges/resilience paths.
8. Run targeted package validation after each batch; run repository-level checks once the `check:unused` baseline is clean enough to be meaningful.

Rollback strategy:

- Pure shim deletion can be reverted by restoring the shim file and import if a hidden consumer appears.
- Deprecated API deletion should be committed only after all imports migrate; rollback is restoring the old export and adding it to LCD as an active current-bridge or temporary migration surface.
- Old schema deletion should retain canonical fixtures, so rollback does not require restoring outdated fixtures unless a current test proves the old shape is still needed.

## Open Questions

- Which package should own the first non-Agent old-format deletion batch: `neko-types` config/schema fields, Canvas compatibility fields, or Market/Asset manifest compatibility?
- Should proto legacy fields be removed in this change or tracked as a separate proto-specific breaking cleanup with generated artifact validation?
- Should product status values named `deprecated` be renamed before launch to avoid confusing cleanup scans, or kept because the domain meaning is clear?
