/**
 * MediaFrameProvider Module
 * 媒体帧提供器模块
 *
 * WebviewMediaFrameProvider (Recommended for basic mode)
 * - Uses WebCodecs + mp4box.js for Zero-Copy decoding
 * - Supports H.264, VP8, VP9 video codecs
 * - Best performance for supported formats
 *
 * CompatibleMediaFrameProvider (For compatible mode)
 * - Uses Extension Host with FFmpeg for decoding
 * - Supports all formats via native FFmpeg
 * - Falls back when WebCodecs not available
 *
 * ModeAwareMediaFrameProvider (Automatic routing)
 * - Routes to appropriate provider based on currentMode
 * - Seamless switching between basic and compatible modes
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
// Webview-based frame provider (Basic mode - Recommended)
// =============================================================================

export {
  WebviewMediaFrameProvider,
  createWebviewMediaFrameProvider,
  getWebviewMediaFrameProvider,
  disposeWebviewMediaFrameProvider,
  BasicModeUnsupportedReason,
  type BasicModeError,
  type WebviewMediaFrameProviderConfig,
} from './WebviewMediaFrameProvider';

// =============================================================================
// Compatible mode frame provider (Extension-based)
// =============================================================================

export {
  CompatibleMediaFrameProvider,
  createCompatibleMediaFrameProvider,
  type CompatibleMediaFrameProviderConfig,
} from './CompatibleMediaFrameProvider';

// =============================================================================
// Mode-aware frame provider (Automatic routing)
// =============================================================================

export {
  ModeAwareMediaFrameProvider,
  createModeAwareMediaFrameProvider,
  type ModeGetter,
  type ModeAwareMediaFrameProviderConfig,
} from './ModeAwareMediaFrameProvider';
