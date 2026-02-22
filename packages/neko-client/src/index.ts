/**
 * @neko/neko-client - Media streaming clients for Neko Suite
 *
 * Provides browser-side clients for consuming media streams from neko-engine:
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
