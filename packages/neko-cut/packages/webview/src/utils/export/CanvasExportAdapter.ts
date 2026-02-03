/**
 * CanvasExportAdapter - Canvas 2D 导出引擎适配器
 *
 * 处理 GIF 和图片序列导出
 * 基于 Canvas 2D API 和 gif.js / JSZip 库
 */

import type { ProjectData } from '../../types';
import {
  type IExportEngine,
  type ExportFormat,
  type ExportConfig,
  type ExportProgress,
  type ExportProgressCallback,
  type ExportResult,
  type GifExportConfig,
  type ImageSequenceExportConfig,
  isImageSequenceFormat,
} from './IExportEngine';
import {
  exportToGIF,
  exportToImageSequence,
  downloadImageSequenceAsZip,
  type EnhancedExportSettings,
  type ImageSequenceFrame,
} from '../enhancedExport';

// =============================================================================
// CanvasExportAdapter
// =============================================================================

/**
 * Canvas 2D 导出适配器
 *
 * 特点:
 * - 支持 GIF 动画导出 (gif.js)
 * - 支持图片序列导出 (PNG/JPEG/WebP)
 * - 支持 ZIP 打包下载 (JSZip)
 */
export class CanvasExportAdapter implements IExportEngine {
  private _canvas: HTMLCanvasElement | null = null;
  private _isExporting = false;
  private _shouldCancel = false;

  readonly name = 'Canvas2D';
  readonly supportedFormats: ExportFormat[] = ['gif', 'png-sequence', 'jpeg-sequence', 'webp-sequence'];

  // ---------------------------------------------------------------------------
  // IExportEngine Implementation
  // ---------------------------------------------------------------------------

  get isExporting(): boolean {
    return this._isExporting;
  }

  supportsFormat(format: ExportFormat): boolean {
    return this.supportedFormats.includes(format);
  }

