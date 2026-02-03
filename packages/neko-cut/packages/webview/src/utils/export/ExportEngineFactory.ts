/**
 * ExportEngineFactory - 导出引擎工厂
 *
 * 遵循工厂模式和开闭原则，根据导出格式选择合适的导出引擎
 *
 * 导出引擎选择：
 * - 视频格式 (mp4/webm)：CompatibleExportAdapter（Extension 端，FFmpeg 全流程 via NAPI）
 * - GIF/图片序列：CanvasExportAdapter
 */

import {
  type IExportEngine,
  type ExportFormat,
  isVideoFormat,
  isImageSequenceFormat,
} from './IExportEngine';
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
export type ExportEngineType = 'compatible' | 'canvas';

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
 * - 根据格式自动选择合适的导出引擎
 * - 提供引擎能力查询
 * - 管理引擎生命周期
 *
 * 选择策略:
 * - 视频格式 → CompatibleExportAdapter (Extension FFmpeg via NAPI)
 * - GIF/图片序列 → CanvasExportAdapter
 */
export class ExportEngineFactory {
  private static _engines: Map<ExportEngineType, IExportEngine> = new Map();

  // ---------------------------------------------------------------------------
  // 公共静态方法
  // ---------------------------------------------------------------------------

  /**
   * 获取指定格式的导出引擎
   *
   * 选择策略:
   * - 视频格式 → CompatibleExportAdapter (Extension FFmpeg via NAPI)
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

    // Compatible 引擎 (via NAPI)
    const compatibleAvailable = isCompatibleExportAvailable();
    capabilities.push({
      name: 'Compatible (Extension FFmpeg via NAPI)',
      type: 'compatible',
      supportedFormats: ['mp4', 'webm'],
      gpuAccelerated: true, // wgpu acceleration
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
      return isCompatibleExportAvailable();
    }
    return true;
  }

  /**
   * 获取格式不支持的原因
   */
  static getUnsupportedReason(format: ExportFormat): string | null {
    if ((format === 'mp4' || format === 'webm') && !isCompatibleExportAvailable()) {
      return 'Compatible export is not available. Extension Host may not be ready.';
    }
    return null;
  }

  /**
   * 获取推荐的导出格式
   */
  static getRecommendedFormats(): ExportFormat[] {
    const formats: ExportFormat[] = [];

    if (isCompatibleExportAvailable()) {
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
      if (isCompatibleExportAvailable()) {
        return 'compatible';
      }
      throw new Error(
        '视频导出不可用：Extension Host 未就绪。\n' +
        '请尝试重新加载窗口。'
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
