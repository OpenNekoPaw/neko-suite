## Context

Neko Agent's AI configuration now has explicit user TOML config and OAuth/account gateway paths, but the model category layer is still too narrow and too eager to promote specific use cases to top-level modes. Recent work added `music` as a peer of `image`, `video`, and `audio`. That solves one immediate selection problem but creates the wrong extension pattern: future TTS, ASR, safety, OCR, video-understanding, 3D generation, material generation, and validation APIs would each push new hard-coded categories through shared protocol, Webview UI, runtime selection, and tests.

This change keeps the local VS Code client boundary simple. It does not introduce a remote workflow platform or a general cloud service registry. It introduces a local, typed model metadata contract plus an internal Agent model purpose registry. User TOML and OAuth/account catalogs declare provider/model metadata; Neko code owns normalized product purposes and mappings from provider capability names to those purposes.

Five-layer analysis:

- Responsibility: config files and account catalogs declare provider/model metadata; `agent-types` owns secret-free DTOs and parser/projector contracts; Platform owns the MVP model purpose registry and config snapshot normalization; Webview renders broad groups and sends selected model refs; Agent runtime validates required product purposes before execution.
- Dependency: shared contracts stay in Layer 0. Extension Host owns config loading and OAuth/account catalog merging. Webview receives no secrets and no provider adapter internals. Runtime receives normalized model refs/capabilities rather than parsing TOML.
- Interface: model `type` is a stable broad category; `capabilities` is provider/catalog model metadata; normalized product purposes such as `audio.music.generate` live in an internal registry; default model bindings are keyed by broad type and store structured provider/model refs. No Proto changes are required because this is Agent/Webview/config-layer behavior.
- Extension: new use cases add registry purposes and provider/catalog mappings instead of adding top-level categories. A future `model3d` category can be added when there is an actual 3D result/rendering path, but music stays an `audio` subtype handled by model metadata and internal purpose mapping.
- Testing: parser tests cover accepted/rejected categories and model metadata; registry tests cover existing capability names satisfying normalized purposes; projector tests cover music-capable models appearing under audio; runtime tests cover fail-visible missing purpose; docs/tests cover TOML examples and breaking migration.
- Proportionality: capabilities are a small metadata contract already needed for provider selection. Validation workflows remain code/preset driven roadmap work; user TOML should not become a workflow DSL.
- Fail-visible behavior: unsupported top-level categories, invalid default model IDs, missing required product purposes, and model-purpose mismatches produce diagnostics or parser rejection instead of fallback.

## Goals / Non-Goals

**Goals:**

- Remove `music` as a top-level session mode/model category.
- Represent music-capable models as `type = "audio"` with existing model capability metadata such as `text_to_music`; internally map that metadata to the `audio.music.generate` product purpose.
- Add optional model `capabilities` metadata to user/account model records, keeping existing fields like `chat`, `function_calling`, `streaming`, `json_mode`, `code`, `vision`, `text_to_image`, and `text_to_music` first-class.
- Add type-keyed defaults for model selection preferences, backed by provider/model/type validation.
- Define where validation workflow profiles will live later: code/preset/registry, not MVP user TOML.
- Keep broad conversation UI groups stable and hide unsupported/empty groups in the action surface.

**Non-Goals:**

- No direct Suno/Kling/Seedance/OpenAI image/audio/video adapter implementation.
- No complete LLM-plan-to-video-generation validation workflow runtime.
- No user-authored validation profile/workflow schema in TOML.
- No Webview validation-profile editor.
- No public/user-configurable alias mapping layer.
- No arbitrary unknown category renderer in chat.
- No compatibility shim that keeps `music` as a hidden runtime category.

## Decisions

1. Use broad model categories for UI grouping and output shape.

   MVP categories are `llm`, `image`, `video`, and `audio`. `music` is removed from this layer because it is an audio use case. Future categories such as `model3d` require an actual asset/runtime/rendering path before becoming broad categories.

   Alternative considered: keep `music` as a category. Rejected because it encourages a new category for every use case and makes future validation/voice/OCR/safety expansion expensive.

2. Use `capabilities` for model metadata, and an internal registry for product purposes.

   A model can declare existing capability strings such as `chat`, `function_calling`, `streaming`, `json_mode`, `code`, `vision`, `reasoning`, `text_to_image`, `text_to_video`, `text_to_audio`, and `text_to_music`. These remain first-class because they describe the provider/catalog model.

   Neko product purposes such as `llm.chat`, `image.generate`, `video.generate`, `video.understand`, `audio.music.generate`, and `content.safety.moderate` are owned by an internal Agent registry. The registry maps provider/catalog capability names to product purposes. For example, `chat` satisfies `llm.chat`, and `text_to_music` satisfies `audio.music.generate`.

   The mapping is not user-authored TOML. It should first live in the Platform config/model capability registry for MVP, then move to a shared Agent contract only if runtime/extension packages need the same pure helper.

   Alternative considered: infer all behavior only from `type`. Rejected because same-category models can do very different jobs, especially in audio and video.

   Alternative considered: expose an alias layer in config schema. Rejected because users should not govern Neko product-purpose semantics; aliases are internal provider/catalog normalization rules.

