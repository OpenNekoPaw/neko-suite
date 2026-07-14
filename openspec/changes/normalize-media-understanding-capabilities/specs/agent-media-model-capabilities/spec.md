## ADDED Requirements

### Requirement: Current Model Capability Taxonomy Is Preserved
Neko Agent SHALL keep the current model capability taxonomy for this iteration and SHALL NOT require `input.*`, `generate`, `edit`, or `extend` capabilities for media model routing.

#### Scenario: Existing generation capabilities are used
- **WHEN** a generation model is configured
- **THEN** image models MAY declare `text_to_image`, `image_to_image`, or `image_edit`
- **AND** video models MAY declare `text_to_video` or `image_to_video`
- **AND** audio models MAY declare `text_to_music` or `text_to_audio`

#### Scenario: Generic input capabilities are encountered
- **WHEN** a catalog or configuration includes `input.*` capabilities
- **THEN** this change SHALL NOT require Agent media routing to depend on those fields
- **AND** existing capability names SHALL remain the canonical routing vocabulary

### Requirement: Media Understanding Capabilities Are Explicit
LLM media understanding capabilities SHALL be explicit and file-modality oriented.

#### Scenario: Image understanding is required
- **WHEN** Agent needs an image or still-frame understanding model
- **THEN** the selected model MUST be `type = "llm"`
- **AND** it MUST declare `vision`

#### Scenario: Audio understanding is required
- **WHEN** Agent needs a standalone audio file understanding model
- **THEN** the selected model MUST be `type = "llm"`
- **AND** it MUST declare `audio`

#### Scenario: Video understanding is required
- **WHEN** Agent needs a video file understanding model
- **THEN** the selected model MUST be `type = "llm"`
- **AND** it MUST declare `vision_video`

#### Scenario: Video understanding does not imply image understanding
- **WHEN** a model declares `vision_video` but not `vision`
- **THEN** Agent MUST NOT treat that model as image-understanding capable

#### Scenario: Video understanding does not require standalone audio understanding
- **WHEN** a model declares `vision_video` but not `audio`
- **THEN** Agent MAY treat that model as video-understanding capable
- **AND** Agent MUST NOT treat that model as standalone audio-understanding capable

### Requirement: Product Purposes Map To Current Capabilities
Durable media understanding purpose keys SHALL remain stable while validation maps them to current model capabilities.

#### Scenario: Image understanding purpose is resolved
- **WHEN** `[default_model_purposes.image_understand]` resolves to a model
- **THEN** validation MUST require `type = "llm"` and `vision`

#### Scenario: Audio understanding purpose is resolved
- **WHEN** `[default_model_purposes.audio_understand]` resolves to a model
- **THEN** validation MUST require `type = "llm"` and `audio`

#### Scenario: Video understanding purpose is resolved
- **WHEN** `[default_model_purposes.video_understand]` resolves to a model
- **THEN** validation MUST require `type = "llm"` and `vision_video`

### Requirement: Agent Media Understanding Routing Is Scoped
Agent SHALL choose native context or tool/perception context based on whether the selected chat model and selected understand model are the same model.

#### Scenario: Chat model and understand model match
- **WHEN** a media attachment requires understanding
- **AND** the selected chat model and selected understand model have the same provider and model id
- **THEN** Agent SHALL keep the media in the native multimodal chat context

#### Scenario: Chat model and understand model differ
- **WHEN** a media attachment requires understanding
- **AND** the selected chat model and selected understand model differ
- **THEN** Agent SHALL keep the chat model as the main Agent turn model
- **AND** Agent SHALL route media analysis through a perception/tool path using the selected understand model
- **AND** Agent SHALL NOT send the full Agent conversation context to the understand model

#### Scenario: Host dispatch preserves understanding selections
- **WHEN** Webview/Extension resolution selects a distinct media understanding model for an Agent turn
- **THEN** the message runtime and task-result continuation dispatch contracts MUST preserve that explicit selection through the Agent turn bridge
- **THEN** downstream perception routing MUST NOT fall back to an active or unrelated understanding model when the selection is missing
