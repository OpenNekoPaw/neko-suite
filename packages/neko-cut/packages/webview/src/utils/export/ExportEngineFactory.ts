/**
 * ExportEngineFactory - 导出引擎工厂
 *
 * 遵循工厂模式和开闭原则，根据导出格式和运行模式选择合适的导出引擎
 *
 * 导出引擎选择：
 * - 基础模式 (basic)：WebviewExportAdapter（纯 Web 端，WebCodecs + GPURender + Muxer）
 * - 兼容模式 (compatible)：CompatibleExportAdapter（纯 Extension 端，FFmpeg 全流程）
 * - GIF/图片序列：CanvasExportAdapter
 */

import {
  type IExportEngine,
  type ExportFormat,
  isVideoFormat,
  isImageSequenceFormat,
} from './IExportEngine';
import {
  createWebviewExportAdapter,
  isWebviewExportAvailable,
  type RenderEngineFactory,
} from './WebviewExportAdapter';
import {
  createCompatibleExportAdapter,
  isCompatibleExportAvailable,
} from './CompatibleExportAdapter';
import { createCanvasExportAdapter } from './CanvasExportAdapter';

// =============================================================================
// Types
// =============================================================================

/**
 * 导出引擎类型
 */
export type ExportEngineType = 'webview' | 'compatible' | 'canvas';

/**
 * 引擎能力信息
 */
export interface EngineCapabilities {
  /** 引擎名称 */
  name: string;
  /** 引擎类型 */
  type: ExportEngineType;
  /** 支持的格式 */
  supportedFormats: ExportFormat[];
  /** 是否支持 GPU 加速 */
  gpuAccelerated: boolean;
  /** 是否可用 */
  available: boolean;
  /** 不可用原因 */
  unavailableReason?: string;
}

// =============================================================================
// ExportEngineFactory
// =============================================================================

/**
 * 导出引擎工厂
 *
 * 职责:
 * - 根据模式和格式自动选择合适的导出引擎
 * - 提供引擎能力查询
 * - 管理引擎生命周期
 *
 * 选择策略:
 * - basic 模式 → WebviewExportAdapter (纯 Web)
 * - compatible 模式 → CompatibleExportAdapter (纯 Extension)
 * - GIF/图片序列 → CanvasExportAdapter
 */
export class ExportEngineFactory {
  private static _engines: Map<ExportEngineType, IExportEngine> = new Map();
  private static _webviewRenderEngineFactory: RenderEngineFactory | null = null;
  private static _useCompatibleMode = false;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Set render engine factory for pure Webview export (basic mode)
   */
  static setWebviewRenderEngineFactory(factory: RenderEngineFactory): void {
    this._webviewRenderEngineFactory = factory;
  }

  /**
   * Set whether to use compatible mode (Extension-side export)
   * When true, uses CompatibleExportAdapter for video formats
   */
  static setUseCompatibleMode(useCompatible: boolean): void {
    this._useCompatibleMode = useCompatible;
    // Clear cached engines when mode changes
    this._engines.clear();
  }

  // ---------------------------------------------------------------------------
  // 公共静态方法
  // ---------------------------------------------------------------------------

  /**
   * 获取指定格式的导出引擎
   *
   * 选择策略:
   * - compatible 模式 → CompatibleExportAdapter (纯 Extension)
   * - basic 模式 → WebviewExportAdapter (纯 Web)
   * - GIF/图片序列 → Canvas2D
   */
  static getEngine(format: ExportFormat): IExportEngine {
    const engineType = this._selectEngineType(format);
    return this._getOrCreateEngine(engineType);
  }

  /**
   * 创建新的导出引擎实例（非缓存）
   */
  static createEngine(format: ExportFormat): IExportEngine {
    const engineType = this._selectEngineType(format);
    return this._createEngine(engineType);
  }

  /**
   * 获取所有引擎的能力信息
   */
  static getCapabilities(): EngineCapabilities[] {
    const capabilities: EngineCapabilities[] = [];

    // Pure Webview 引擎 (basic mode)
    const webviewAvailable = isWebviewExportAvailable();
    capabilities.push({
      name: 'Pure Webview (WebCodecs + GPU)',
      type: 'webview',
      supportedFormats: ['mp4', 'webm'],
      gpuAccelerated: true,
      available: webviewAvailable,
      unavailableReason: webviewAvailable ? undefined : 'WebCodecs or GPU not available',
    });

    // Compatible 引擎 (compatible mode)
    const compatibleAvailable = isCompatibleExportAvailable();
    capabilities.push({
      name: 'Compatible (Extension FFmpeg)',
      type: 'compatible',
      supportedFormats: ['mp4', 'webm'],
      gpuAccelerated: false,
      available: compatibleAvailable,
      unavailableReason: compatibleAvailable ? undefined : 'VSCode API not available',
    });

    // Canvas 引擎
    capabilities.push({
      name: 'Canvas2D',
      type: 'canvas',
      supportedFormats: ['gif', 'png-sequence', 'jpeg-sequence', 'webp-sequence'],
      gpuAccelerated: false,
      available: true,
    });

    return capabilities;
  }

