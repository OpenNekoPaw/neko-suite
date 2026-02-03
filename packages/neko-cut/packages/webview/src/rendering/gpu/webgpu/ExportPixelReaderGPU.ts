/**
 * ExportPixelReaderGPU - WebGPU 导出专用双缓冲异步像素读取器
 *
 * 优化策略：
 * 1. 双缓冲：渲染帧 N+1 时异步读取帧 N
 * 2. GPUBuffer mapAsync：异步 GPU→CPU 传输
 * 3. ImageBitmap：避免 ImageData 拷贝
 * 4. 流水线：隐藏读取延迟
 *
 * 架构：
 * ```
 * Frame N:   [Render] ────────────────────────────→
 * Frame N-1:          [Async Read] ──→ [Available]
 *
 * 双缓冲 GPUBuffer：
 * Buffer[0]: 写入中 (GPU→Buffer)
 * Buffer[1]: 读取中 (Buffer→CPU)
 * 每帧交换
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * 读取结果
 */
export interface PixelReadResult {
  /** 帧索引 */
  frameIndex: number;
  /** 像素数据 (JPEG 或 RGBA) */
  data: Uint8Array;
  /** 数据格式 */
  format: 'jpeg' | 'rgba';
  /** 读取耗时 (ms) */
  readTime: number;
}

/**
 * 读取器配置
 */
export interface ExportPixelReaderGPUConfig {
  /** 画布宽度 */
  width: number;
  /** 画布高度 */
  height: number;
  /** 输出格式 */
  format: 'jpeg' | 'rgba';
  /** JPEG 质量 (0-1) */
  jpegQuality?: number;
}

/**
 * 缓冲区状态
 */
interface BufferState {
  /** GPU 缓冲区 */
  buffer: GPUBuffer | null;
  /** 帧索引 */
  frameIndex: number;
  /** 是否正在读取 */
  reading: boolean;
  /** 读取开始时间 */
  startTime: number;
  /** 映射 Promise */
  mapPromise: Promise<void> | null;
}

// =============================================================================
// ExportPixelReaderGPU
// =============================================================================

/**
 * WebGPU 导出专用双缓冲异步像素读取器
 */
export class ExportPixelReaderGPU {
  private _device: GPUDevice | null = null;
  private _context: GPUCanvasContext | null = null;
  private _config: ExportPixelReaderGPUConfig;
  private _isInitialized = false;

  // 双缓冲 GPUBuffer
  private _buffers: [BufferState, BufferState] = [
    { buffer: null, frameIndex: -1, reading: false, startTime: 0, mapPromise: null },
    { buffer: null, frameIndex: -1, reading: false, startTime: 0, mapPromise: null },
  ];
  private _currentBufferIndex = 0;

  // 待处理的读取结果
  private _pendingResults: Map<number, PixelReadResult> = new Map();

  // 性能统计
  private _stats = {
    totalReads: 0,
    totalReadTime: 0,
  };

  // 像素数据大小
  private _pixelDataSize = 0;
  private _bytesPerRow = 0;

