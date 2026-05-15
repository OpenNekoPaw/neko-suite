## 1. Audio Factory

- [x] 1.1 Convert `create_effect()` into `AudioEffectFactory` with register/create methods.
- [x] 1.2 Register all existing built-in audio effects.
- [x] 1.3 Update audio mixdown to use the factory.
- [x] 1.4 Add tests for built-in creation and unknown type errors.

## 2. Capability Metadata

- [x] 2.1 Add `EffectCapability`, `EffectKind`, `EffectSource`, and `ParamDef` DTOs in `engine-types`.
- [x] 2.2 Ensure DTOs use only primitive and engine-types-local values.
- [x] 2.3 Add `effects:list-capabilities` controller action.

## 3. Plugin Activation

- [x] 3.1 Implement `EffectRegistryActivator` as a `PluginActivationHandler`.
- [x] 3.2 Register shader, audio, model, and LUT capabilities on activation.
- [x] 3.3 Remove plugin capabilities on deactivation.
- [x] 3.4 Add activation failure reporting through existing plugin audit/error surfaces.

## 4. TS Discovery And ML Workflow

- [x] 4.1 Update TS effects discovery to call `effects:list-capabilities`.
- [x] 4.2 Preserve built-in UI behavior using engine-provided built-in metadata.
- [x] 4.3 Add `models:preprocess` or equivalent offline preprocessing action.
- [x] 4.4 Integrate preprocessing result metadata with timeline source replacement.

## 5. Cleanup And Verification

- [x] 5.1 Remove deprecated `use_pipeline_sink` rollback flag and old inline encoding path.
- [x] 5.2 Add tests for plugin shader/model capability registration and discovery.
- [x] 5.3 Run affected Rust tests and TS checks for effect discovery consumers.