  async export(
    project: ProjectData,
    config: ExportConfig,
    onProgress?: ExportProgressCallback
  ): Promise<ExportResult> {
    if (!this.supportsFormat(config.format)) {
      return {
        success: false,
        error: `Format '${config.format}' is not supported by Canvas2D engine. Supported: ${this.supportedFormats.join(', ')}`,
      };
    }

    this._isExporting = true;
    this._shouldCancel = false;

    const startTime = performance.now();

    try {
      // 创建 Canvas
      this._canvas = document.createElement('canvas');
      this._canvas.width = config.width;
      this._canvas.height = config.height;

      let result: ExportResult;

      if (config.format === 'gif') {
        result = await this._exportGif(project, config as GifExportConfig, onProgress, startTime);
      } else if (isImageSequenceFormat(config.format)) {
        result = await this._exportImageSequence(project, config as ImageSequenceExportConfig, onProgress, startTime);
      } else {
        result = { success: false, error: `Unsupported format: ${config.format}` };
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this._reportProgress(onProgress, {
        stage: 'error',
        currentFrame: 0,
        totalFrames: 0,
        percent: 0,
        elapsedTime: performance.now() - startTime,
        estimatedTimeRemaining: 0,
        currentFps: 0,
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    } finally {
      this._cleanup();
      this._isExporting = false;
    }
  }

  cancel(): void {
    this._shouldCancel = true;
  }

  dispose(): void {
    this._cleanup();
  }

  // ---------------------------------------------------------------------------
  // Private Methods - GIF Export
  // ---------------------------------------------------------------------------

  private async _exportGif(
    project: ProjectData,
    config: GifExportConfig,
    onProgress?: ExportProgressCallback,
    startTime?: number
  ): Promise<ExportResult> {
    const start = startTime || performance.now();

    // 转换配置
    const enhancedSettings: EnhancedExportSettings = {
      width: config.width,
      height: config.height,
      fps: config.fps,
      format: 'gif',
      quality: config.quality,
      audioBitrate: 0,
      gifColors: config.colors || 256,
      gifDither: config.dither !== false,
      gifQuality: config.gifQuality || 80,
    };

    // 报告初始化进度
    this._reportProgress(onProgress, {
      stage: 'initializing',
      currentFrame: 0,
      totalFrames: 0,
      percent: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      currentFps: 0,
      message: 'Initializing GIF encoder...',
    });

    // 执行导出
    const blob = await exportToGIF(
      project,
      this._canvas!,
      enhancedSettings,
      (progress, message) => {
        if (this._shouldCancel) {
          throw new Error('Export cancelled');
        }

        const elapsed = performance.now() - start;
        const estimatedRemaining = progress > 0 ? (elapsed / progress) * (1 - progress) : 0;

        this._reportProgress(onProgress, {
          stage: progress < 0.9 ? 'rendering' : 'encoding',
          currentFrame: Math.round(progress * 100),
          totalFrames: 100,
          percent: Math.round(progress * 100),
          elapsedTime: elapsed,
          estimatedTimeRemaining: estimatedRemaining,
          currentFps: 0,
          message,
        });
      }
    );

    const totalTime = performance.now() - start;

    // 报告完成
    this._reportProgress(onProgress, {
      stage: 'completed',
      currentFrame: 100,
      totalFrames: 100,
      percent: 100,
      elapsedTime: totalTime,
      estimatedTimeRemaining: 0,
      currentFps: 0,
      message: 'GIF export completed!',
    });

    return {
      success: true,
      blob,
      fileSize: blob.size,
      totalTime,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Image Sequence Export
  // ---------------------------------------------------------------------------

  private async _exportImageSequence(
    project: ProjectData,
    config: ImageSequenceExportConfig,
    onProgress?: ExportProgressCallback,
    startTime?: number
  ): Promise<ExportResult> {
    const start = startTime || performance.now();

    // 转换配置
    const enhancedSettings: EnhancedExportSettings = {
      width: config.width,
      height: config.height,
      fps: config.fps,
      format: config.format,
      quality: config.quality,
      audioBitrate: 0,
      imageQuality: config.imageQuality || 95,
      frameNumberPadding: config.frameNumberPadding || 5,
    };

    // 报告初始化进度
    this._reportProgress(onProgress, {
      stage: 'initializing',
      currentFrame: 0,
      totalFrames: 0,
      percent: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      currentFps: 0,
      message: 'Initializing image sequence export...',
    });

    // 执行导出
    const frames: ImageSequenceFrame[] = await exportToImageSequence(
      project,
      this._canvas!,
      enhancedSettings,
      (progress, message) => {
        if (this._shouldCancel) {
          throw new Error('Export cancelled');
        }

        const elapsed = performance.now() - start;
        const estimatedRemaining = progress > 0 ? (elapsed / progress) * (1 - progress) : 0;

        this._reportProgress(onProgress, {
          stage: 'rendering',
          currentFrame: Math.round(progress * 100),
          totalFrames: 100,
          percent: Math.round(progress * 80), // 80% for rendering
          elapsedTime: elapsed,
          estimatedTimeRemaining: estimatedRemaining,
          currentFps: 0,
          message,
        });
      }
    );

    // 打包为 ZIP
    this._reportProgress(onProgress, {
      stage: 'muxing',
      currentFrame: 100,
      totalFrames: 100,
      percent: 85,
      elapsedTime: performance.now() - start,
      estimatedTimeRemaining: 5000,
      currentFps: 0,
      message: 'Creating ZIP archive...',
    });

    await downloadImageSequenceAsZip(
      frames,
      project.name || 'export',
      (progress, message) => {
        const elapsed = performance.now() - start;

        this._reportProgress(onProgress, {
          stage: 'muxing',
          currentFrame: 100,
          totalFrames: 100,
          percent: 85 + Math.round(progress * 15),
          elapsedTime: elapsed,
          estimatedTimeRemaining: 1000,
          currentFps: 0,
          message,
        });
      }
    );

    const totalTime = performance.now() - start;

    // 报告完成
    this._reportProgress(onProgress, {
      stage: 'completed',
      currentFrame: 100,
      totalFrames: 100,
      percent: 100,
      elapsedTime: totalTime,
      estimatedTimeRemaining: 0,
      currentFps: 0,
      message: 'Image sequence export completed!',
    });

    // 计算总文件大小
    const totalSize = frames.reduce((sum, frame) => sum + frame.blob.size, 0);

    return {
      success: true,
      blobs: frames.map(f => ({ name: f.filename, blob: f.blob })),
      fileSize: totalSize,
      totalTime,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private _cleanup(): void {
    this._canvas = null;
  }

  private _reportProgress(
    callback: ExportProgressCallback | undefined,
    progress: ExportProgress
  ): void {
    if (callback) {
      callback(progress);
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * 创建 Canvas 导出适配器
 */
export function createCanvasExportAdapter(): CanvasExportAdapter {
  return new CanvasExportAdapter();
}
