/**
 * Services Index
 *
 * Export all webview services for easy import.
 */

// Media Info Service
export {
  MediaInfoService,
  getMediaInfoService,
  getMediaDuration,
  type IMediaInfoService,
  type MediaInfo,
} from './MediaInfoService';

// Thumbnail Service
export {
  ThumbnailService,
  getThumbnailService,
  createThumbnailService,
  type IThumbnailService,
  type ThumbnailData,
  type ThumbnailRequestOptions,
} from './ThumbnailService';

// URL Resolver Factory
export {
  createWebviewUrlResolver,
  getWebviewUrlResolver,
  type UrlResolver,
} from './urlResolverFactory';

// Media Request Proxy (Extension FFmpeg via NAPI)
export { MediaRequestProxy, type IMediaRequestProxy } from './MediaRequestProxy';

// Media Proxy Factory (Singleton access)
export { getMediaProxy, getRemoteMediaProxy, resetMediaProxy } from './mediaProxyFactory';

// H.264 Stream Client (WebCodecs decoding) — re-exported from @neko/neko-client
export {
  H264StreamClient,
  type H264StreamClientConfig,
  type H264StreamClientStats,
} from '@neko/neko-client';

// Audio Stream Client (PCM f32le playback + master clock) — re-exported from @neko/neko-client
export {
  AudioStreamClient,
  type AudioStreamClientConfig,
  type AudioStreamStats,
} from '@neko/neko-client';

// Frame Scheduler (A/V sync scheduling) — re-exported from @neko/neko-client
export {
  FrameScheduler,
  type ScheduleAction,
  type ScheduleResult,
  type FrameSchedulerStats,
} from '@neko/neko-client';

// Playback Performance Monitor (real-time metrics) — re-exported from @neko/neko-client
export { PlaybackPerformanceMonitor, type PerformanceSnapshot } from '@neko/neko-client';

// Preview Mode Controller (mode state management)
export {
  PreviewModeController,
  getPreviewModeController,
  resetPreviewModeController,
  type PreviewModeControllerConfig,
} from './PreviewModeController';

// Loudness Analysis Service
export {
  analyzeLoudness,
  disposeLoudnessService,
  type LoudnessAnalysisResult,
  type LoudnessAnalysisItem,
} from './LoudnessService';
