/**
 * 统一渲染模块导出
 * Unified Rendering Module Export
 *
 * WebviewMediaFrameProvider 用于帧数据获取
 */

// 媒体帧提供器（从重构后的模块化目录导入）
export {
  WebviewMediaFrameProvider,
  createWebviewMediaFrameProvider,
  getWebviewMediaFrameProvider,
  disposeWebviewMediaFrameProvider,
  BasicModeUnsupportedReason,
  type BasicModeError,
  type WebviewMediaFrameProviderConfig,
} from './mediaFrameProvider/index';

export type {
  IMediaFrameProvider,
  MediaFrameProviderConfig,
  CompositeTrackConfig,
  UrlResolver,
} from './mediaFrameProvider/index';
