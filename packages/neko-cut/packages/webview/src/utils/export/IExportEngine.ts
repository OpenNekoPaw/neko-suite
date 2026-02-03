/**
 * IExportEngine - 统一导出引擎接口
 * Unified Export Engine Interface
 *
 * 遵循接口隔离原则 (ISP)，定义导出引擎的最小契约
 */

import type { ProjectData } from '../../types';

// =============================================================================
// Types
// =============================================================================

/**
 * URL 解析器 - 将相对路径转换为可访问的 URL
 * 用于 VSCode webview 等环境中解析媒体文件路径
 */
export type UrlResolver = (path: string) => Promise<string>;

/**
 * 支持的导出格式
 */
export type ExportFormat = 'mp4' | 'webm' | 'gif' | 'png-sequence' | 'jpeg-sequence' | 'webp-sequence';

/**
 * 质量预设
 */
export type QualityPreset = 'low' | 'medium' | 'high';

/**
 * 导出阶段
 */
export type ExportStage =
  | 'initializing'
  | 'rendering'
  | 'encoding'
  | 'muxing'
  | 'finalizing'
  | 'completed'
  | 'error'
  | 'cancelled';

/**
 * 导出配置（通用）
 */
export interface ExportConfig {
  /** 输出宽度 */
  width: number;
  /** 输出高度 */
  height: number;
  /** 帧率 */
  fps: number;
  /** 输出格式 */
  format: ExportFormat;
  /** 质量预设 */
  quality: QualityPreset;
  /** 视频比特率 (bps) - 仅视频格式 */
  videoBitrate?: number;
  /** 音频比特率 (bps) - 仅音视频格式 */
  audioBitrate?: number;
  /** 包含音频 */
  includeAudio?: boolean;
  /** URL 解析器 - 用于 VSCode webview 等环境中解析媒体文件路径 */
  urlResolver?: UrlResolver;
}

/**
 * 视频导出配置扩展
 */
export interface VideoExportConfig extends ExportConfig {
  format: 'mp4' | 'webm';
  /** 视频编解码器 */
  videoCodec?: 'avc' | 'hevc' | 'vp9' | 'av1';
  /** 音频编解码器 */
  audioCodec?: 'aac' | 'opus';
}

/**
 * GIF 导出配置扩展
 */
export interface GifExportConfig extends ExportConfig {
  format: 'gif';
  /** 颜色数 (2-256) */
  colors?: number;
  /** 启用抖动 */
  dither?: boolean;
  /** GIF 质量 (1-100) */
  gifQuality?: number;
}

/**
 * 图片序列导出配置扩展
 */
export interface ImageSequenceExportConfig extends ExportConfig {
  format: 'png-sequence' | 'jpeg-sequence' | 'webp-sequence';
  /** 图片质量 (1-100) - 仅 JPEG/WebP */
  imageQuality?: number;
  /** 帧号填充位数 */
  frameNumberPadding?: number;
}

/**
 * 导出性能统计
 */
export interface ExportPerformanceStats {
  /** 平均渲染时间 (ms/frame) */
  avgRenderTime: number;
  /** 平均编码时间 (ms/frame) */
  avgEncodeTime: number;
  /** 平均解码时间 (ms/frame) */
  avgDecodeTime?: number;
  /** 平均队列等待时间 (ms) */
  avgWaitTime: number;
  /** 当前队列长度 */
  queueLength: number;
  /** 内存使用 (MB) */
  memoryUsedMB: number;
  /** 显存使用 (MB) */
  vramUsedMB?: number;
  /** CPU 利用率 (0-100%) */
  cpuUsage?: number;
  /** GPU 利用率 (0-100%) */
  gpuUsage?: number;
  /** 是否使用流水线模式 */
  pipelineMode: boolean;
}

/**
 * 导出进度
 */
export interface ExportProgress {
  /** 当前阶段 */
  stage: ExportStage;
  /** 当前帧 */
  currentFrame: number;
  /** 总帧数 */
  totalFrames: number;
  /** 百分比 (0-100) */
  percent: number;
  /** 已用时间 (毫秒) */
  elapsedTime: number;
  /** 预计剩余时间 (毫秒) */
  estimatedTimeRemaining: number;
  /** 当前处理 FPS */
  currentFps: number;
  /** 消息 */
  message?: string;
  /** 错误信息 */
  error?: string;
  /** 性能统计（可选） */
  performanceStats?: ExportPerformanceStats;
  /** 导出模式 */
  mode?: 'basic' | 'compat';
  /** 渲染后端 */
  renderBackend?: 'webgpu' | 'webgl' | 'wgpu';
  /** 输出分辨率 */
  resolution?: { width: number; height: number };
  /** 输出码率 (bps) */
  bitrate?: number;
}

