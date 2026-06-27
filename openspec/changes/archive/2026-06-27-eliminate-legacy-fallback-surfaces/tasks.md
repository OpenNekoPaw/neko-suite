## 1. Baseline And Gates

- [x] 1.1 Capture the current `pnpm check:legacy-debt` production baseline and record target counts for this change: `delete-now=0`, `migrate-now=0`, `needs-review=0`.
- [x] 1.2 Update `scripts/check-legacy-debt-surfaces.mjs` so production `delete-now`, `migrate-now`, and `needs-review` matches fail the check.
- [x] 1.3 Update `quality/ledgers/code-debt-surface-ledger.json` and `quality/ledgers/agent-code-debt-lcd-register.json` schema expectations for retained bridge/resilience entries.
- [x] 1.4 Add or update scanner tests that prove accepted classes pass and unresolved production debt classes fail.

## 2. Agent Centralized Tool Compatibility Migration

- [x] 2.1 Audit `packages/neko-agent/packages/extension/src/bootstrap/toolBootstrap.ts` and list current READ_DOCUMENT, READ_IMAGE, READ_DOCUMENT_IMAGE, and QUERY_SEMANTIC_COVERAGE registration dependencies.
- [x] 2.2 Move READ_DOCUMENT and READ_DOCUMENT_IMAGE registration ownership to the platform document capability provider or a document-owned provider factory.
- [x] 2.3 Move READ_IMAGE registration ownership to the platform media/image capability provider.
- [x] 2.4 Move QUERY_SEMANTIC_COVERAGE registration ownership to the search capability provider/facade.
- [x] 2.5 Remove `LEGACY_CENTRALIZED_TOOL_REGISTRATION_METADATA` and associated LCD-002 active compatibility expectations once owner providers register the tools.
- [x] 2.6 Add focused tests proving Agent capability discovery still exposes the four tools through owning providers and central compatibility registration is not hit.

## 3. AI SDK Legacy Bridge Sunset

- [x] 3.1 Add a provider migration matrix for `fal`, `dashscope`, `runway`, `luma`, `suno`, `vidu`, `midjourney`, `minimax`, `liblib`, and `kling` with task families, native/generic path decision, and removal trigger.
- [x] 3.2 Migrate OpenAI-compatible provider types to `newapi`/`generic` or native provider resolution without `createLegacyBridgeProvider()`.
- [x] 3.3 For providers without native support, return explicit fail-closed diagnostics unless the provider has an active migration bridge ledger row.
- [x] 3.4 Add poison-bridge tests for every migrated provider proving `createLegacyBridgeProvider()` is not invoked on new native/generic paths.
- [ ] 3.5 Remove `LegacyMediaAdapter` exports and `createLegacyBridgeProvider()` only after all provider rows are migrated or explicitly unsupported.
- [x] 3.6 Update media task executor tests for unsupported-provider diagnostics, retry/failure behavior, cancellation, provider options, and result normalization without bridge success.

## 4. Asset Entity Command Fallback Retirement

- [x] 4.1 Migrate `packages/neko-story/packages/extension/src/services/AssetLinkingService.ts` from `neko.assets.getAllEntities` to typed `NekoAssetsAPI.getAllEntities()` or an owning shared facade.
- [x] 4.2 Migrate `packages/neko-story/packages/extension/src/services/CrossModalDataProvider.ts` from command lookup to typed assets API/facade.
- [x] 4.3 Migrate `packages/neko-tools/packages/extension/src/bootstrap/bootstrapCoreServices.ts` from command lookup to typed assets API/facade.
- [x] 4.4 Delete `neko.assets.getAllEntities` command registration from `packages/neko-assets/src/extension.ts` after all callers are migrated.
- [x] 4.5 Add focused tests proving Canvas, Story, and Tools fail visibly when typed Assets API is unavailable and do not call the old command.

## 5. Fallback Naming Cleanup

- [x] 5.1 Rename project file save `fallbackMessage` contract to `defaultMessage` or `defaultErrorMessage` across `packages/neko-types/src/project-file-io/save-session.ts`, `packages/neko-types/src/vscode/extension/project-file-save-session.ts`, and callers in Canvas, Cut, Model, Puppet, Sketch, Audio, and tests.
- [x] 5.2 Rename project source `fileNameFallback` to `defaultFileName` or `sourceNameHint` across `packages/neko-types/src/project-file-io/add-source.ts` and callers in Cut, Model, Puppet, Sketch, and Canvas/Webview source-add flows.
- [x] 5.3 Rename Canvas Webview drag/drop `fallbackName` to `sourceNameHint` or `defaultFileName` in `packages/neko-canvas/packages/webview/src/hooks/useDragDrop.ts`, `CanvasApp.tsx`, and tests.
- [x] 5.4 Rename non-framework display/default identifiers such as `fallbackName`, `fallbackNames`, `fallbackThumbnailUri`, `fallbackCharacters`, and `visibleFallbackChars` where they represent hints or defaults.
- [x] 5.5 Leave React `fallback` props and ErrorBoundary fallback UI unchanged, but ensure the scanner classifies them as presentation/default UI.

## 6. Remaining Scanner Classes

- [x] 6.1 Resolve all current production `needs-review` matches by cleanup, renaming, or ledger classification with owner and validation.
- [x] 6.2 Review `boundary-canonicalizer` entries and convert any prelaunch internal dual-read/dual-write compatibility to fail-closed diagnostics or explicit one-time migration.
- [x] 6.3 Review `runtime-resilience` entries in Agent, Canvas, Story, Assets, and shared packages to ensure they protect real boundaries and do not hide contract bugs.
- [x] 6.4 Review `presentation-default` entries and rename those that are not React/UI/default-value terminology.
- [x] 6.5 Update `docs/architecture/adr-code-debt-redundancy-governance.md` with the new post-cleanup baseline and retained bridge list.

## 7. Validation

- [x] 7.1 Run focused tests for Agent tool capability registration, AI SDK provider resolution/media task execution, Story/Tools asset lookup, Canvas typed API lookup, project-file IO naming, and Canvas drag/drop naming.
- [x] 7.2 Run `pnpm check:legacy-debt` and `pnpm check:legacy-debt:ledger` and verify failing classes are zero.
- [x] 7.3 Run `pnpm check:openspec`.
- [x] 7.4 Run the smallest reliable package checks/builds for affected packages and document any existing broad TypeScript gate blockers separately from this change.
- [x] 7.5 Run `git diff --check` and perform a Neko quality self-review focused on over-design, over-defense, path-level validation, and retained compatibility evidence.
