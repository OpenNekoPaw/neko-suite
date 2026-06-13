## 1. Baseline And Governance Reset

- [x] 1.1 Update `adr-code-debt-cleanup-strategy.md` to state the prelaunch no-backcompat policy and remove contradictions from completed Agent boundary cleanup.
- [x] 1.2 Recompute and document `legacy`, `fallback`, and `deprecated` counts with explicit scan scope: case sensitivity, occurrence vs line count, test inclusion, and generated/dist exclusions.
- [x] 1.3 Replace stale TODO/FIXME/HACK, fallback, and Agent projectSearch statements in the ADR with current-code facts.
- [x] 1.4 Update the ADR so raw search counts are triage inputs, not deletion criteria.
- [x] 1.5 Add or update a machine-readable cleanup classification source for remaining Agent `legacy` / `fallback` / `deprecated` surfaces using the semantic classes from the spec.
- [x] 1.6 Extend `pnpm check:agent-boundaries` or a focused cleanup check to validate required metadata for preserved Agent legacy/deprecated/current-bridge surfaces.

## 2. Static Analysis Baseline Repair

- [x] 2.1 Update `knip.config.ts` so `neko-tools` AssetDiff webview entries are modeled as real Vite/custom webview entries instead of dead code.
- [x] 2.2 Update `knip.config.ts` so `neko-canvas` narrative preview media runtime is modeled as a real runtime/Vite entry.
- [x] 2.3 Split dependency drift fixes by owner package: `@neko/ai-sdk` for Agent Extension, and `undici` / `@neko/shared` / `@neko-agent/types` for Agent AI SDK.
- [x] 2.4 Keep dynamic document parser dependencies (`epub2`, `fast-xml-parser`, `node-fetch`, `node-unrar-js`, `xlsx`) as explicit static-analysis false positives with tests.
- [x] 2.5 Run `pnpm check:unused` and record the reduced or remaining baseline in the ADR.

## 3. Delete Immediate Dead Shims

- [x] 3.1 Confirm no imports remain for Agent Webview `message-helpers.ts`, `media-extractors.ts`, and `tool-constants.ts`.
- [x] 3.2 Delete the three Agent Webview re-export shim files.
- [x] 3.3 Run targeted Agent Webview presenter/component tests and `packages/neko-agent/packages/webview` build.
- [x] 3.4 Add a guard or ADR note preventing new Webview re-export compatibility shims when canonical presenter imports are available.

## 4. Agent Deprecated Surface Migration

- [x] 4.1 Inventory repo callers of `agent-types/src/message.ts` legacy `toolCalls?` and `thinking?` fields and classify each as current behavior, stale test, or removable compatibility.
- [x] 4.2 Migrate current callers to `contentBlocks[].toolCall` and canonical thinking/content-block projections.
- [x] 4.3 Remove or narrow the legacy message fields once TypeScript callers and tests no longer require them.
- [x] 4.4 Inventory repo callers of `platform/src/types/{prompt,task}.ts` deprecated re-export modules.
- [x] 4.5 Migrate those imports to the canonical shared package entrypoints and delete the deprecated re-export modules if no current callers remain.
- [x] 4.6 Inventory and migrate `LegacyToolCall` callers to `LLMToolCall`; delete or narrow the old type after tests pass.
- [x] 4.7 Review `triggerKeywords()` compatibility in `tool-group-registry.ts`; remove it if current skill/tool-group API callers can use the canonical discovery path.

## 5. Current Bridges And Runtime Resilience

- [x] 5.1 Keep AI SDK legacy bridge wrappers only as `current-bridge` entries for provider types still proven to route through them.
- [x] 5.2 Verify fal.ai, DashScope, and Kling resolver tests still prove current bridge usage and provider-specific sunset conditions.
- [x] 5.3 Classify Agent runtime fallback hits into runtime resilience, boundary canonicalizer, current bridge, or cleanup candidate.
- [x] 5.4 Remove or rewrite Agent fallback branches that only support old unpublished message/schema/config shapes.
- [x] 5.5 Add tests for retained runtime resilience fallback paths where coverage is missing.

## 6. Cross-Package Old-Format Cleanup Plan

- [x] 6.1 Inventory `neko-types` legacy/deprecated schema, config, asset, canvas, and skill metadata fields that only protect prelaunch formats.
- [x] 6.2 Convert canonical fixtures/tests to current shapes and delete stale old-format fixtures where no current reader remains.
- [x] 6.3 Draft package-specific deletion batches for Canvas old anchors/group child compatibility, Asset/Market manifest compatibility, config normalizers, and shared UI legacy exports.
- [x] 6.4 Decide whether proto legacy fields are included in this change or split into a proto-specific breaking cleanup with generated artifact validation.
- [x] 6.5 Update LCD/ADR entries so non-Agent cleanup candidates are either executable tasks or explicitly deferred with owner and removal trigger.

## 7. Verification

- [x] 7.1 Run `pnpm check:agent-boundaries` after Agent cleanup metadata and Webview shim deletion.
- [x] 7.2 Run targeted Agent tests for message projection, tool group registry, AI SDK resolver/bridge, and Webview presenters affected by cleanup.
- [x] 7.3 Run touched package builds/tests after each non-Agent cleanup batch.
- [x] 7.4 Run `pnpm check:unused` after static-analysis and deletion batches.
- [x] 7.5 Run broader `pnpm check`, `pnpm test`, and `pnpm build` only after the unused-code baseline no longer blocks later gates, or document the exact remaining baseline.
