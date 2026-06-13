## Why

`adr-agent-host-boundary-review.md` and `adr-code-debt-cleanup-strategy.md` both conclude that the current risk is not broad dead code, but live Agent business logic drifting into Extension/Webview layers plus migration debt without executable sunset checks. This change turns those ADR decisions into an implementation plan that restores the Extension/Webview/Runtime boundary and makes cleanup work trackable by tests and static-analysis baselines.

The timing matters because recent `packages/neko-agent` growth has made several thick host files active dependencies for new character, evidence, project search, and entity-memory flows. Leaving them as-is would keep future CLI/TUI/runtime reuse blocked and would make cleanup decisions depend on stale manual scans.

## What Changes

- Remove the remaining `projectSearch` compatibility shim usage from Agent Extension production code and delete the shim group after imports and tests move to `@neko/search/host-vscode`.
- Introduce or extend runtime/domain services so Extension controllers delegate character dialogue orchestration, transcript evaluation, fallback report generation, suggestion policy, evidence strategy, and headless probe coordination instead of owning those rules.
- Move persistent `EntityMemoryContribution` inference out of Webview presenter code and into an Agent/entity runtime service; Webview will render contribution previews and send typed user intent only.
- Move character evidence locator derivation, freshness handling, relevance scoring, trimming, and story-scene locator derivation behind host-agnostic runtime contracts fed by injected host readers.
- Move project search candidate extraction, dedupe, and freshness/status aggregation into `@neko/search` or `@neko/entity`, leaving Agent Extension with VSCode command and workspace adapters.
- Add cleanup governance for dead-code/legacy/fallback decisions, including current-code scan baselines, LCD entries, `misplaced-domain-logic` debt, provider-level AI SDK legacy bridge sunset criteria, and knip false-positive handling.
- Add guardrails so newly migrated runtime services and future domain tools use `AgentCapabilityProvider` paths and do not reintroduce legacy centralized domain-tool registration.

No breaking user-facing behavior is intended. Existing VSCode commands, Webview messages, character dialogue flows, evidence loading, project search queries, and entity memory review surfaces should remain compatible while implementation ownership moves.

## Capabilities

### New Capabilities

- `agent-code-debt-cleanup-governance`: Defines the cleanup taxonomy, LCD register metadata, static-analysis baseline rules, legacy bridge sunset criteria, and validation gates for dead code, legacy code, fallback code, and misplaced domain logic.

### Modified Capabilities

- `agent-runtime-boundaries`: Tighten the Extension/Webview/Runtime ownership requirements for character dialogue and entity-memory flows.
- `character-evidence-loading`: Move locator derivation, freshness, relevance, trimming, and story-scene evidence strategy into runtime-owned contracts.
- `project-cache-search-service`: Remove Agent-local projectSearch shims and keep search aggregation/dedupe/status rules in `@neko/search` / `@neko/entity`.
- `unified-entity-memory-semantic-index`: Require entity memory contribution inference to be host-agnostic and reviewable, with Webview limited to projection and user intent.
- `agent-capability-injection`: Add guardrails for duplicate capability diagnostics and prevent new domain tools from entering legacy centralized registration paths.

## Impact

- `packages/neko-agent/packages/extension`: `characterDialogueController.ts`, `characterEvidenceLoader.ts`, `agentProjectSearchAdapters.ts`, `services/projectSearch/*`, and related tests.
- `packages/neko-agent/packages/webview`: `presenters/entity-memory-contribution-inference.ts`, contribution review presenters, message handlers, and Webview tests.
- `packages/neko-agent/packages/agent` and runtime packages: new or expanded host-agnostic services/ports for character dialogue, evidence strategy, entity contribution inference, and boundary tests.
- `packages/neko-search` and `packages/neko-entity`: search aggregation, dedupe, freshness/status, candidate extraction, and entity memory inference ownership.
- `packages/neko-agent/packages/ai-sdk`: legacy bridge remains in use but gains provider-level sunset tracking for fal.ai, DashScope, and Kling.
- Tooling/docs: `knip.config.ts`, static-analysis baselines, ADR/LCD register updates, and targeted validation commands.
