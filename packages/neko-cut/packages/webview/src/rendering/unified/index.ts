/**
 * 统一渲染模块导出
 * Unified Rendering Module Export
 *
 * CompatibleMediaFrameProvider 用于帧数据获取 (via Extension NAPI)
 */

// 媒体帧提供器（从重构后的模块化目录导入）
export {
  CompatibleMediaFrameProvider,
  createCompatibleMediaFrameProvider,
  type CompatibleMediaFrameProviderConfig,
  type FrameTransportMode,
} from './mediaFrameProvider/index';

export type {
  IMediaFrameProvider,
  MediaFrameProviderConfig,
  CompositeTrackConfig,
  UrlResolver,
} from './mediaFrameProvider/index';
