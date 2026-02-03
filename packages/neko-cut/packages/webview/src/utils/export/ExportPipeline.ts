/**
 * ExportPipeline - 高性能导出流水线
 *
 * 实现渲染与编码的真正并行，通过双缓冲 OffscreenCanvas 交替渲染，
 * 解耦渲染和编码阶段，实现流水线重叠执行。
 *
 * 架构：
 * ```
 * Frame N:   [Render to Canvas A] → [Create VideoFrame] → [Queue]
 * Frame N+1: [Render to Canvas B] → [Create VideoFrame] → [Queue]
 *                                                              ↓
 *                                                    [Encoder consumes]
 *
 * 双 OffscreenCanvas 交替渲染：
 * - 当 Engine A 渲染 Frame N 时，Encoder 可以编码 Frame N-1
 * - 当 Engine B 渲染 Frame N+1 时，Engine A 的 Frame N 已入队
 * ```
 *
 * 性能优化：
 * - 零拷贝 VideoFrame：直接从 Canvas 创建，无需像素读回
 * - 生产者-消费者模式：渲染和编码真正并行
 * - 背压控制：队列满时等待，防止内存溢出
 * - 共享 FrameProvider：避免多引擎重复解码
 */

import type { ProjectData } from '../../types';
import { createGPURenderEngine, type GPURenderEngine } from '../../rendering/gpu';
import {
  createWebviewMediaFrameProvider,
  type WebviewMediaFrameProvider,
} from '../../rendering/unified/mediaFrameProvider';

// =============================================================================
// Types
// =============================================================================

/**
 * 流水线配置
 */
export interface ExportPipelineConfig {
  /** 导出宽度 */
  width: number;
  /** 导出高度 */
  height: number;
  /** 帧率 */
  fps: number;
  /** 总帧数 */
  totalFrames: number;
  /** 最大同时处理的帧数（队列容量），默认 4 */
  maxInflightFrames?: number;
  /** URL 解析器 */
  urlResolver?: (path: string) => Promise<string>;
}

/**
 * 帧数据
 */
export interface FrameData {
  /** 帧索引 */
  frameIndex: number;
  /** 时间戳（微秒） */
  timestamp: number;
  /** VideoFrame 对象 */
  videoFrame: VideoFrame;
}

/**
 * 流水线统计
 */
export interface PipelineStats {
  /** 已渲染帧数 */
  renderedFrames: number;
  /** 已编码帧数 */
  encodedFrames: number;
  /** 当前队列长度 */
  queueLength: number;
  /** 平均渲染时间 (ms) - 包含解码+合成 */
  avgRenderTime: number;
  /** 平均队列等待时间 (ms) */
  avgWaitTime: number;
  /** 平均解码时间 (ms) - 从 GPURenderEngine 获取 */
  avgDecodeTime: number;
  /** 平均合成时间 (ms) - GPU 合成时间 */
  avgCompositeTime: number;
}

// =============================================================================
// ExportPipeline
// =============================================================================

/**
 * 高性能导出流水线
 *
 * 使用双缓冲渲染引擎实现渲染与编码的真正并行
 */
export class ExportPipeline {
  private _config: ExportPipelineConfig;

  // 双缓冲渲染引擎
  private _engines: [GPURenderEngine, GPURenderEngine] | null = null;
  private _canvases: [OffscreenCanvas, OffscreenCanvas] | null = null;
  private _currentEngineIndex = 0;

  // 共享的帧提供器
  private _frameProvider: WebviewMediaFrameProvider | null = null;

  // 帧队列（已渲染待编码）
  private _frameQueue: FrameData[] = [];
  private _maxQueueSize: number;

  // 状态控制
  private _renderComplete = false;
  private _disposed = false;
  private _initialized = false;

  // 等待通知机制
  private _capacityWaiters: Array<() => void> = [];
  private _frameWaiters: Array<() => void> = [];

  // 性能统计
  private _stats = {
    renderedFrames: 0,
    totalRenderTime: 0,
    totalWaitTime: 0,
    totalDecodeTime: 0,
    totalCompositeTime: 0,
  };

