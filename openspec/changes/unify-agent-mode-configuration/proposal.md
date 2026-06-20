## Why

Neko Agent already uses one `SessionMode` surface for Agent collaboration and direct media generation, but the composer UI presents Agent mode as a simple model selector while media modes expose richer model and parameter controls. This makes the entry/composer experience feel inconsistent and leaves important Agent LLM controls hidden in global settings instead of the creative workflow where users make mode decisions.

This change creates a unified, capability-aware composer configuration model: users choose the creative mode on the left and configure the current mode's model and parameters on the right, while the runtime keeps Agent reasoning/tool orchestration separate from direct image/video/audio generation.

## What Changes

- Add a unified composer configuration surface where the left side selects `Agent`, `Image`, `Video`, or `Audio`, and the right side exposes the current mode's model/parameter configuration as independent dropdown chips.
- Add Agent-mode LLM configuration to the composer, including user-facing presets for reasoning depth, output verbosity, and creativity, while keeping execution approval mode in the bottom runtime toolbar.
- Introduce Agent LLM model slots for future multi-model orchestration: primary, fast, deep, summarizer, and vision. MVP implementation may expose only primary by default and keep additional slots behind an advanced section.
- Make LLM parameter controls capability-aware so unsupported controls are hidden or disabled with explicit diagnostics instead of being sent to providers that cannot honor them.
- Extend Webview-to-Extension message contracts to carry selected Agent model configuration and LLM parameters when sending Agent messages.
- Map user-facing Agent presets to provider-specific request parameters in platform adapters, preserving fail-visible behavior for unsupported or mismatched model capabilities.
- Keep direct media generation modes focused on generation model and media parameters, while preserving shared composer behavior such as attachments and `@` references.

Non-goals:

- No full workflow scheduler that dynamically delegates every Agent step to separate fast/deep/summarizer models in the MVP.
- No arbitrary provider-parameter editor in the composer.
- No user-authored model capability mapping DSL.
- No change to Rust Engine authority, project file formats, or media rendering pipelines.
- No support for unsupported provider parameters through silent pass-through.

## Capabilities

### New Capabilities

- `agent-mode-configuration`: Defines the unified Agent composer mode/configuration behavior, Agent LLM presets and model slots, capability-aware parameter exposure, and send-message contract requirements.

### Modified Capabilities

- None.

## Impact

- `packages/neko-agent/packages/agent-types`: Add Agent model slot and LLM parameter DTOs, extend `SendMessageWebviewMessage`, and add parser/projector tests.
- `packages/neko-agent/packages/platform`: Add capability-aware LLM parameter projection and provider adapter mapping for OpenAI-compatible, Anthropic, generic, and local providers where supported.
- `packages/neko-agent/packages/extension`: Validate incoming Agent configuration payloads, resolve selected/default model refs, and return diagnostics for unsupported or mismatched model capabilities.
- `packages/neko-agent/packages/webview`: Replace the composer top row with a unified mode/configuration presentation, add inline Agent model and parameter chips, preserve direct media configuration, and update i18n/accessibility tests.
- `packages/neko-agent/packages/agent`: Consume Agent model configuration and LLM parameters through the existing Agent turn/session initialization path without creating a parallel runtime.
- Documentation and examples: Update Agent configuration guidance to explain mode selection, Agent presets, model slots, and provider capability behavior.
