export { EngineClient } from '../EngineClient';
export { sourceReplacementToElementPatch } from './sourceReplacement';
export type { TimelineSourcePatch } from './sourceReplacement';
export type {
  // Request / Response
  ActionRequest,
  ActionResponse,
  ApiError,
  // Raw Rust types
  RawProbeData,
  VideoStreamInfo,
  AudioStreamInfo,
  SubtitleStreamInfo,
  RawWaveformData,
  RawStreamSession,
  Resolution,
  // Diff types
  DiffCategory,
  FieldDiff,
  DiffResult,
  ImageContentDiff,
  AudioDiffRegion,
  AudioContentDiff,
  FrameMetric,
  VideoDiffRegion,
  VideoContentDiff,
  TimelineChangeType,
  PropertyChange,
  ElementChange,
  TrackChange,
  TimelineDiffSummary,
  TimelineProjectMeta,
  ElementContentDiffResult,
  TimelineContentDiff,
  // Convenience types
  ProbeResult,
  WaveformResult,
  StreamHandle,
  // Effects types
  EffectCapability,
  EffectCapabilityParamDef,
  EffectKind,
  EffectParamOption,
  ShaderParamDef,
  EffectPresetInfo,
  EffectApplyResult,
  ModelPreprocessOperation,
  ModelPreprocessRequest,
  ModelPreprocessResult,
  TimelineSourceReplacement,
} from './types';
export { transformDiffResponse } from './responseTransform';