/**
 * 进度回调类型
 */
export type ExportProgressCallback = (progress: ExportProgress) => void;

/**
 * 导出结果
 */
export interface ExportResult {
  /** 是否成功 */
  success: boolean;
  /** 输出 Blob（单文件导出） */
  blob?: Blob;
  /** 输出 Blobs（图片序列导出） */
  blobs?: Array<{ name: string; blob: Blob }>;
  /** 文件大小 (字节) */
  fileSize?: number;
  /** 总耗时 (毫秒) */
  totalTime?: number;
  /** 平均处理 FPS */
  averageFps?: number;
  /** 错误信息 */
  error?: string;
}

// =============================================================================
// Interface
// =============================================================================

/**
 * 导出引擎接口
 *
 * 所有导出引擎实现都必须遵循此接口，确保：
 * - 统一的 API 调用方式
 * - 统一的进度回调
 * - 统一的取消机制
 * - 统一的错误处理
 */
export interface IExportEngine {
  /**
   * 引擎名称
   */
  readonly name: string;

  /**
   * 支持的格式列表
   */
  readonly supportedFormats: ExportFormat[];

  /**
   * 是否正在导出
   */
  readonly isExporting: boolean;

  /**
   * 检查是否支持该格式
   */
  supportsFormat(format: ExportFormat): boolean;

  /**
   * 执行导出
   *
   * @param project - 项目数据
   * @param config - 导出配置
   * @param onProgress - 进度回调（可选）
   * @returns 导出结果
   */
  export(
    project: ProjectData,
    config: ExportConfig,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult>;

  /**
   * 取消当前导出
   */
  cancel(): void;

  /**
   * 释放资源
   */
  dispose(): void;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * 检查是否为视频格式
 */
export function isVideoFormat(format: ExportFormat): format is 'mp4' | 'webm' {
  return format === 'mp4' || format === 'webm';
}

/**
 * 检查是否为图片序列格式
 */
export function isImageSequenceFormat(format: ExportFormat): format is 'png-sequence' | 'jpeg-sequence' | 'webp-sequence' {
  return format === 'png-sequence' || format === 'jpeg-sequence' || format === 'webp-sequence';
}

/**
 * 获取默认比特率
 *
 * H.264 推荐比特率参考：
 * - 720p (1280x720):   低 2.5Mbps / 中 5Mbps / 高 8Mbps
 * - 1080p (1920x1080): 低 4Mbps / 中 8Mbps / 高 12Mbps
 * - 4K (3840x2160):    低 15Mbps / 中 30Mbps / 高 50Mbps
 */
export function getDefaultBitrate(width: number, height: number, quality: QualityPreset): number {
  const pixelCount = width * height;
  // ~4 bpp base for good quality H.264
  // 1080p: 2,073,600 * 4 = 8.3 Mbps (medium)
  const baseBitrate = pixelCount * 4;

  const multiplier = {
    low: 0.5,    // 1080p: ~4 Mbps
    medium: 1.0, // 1080p: ~8 Mbps
    high: 1.5,   // 1080p: ~12 Mbps
  };

  return Math.round(baseBitrate * multiplier[quality]);
}

/**
 * 获取格式的 MIME 类型
 */
export function getMimeType(format: ExportFormat): string {
  switch (format) {
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'gif':
      return 'image/gif';
    case 'png-sequence':
      return 'image/png';
    case 'jpeg-sequence':
      return 'image/jpeg';
    case 'webp-sequence':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

/**
 * 获取格式的文件扩展名
 */
export function getFileExtension(format: ExportFormat): string {
  switch (format) {
    case 'mp4':
      return 'mp4';
    case 'webm':
      return 'webm';
    case 'gif':
      return 'gif';
    case 'png-sequence':
      return 'png';
    case 'jpeg-sequence':
      return 'jpg';
    case 'webp-sequence':
      return 'webp';
    default:
      return 'bin';
  }
}
