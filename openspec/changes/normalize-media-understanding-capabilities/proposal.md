## Why

Neko Agent recently added selectable media understanding models and Gemini-backed media analysis. During design review, the model capability taxonomy drifted toward a more generic `input.*` abstraction, but that abstraction is not stable enough for the current provider landscape. New media abilities such as first/last-frame video, video restyling, reference images, audio-driven motion, long-video review, and multimodal generation do not yet have a clean cross-provider classification.

The product already has a working capability vocabulary in configuration and catalogs:

- LLM/chat abilities: `chat`, `function_calling`, `streaming`, `json_mode`, `code`;
- LLM media understanding abilities: `audio`, `vision`, `vision_video`;
- image generation abilities: `text_to_image`, `image_to_image`, `image_edit`;
- video generation abilities: `text_to_video`, `image_to_video`;
- audio generation abilities: `text_to_music`, `text_to_audio`.

This change keeps that vocabulary and clarifies the semantic boundary so future implementation does not mix product purposes such as `video.understand` with model capabilities such as `vision_video`.

## What Changes

- Document that `audio`, `vision`, and `vision_video` are LLM media understanding capabilities:
  - `audio` means understanding standalone audio files;
  - `vision` means understanding image/still-frame files;
  - `vision_video` means integrated understanding of video files.
- Document that no media understanding capability implies another capability:
  - `vision_video` does not imply `vision`;
  - `vision_video` does not require or imply `audio`;
  - models supporting multiple file modalities must declare each capability explicitly.
- Keep durable `default_model_purposes.image_understand`, `audio_understand`, and `video_understand` as product-purpose bindings, while mapping those purposes to the current model capabilities during validation and selection.
- Preserve existing generation capability names for now. Do not introduce `input.*`, `generate`, `edit`, or `extend` in this change.
- Align Agent routing rules around selected chat and understand models:
  - same chat and understand model: native multimodal context;
  - different chat and understand model: perception/tool path with a scoped understanding context.

## Non-Goals

- No TOML schema migration.
- No replacement of existing model capabilities with `input.*`.
- No new generic operation fields such as `generate`, `edit`, or `extend`.
- No attempt to classify every provider-specific media feature as a global capability.
- No Webview writes to `config.toml` from the Agent panel.

## Impact

- Affected docs:
  - `packages/neko-agent/docs/media-model-configuration.md`.
- Likely affected implementation in a follow-up apply step:
  - Agent model/capability validation and model filtering;
  - `default_model_purposes.*_understand` resolution;
  - Agent turn routing for native media context versus Perceive/Gemini tool context;
  - Webview model picker labels and filtering for understand models.
- Compatibility: prelaunch clarification only. Existing config keys and existing capability strings remain supported.
