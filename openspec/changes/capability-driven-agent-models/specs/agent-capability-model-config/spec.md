## ADDED Requirements

### Requirement: Broad Model Categories
Neko Agent model configuration SHALL use broad model categories for UI grouping and output shape. The MVP categories SHALL be `llm`, `image`, `video`, and `audio`. Music generation SHALL be represented as an audio model capability, not as a top-level `music` category or session mode.

#### Scenario: Music model configured as audio
- **WHEN** a user configures a model with `type = "audio"` and `capabilities = ["text_to_music"]`
- **THEN** the system SHALL normalize the model as an audio model
- **AND** the internal model purpose registry SHALL treat the model as satisfying `audio.music.generate`.

#### Scenario: Music category rejected
- **WHEN** a user configures a model with `type = "music"` or a Webview message uses `sessionMode = "music"`
- **THEN** the system SHALL reject the config or message with a visible diagnostic instead of treating music as a hidden category.

### Requirement: Capability Metadata And Internal Purposes
Models SHALL expose provider/catalog capability metadata through `models[].capabilities`. Existing capability names such as `chat`, `function_calling`, `streaming`, `json_mode`, `code`, `vision`, `text_to_image`, `text_to_video`, `text_to_audio`, and `text_to_music` SHALL remain supported. Neko product purposes such as `llm.chat`, `video.generate`, and `audio.music.generate` SHALL be owned by an internal model purpose registry rather than by user-authored alias configuration.

#### Scenario: Existing capability fields remain supported
- **WHEN** a user configures an LLM model with `capabilities = ["chat", "function_calling", "streaming", "json_mode", "code"]`
- **THEN** the system SHALL preserve those capability fields as model metadata
- **AND** the internal registry SHALL allow `chat` to satisfy the `llm.chat` product purpose.

#### Scenario: Required capability present
- **WHEN** a runtime path requires the `video.generate` product purpose and the selected model declares compatible metadata such as `capabilities = ["text_to_video"]`
- **THEN** the system SHALL allow the path to bind that model.

#### Scenario: Required capability absent
- **WHEN** a runtime path requires `video.understand` and the selected model metadata does not satisfy that internal purpose
- **THEN** the system SHALL fail visibly before provider invocation.

### Requirement: Type Default Models
Neko Agent configuration SHALL support type-keyed default model bindings for the broad model groups `llm`, `image`, `video`, and `audio`. Each binding SHALL store structured `provider_id` and `model_id` fields. These bindings SHALL select default models; they SHALL NOT define capability aliases or workflow semantics.

#### Scenario: Type default resolves model
- **WHEN** `[default_models.video] provider_id = "runway"` and `model_id = "gen-4"` reference an enabled video model owned by the provider
- **THEN** the system SHALL resolve the video default to that provider/model pair.

#### Scenario: Type default mismatch
- **WHEN** `[default_models.video]` references a missing provider, missing model, model from another provider, disabled model, or non-video model
- **THEN** the system SHALL report a configuration diagnostic and SHALL NOT fall back to another video model.

#### Scenario: Legacy media defaults rejected
- **WHEN** user TOML includes `[default_media_models]`
- **THEN** the system SHALL reject the config with a visible diagnostic directing the user to `[default_models.<type>]`.

### Requirement: Workflow Profiles Out Of User TOML MVP
Neko Agent user TOML configuration SHALL NOT be the MVP source of truth for validation workflows, alias mappings, or multi-step generation-check orchestration. Those behaviors SHALL be implemented later through code-owned presets, internal registries, provider adapters, and UI affordances.

#### Scenario: Validation workflow needs multiple checks
- **WHEN** a future video validation workflow needs local probing, video understanding, safety moderation, and LLM judging
- **THEN** the workflow SHALL be defined by Neko-owned presets/registries and provider adapters
- **AND** user TOML SHALL only select models/defaults exposed by those known purposes, not define the workflow steps.

#### Scenario: User TOML tries to define workflow semantics
- **WHEN** user TOML includes a workflow/validation profile schema that is not supported by the MVP
- **THEN** the system SHALL ignore unsupported future-only sections only if they are outside the current schema contract, or reject them once schema validation owns unknown sections
- **AND** the MVP SHALL NOT route runtime behavior from those user-authored workflow definitions.

### Requirement: Parameter Schema Boundaries
Model/provider parameters SHALL be validated against declared schemas or explicit pass-through policy. Unknown parameters SHALL NOT be silently dropped when the owning adapter/schema claims that section.

#### Scenario: Known parameter accepted
- **WHEN** a provider/model option declares a known parameter accepted by its schema
- **THEN** the system SHALL preserve the parameter for runtime execution.

#### Scenario: Unknown parameter rejected
- **WHEN** a provider/model option includes an unknown parameter and the adapter/schema does not allow pass-through
- **THEN** the system SHALL report a visible configuration diagnostic.
