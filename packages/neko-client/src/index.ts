/**
 * @neko/neko-client - Media clients for Neko Suite
 *
 * Provides clients for consuming neko-engine services:
 *
 * Engine dispatch (HTTP/WS — works in both Extension Host and Webview):
 * - EngineClient: HTTP dispatch + WS stream management
 *
 * Stream consumers (browser-side):
 * - H264StreamClient: H.264 WebCodecs decoder
 * - AudioStreamClient: PCM Web Audio player (master clock for A/V sync)
 * - FrameScheduler: A/V synchronized frame scheduling
 * - FMP4StreamClient: fMP4 MSE player (alternative pipeline)
 * - PlaybackPerformanceMonitor: Real-time performance metrics
 */

// H.264 WebCodecs decoder
export {
	H264StreamClient,
	type H264StreamClientConfig,
	type H264StreamClientStats,
	type H264StreamStats,
} from './H264StreamClient';

// PCM Web Audio player + master clock
export {
	AudioStreamClient,
	type AudioStreamClientConfig,
	type AudioStreamStats,
} from './AudioStreamClient';

// A/V synchronized frame scheduler
export {
	FrameScheduler,
	type ScheduleAction,
	type ScheduleResult,
	type FrameSchedulerStats,
} from './FrameScheduler';

// fMP4 MSE player (alternative pipeline)
export {
	FMP4StreamClient,
	type FMP4StreamClientConfig,
	type FMP4StreamStats,
} from './FMP4StreamClient';

// Playback performance monitoring
export {
	PlaybackPerformanceMonitor,
	type PerformanceSnapshot,
} from './PlaybackPerformanceMonitor';

// Browser capability detection
export {
	detectCapabilities,
	type CapabilityResult,
	type CapabilityReport,
} from './detectCapabilities';

// Time formatting utilities
export {
	formatTime,
	formatTimePrecise,
} from './formatTime';

// Engine HTTP/WS dispatch client
export {
	EngineClient,
	type EngineClientConfig,
} from './EngineClient';

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
	LoudnessAnalysis,
	// Silence detection
	SilenceAnalysis,
	SilenceRegion,
	// Effects types
	ShaderParamDef,
	EffectPresetInfo,
	EffectApplyResult,
} from './engine/types';

export { transformDiffResponse } from './engine/responseTransform';