  constructor(config: ExportPipelineConfig) {
    this._config = config;
    this._maxQueueSize = config.maxInflightFrames ?? 4;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * 初始化流水线
   * 创建双 OffscreenCanvas 和双 GPURenderEngine，共享 FrameProvider
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    const { width, height, urlResolver } = this._config;

    // 创建双 OffscreenCanvas
    this._canvases = [
      new OffscreenCanvas(width, height),
      new OffscreenCanvas(width, height),
    ];

    // 创建共享的 MediaFrameProvider
    this._frameProvider = createWebviewMediaFrameProvider({
      maxDecoderInstances: 6,
      urlResolver,
    });

    // 创建双 GPURenderEngine
    this._engines = [
      createGPURenderEngine(),
      createGPURenderEngine(),
    ];

    // 初始化两个引擎并共享 FrameProvider
    await this._engines[0].initialize(this._canvases[0]);
    await this._engines[1].initialize(this._canvases[1]);

    // 设置共享的 FrameProvider
    this._engines[0].setFrameProvider(this._frameProvider);
    this._engines[1].setFrameProvider(this._frameProvider);

    this._initialized = true;

    console.log(
      `[ExportPipeline] Initialized: ${width}x${height}, ` +
      `maxQueueSize=${this._maxQueueSize}, dual-engine mode`
    );
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    // 关闭队列中未消费的 VideoFrame
    for (const frame of this._frameQueue) {
      try {
        frame.videoFrame.close();
      } catch {
        // Ignore errors during disposal
      }
    }
    this._frameQueue = [];

    // 释放渲染引擎
    this._engines?.[0].dispose();
    this._engines?.[1].dispose();
    this._engines = null;
    this._canvases = null;

    // 释放帧提供器
    this._frameProvider?.dispose();
    this._frameProvider = null;

    // 清空等待队列
    this._capacityWaiters = [];
    this._frameWaiters = [];

    console.log(
      `[ExportPipeline] Disposed. Stats: ` +
      `rendered=${this._stats.renderedFrames}, ` +
      `avgRender=${(this._stats.totalRenderTime / Math.max(1, this._stats.renderedFrames)).toFixed(1)}ms`
    );
  }

  // ===========================================================================
  // Producer API (渲染侧)
  // ===========================================================================

