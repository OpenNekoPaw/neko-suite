## 1. Shared Contracts

- [x] 1.1 Remove `music` from top-level Agent session/model category contracts and parser allow-lists.
- [x] 1.2 Add model capability metadata/default-binding DTOs and an internal model purpose registry for normalized product purposes.
- [x] 1.3 Update shared protocol/config tests for audio music metadata, rejected music category, legacy capability fields, and type-keyed defaults.

## 2. Config And Runtime Projection

- [x] 2.1 Update TOML/config normalization to carry model capability metadata and type-keyed default model selections.
- [x] 2.2 Update model projection/runtime helpers so required generation purposes use the internal model purpose registry instead of top-level music categories.
- [x] 2.3 Add fail-visible tests for missing capability, mismatched defaults, and unsupported `music` model type.

## 3. Webview Model UI

- [x] 3.1 Remove top-level music session mode from the input area and session mode selector.
- [x] 3.2 Keep music-capable models in the audio model group and update UI/i18n tests.
- [x] 3.3 Ensure empty/unconfigured groups remain hidden or disabled according to existing model availability rules.

## 4. Documentation And Validation

- [x] 4.1 Update Agent README/OpenSpec examples from `music` type/default to `audio` plus existing capability metadata such as `text_to_music`, with internal `audio.music.generate` purpose binding.
- [x] 4.2 Run targeted agent-types, platform/config, webview, extension, and runtime tests.
- [x] 4.3 Record remaining roadmap work for validation workflow presets, provider-specific adapters, and UI selection of known validation profiles.