  /**
   * 检查格式是否支持
   */
  static isFormatSupported(format: ExportFormat): boolean {
    if (format === 'mp4' || format === 'webm') {
      return isWebviewExportAvailable() || isCompatibleExportAvailable();
    }
    return true;
  }

  /**
   * 获取格式不支持的原因
   */
  static getUnsupportedReason(format: ExportFormat): string | null {
    if ((format === 'mp4' || format === 'webm') && !isWebviewExportAvailable() && !isCompatibleExportAvailable()) {
      return 'Neither Webview export nor Compatible export is available.';
    }
    return null;
  }

  /**
   * 获取推荐的导出格式
   */
  static getRecommendedFormats(): ExportFormat[] {
    const formats: ExportFormat[] = [];

    if (isWebviewExportAvailable() || isCompatibleExportAvailable()) {
      formats.push('mp4', 'webm');
    }

    formats.push('gif', 'png-sequence', 'jpeg-sequence', 'webp-sequence');
    return formats;
  }

  /**
   * 释放所有缓存的引擎
   */
  static disposeAll(): void {
    for (const engine of this._engines.values()) {
      engine.dispose();
    }
    this._engines.clear();
  }

  // ---------------------------------------------------------------------------
  // 私有静态方法
  // ---------------------------------------------------------------------------

  private static _selectEngineType(format: ExportFormat): ExportEngineType {
    if (isVideoFormat(format)) {
      // Compatible mode: use Extension FFmpeg
      if (this._useCompatibleMode && isCompatibleExportAvailable()) {
        return 'compatible';
      }
      // Basic mode: use Webview WebCodecs
      // NOTE: Basic mode does NOT fallback to compatible mode - they are independent
      if (!this._useCompatibleMode) {
        if (isWebviewExportAvailable()) {
          return 'webview';
        }
        // Do NOT fallback to compatible mode in basic mode
        throw new Error(
          '基础模式导出不可用：WebCodecs API 不支持。\n' +
          '请切换到兼容模式导出（设置 → 媒体引擎模式 → 兼容模式）'
        );
      }
      // Compatible mode requested but not available
      throw new Error(
        '兼容模式导出不可用：Extension Host 未就绪。\n' +
        '请尝试重新加载窗口或切换到基础模式。'
      );
    }

    if (format === 'gif' || isImageSequenceFormat(format)) {
      return 'canvas';
    }

    throw new Error(`Unknown format: ${format}`);
  }

  private static _getOrCreateEngine(type: ExportEngineType): IExportEngine {
    let engine = this._engines.get(type);
    if (!engine) {
      engine = this._createEngine(type);
      this._engines.set(type, engine);
    }
    return engine;
  }

  private static _createEngine(type: ExportEngineType): IExportEngine {
    switch (type) {
      case 'webview': {
        const adapter = createWebviewExportAdapter();
        if (this._webviewRenderEngineFactory) {
          adapter.setRenderEngineFactory(this._webviewRenderEngineFactory);
        }
        return adapter;
      }
      case 'compatible': {
        return createCompatibleExportAdapter();
      }
      case 'canvas':
        return createCanvasExportAdapter();
      default:
        throw new Error(`Unknown engine type: ${type}`);
    }
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * 获取导出引擎
 */
export function getExportEngine(format: ExportFormat): IExportEngine {
  return ExportEngineFactory.getEngine(format);
}

/**
 * 创建导出引擎
 */
export function createExportEngine(format: ExportFormat): IExportEngine {
  return ExportEngineFactory.createEngine(format);
}

/**
 * 检查格式是否支持
 */
export function isExportFormatSupported(format: ExportFormat): boolean {
  return ExportEngineFactory.isFormatSupported(format);
}

/**
 * 获取格式不支持的原因
 */
export function getExportUnsupportedReason(format: ExportFormat): string | null {
  return ExportEngineFactory.getUnsupportedReason(format);
}

/**
 * 释放所有导出引擎
 */
export function disposeAllExportEngines(): void {
  ExportEngineFactory.disposeAll();
}
