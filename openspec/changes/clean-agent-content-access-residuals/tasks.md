## 1. Residual Inventory

- [x] 1.1 Audit Agent, Agent-types, Platform, Extension, Webview, and CLI-TUI for `cachePath`, `.neko/.cache`, `runtimePath`, `localPaths`, `webviewUri`, `ForWebview`, blob/object URL, Engine token, and scratch-path success paths.
- [x] 1.2 Classify each finding as remove, Host-internal only, migration-only diagnostic, or tracked compatibility shim with owner and removal condition.
- [x] 1.3 Update the residual audit notes in the change design if new categories are discovered during implementation.

## 2. Contract Cleanup

- [x] 2.1 Remove or rename Webview-specific canonical runtime exports in `packages/neko-agent/packages/agent`, keeping any necessary aliases adapter-scoped and tracked.
- [x] 2.2 Update `packages/neko-agent/packages/agent-types` work item and generated asset projections so stable payloads cannot require Webview URI or cache/local path identity.
- [x] 2.3 Update Agent working memory, task projection, message projection, and builtin skill guidance to preserve stable refs and strip legacy runtime fields.

## 3. Platform Residual Cleanup

- [x] 3.1 Refactor `platform/src/media` generated asset and delivery helpers so physical output paths remain Host-internal and Agent-visible result DTOs expose stable refs/descriptors.
- [x] 3.2 Refactor `platform/src/document` parser scratch and document image helpers so scratch/cache paths do not cross service boundaries.
- [x] 3.3 Review `platform/src/files` and keep only text/config operation plans or host-executed abstractions, not binary/media IO services.

## 4. Adapter and Presentation Cleanup

- [x] 4.1 Move any remaining Webview URI enrichment to Extension/Webview adapter code backed by `LocalResourceAccessService` or `ResourceCacheService.project()`.
- [x] 4.2 Update Webview presenters for tool calls, work items, storyboard transfer, composite content, and clipboard context to reject or sanitize legacy path fields.
- [x] 4.3 Update CLI-TUI media/progress output to display stable asset/output identity or diagnostics, not managed cache directories.

## 5. Guardrails and Validation

- [x] 5.1 Extend `scripts/check-neko-agent-boundaries.mjs` or quality debt rules for any newly found residual category.
- [x] 5.2 Add tests that poison legacy fields and prove new successful paths use stable refs, content access, resource cache, Engine, or adapter-layer projection.
- [x] 5.3 Run focused Agent/Platform/Extension/Webview/CLI-TUI tests touched by the cleanup.
- [x] 5.4 Run `node scripts/check-neko-agent-boundaries.mjs`, `pnpm check:legacy-debt`, and `openspec validate clean-agent-content-access-residuals`.
