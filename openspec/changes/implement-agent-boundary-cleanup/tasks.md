## 1. Baseline And ProjectSearch Shim Cleanup

- [x] 1.1 Run an import scan for `packages/neko-agent/packages/extension/src/services/projectSearch` and record production/test consumers.
- [x] 1.2 Replace `characterEvidenceLoader.ts` shim imports with canonical `@neko/search/host-vscode` or shared search contract imports.
- [x] 1.3 Migrate remaining Agent tests that import projectSearch shim paths to canonical search package entrypoints or local fakes.
- [x] 1.4 Delete the eight Agent Extension `services/projectSearch/*` compatibility shim files after the import scan is clean.
- [x] 1.5 Update `knip.config.ts` only for verified dynamic imports, Vite entries, public exports, or deleted shim paths affected by this change.
- [x] 1.6 Run `rg` checks proving no Agent projectSearch shim imports remain and run targeted Agent Extension/search tests.

## 2. Character Dialogue Runtime Boundary

- [x] 2.1 Add host-agnostic character dialogue runtime contracts for profile enrichment, transcript evaluation, fallback report generation, suggestion policy, headless probe orchestration, evidence requests, and save/apply effects.
- [x] 2.2 Add runtime unit tests that cover current character dialogue profile, evaluation, fallback report, suggestion, and probe behavior with fake ports.
- [x] 2.3 Implement the character dialogue runtime service behind narrow ports without importing VSCode, React, Webview, or Extension-only services.
- [x] 2.4 Wire `characterDialogueController.ts` to call the runtime service while keeping VSCode command, Webview message, tab state, QuickPick, file/URI, and `Disposable` lifecycle in Extension.
- [x] 2.5 Remove migrated business helpers from `characterDialogueController.ts` once adapter and runtime tests preserve behavior.
- [x] 2.6 Add or update boundary guard coverage for new Extension-owned character dialogue strategy helpers without runtime counterparts.

## 3. Entity Memory Contribution Inference Boundary

- [x] 3.1 Decide and document whether the pure inference owner is `@neko/agent` or `@neko/entity`, with Agent orchestration as needed.
- [x] 3.2 Move Markdown table parsing, entity candidate inference, observation dimension inference, confidence scoring, diagnostics, and `EntityMemoryContribution` construction into the chosen host-agnostic service.
- [x] 3.3 Add golden tests for representative Markdown analysis tables and expected reviewable contribution payloads.
- [x] 3.4 Replace Webview `entity-memory-contribution-inference.ts` usage with runtime/domain-provided contribution projections and typed user intent messages.
- [x] 3.5 Ensure Webview no longer constructs durable `EntityMemoryContribution` objects or assigns authoritative confidence/review policy values.
- [x] 3.6 Add a guard or focused test that reports new Webview modules that generate durable entity memory contribution payloads.

## 4. Character Evidence Strategy Boundary

- [x] 4.1 Define runtime evidence strategy inputs and reader ports for Dashboard detail, Story indexes, project search results, source text, project root, query text, transcript, role mode, and evidence budget.
- [x] 4.2 Move locator collection, story-scene locator derivation, freshness handling, relevance scoring, dedupe, trimming, and omission metadata into runtime evidence strategy.
- [x] 4.3 Keep `characterEvidenceLoader.ts` as the Extension host adapter for VSCode command calls, workspace reads, Extension API discovery, and safe file/URI mediation.
- [x] 4.4 Add pure runtime tests for late-scene selection, duplicate locator handling, stale/unavailable source handling, deterministic trimming, and no-embedding fallback behavior.
- [x] 4.5 Add Extension adapter tests with fake VSCode command/file readers to prove host reads still feed the runtime strategy correctly.

## 5. Project Search And Entity Aggregation Boundary

- [x] 5.1 Move creative entity candidate extraction, script-role candidate extraction, freshness-aware dedupe, and multi-source status aggregation out of `agentProjectSearchAdapters.ts`.
- [x] 5.2 Place search fan-out/status/dedupe policy in `@neko/search` and entity-specific candidate semantics in `@neko/entity` or a clearly owned provider helper.
- [x] 5.3 Add package-level tests for script role and `@character` candidate extraction without constructing VSCode or Agent Extension services.
- [x] 5.4 Update Agent Extension adapters to map canonical `ProjectSearchItem` results into mention/picker DTOs without reimplementing aggregation policy.
- [x] 5.5 Add dependency/boundary checks that prevent new Agent-local project search aggregation helpers or shim imports.

## 6. Cleanup Governance And Legacy Bridge Sunset

- [x] 6.1 Add or update an LCD register source for confirmed dead code, static false positives, canonical compatibility, migration adapters, stray legacy surfaces, misplaced domain logic, and runtime fallback/resilience.
- [x] 6.2 Encode LCD-009 provider-level sunset rows for fal.ai, DashScope, and Kling with resolver path, migration conditions, removal triggers, and protecting tests.
- [x] 6.3 Keep AI SDK legacy bridge wrappers in place until provider-specific native or configured paths pass resolver, task execution, failure, cancellation, and result normalization tests.
- [x] 6.4 Add cleanup validation or review checks that require owner, replacement path, remove-after condition, and tests for new compatibility or migration surfaces.
- [x] 6.5 Update `adr-code-debt-cleanup-strategy.md` and `adr-agent-host-boundary-review.md` after implementation if facts, counts, or execution order change.

## 7. Capability Provider Guardrails

- [x] 7.1 Add capability registry diagnostics for duplicate provider ids, duplicate canonical tool names, conflicting short names, and legacy/provider path conflicts.
- [x] 7.2 Add tests proving duplicate diagnostics identify both conflicting providers or registration paths.
- [x] 7.3 Add validation or review guardrail that rejects new domain tools on legacy centralized registration paths when a package `AgentCapabilityProvider` path is available.
- [x] 7.4 Document any remaining legacy centralized meta-tools or compatibility bridges with LCD metadata and protecting tests.
- [x] 7.5 Verify boundary migration batches do not add new legacy domain-tool registrations.

## 8. Verification

- [x] 8.1 Run `pnpm check:agent-boundaries` and fix boundary regressions introduced by this change.
- [x] 8.2 Run targeted Agent runtime tests for character dialogue, entity contribution inference, evidence strategy, and project search aggregation.
- [x] 8.3 Run targeted Agent Extension tests for character dialogue adapters, evidence loader adapters, project search adapters, and shim deletion.
- [x] 8.4 Run targeted Agent Webview tests/build for entity memory contribution projection changes.
- [x] 8.5 Run `pnpm check:unused` after shim deletion and knip baseline updates.
- [x] 8.6 Run broader `pnpm check`, `pnpm test`, or `pnpm build` only after targeted gates pass or when touched package scope requires it.

Verification note: `pnpm check:unused` was run after shim deletion. It still fails on the pre-existing repo-wide knip baseline documented in `adr-code-debt-cleanup-strategy.md` (Vite entry false positives, dependency drift, unused exports), but no deleted `services/projectSearch/*` shim path appears in the report. Broader `pnpm check` was intentionally not run because it would fail at the same `check:unused` baseline before reaching later gates.
