## Why

The previous prelaunch cleanup change completed its scoped tasks, but the repository still contains a large remaining surface of `legacy`, `fallback`, `deprecated`, dead-code, and static-analysis findings. As of the follow-up scan on 2026-06-13, TypeScript sources still contain 2,575 `legacy` / `fallback` / `deprecated` occurrences, including 606 `legacy`, 1,146 `fallback`, and 90 `deprecated` occurrences in non-test source.

Because Neko Suite has no launched compatibility contract, the next change must turn the remaining findings into executable deletion and migration batches instead of treating them as vague future cleanup or relying on broad runtime fallback code.

## What Changes

- **BREAKING**: Remove remaining prelaunch-only old-format readers, deprecated aliases, compatibility migrations, stale fixtures, and unused files when no current producer or runtime path requires them.
- **BREAKING**: Remove or migrate current callers of deprecated shared exports, legacy manifest readers, legacy Canvas connection/container fields, legacy storyboard table normalization, and Agent legacy workflow/artifact paths where current canonical replacements exist.
- Establish a repo-wide cleanup ledger for non-Agent packages so preserved `legacy` / `fallback` / `deprecated` surfaces have owner, semantic class, replacement, remove condition, and validation.
- Add a repeatable scanner that reports:
  - raw term counts by scope,
  - non-test hotspots by package and file,
  - semantic class buckets,
  - explicit deletion candidates,
  - preserved runtime-resilience / domain-status / generated-code exceptions.
- Drive `pnpm check:unused` toward a clean or explicitly justified baseline by deleting confirmed unused files, fixing package dependency drift, and either declaring or centralizing `jsdom` test dependencies.
- Split remaining work into package-specific cleanup batches:
  - shared schema/types (`neko-types`),
  - Canvas old anchors / cells / group child compatibility,
  - Asset / Market legacy manifest and package type migrations,
  - Agent legacy workflow / artifact restore compatibility,
  - deprecated shared UI/type re-exports,
  - current runtime fallback naming and metadata hardening.
- Preserve current runtime resilience only when it handles current failures such as provider absence, GPU/media/model/network errors, file availability, or UI empty states. Pure default-value presentation should be renamed where the word `fallback` creates cleanup noise.

## Capabilities

### New Capabilities

- `legacy-debt-surface-burndown`: Defines the repo-wide requirements for classifying, deleting, migrating, preserving, validating, and preventing reintroduction of remaining legacy/fallback/deprecated/dead-code surfaces.

### Modified Capabilities

- None.

## Impact

- Documentation and governance:
  - `docs/architecture/adr-code-debt-cleanup-strategy.md`
  - new or updated cleanup ledger for non-Agent packages
  - OpenSpec cleanup tasks and validation evidence
- Static analysis and guards:
  - new cleanup scanner or extension of existing boundary/cleanup scripts
  - `knip.config.ts`
  - package-level dependency manifests
- High-priority cleanup areas:
  - `packages/neko-types/src/types/storyboard-table.ts`
  - `packages/neko-types/src/types/asset/manifest.ts`
  - `packages/neko-types/src/types/storage.ts`
  - `packages/neko-types/src/types/canvas*.ts`
  - `packages/neko-canvas/packages/**`
  - `packages/neko-assets/src/**`
  - `packages/neko-market/packages/**`
  - `packages/neko-agent/packages/agent/src/runtime/**`
  - `packages/neko-agent/packages/agent/src/artifact/**`
  - confirmed `pnpm check:unused` files and exports
- Expected validation:
  - targeted `rg` no-stale-surface scans,
  - touched package tests/builds,
  - `pnpm check:unused`,
  - package-specific guards for old-format reintroduction.
