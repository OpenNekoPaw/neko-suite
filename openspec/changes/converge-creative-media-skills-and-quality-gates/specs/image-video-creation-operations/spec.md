## ADDED Requirements

### Requirement: Image operations use a capability-neutral vocabulary
The system SHALL define canonical image operation intents for generation, editing, inpainting, outpainting, upscaling, coloring, style transfer, compositing, splitting, background removal/replacement, and shot-reference preparation. The canonical operation contract MUST remain independent of provider-specific parameter names.

#### Scenario: User requests outpainting
- **WHEN** the user requests expansion beyond the existing image bounds
- **THEN** the `image` workflow SHALL select the canonical outpaint operation
- **AND** it SHALL route to an owning capability that explicitly supports the required source, mask or canvas expansion semantics.

#### Scenario: User requests compositing
- **WHEN** the user asks to fuse multiple images or layers
- **THEN** the workflow SHALL preserve each stable input reference and composition intent
- **AND** it SHALL choose Canvas, Sketch, Engine, or a provider adapter according to declared capability support.

#### Scenario: Split semantics are ambiguous
- **WHEN** a request could mean grid crop, comic panel segmentation, or semantic segmentation
- **THEN** the workflow SHALL select an explicit split profile or request clarification
- **AND** it SHALL NOT silently substitute one split behavior for another.

### Requirement: Video operations cover single-clip creation and transformation
The system SHALL define canonical video operation intents for prompt-to-video, image-to-video, keyframe-to-video, reference/video-to-video transformation, restyling, extension, enhancement when available, and timeline preparation. Timeline-wide editing SHALL remain owned by Cut and `video-editing` rather than the single-clip `video` Skill.

#### Scenario: First and last frames drive generation
- **WHEN** the user supplies stable first-frame and last-frame image references with duration and aspect ratio
- **THEN** the video workflow SHALL issue the canonical keyframe generation request
- **AND** it SHALL preserve both frame references in generation provenance.

#### Scenario: Existing video is restyled
- **WHEN** the user requests a style transformation of an existing video
- **THEN** the workflow SHALL require an adapter that declares video transformation or restyle support
- **AND** it SHALL NOT claim support merely because a free-form prompt field exists.

### Requirement: Capability support is negotiated before execution
Each image or video adapter SHALL declare operation support as `supported`, `degraded`, or `unsupported`, including required model, provider, inputs, limits, and diagnostics. The runtime MUST validate support before dispatch and MUST fail visibly when the requested operation cannot be honored.

#### Scenario: Provider lacks end-frame support
- **WHEN** a keyframe video request includes an end frame but the selected provider does not support end-frame conditioning
- **THEN** the runtime SHALL return an unsupported or degraded diagnostic according to declared behavior
- **AND** it SHALL NOT silently drop the end frame and report full success.

#### Scenario: Adapter supports a provider-specific extension
- **WHEN** a provider offers a non-portable control beyond the canonical vocabulary
- **THEN** the adapter MAY expose it through provider-specific typed metadata
- **AND** the canonical Skill content SHALL remain provider-neutral.

### Requirement: Owning packages retain authoring responsibility
Sketch SHALL own selection-, layer-, paint-, and `.nks`-specific image mutations; Canvas SHALL own node composition, ShotNode, and keyframe relationships; Cut SHALL own timeline clip edits; Provider adapters SHALL own external generation mapping; Engine SHALL own engine-side deterministic media operations. Canonical Skills MUST call these capabilities without importing package internals.

#### Scenario: Inpaint targets a Sketch selection
- **WHEN** inpainting depends on active or explicit Sketch selection and layer state
- **THEN** Sketch authoring SHALL validate and apply the mutation
- **AND** the `image` Skill SHALL not duplicate `.nks` layer logic.

#### Scenario: Generated clip is added to a timeline
- **WHEN** a generated video is accepted for timeline use
- **THEN** Cut headless authoring SHALL perform the durable `.nkv` mutation
- **AND** the media provider result SHALL not mutate Cut state directly.
