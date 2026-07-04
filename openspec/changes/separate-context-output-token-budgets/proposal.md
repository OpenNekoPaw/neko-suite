## Why

Neko Agent currently lets one `maxTokens` value flow through config, Webview usage display, runtime options, and provider requests with conflicting meanings. This allows a model context-window value such as `256000` to be sent as a provider output cap, producing API failures like `max_tokens is too large` and making the context indicator misleading.

This change separates the configured input context window and output-token limits so Neko can compact the right data, surface accurate UI, and fail visibly before provider dispatch.

## What Changes

- Add an Agent token-budget contract that computes each turn's effective input budget from the configured input context window and safety margin while keeping output and reasoning limits independent.
- Treat `max_tokens` / `maxTokens` on provider requests as output generation budget only, not total context window.
- Use `models[].context_window` for model input context-window metadata and `models[].max_output_tokens` for the model's output cap.
- Clamp or diagnose requested output limits before provider invocation instead of sending impossible provider requests.
- Make compact context usage UI show input-context usage against the combined input+output display window without a separate output-window row.
- Make manual and automatic compact operate only on conversation input history and tool-result context; compact MUST NOT mutate future output-token limits.
- Add fail-visible diagnostics for missing/invalid model windows, output limits larger than model caps, and impossible budgets where reserved output/reasoning leaves no usable input space.
- **BREAKING**: prelaunch internal config/runtime semantics change so `[defaults].max_tokens` no longer represents a context-window fallback. Users must put model input context-window size in `models[].context_window` and output caps in `max_tokens` / `models[].max_output_tokens`.

## Capabilities

### New Capabilities

- `agent-token-budget-governance`: Defines how Agent computes, displays, validates, and compacts model input/output token budgets for each turn.

### Modified Capabilities

- `agent-toml-config-authoring`: Clarifies TOML token fields so default `max_tokens` is an output cap, while model `context_window` and `max_output_tokens` are separate model metadata.
- `agent-capability-model-config`: Adds token-limit metadata requirements for chat-capable models and custom provider catalogs.
- `agent-mode-configuration`: Updates Agent composer/runtime UI requirements so output-token controls remain explicit while compact usage surfaces show a combined input+output window.

## Impact

- Affected packages:
  - `packages/neko-types`: shared config contracts, TOML conversion, validation, and token-budget DTOs.
  - `packages/neko-agent/packages/platform`: config normalization, model metadata projection, LLM parameter projection, provider adapters, and diagnostics.
  - `packages/neko-agent/packages/agent`: turn runtime option resolution, context compaction thresholds, and request preflight validation.
  - `packages/neko-agent/packages/extension`: settings projection, Webview message validation, and fail-visible diagnostics.
  - `packages/neko-agent/packages/webview`: context usage indicator, settings labels, composer advanced controls, and i18n.
  - `packages/neko-agent/packages/cli-tui`: config/status display and slash command parameter naming.
- No Rust Engine, Proto, media runtime, project-file, marketplace, or cloud service changes.
- Compatibility and rollback:
  - This is a prelaunch cleanup of internal Agent config/runtime semantics.
  - Existing user TOML using `[defaults].max_tokens = 256000` to mean context window becomes invalid or diagnosed for provider requests instead of being sent as an output cap.
  - Rollback is local to Agent config/runtime/UI code; no durable creative project data is migrated or deleted.
