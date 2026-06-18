## Context

The fallback/legacy audit found 607 `fallback` matches and 108 `legacy` matches under the VS Code search baseline. Most are benign UI/default-value surfaces, but the Agent stack has several behavior-changing paths: AI SDK provider resolution can silently bridge to legacy `MediaAdapter`s, permission auto mode allows all tools when the traits registry is absent, Agent turn setup failures are typed as `fallback`, and LLM summarization/classification degraded outputs lack structured provenance.

This change is local-client focused. It must not remove real VS Code/Webview/Engine boundary defenses, and it must not break current media providers that still depend on the legacy bridge. It should instead make debt observable, fail-visible, and testable so follow-up migrations can remove compatibility paths safely.

## Goals / Non-Goals

**Goals:**

- Preserve current media provider availability while making legacy bridge usage observable and testable.
- Make missing permission metadata fail-visible in auto mode by asking the user instead of allowing by default.
- Replace runtime `fallback` status for unmet preconditions with a clearer contract.
- Add provenance/degraded metadata to non-LLM summarization/classification outputs.
- Remove one low-risk old command fallback from Canvas where a typed API already exists.
- Keep ADR and OpenSpec artifacts aligned with code behavior and validation.

**Non-Goals:**

- Migrating all media providers from `MediaAdapter` to native AI SDK models in this change.
- Removing the `neko.assets.getAllEntities` command globally while Story/Tools may still call it.
- Renaming every benign `fallback*` identifier in the repository.
- Weakening Webview message validation, resource authorization, CSP/media fallback, Engine availability handling, or project-file diagnostics.

## Decisions

1. **Keep the legacy bridge, but tag it.**

   `ResolvedProvider` will carry an optional source/provenance field such as `source: 'native' | 'legacy-bridge'`. Native providers set `native`; `createLegacyBridgeProvider` sets `legacy-bridge`. `media-task-executor` will copy this source into task output metadata and/or lifecycle diagnostics so usage is observable.

   Alternative rejected: delete `createLegacyBridgeProvider` immediately. This would break providers such as `fal`, `dashscope`, `runway`, `luma`, `suno`, `vidu`, `midjourney`, `minimax`, and `liblib` before native replacements exist.

2. **Auto permission without traits asks instead of allows.**

   In auto mode, explicit deny/allow/ask rules still win first. When no traits registry is available for conditional auto, the matcher returns `ask` with a reason explaining that tool traits metadata is unavailable. This preserves user control for expensive or irreversible actions.

   Alternative rejected: make traits registry immediately mandatory everywhere. That is the end state, but a staged ask behavior reduces blast radius while still closing the unsafe allow path.

3. **Unmet Agent runtime preconditions get their own status.**

   Results currently typed as `status: 'fallback'` for missing provider/platform/agent runtime will become `status: 'precondition-unmet'` or `status: 'setup-incomplete'`. The existing `failed` status remains reserved for execution exceptions after a run starts.

   Alternative rejected: rename to `failed`. That would collapse setup problems and execution failures into one state, making UI and tests less precise.

4. **Degraded LLM outputs carry structured provenance.**

   `SummarizationResult` and `ClassificationResult` receive optional provenance fields (`source` and/or `degraded`) so existing callers remain compatible while tests and future UI can distinguish LLM outputs from local fallback/degraded outputs.

   Alternative rejected: rely on text prefixes such as `[Fallback Summary]`. Text prefixes are not reliable contracts and do not cover classifier results.

5. **Delete only the Canvas-side old command fallback.**

   Canvas will require the typed `NekoAssetsAPI.getAllEntities()` path. The legacy command remains registered for other packages until their call sites are audited and migrated.

## Risks / Trade-offs

- **Provider bridge tagging may miss some downstream views** -> Add focused AI SDK/platform tests and include metadata in task outputs where currently available.
- **Changing permission auto fallback will break tests that expected allow** -> Update tests to assert `ask` and add explicit allow-rule coverage for intended no-prompt cases.
- **Runtime status rename touches host adapters and tests** -> Keep the reason union stable and provide focused tests for missing provider/platform/agent manager.
- **Optional provenance fields may not be consumed immediately** -> Add tests at producers first; UI consumption can follow without blocking this governance pass.
- **Canvas typed API requirement can fail if neko-assets is unavailable** -> Return the existing explicit unavailable error instead of falling back silently; this is intentional fail-visible behavior.

## Migration Plan

1. Add or update types first: provider source, runtime precondition status, summarization/classification provenance.
2. Update producers and focused tests.
3. Update Canvas typed API path and tests if present.
4. Update ADR/OpenSpec tasks and run focused validation.
5. Leave provider-by-provider native AI SDK migration as follow-up work tracked by ADR/ledger.
