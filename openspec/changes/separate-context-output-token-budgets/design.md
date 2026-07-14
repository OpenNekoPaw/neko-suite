## Context

Neko Agent already has the raw contract fields needed to model token limits: model entries can carry `contextWindow` and `maxOutputTokens`, and Agent LLM advanced parameters can carry `maxOutputTokens`. The implementation still lets the legacy scalar `maxTokens` mean different things at different layers:

- TOML `[defaults].max_tokens` is converted to `UnifiedConfig.maxTokens`.
- Webview context usage falls back to `settings.maxTokens` as a context-window denominator.
- Agent turn runtime passes `settings.maxTokens` into chat options.
- Provider adapters map `options.maxTokens` to provider output fields such as `maxOutputTokens`, `max_tokens`, or `num_predict`.

This mixes three concepts:

1. Configured input context window: the request-side budget for system instructions, conversation history, tool context, attachments, and other model input.
2. Effective input budget: the portion of the configured input context window available after Neko's safety margin.
3. Output cap: the provider-specific maximum generated tokens for the turn, independent from the input window.

The change stays within the local VS Code Extension/Webview and TypeScript Agent boundary. It does not introduce a remote budget service, external tokenization dependency, Rust Engine contract, project-file migration, or cloud-scale policy layer.

Five-layer analysis:

- Responsibility: shared contracts own token-budget DTOs and diagnostics; Platform owns config/model normalization and provider-capability projection; Agent runtime owns per-turn budget resolution and compact triggering; provider adapters only map normalized output caps to wire fields; Webview and CLI own display and user controls.
- Dependency: Layer 0 budget types and pure helpers must not depend on VSCode, React, provider SDKs, or feature packages. Extension validates Webview/CLI input before runtime dispatch. Webview does not inspect provider adapters.
- Interface: use explicit fields for `contextWindow`, `modelMaxOutputTokens`, `requestedMaxOutputTokens`, `effectiveMaxOutputTokens`, `reasoningReserveTokens`, `safetyMarginTokens`, and `effectiveInputBudget`. Do not overload `maxTokens` in new interfaces.
- Extension: adding a provider or model with different limits updates model metadata and adapter capability mapping, not UI math or compact logic. Future exact token counters can replace estimators behind the same budget interface.
- Testing: config conversion tests cover TOML semantics; pure budget tests cover formulas and diagnostics; Platform projection tests cover provider caps; Agent runtime tests cover compact thresholds and preflight errors; provider adapter tests assert wire output caps; Webview/CLI tests cover combined usage-window display and output-control labels.
- Proportionality: a small resolver is enough for this local product. Avoid policy engines, tenant-level quota managers, remote catalogs, or generalized cost governance.
- Fail-visible behavior: missing selected model metadata, non-positive windows, output caps above provider/model limits, and budgets where reservations consume the whole window return diagnostics or block dispatch instead of silently defaulting to a misleading value.

## Goals / Non-Goals

**Goals:**

- Separate configured input context window, effective input budget, and output-token cap in contracts, UI, runtime, and provider dispatch.
- Preserve `max_tokens` / `maxTokens` as an output-generation setting for provider calls.
- Make model `context_window` the canonical source for input context-window metadata.
- Compute compact thresholds from effective input budget instead of from output-token limits.
- Show compact context usage against the combined input+output display window while keeping output controls labeled as generation caps.
- Clamp or reject impossible output settings before provider invocation.
- Keep manual `/compact` and auto-compact focused on input history/tool context only.

**Non-Goals:**

- No exact tokenizer dependency in this change. Existing rough estimators can remain with conservative safety margins.
- No billing/quota manager or team spend policy.
- No provider-specific UI branching in React components.
- No Rust Engine, Proto, media workflow, or project file changes.
- No automatic migration of user TOML. Prelaunch config mistakes are diagnosed with explicit guidance.
- No silent compatibility fallback where `max_tokens` still acts as a context-window fallback.

## Decisions

