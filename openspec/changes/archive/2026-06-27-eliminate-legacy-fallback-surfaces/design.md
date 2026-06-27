## Context

The current scanner baseline reports 739 non-test `legacy` / `fallback` / `deprecated` matches after the first Agent governance pass. The highest-risk P0/P1/P2 items from `govern-agent-fallback-legacy-debt` are already implemented: provider source metadata, permission ask-on-missing-traits, runtime `precondition-unmet`, degraded summarizer/classifier provenance, and Canvas typed assets API lookup.

The remaining work is broader than deleting strings. Some matches are genuine compatibility debt (`migrate-now`, `current-bridge`), some are naming noise (`presentation-default`), and many are legitimate local-client boundary resilience (`runtime-resilience`). This design treats “all legacy/fallback issues” as all remaining matches being either removed/migrated, renamed away from misleading terminology, or retained with explicit ledger evidence and path-level tests.

## Goals / Non-Goals

**Goals:**

- Reduce production `delete-now` and `migrate-now` scanner counts to zero.
- Reduce production `needs-review` scanner counts to zero by classification, cleanup, or renaming.
- Migrate centralized Agent domain tool compatibility registration to owning package capability providers.
- Complete command fallback retirement for asset entity lookup by migrating remaining callers and deleting the old command registration.
- Turn the AI SDK legacy bridge from a broad fallback into provider-by-provider native/generic paths, with unsupported providers returning explicit diagnostics.
- Rename benign `fallback*` identifiers that are defaults, display-name hints, file-name hints, or UI placeholders.
- Keep legitimate boundary fallback only when it protects a real local client, external provider, media, file, cancellation, user-data, or trust boundary.
- Update ledgers, ADR, and scanner rules so retained words are intentional and future regressions fail visibly.

**Non-Goals:**

- Removing React `fallback` props or ErrorBoundary terminology.
- Removing media codec/range, Engine availability, Webview resource/CSP, cancellation, timeout, or external provider resilience.
- Replacing every external provider adapter with a cloud-scale provider abstraction.
- Preserving unpublished internal legacy payloads where canonical paths can reject or migrate them.
- Fixing unrelated TypeScript module-resolution/test-mock issues that currently block broad `tsc --noEmit` commands.

## Decisions

1. **Use a three-outcome classification for every remaining match.**

   Each production match must end in one of three states: removed/migrated, renamed to non-debt vocabulary, or retained in the ledger with owner/removal condition/validation. This is more useful than a raw zero-string target because React/UI and boundary-resilience fallback are valid terms in a local VSCode client.

   Alternative rejected: ban the words globally. That would force awkward names for React/ErrorBoundary and real runtime resilience, while still not proving old paths are gone.

2. **Treat `migrate-now`, `delete-now`, and `needs-review` as failing classes.**

   The quality gate will fail when production matches remain in these classes. `current-bridge` may remain only with explicit owner, replacement, remove condition, and tests. `runtime-resilience`, `boundary-canonicalizer`, `presentation-default`, and `domain-status` must be either accepted classes or renamed where the term is misleading.

   Alternative rejected: keep a manual ADR table as the only source of truth. The table is useful for explanation, but enforcement belongs in the scanner and ledgers.

3. **Migrate Agent centralized tools by owner, not by moving code into another feature package.**

   Document tools move to the platform document capability provider, image/document-image tools move to platform media/document-image providers as appropriate, and semantic coverage moves to search-owned capability registration. Agent bootstrap may keep only Agent-owned meta-tools and discovery wiring.

   Alternative rejected: keep `toolBootstrap` as a permanent compatibility registry. That continues to blur package ownership and makes new domain tools likely to copy the old pattern.

4. **Sunset the AI SDK legacy bridge by provider row.**

   Provider types that are OpenAI-compatible should map to `newapi` / `generic` native provider resolution. Provider types that require distinct request/async/status semantics should get native provider wrappers or explicit unsupported diagnostics. Each migrated provider needs a poison-bridge test proving `createLegacyBridgeProvider()` is not hit.

   Alternative rejected: delete the bridge immediately. That would break current media providers before native paths exist.

5. **Delete command fallback only after callers migrate.**

   Canvas already uses `NekoAssetsAPI.getAllEntities()` only. Story and Tools callers must be audited and migrated to typed API or an owning shared facade before deleting `neko.assets.getAllEntities` registration.

   Alternative rejected: keep the command forever because it is convenient. Prelaunch internal command aliases should not survive once typed extension APIs exist.

6. **Rename benign fallback vocabulary in small batches.**

   `fallbackMessage` becomes `defaultMessage` / `defaultErrorMessage`; `fallbackName` / `fileNameFallback` becomes `displayNameHint`, `sourceNameHint`, or `defaultFileName`; visual placeholder fallback becomes `emptyState` or `placeholder`. React `fallback` remains unchanged.

   Alternative rejected: leave all naming noise in the scanner. That makes future audits harder and hides real debt among harmless words.

## Risks / Trade-offs

- **Provider migration could regress media generation** -> Migrate one provider family at a time with focused request/progress/failure/cancellation/result tests and poison-bridge assertions.
- **Capability provider migration may duplicate host wiring temporarily** -> Introduce owner-owned registration adapters first, then remove central compatibility entries once tests prove discovery still works.
- **Renaming fallback identifiers can churn many tests** -> Batch by semantic group and keep behavior-preserving tests close to changed files.
- **Scanner strictness can block unrelated work** -> Gate only production `delete-now`, `migrate-now`, and `needs-review`; accepted classes require ledger evidence.
- **Some local project data may contain old shapes** -> For prelaunch internals, prefer fail-closed diagnostics or explicit one-time migration when data is valuable; do not silently dual-read.

## Migration Plan

1. Freeze the current scanner output as the starting baseline for this change and add target thresholds to the tasks.
2. Resolve all production `needs-review` matches by cleanup, renaming, or ledger classification.
3. Remove remaining `delete-now` entries and migrate all `migrate-now` entries to canonical contracts.
4. Migrate Agent centralized compatibility tool registration to owning providers and delete LCD-002 active compatibility entries.
5. Migrate remaining asset entity command callers and delete `neko.assets.getAllEntities` command registration.
6. Migrate AI SDK provider rows away from `createLegacyBridgeProvider()` or convert unsupported providers to explicit diagnostics.
7. Rename benign fallback identifiers and update tests.
8. Update ADR and ledgers, then enforce zero production `delete-now` / `migrate-now` / `needs-review` in `pnpm check:legacy-debt`.
9. Run focused package tests plus `pnpm check:legacy-debt`, `pnpm check:legacy-debt:ledger`, and `pnpm check:openspec`.

## Open Questions

- Which providers should be migrated first from the legacy bridge: OpenAI-compatible provider types (`kling`, `minimax`, `liblib` if compatible) or high-use async providers (`fal`, `dashscope`, `runway`)?
- Should unsupported provider diagnostics remain configurable during migration, or should missing native support always fail closed in prelaunch builds?
- Should `fallback` as structured provenance remain the public type name, or should it be renamed to `local` / `rule` / `degraded` after UI consumption is added?
