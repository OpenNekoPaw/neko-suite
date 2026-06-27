## 1. Shared Contracts

- [x] 1.1 Add Agent LLM preset, advanced parameter, model slot, and model-slot map types in `@neko-agent/types`.
- [x] 1.2 Extend `SendMessageWebviewMessage` with optional Agent model configuration and LLM parameter payloads for `sessionMode: "agent"`.
- [x] 1.3 Update Webview protocol parsers to reject unknown slots, invalid preset values, unsupported payload shapes for non-Agent session modes, and legacy/raw provider passthrough fields.
- [x] 1.4 Add `agent-types` tests for accepted Agent configuration payloads, rejected unknown slots, rejected invalid presets, and media-mode payload rejection.

## 2. Capability And Parameter Projection

- [x] 2.1 Add a pure LLM capability projection helper that derives control availability from model/provider capability metadata.
- [x] 2.2 Add a pure Agent preset projection helper that maps `fast/balanced/deep`, `brief/standard/detailed`, and `stable/creative/wild` to normalized request intent.
- [x] 2.3 Add Platform mapping for OpenAI-compatible, Anthropic-compatible, generic OpenAI-compatible, and local/Ollama-safe LLM parameter behavior, with explicit unsupported-parameter diagnostics.
- [x] 2.4 Add Platform tests for reasoning/verbosity/sampling capability checks, conservative custom-provider defaults, and provider-specific invalid-combination diagnostics.

## 3. Webview Composer UI

- [x] 3.1 Add a presenter for unified composer mode/configuration summaries covering Agent and image/video/audio modes.
- [x] 3.2 Replace the existing top-row composition with a `ModeConfigBar` or equivalent local component that renders left mode selection and right active-mode configuration chips.
- [x] 3.3 Add Agent inline configuration groups that separate model configuration from Agent behavior presets, with each parameter exposed as an independent dropdown.
- [x] 3.4 Preserve existing media generation parameter controls and expose the active media model as an independent dropdown in direct media modes.
- [x] 3.5 Keep roleplay and direct media generation command behavior aligned with current rules: hide `/` and `$`, preserve valid `@` references.
- [x] 3.6 Update i18n strings, keyboard/focus behavior, and accessibility labels for the unified controls.
- [x] 3.7 Add Webview tests for Agent configuration chips, media configuration chips, mode switching, hidden unsupported controls, command affordance behavior, and no stale controls after mode changes.

## 4. Extension And Runtime Wiring

- [x] 4.1 Validate incoming Agent model configuration in the Extension message boundary before dispatching Agent turns.
- [x] 4.2 Resolve the Agent `primary` model slot against selected composer state and config defaults without silently falling back to an unrelated provider/model.
- [x] 4.3 Thread normalized Agent LLM config into the existing Agent turn/session initialization path without introducing a parallel runtime.
- [x] 4.4 Add diagnostics for unsupported referenced slots, capability mismatches, missing required primary/default model, and provider parameter mapping failures.
- [x] 4.5 Add Extension/router/runtime tests proving the canonical Agent send path receives the new configuration and invalid payloads fail visibly.

## 5. Documentation And Migration Notes

- [x] 5.1 Update Agent configuration examples to explain composer-scoped Agent presets and model slots without implying automatic durable config writes.
- [x] 5.2 Document conservative behavior for custom providers with missing capability metadata and how users can declare supported capabilities.
- [x] 5.3 Record remaining non-MVP work for persisted Agent preset defaults and runtime use of fast/deep/summarizer/vision slots.

## 6. Validation

- [x] 6.1 Run targeted `@neko-agent/types` protocol tests.
- [x] 6.2 Run targeted `@neko-agent/platform` config/adapter projection tests.
- [x] 6.3 Run targeted `@neko-agent/webview` presenter and composer tests.
- [x] 6.4 Run targeted Extension chat/router tests for Agent send payload validation.
- [x] 6.5 Run `pnpm --filter @neko-agent/webview exec tsc --noEmit --pretty false`.
- [x] 6.6 Run `pnpm smoke:webview:runtime` or equivalent VS Code Extension Webview runtime validation.
