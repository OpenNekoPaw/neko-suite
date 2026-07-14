## 1. Contracts And Config Semantics

- [x] 1.1 Add shared Agent token-budget DTOs, diagnostics, and a pure resolver for context window, output cap, reasoning reserve, safety margin, and effective input budget.
- [x] 1.2 Add unit tests for resolver cases: normal budget, requested output above model cap, missing context window, missing output cap, and impossible budget.
- [x] 1.3 Update TOML config conversion and validation so `[defaults].max_tokens` is output-only and model `context_window` / `max_output_tokens` remain separate metadata.
- [x] 1.4 Add TOML/config tests proving `max_tokens` no longer feeds context-window fallback or auto-compact threshold selection.
- [x] 1.5 Update model metadata projection tests for valid, missing, and invalid `contextWindow` / `maxOutputTokens` values.

## 2. Runtime And Provider Dispatch

- [x] 2.1 Integrate token-budget resolution into Agent turn option resolution before chat provider dispatch.
- [x] 2.2 Remove runtime paths that use `settings.maxTokens` or default output caps as model context-window denominators.
- [x] 2.3 Validate or clamp requested output caps against selected model `maxOutputTokens` before provider invocation, with fail-visible diagnostics for explicit impossible values.
- [x] 2.4 Update provider adapter tests to assert OpenAI-compatible, AI SDK, Azure, Ollama, and generic adapters receive only resolved output caps.
- [x] 2.5 Add path-level tests proving the old path cannot send a context-window-sized value as `max_tokens` / `maxOutputTokens`.

## 3. Context Compaction

- [x] 3.1 Derive auto-compact thresholds from effective input budget or a smaller explicit context setting, never from output-token defaults.
- [x] 3.2 Preserve manual `compressContext` behavior as input-history/tool-context compression without mutating output-token limits.
- [x] 3.3 Pass target input budget into compression where practical and keep conservative safety margin while token counting is approximate.
- [x] 3.4 Add Agent session and auto-compact tests for threshold derivation, manual compact output-cap preservation, and impossible-budget diagnostics.

## 4. Webview And CLI Surfaces

- [x] 4.1 Update Webview config projection so context usage uses selected model `contextWindow` and resolved effective input budget, not `settings.maxTokens`.
- [x] 4.2 Update Webview context indicator to show unknown/diagnostic state when model context window is missing.
- [x] 4.3 Rename user-facing labels and i18n strings from ambiguous "Max Tokens" to output-token wording where the value controls generation length.
- [x] 4.4 Show compact context usage against the combined input+output window in Webview and CLI status surfaces.
- [x] 4.5 Add presenter, protocol, component, and CLI tests for separated config semantics and combined usage display.

## 5. Documentation And Diagnostics

- [x] 5.1 Update Agent config documentation/examples to show `[defaults].max_tokens` as output cap and `[[models]].context_window` / `max_output_tokens` as model metadata.
- [x] 5.2 Add diagnostics that guide users from oversized `[defaults].max_tokens` values to the correct model metadata fields.
- [x] 5.3 Update any README/settings help text that currently implies `maxTokens` is a context window.
- [x] 5.4 Record remaining compatibility or token-estimation risk in implementation notes if exact token counting is not added.

## 6. Validation

- [x] 6.1 Run targeted unit tests for config conversion, token-budget resolver, LLM parameter projection, provider adapters, Agent session compact behavior, Webview presenters, and CLI config/status.
- [ ] 6.2 Run `pnpm check` after targeted tests pass. (Attempted; `knip` reports existing repository-wide unused/dependency/export debt outside this change.)
- [ ] 6.3 For Webview-visible changes, run VS Code Extension Development Host smoke through the `vscode-extension-debugger` workflow or record why the implementation did not change runtime UI behavior. (Attempted direct smoke; blocked because no VS Code CDP endpoint was listening on port 9222.)
- [x] 6.4 Verify a config with `[defaults].max_tokens = 256000`, model `context_window = 256000`, and model `max_output_tokens = 128000` no longer sends `256000` as provider output cap.
- [x] 6.5 Add a regression test proving supported session `maxTokens` and `thinkingBudget` values enter the single provider capability projection path while unsupported fields stay omitted.