  /**
   * 渲染下一帧
   * 使用当前引擎渲染，创建 VideoFrame 并入队，然后切换到另一个引擎
   *
   * @param project 项目数据
   * @param frameIndex 帧索引
   */
  async renderNextFrame(project: ProjectData, frameIndex: number): Promise<void> {
    if (!this._initialized || !this._engines) {
      throw new Error('[ExportPipeline] Not initialized');
    }

    if (this._disposed) {
      throw new Error('[ExportPipeline] Already disposed');
    }

    const { fps } = this._config;
    const time = frameIndex / fps;
    const timestamp = Math.round((frameIndex / fps) * 1_000_000); // 微秒

    const renderStart = performance.now();

    // 选择当前引擎
    const engine = this._engines[this._currentEngineIndex];

    // 渲染帧
    await engine.renderProjectFrame(project, time, 'export', 'final');

    // 获取引擎的性能统计
    const frameStats = engine.lastFrameStats;

    // 从 canvas 创建 VideoFrame（零拷贝）
    let videoFrame: VideoFrame;
    try {
      videoFrame = engine.toVideoFrame(timestamp);
    } catch (error) {
      console.error('[ExportPipeline] Failed to create VideoFrame', {
        frameIndex,
        timestamp,
        engineIndex: this._currentEngineIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const renderTime = performance.now() - renderStart;
    this._stats.renderedFrames++;
    this._stats.totalRenderTime += renderTime;
    this._stats.totalDecodeTime += frameStats.decodeTime;
    this._stats.totalCompositeTime += frameStats.compositeTime;

    // 入队
    this._frameQueue.push({ frameIndex, timestamp, videoFrame });

    // 切换到另一个引擎（双缓冲交替）
    this._currentEngineIndex = (this._currentEngineIndex + 1) % 2;

    // 通知等待帧的消费者
    this._notifyFrameWaiters();
  }

  /**
   * 等待队列有空间
   * 当队列满时阻塞，直到消费者消费帧腾出空间
   */
  async waitForCapacity(): Promise<void> {
    if (this._disposed) return;
    if (this._frameQueue.length < this._maxQueueSize) return;

    const waitStart = performance.now();

    return new Promise<void>(resolve => {
      this._capacityWaiters.push(() => {
        this._stats.totalWaitTime += performance.now() - waitStart;
        resolve();
      });
    });
  }

  /**
   * 标记渲染完成
   * 通知所有等待帧的消费者，渲染已结束
   */
  markRenderComplete(): void {
    this._renderComplete = true;

    // 唤醒所有等待帧的消费者
    for (const waiter of this._frameWaiters) {
      waiter();
    }
    this._frameWaiters = [];
  }

  // ===========================================================================
  // Consumer API (编码侧)
  // ===========================================================================

  /**
   * 获取下一个待编码的帧
   * 如果队列为空但渲染未完成，则等待
   *
   * @returns 帧数据，如果渲染完成且队列为空则返回 null
   */
  async getNextFrame(): Promise<FrameData | null> {
    if (this._disposed) return null;

    // 队列有帧，直接返回
    if (this._frameQueue.length > 0) {
      const frame = this._frameQueue.shift()!;
      this._notifyCapacityWaiters();
      return frame;
    }

    // 渲染已完成且队列为空，返回 null 表示结束
    if (this._renderComplete) {
      return null;
    }

    // 等待新帧入队
    return new Promise<FrameData | null>(resolve => {
      this._frameWaiters.push(() => {
        if (this._frameQueue.length > 0) {
          const frame = this._frameQueue.shift()!;
          this._notifyCapacityWaiters();
          resolve(frame);
        } else {
          // 渲染完成且队列为空
          resolve(null);
        }
      });
    });
  }

  /**
   * 尝试获取帧（非阻塞）
   * 如果队列为空，立即返回 null，不等待
   */
  tryGetNextFrame(): FrameData | null {
    if (this._disposed || this._frameQueue.length === 0) {
      return null;
    }

    const frame = this._frameQueue.shift()!;
    this._notifyCapacityWaiters();
    return frame;
  }

  // ===========================================================================
  // Status API
  // ===========================================================================

  /**
   * 检查队列是否有帧可用
   */
  hasFramesAvailable(): boolean {
    return this._frameQueue.length > 0;
  }

  /**
   * 检查渲染是否完成
   */
  isRenderComplete(): boolean {
    return this._renderComplete;
  }

  /**
   * 检查是否所有帧都已处理完成
   */
  isComplete(): boolean {
    return this._renderComplete && this._frameQueue.length === 0;
  }

  /**
   * 获取当前队列长度
   */
  get queueLength(): number {
    return this._frameQueue.length;
  }

  /**
   * 获取统计信息
   */
  getStats(): PipelineStats {
    return {
      renderedFrames: this._stats.renderedFrames,
      encodedFrames: this._stats.renderedFrames - this._frameQueue.length,
      queueLength: this._frameQueue.length,
      avgRenderTime: this._stats.renderedFrames > 0
        ? this._stats.totalRenderTime / this._stats.renderedFrames
        : 0,
      avgWaitTime: this._stats.renderedFrames > 0
        ? this._stats.totalWaitTime / this._stats.renderedFrames
        : 0,
      avgDecodeTime: this._stats.renderedFrames > 0
        ? this._stats.totalDecodeTime / this._stats.renderedFrames
        : 0,
      avgCompositeTime: this._stats.renderedFrames > 0
        ? this._stats.totalCompositeTime / this._stats.renderedFrames
        : 0,
    };
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * 通知等待容量的生产者
   */
  private _notifyCapacityWaiters(): void {
    if (this._frameQueue.length < this._maxQueueSize && this._capacityWaiters.length > 0) {
      const waiter = this._capacityWaiters.shift()!;
      waiter();
    }
  }

  /**
   * 通知等待帧的消费者
   */
  private _notifyFrameWaiters(): void {
    if (this._frameWaiters.length > 0) {
      const waiter = this._frameWaiters.shift()!;
      waiter();
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * 创建导出流水线
 */
export function createExportPipeline(config: ExportPipelineConfig): ExportPipeline {
  return new ExportPipeline(config);
}
