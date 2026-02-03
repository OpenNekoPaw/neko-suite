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
export {
  MediaRequestProxy,
  type IMediaRequestProxy,
} from './MediaRequestProxy';

// Media Proxy Factory (Singleton access)
export {
  getMediaProxy,
  getRemoteMediaProxy,
  resetMediaProxy,
} from './mediaProxyFactory';

// H.264 Stream Client (WebCodecs decoding)
export {
  H264StreamClient,
  type H264StreamClientConfig,
  type H264StreamClientStats,
} from './H264StreamClient';

// Preview Mode Controller (mode state management)
export {
  PreviewModeController,
  getPreviewModeController,
  resetPreviewModeController,
  type PreviewModeControllerConfig,
} from './PreviewModeController';