1. Introduce a pure token budget resolver.

   Add a small contract-first resolver, conceptually:

   ```ts
   interface AgentTokenBudgetInput {
     readonly modelId: string;
     readonly contextWindow?: number;
     readonly modelMaxOutputTokens?: number;
     readonly requestedMaxOutputTokens?: number;
     readonly defaultMaxOutputTokens: number;
     readonly reasoningReserveTokens?: number;
     readonly safetyMarginTokens?: number;
   }

   interface AgentTokenBudget {
     readonly contextWindow: number;
     readonly effectiveMaxOutputTokens: number;
     readonly reasoningReserveTokens: number;
     readonly safetyMarginTokens: number;
     readonly effectiveInputBudget: number;
     readonly diagnostics: readonly AgentTokenBudgetDiagnostic[];
   }
   ```

   Formula:

   ```text
   effectiveMaxOutputTokens =
     min(requestedMaxOutputTokens ?? defaultMaxOutputTokens, modelMaxOutputTokens)

   effectiveInputBudget =
     contextWindow - safetyMarginTokens
   ```

   `contextWindow` is the configured input context window, not the model total window. Output caps and reasoning budgets are validated independently for provider dispatch; they do not reduce the configured input window. If `modelMaxOutputTokens` is unknown, use the requested/default output cap only if it is positive and rely on provider errors as a last boundary; known caps MUST be validated before dispatch. If `contextWindow` is unknown for the selected model, runtime MUST return a diagnostic for context display and auto-compact threshold resolution instead of using output max as a denominator.

   Alternative considered: keep `maxTokens` and add comments. Rejected because the same field already has conflicting call sites and API-visible failure.

   Alternative considered: derive input budget by subtracting output and reasoning reservations from a single total context value. Rejected because Neko's configuration should model the common provider shape directly: input context window and output generation window are independently configured.

2. Keep provider adapters as thin wire mappers.

   Provider adapters receive `ChatOptions.maxTokens` only after runtime/projection has resolved it as the effective output cap. They continue mapping:

   - AI SDK: `maxOutputTokens`
   - OpenAI-compatible generic/Azure: `max_tokens`
   - Ollama: `num_predict`

   Adapters do not compute context budgets and do not read UI settings. Provider-specific hard caps can be surfaced through model metadata or adapter preflight diagnostics, but the cross-layer formula remains provider-neutral.

   Alternative considered: let each adapter clamp its own output cap. Rejected because UI, compact, CLI, and runtime would still disagree about the request budget.

3. Make TOML token fields explicit and fail-visible.

   New authoring semantics:

   ```toml
   [defaults]
   max_tokens = 8192 # default output cap

   [[models]]
   id = "gpt-5-codex"
   context_window = 256000
   max_output_tokens = 128000
   ```

   `defaults.max_tokens` remains accepted, but it means default output cap only. Model `context_window` is input context-window metadata. Model `max_output_tokens` is model output cap metadata. A large default output cap that exceeds the selected model cap is diagnosed or clamped according to UI/runtime context, but it is never reinterpreted as a context window.

   Alternative considered: rename TOML `max_tokens` immediately. Rejected because provider ecosystems already use `max_tokens` for output. Instead, docs and UI labels must make the meaning explicit.

4. Derive compact thresholds from input budget.

   Manual compact continues to rewrite conversation history and tool result context only. Auto-compact should trigger when estimated input tokens exceed a threshold derived from `effectiveInputBudget`, for example `floor(effectiveInputBudget * 0.85)` unless the user configured a smaller explicit auto-compact threshold.

   Existing compression behavior remains valid:

   - Preserve system turns.
   - Preserve recent turns.
   - Summarize or discard older turns according to compressor config.
   - Compress tool result fields.

   The target budget should eventually be passed to compression so it can compact toward the effective input budget. Until exact token counting exists, keep a safety margin to avoid request-time provider failures.

   Alternative considered: compact only after provider context errors. Rejected because users experience failed turns and provider errors before Neko takes corrective action.

5. Keep configuration separate while combining usage display.

   Webview/CLI compact usage surfaces should present current input usage against the combined display window:

   ```text
   Context: currentInputTokens / (effectiveInputBudget + displayOutputWindow)
   ```

   `displayOutputWindow` prefers the known model output window (`modelMaxOutputTokens`) and may fall back to the resolved output cap when model output metadata is unknown. The existing context indicator should no longer use `settings.maxTokens` as a fallback denominator. If model context is unknown, show an unknown/diagnostic state rather than a false 8192/256000-style denominator. Output-generation settings and advanced controls still use max-output-token wording, but compact usage tooltip/status text does not render a separate output-window row.

   Alternative considered: show output cap as a separate row in the compact usage tooltip/status bar. Rejected because the configured sizes are independently authored, but the compact UI is easier to scan when it reports a single input+output window.