  constructor(config: ExportPixelReaderGPUConfig) {
    this._config = {
      jpegQuality: 0.75,
      ...config,
    };
    // WebGPU requires 256-byte alignment for buffer copy
    this._bytesPerRow = Math.ceil(config.width * 4 / 256) * 256;
    this._pixelDataSize = this._bytesPerRow * config.height;
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 初始化读取器
   */
  initialize(
    device: GPUDevice,
    canvas: HTMLCanvasElement | OffscreenCanvas
  ): void {
    if (this._isInitialized) return;

    this._device = device;
    this._context = canvas.getContext('webgpu') as GPUCanvasContext | null;

    // 创建双缓冲 GPUBuffer
    this._initBuffers();

    this._isInitialized = true;
    console.log(
      `[ExportPixelReaderGPU] Initialized: ${this._config.width}x${this._config.height}, ` +
      `format=${this._config.format}, bytesPerRow=${this._bytesPerRow}`
    );
  }

  /**
   * 开始异步读取当前帧
   * 调用此方法后，渲染下一帧，然后调用 getResult() 获取结果
   *
   * @param frameIndex 帧索引
   */
  startAsyncRead(frameIndex: number): void {
    if (!this._isInitialized || !this._device || !this._context) return;

    const buffer = this._buffers[this._currentBufferIndex];

    // 如果上一次读取还未完成，跳过（不阻塞）
    if (buffer.reading) {
      console.warn('[ExportPixelReaderGPU] Previous read not complete, skipping');
      return;
    }

    if (!buffer.buffer) return;

    // 获取当前帧的纹理
    const texture = this._context.getCurrentTexture();

    // 创建命令编码器
    const commandEncoder = this._device.createCommandEncoder();

    // 从纹理复制到缓冲区
    commandEncoder.copyTextureToBuffer(
      { texture },
      {
        buffer: buffer.buffer,
        bytesPerRow: this._bytesPerRow,
        rowsPerImage: this._config.height,
      },
      {
        width: this._config.width,
        height: this._config.height,
      }
    );

    // 提交命令
    this._device.queue.submit([commandEncoder.finish()]);

    // 开始异步映射
    buffer.mapPromise = buffer.buffer.mapAsync(GPUMapMode.READ);
    buffer.frameIndex = frameIndex;
    buffer.reading = true;
    buffer.startTime = performance.now();

    // 切换到下一个缓冲区
    this._currentBufferIndex = (this._currentBufferIndex + 1) % 2;
  }

  /**
   * 获取异步读取结果
   * 如果结果尚未准备好，会等待
   *
   * @param frameIndex 帧索引
   * @returns 读取结果，如果不存在返回 null
   */
  async getResult(frameIndex: number): Promise<PixelReadResult | null> {
    // 检查是否已有结果
    const cached = this._pendingResults.get(frameIndex);
    if (cached) {
      this._pendingResults.delete(frameIndex);
      return cached;
    }

    // 查找对应的缓冲区
    for (const buffer of this._buffers) {
      if (buffer.frameIndex === frameIndex && buffer.reading) {
        return this._completeRead(buffer);
      }
    }

    return null;
  }

  /**
   * 同步读取当前帧 (用于最后一帧或回退)
   */
  async readSync(frameIndex: number): Promise<PixelReadResult> {
    const startTime = performance.now();

    if (!this._device || !this._context) {
      throw new Error('Device or context not available');
    }

    // 获取当前帧的纹理
    const texture = this._context.getCurrentTexture();

    // 创建临时缓冲区
    const tempBuffer = this._device.createBuffer({
      size: this._pixelDataSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    // 创建命令编码器
    const commandEncoder = this._device.createCommandEncoder();

    // 从纹理复制到缓冲区
    commandEncoder.copyTextureToBuffer(
      { texture },
      {
        buffer: tempBuffer,
        bytesPerRow: this._bytesPerRow,
        rowsPerImage: this._config.height,
      },
      {
        width: this._config.width,
        height: this._config.height,
      }
    );

    // 提交命令
    this._device.queue.submit([commandEncoder.finish()]);

    // 等待映射完成
    await tempBuffer.mapAsync(GPUMapMode.READ);

    // 读取数据
    const mappedRange = tempBuffer.getMappedRange();
    const pixels = this._extractPixels(new Uint8Array(mappedRange));

    tempBuffer.unmap();
    tempBuffer.destroy();

    // 转换格式
    let data: Uint8Array;
    if (this._config.format === 'jpeg') {
      data = await this._rgbaToJpeg(pixels);
    } else {
      data = pixels;
    }

    const readTime = performance.now() - startTime;
    this._stats.totalReads++;
    this._stats.totalReadTime += readTime;

    return {
      frameIndex,
      data,
      format: this._config.format,
      readTime,
    };
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalReads: number;
    avgReadTime: number;
    pboHitRate: number;
  } {
    return {
      totalReads: this._stats.totalReads,
      avgReadTime: this._stats.totalReads > 0
        ? this._stats.totalReadTime / this._stats.totalReads
        : 0,
      pboHitRate: 1.0, // WebGPU always uses async
    };
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (!this._isInitialized) return;

    // 删除缓冲区
    for (const buffer of this._buffers) {
      if (buffer.buffer) {
        buffer.buffer.destroy();
        buffer.buffer = null;
      }
    }

    this._pendingResults.clear();
    this._isInitialized = false;
    this._device = null;
    this._context = null;

    console.log(
      `[ExportPixelReaderGPU] Disposed. Stats: ` +
      `reads=${this._stats.totalReads}, ` +
      `avgTime=${(this._stats.totalReadTime / Math.max(1, this._stats.totalReads)).toFixed(1)}ms`
    );
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * 初始化双缓冲 GPUBuffer
   */
  private _initBuffers(): void {
    if (!this._device) return;

    for (let i = 0; i < 2; i++) {
      const buffer = this._device.createBuffer({
        size: this._pixelDataSize,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });

      this._buffers[i]!.buffer = buffer;
    }

    console.log(`[ExportPixelReaderGPU] Buffers initialized: ${this._pixelDataSize} bytes each`);
  }

  /**
   * 完成异步读取
   */
  private async _completeRead(buffer: BufferState): Promise<PixelReadResult> {
    if (!buffer.buffer || !buffer.mapPromise) {
      throw new Error('Buffer not available');
    }

    // 等待映射完成
    await buffer.mapPromise;

    // 读取数据
    const mappedRange = buffer.buffer.getMappedRange();
    const pixels = this._extractPixels(new Uint8Array(mappedRange));

    buffer.buffer.unmap();

    // 更新状态
    buffer.reading = false;
    buffer.mapPromise = null;
    const readTime = performance.now() - buffer.startTime;

    this._stats.totalReads++;
    this._stats.totalReadTime += readTime;

    // 转换格式
    let data: Uint8Array;
    if (this._config.format === 'jpeg') {
      data = await this._rgbaToJpeg(pixels);
    } else {
      data = pixels;
    }

    return {
      frameIndex: buffer.frameIndex,
      data,
      format: this._config.format,
      readTime,
    };
  }

  /**
   * 从带对齐的缓冲区提取像素数据
   */
  private _extractPixels(alignedData: Uint8Array): Uint8Array {
    const { width, height } = this._config;
    const actualBytesPerRow = width * 4;

    // 如果没有对齐填充，直接返回
    if (this._bytesPerRow === actualBytesPerRow) {
      return new Uint8Array(alignedData);
    }

    // 去除对齐填充
    const result = new Uint8Array(actualBytesPerRow * height);
    for (let y = 0; y < height; y++) {
      const srcOffset = y * this._bytesPerRow;
      const dstOffset = y * actualBytesPerRow;
      result.set(alignedData.subarray(srcOffset, srcOffset + actualBytesPerRow), dstOffset);
    }

    return result;
  }

  /**
   * RGBA 转 JPEG (使用 ImageBitmap + OffscreenCanvas)
   */
  private async _rgbaToJpeg(pixels: Uint8Array): Promise<Uint8Array> {
    const { width, height } = this._config;

    // 创建 ImageData
    const clampedData = new Uint8ClampedArray(pixels.length);
    clampedData.set(pixels);
    const imageData = new ImageData(clampedData, width, height);

    // 使用 ImageBitmap 进行高效转换
    const bitmap = await createImageBitmap(imageData);

    // 使用 OffscreenCanvas 编码为 JPEG
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2d context');
    }

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const blob = await offscreen.convertToBlob({
      type: 'image/jpeg',
      quality: this._config.jpegQuality,
    });

    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * 创建 WebGPU 导出像素读取器
 */
export function createExportPixelReaderGPU(
  config: ExportPixelReaderGPUConfig
): ExportPixelReaderGPU {
  return new ExportPixelReaderGPU(config);
}
