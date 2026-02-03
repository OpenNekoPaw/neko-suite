/**
 * MediaFrameProvider Module
 * 媒体帧提供器模块
 *
 * CompatibleMediaFrameProvider (Compatible mode via NAPI)
 * - Uses Extension Host with FFmpeg for decoding
 * - Supports all formats via native FFmpeg + wgpu
 * - H264 stream mode for real-time preview
 */

// Types
export type {
  IMediaFrameProvider,
  MediaFrameProviderConfig,
  CompositeTrackConfig,
  UrlResolver,
  VideoMediaEntry,
  CurrentFrameCache,
  PreloadedFrameEntry,
  ImageCacheEntry,
} from './types';

// =============================================================================
// Compatible mode frame provider (Extension-based via NAPI)
// =============================================================================

export {
  CompatibleMediaFrameProvider,
  createCompatibleMediaFrameProvider,
  type CompatibleMediaFrameProviderConfig,
  type FrameTransportMode,
} from './CompatibleMediaFrameProvider';