6. Preserve prelaunch cleanup semantics.

   This change deliberately breaks the old internal interpretation where `[defaults].max_tokens` could be used as a context-window fallback. The old successful path should be removed or fail-closed:

   - No UI fallback from `settings.maxTokens` to context-window denominator.
   - No runtime path treating default output cap as auto-compact token threshold.
   - No provider request sending a value above the selected model's known output cap.

   Because this does not migrate creative project files or user-generated media, explicit diagnostics are enough. The user's fix is to put context-window metadata in model entries.

## Risks / Trade-offs

- [Risk] Existing user TOML may rely on `[defaults].max_tokens = 256000` as a context-window shorthand. -> Mitigation: diagnose selected-model output cap overflow with a message that names `models[].context_window` and `models[].max_output_tokens`.
- [Risk] Custom providers may omit model caps. -> Mitigation: treat unknown metadata as unknown in UI, use conservative defaults, and surface provider errors without rewriting them as context-window failures.
- [Risk] Rough token estimates can still undercount inputs. -> Mitigation: reserve safety margin, keep compact threshold below the computed budget, and add provider/request-level diagnostics.
- [Risk] Renaming user-facing labels may confuse users who know provider `max_tokens`. -> Mitigation: label default setting as "Max output tokens" in UI/CLI docs while preserving TOML key compatibility.
- [Risk] Budget resolver could become a policy dumping ground. -> Mitigation: keep it pure and limited to arithmetic, clamping, and diagnostics; cost/quotas remain separate.

## Migration Plan

1. Add token-budget DTOs, diagnostics, and pure resolver tests.
2. Update TOML conversion/validation and docs labels so `defaults.max_tokens` is output-only.
3. Update model metadata projection to preserve `contextWindow` and `maxOutputTokens` for selected chat models.
4. Update Agent runtime option resolution to compute a budget before building provider chat options.
5. Remove UI/runtime fallback that uses default output max as context-window denominator or compact threshold.
6. Update auto-compact threshold calculation and manual compact result reporting to reference input budget.
7. Update provider adapter tests to assert only resolved output caps are sent.
8. Update Webview/CLI labels, context indicators, and diagnostics.
9. Run targeted tests and then `pnpm check` or the repository quality gate selected for the implementation scope.

Rollback is prelaunch and local: revert budget resolver integration and UI labeling, while preserving diagnostics for provider output caps if possible. No durable creative data needs rollback.

## Open Questions

- Should unknown model `contextWindow` block chat turns, or only disable context display/auto-compact until the provider rejects an oversized request?
- Should runtime clamp `requestedMaxOutputTokens` to `modelMaxOutputTokens`, or fail visibly when a user explicitly requested an impossible value?
- What default safety margin should be used before exact provider token counting exists: a fixed token count, a context-window percentage, or both?

## Implementation Notes

- Token counting remains approximate in this change. Auto-compact thresholds are derived from the effective input budget with a conservative ratio, but exact provider tokenizers are still a future replacement behind the same resolver contract.
- Unknown custom-provider `contextWindow` stays unknown in Webview/CLI instead of falling back to `[defaults].max_tokens`; users must add `[[models]].context_window` for precise context usage and auto-compact thresholds.
- `[defaults].max_tokens` remains the durable TOML key for output generation compatibility, but UI, CLI, diagnostics, and docs label it as max output tokens.
- Validation note: `pnpm check` reached `knip` with the repository package manager and failed on existing unused files, dependencies, exports, duplicate exports, and configuration hints outside this fix. Focused runtime tests and Agent Evaluation passed; the repository-wide unused-code gate remains blocked by that pre-existing debt.
- Runtime smoke note: VS Code Extension Host smoke was attempted with `node scripts/smoke-vscode-targets.mjs --skill vscode-extension-debugger --require-webview`, but no VS Code CDP endpoint was listening on port 9222 in this session.
