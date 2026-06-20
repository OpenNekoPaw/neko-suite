## Why

Neko Agent is starting to support LLM and generation models from gateway, local, and future direct providers, but the current model contract keeps adding top-level modes such as `music` for each new use case. That approach makes every new model purpose require shared protocol, Webview, config, and test changes instead of letting providers declare what a model can do.

## What Changes

- **BREAKING**: Remove `music` as a top-level Agent session mode and model category. Music generation models are represented as `type = "audio"` with model capabilities such as `text_to_music`; Neko's internal purpose registry maps that to the `audio.music.generate` product purpose.
- Keep `models[].capabilities` as provider/catalog model metadata. Existing capability names such as `chat`, `function_calling`, `streaming`, `json_mode`, `code`, `vision`, `text_to_image`, `text_to_video`, `text_to_audio`, and `text_to_music` remain first-class supported fields.
- Add an internal Agent model purpose registry for normalized product purposes such as `llm.chat`, `video.generate`, `video.understand`, `content.safety.moderate`, and `audio.music.generate`. This registry, not TOML, owns mappings from existing capability names to Neko product purposes.
- Replace `default_media_models` and capability-keyed defaults with type-keyed default model bindings under `default_models.llm/image/video/audio`. Each binding stores structured `provider_id + model_id` identity instead of a packed string.
- Keep stable UI/model groups focused on broad output modalities: `llm`, `image`, `video`, and `audio` for the MVP.
- Keep validation profiles and generation-check workflows out of the user TOML MVP. Future validation workflows should be code/preset/registry driven, with provider adapters and UI support added later.
- Preserve fail-visible behavior: missing capability bindings, unknown model references, mismatched model capabilities, or unsupported model categories return diagnostics instead of silently falling back.

Non-goals:

- No direct vendor API implementation for Suno, Kling, Seedance, OpenAI image/audio/video endpoints, or safety APIs.
- No full workflow runner for LLM plan -> video generation -> multi-step validation in this change.
- No user-authored validation workflow/profile schema in TOML for the MVP.
- No complex Webview UI for editing validation profiles; MVP should project enough metadata for future UI without exposing raw unknown parameters.
- No dynamic arbitrary renderer for every future model type in the conversation UI.

## Capabilities

### New Capabilities

- `agent-capability-model-config`: Defines Neko Agent's capability-driven model metadata, broad model category contract, internal model purpose registry, default purpose bindings, and fail-visible normalization behavior.

### Modified Capabilities

- None.

## Impact

- `packages/neko-agent/packages/agent-types`: Shared Webview/config protocol types need broad model categories, model capability metadata, default model binding projection, and parser/projector tests.
- `packages/neko-agent/packages/platform`: ConfigManager TOML normalization needs to accept model capability metadata and type-keyed defaults while rejecting unsupported top-level model categories and legacy default media sections. Platform owns the internal model purpose registry for MVP.
- `packages/neko-agent/packages/extension`: ConfigBridge/model projections need to expose capability metadata without introducing secrets or fallback defaults.
- `packages/neko-agent/packages/webview`: Session mode and media model selectors need to hide `music` as a top-level mode and show music-capable models under the audio group.
- `packages/neko-agent/packages/agent`: Message/runtime model selection should resolve generation needs through the internal model purpose registry and fail visibly when no selected/default model satisfies the required purpose.
- Documentation should update the TOML examples from `music` model type/default to `audio` plus capability metadata.
