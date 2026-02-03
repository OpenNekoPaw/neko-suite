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

// Media Request Proxy (Extension FFmpeg IPC)
export {
  MediaRequestProxy,
  type IMediaRequestProxy,
} from './MediaRequestProxy';

// Local Media Processor (Basic Mode - Webview only)
export {
  LocalMediaProcessor,
  createLocalMediaProcessor,
} from './LocalMediaProcessor';

// Mode-Aware Media Proxy (Routes based on mode)
export {
  ModeAwareMediaProxy,
  createModeAwareMediaProxy,
} from './ModeAwareMediaProxy';

// Media Proxy Factory (Singleton access)
export {
  getMediaProxy,
  getLocalMediaProcessor,
  getRemoteMediaProxy,
  resetMediaProxy,
} from './mediaProxyFactory';

// Frame Stream Receiver (Localhost Server approach)
export {
  FrameStreamReceiver,
  createMjpegImageUrl,
  createWebSocketUrl,
  createSingleFrameUrl,
  type FrameStreamConfig,
  type FrameStreamStats,
} from './FrameStreamReceiver';

// H.264 Stream Client (WebCodecs decoding)
export {
  H264StreamClient,
  type H264StreamClientConfig,
  type H264StreamClientStats,
} from './H264StreamClient';

// WebGPU Texture Importer (VideoFrame zero-copy)
export {
  WebGPUTextureImporter,
  createExternalTextureRenderPipeline,
  EXTERNAL_TEXTURE_SHADER,
  type ImportedTexture,
  type WebGPUTextureImporterConfig,
} from './WebGPUTextureImporter';

// Preview Mode Controller (mode state management)
export {
  PreviewModeController,
  getPreviewModeController,
  resetPreviewModeController,
  type PreviewModeControllerConfig,
} from './PreviewModeController';