3. Use type-keyed structured defaults instead of media-only defaults.

   New defaults use broad model type keys and explicit provider/model identity, for example:

   ```toml
   [default_models.llm]
   provider_id = "ollama-local"
   model_id = "ollama-local-llama3.2"

   [default_models.image]
   provider_id = "neko-gateway"
   model_id = "neko-gateway-gpt-image-2"

   [default_models.video]
   provider_id = "neko-gateway"
   model_id = "neko-gateway-seedance-lite"

   [default_models.audio]
   provider_id = "neko-gateway"
   model_id = "neko-gateway-tts"
   ```

   `default_models` binds default models for the current Webview type groups. It does not define capability aliases or workflow semantics. `default_media_models` is removed as a config-file input, and legacy use is rejected with a visible diagnostic. Advanced purpose-specific defaults such as video safety, video understanding, LLM judge, or separate music-vs-TTS defaults remain roadmap work owned by future presets/registries.

   Alternative considered: use capability-keyed defaults in the MVP. Rejected for now because the current Webview configuration and selection UI is type-based, and exposing purpose keys would force a second default-model model before validation workflows and provider adapters are ready.

   Alternative considered: use packed strings such as `"provider:model"`. Rejected for user-authored TOML because structured `provider_id` and `model_id` is clearer and avoids parsing ambiguity.

4. Model API shape is separate from capability.

   `protocol` or `api_profile` selects adapter behavior. `capabilities` describes what the model can do. Two audio models can share `type = "audio"` while one uses NewAPI, one uses a Suno-compatible profile, and one uses a local service in the future.

   Alternative considered: encode API into type names such as `suno_music` or `video_safety`. Rejected because it mixes provider transport with model purpose.

5. Validation workflow profiles are preset/registry work, not MVP user TOML.

   A future validation profile may target an output category and list ordered or parallelizable checks such as local probing, video understanding, safety moderation, and LLM judging. Users should ultimately choose a product profile such as `none`, `basic`, `standard`, or `strict`, while implementation details live in code/presets and provider adapters.

   Alternative considered: expose "select validation models" as a flat list. Rejected because validation needs step semantics, required/optional decisions, parameters, and aggregation.

   Alternative considered: let advanced users edit validation profiles in TOML in the MVP. Rejected because that turns config into a workflow DSL and makes Neko's validation semantics user-managed before provider adapters and UI are ready.

6. Unknown model/provider parameters are boundary-governed.

   Model/provider parameter schemas define known fields where the adapter owns them. Unknown keys are accepted only for explicit provider pass-through settings that the adapter supports. Otherwise config normalization returns a visible diagnostic.

   Alternative considered: pass all unknown parameters through. Rejected because it hides typos and makes provider calls unpredictable.

## Risks / Trade-offs

- [Risk] Removing top-level `music` breaks existing prelaunch TOML examples and tests. -> Mitigation: update docs and tests in the same change; users configure Suno/music models as `audio` with `text_to_music` metadata, and the internal registry maps that to `audio.music.generate`.
- [Risk] Capability strings can become inconsistent. -> Mitigation: keep provider/catalog capability names as metadata and centralize Neko product-purpose mapping in an internal registry with tests.
- [Risk] Type defaults cannot express separate TTS/music/judge/safety defaults. -> Mitigation: keep those as roadmap purpose-specific defaults once validation workflows and UI affordances are ready; MVP uses one default per broad type.
- [Risk] Validation profiles look like a workflow engine. -> Mitigation: keep validation workflow profiles out of MVP user TOML; record them as roadmap preset/provider-adapter work.
- [Risk] Unknown custom capabilities are useful for user experimentation. -> Mitigation: allow unknown capability strings as model metadata, but runtime only routes product purposes registered internally.

## Migration Plan

1. Update shared Agent model category/session mode contracts to remove `music`.
2. Update config TOML examples and README guidance to model music as `audio` plus capability.
3. Add model capability metadata DTOs and an internal model purpose registry for known product purposes.
4. Update Webview session mode, media selection, i18n, icons, and tests to group music-capable models under audio.
5. Update runtime/provider expression mapping so audio models with `text_to_music` or equivalent catalog metadata can satisfy the internal `audio.music.generate` purpose without requiring a top-level music category.
6. Add fail-visible tests for unsupported `music` category and capability mismatch.

Rollback is local and prelaunch: revert the shared category contract and docs if needed. No durable project data migration is required beyond user TOML examples because previous `music` config was introduced during prelaunch and is intentionally replaced.
