# engine-advanced-gpu-media Specification

## Purpose
TBD - created by archiving change implement-engine-advanced-gpu-media. Update Purpose after archive.
## Requirements
### Requirement: Panoramic Video Preview
The engine SHALL provide panoramic video preview through the preview provider registry using GPU decode, PanoramicRenderer, and StreamSink.

#### Scenario: Panoramic video stream
- **WHEN** a panoramic video preview is requested
- **THEN** the provider decodes frames, projects them through PanoramicRenderer, and streams them through StreamSink

#### Scenario: View state changes
- **WHEN** yaw, pitch, roll, or FOV changes during panoramic video preview
- **THEN** the renderer updates view state without requiring the video to be redecoded from the beginning

### Requirement: Scene And Puppet Preview Providers
The engine SHALL expose scene and puppet previews through `PreviewProviderRegistry`.

#### Scenario: Scene preview request
- **WHEN** a supported scene/model file is requested for preview
- **THEN** the registry routes it to a scene provider that renders through SceneRenderer

#### Scenario: Puppet preview request
- **WHEN** a supported puppet file is requested for preview
- **THEN** the registry routes it to a puppet provider that renders through PuppetRenderer

### Requirement: Puppet H264 Stream And Export
The engine SHALL support puppet H.264 stream and export integration through existing sinks.

#### Scenario: Puppet H264 stream
- **WHEN** a puppet H.264 preview stream is requested
- **THEN** PuppetRenderer output is encoded through StreamSink and is viewable by the puppet webview client

#### Scenario: Puppet export
- **WHEN** puppet output is exported
- **THEN** PuppetRenderer GPU frames are composed or muxed through the engine export pipeline and MuxerSink

### Requirement: ML GPU Bridge Hooks
The engine SHALL define export-oriented GPU bridge hooks for ML texture/tensor workflows without CPU fallback in hot paths.

#### Scenario: Unsupported ML GPU bridge
- **WHEN** a platform lacks implemented GPU interop for ML bridge
- **THEN** the engine returns an unsupported capability error rather than performing texture readback, CPU ONNX inference, and texture upload in the hot path

### Requirement: Transition GPU Effects
The engine SHALL support transition effects as registered GPU effects with two-input semantics.

#### Scenario: Transition effect resolves
- **WHEN** a registered transition effect is used
- **THEN** the effect registry resolves a two-input GPU transition implementation with progress parameters

