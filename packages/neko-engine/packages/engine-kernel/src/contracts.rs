//! Host-facing kernel contracts.
//!
//! This module is the approved import surface for host crates that need kernel
//! DTOs, service traits, or temporary compatibility types. Implementation
//! modules remain behind the facade or compatibility paths.

/// Audio contracts used by host controllers and N-API conversions.
pub mod audio {
    pub use crate::domain::{
        AudioOutputFormat, AudioRenderEffectConfig, AudioTranscodeOptions, StreamConfig,
    };
    pub use crate::services::audio_mixdown::{
        AudioMixdown, MixdownConfig, MixdownElement, MixdownTrack,
    };
    pub use neko_engine_audio::{
        mic_capture, AudioCodec, AudioEncoder, AudioEncoderConfig, AudioInfo, FfmpegAudioEncoder,
    };
}

/// Codec helper contracts used by host controllers.
pub mod codec {
    pub use crate::encoder::codec_ext::HwEncoderTypeExt;
    pub use crate::encoder::hwaccel::detect_hw_encoders;
}

/// Domain contracts that remain part of the host-facing kernel API.
pub mod domain {
    pub use crate::domain::operations::EditOperationEnvelope;
    pub use crate::domain::{
        infer_resource_type, AudioOutputFormat, AudioRenderEffectConfig, AudioTranscodeOptions,
        CaptureOptions, ExtractOptions, ExtractType, FrameData, ResourceHandle, StreamCodec,
        StreamConfig, StreamEntry, StreamTransitionError, Timeline, TranscodeOptions,
    };
}

/// Error contracts shared by kernel and host error mapping.
pub mod error {
    pub use crate::error::{Error, Result};
}

/// Export contracts used by timeline and view adapters.
pub mod export {
    pub use crate::export::{
        ExportHwEncoder, ExportJobConfig, ExportPreset, ExportSettings, ExportVideoCodec,
    };
}

/// GPU and renderer compatibility contracts used by host adapters.
pub mod gpu {
    pub use neko_engine_gpu::ParamDef;
    pub use neko_engine_gpu::{GpuContext, Lut3DData, LutRegistry};
    pub use neko_engine_gpu::{GpuInfo, GpuInfo as GpuDeviceInfo};
    pub use neko_engine_scene_renderer::{
        CameraParams, ControlAckHealthSample, DegradationDecision, DegradationHysteresis,
        DegradationStep, FrameLoadSample, FrameScheduleDecision, FrameScheduler, SceneColorSpace,
        SceneToneMapping, ViewportDebugView, ViewportDescriptor, ViewportH264Settings,
        ViewportLookDevSettings, ViewportMaterialOverride, ViewportMaterialOverrideKind,
        ViewportPostProcess, ViewportRenderMode, ViewportWorkMode,
    };
}

/// JVI project loading contracts.
pub mod jvi {
    pub use crate::domain::JviLoader;
}

/// Media helper contracts used by host controllers and N-API conversions.
pub mod media {
    pub use neko_runtime_media::{
        diff_audio_content_with_options, diff_media, diff_timeline_content_with_options,
        diff_video_content, encode_rgba_to_jpeg, AudioDiffOptions, ContentDiff, DiffCategory,
        ExtractedSubtitleTrack, MediaInfo, SubtitleCue, SubtitleStream, TimelineDiffOptions,
        VideoDiffOptions,
    };
}

/// Preview contracts used by stream setup.
pub mod preview {
    pub use crate::preview::PreviewPipelineConfig;
}

/// Service traits and explicit non-service exceptions approved for host callers.
pub mod services {
    pub use crate::services::camera::{CameraCaptureConfig, CameraDevice, ICameraService};
    pub use crate::services::device_binding::{
        DeviceActionBinding, DeviceActionInvocation, DeviceBindingService, DeviceBindingSource,
        DeviceInputEvent, DeviceInputMatcher, IDeviceBindingService,
    };
    pub use crate::services::gamepad::{GamepadEvent, GamepadInfo};
    pub use crate::services::midi::{MidiEvent, MidiPort};
    pub use crate::services::{
        EffectRegistry, EnvironmentLoadDiagnostic, IAudioService, IEffectsService, IExportService,
        IGamepadService, IImageService, IMidiService, INodeService, IPuppetService, ISceneService,
        IStreamPlayback, ITaskService, ITimelineService, IVideoService, PipelineSink,
        PuppetExportConfig, PuppetExportSummary, PuppetRenderTiming, StreamSink,
        ViewportStreamInteractionProfile,
    };
}

/// Runtime puppet contracts re-exported for host streaming endpoints.
pub mod puppet {
    pub use neko_runtime_puppet::world::PuppetDelta;
}

/// Runtime scene contracts re-exported for host scene transport endpoints.
pub mod scene {
    pub use neko_runtime_scene::world::{
        AssetHandleRef, EnvironmentMode, EnvironmentPatch, NodeRemoveCommand, SceneDelta,
        SceneNodePatch, SceneNodeTransformPatch, SelectionHit, SelectionKind, SelectionMode,
        SelectionQuery, SelectionQueryResult, SelectionTarget, TransformUpdate,
    };
    pub use neko_runtime_scene::{
        AnimationPlaybackAction, EnvironmentDiagnostic, LightPatch, LightShadowPatch,
        SceneCommandAck, SceneCommandAckStatus, SceneCommandEnvelope, SceneCommandEvent,
        SceneCommandPhase, TopologyOperation, VertexBrushPatchMetadata,
    };
}
