/**
 * ExportPixelReader - 导出专用双缓冲异步像素读取器
 *
 * 优化策略：
 * 1. 双缓冲：渲染帧 N+1 时异步读取帧 N
 * 2. PBO (Pixel Buffer Object)：异步 GPU→CPU 传输
 * 3. ImageBitmap：避免 ImageData 拷贝
 * 4. 流水线：隐藏读取延迟
 *
 * 架构：
 * ```
 * Frame N:   [Render] ────────────────────────────→
 * Frame N-1:          [Async Read] ──→ [Available]
 *
 * 双缓冲 PBO：
 * PBO[0]: 写入中 (GPU→PBO)
 * PBO[1]: 读取中 (PBO→CPU)
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
export interface ExportPixelReaderConfig {
  /** 画布宽度 */
  width: number;
  /** 画布高度 */
  height: number;
  /** 输出格式 */
  format: 'jpeg' | 'rgba';
  /** JPEG 质量 (0-1) */
  jpegQuality?: number;
  /** 是否使用 PBO (WebGL2) */
  usePBO?: boolean;
}

/**
 * 缓冲区状态
 */
interface BufferState {
  /** PBO 对象 */
  pbo: WebGLBuffer | null;
  /** 同步对象 (用于异步读取) */
  sync: WebGLSync | null;
  /** 帧索引 */
  frameIndex: number;
  /** 是否正在读取 */
  reading: boolean;
  /** 读取开始时间 */
  startTime: number;
}

// =============================================================================
// ExportPixelReader
// =============================================================================

/**
 * 导出专用双缓冲异步像素读取器
 */
export class ExportPixelReader {
  private _gl: WebGL2RenderingContext | null = null;
  private _canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private _config: ExportPixelReaderConfig;
  private _isInitialized = false;

  // 双缓冲 PBO
  private _buffers: [BufferState, BufferState] = [
    { pbo: null, sync: null, frameIndex: -1, reading: false, startTime: 0 },
    { pbo: null, sync: null, frameIndex: -1, reading: false, startTime: 0 },
  ];
  private _currentBufferIndex = 0;

  // 待处理的读取结果
  private _pendingResults: Map<number, PixelReadResult> = new Map();

  // 性能统计
  private _stats = {
    totalReads: 0,
    totalReadTime: 0,
    pboHits: 0,
    pboMisses: 0,
  };

  // 像素数据大小
  private _pixelDataSize = 0;

  constructor(config: ExportPixelReaderConfig) {
    this._config = {
      usePBO: true,
      jpegQuality: 0.75,
      ...config,
    };
    this._pixelDataSize = config.width * config.height * 4; // RGBA
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * 初始化读取器
   */
  initialize(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement | OffscreenCanvas
  ): void {
    if (this._isInitialized) return;

    this._gl = gl;
    this._canvas = canvas;

    // 创建双缓冲 PBO
    if (this._config.usePBO) {
      this._initPBOs();
    }

    this._isInitialized = true;
    console.log(
      `[ExportPixelReader] Initialized: ${this._config.width}x${this._config.height}, ` +
      `format=${this._config.format}, PBO=${this._config.usePBO}`
    );
  }

  /**
   * 开始异步读取当前帧
   * 调用此方法后，渲染下一帧，然后调用 getResult() 获取结果
   *
   * @param frameIndex 帧索引
   */
  startAsyncRead(frameIndex: number): void {
    if (!this._isInitialized || !this._gl) return;

    const gl = this._gl;
    const buffer = this._buffers[this._currentBufferIndex];

    // 如果上一次读取还未完成，先等待
    if (buffer.reading && buffer.sync) {
      this._waitForSync(buffer);
    }

    // 确保所有 GPU 命令完成
    gl.finish();

    if (this._config.usePBO && buffer.pbo) {
      // 使用 PBO 异步读取
      this._startPBORead(buffer, frameIndex);
    } else {
      // 回退到同步读取
      this._startSyncRead(frameIndex);
    }

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

    let data: Uint8Array;

    if (this._config.format === 'jpeg') {
      data = await this._readAsJpeg();
    } else {
      data = this._readAsRGBA();
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
    const total = this._stats.pboHits + this._stats.pboMisses;
    return {
      totalReads: this._stats.totalReads,
      avgReadTime: this._stats.totalReads > 0
        ? this._stats.totalReadTime / this._stats.totalReads
        : 0,
      pboHitRate: total > 0 ? this._stats.pboHits / total : 0,
    };
  }

  /**
   * 释放资源
   */
  dispose(): void {
    if (!this._isInitialized || !this._gl) return;

    const gl = this._gl;

    // 删除 PBO
    for (const buffer of this._buffers) {
      if (buffer.pbo) {
        gl.deleteBuffer(buffer.pbo);
        buffer.pbo = null;
      }
      if (buffer.sync) {
        gl.deleteSync(buffer.sync);
        buffer.sync = null;
      }
    }

    this._pendingResults.clear();
    this._isInitialized = false;
    this._gl = null;
    this._canvas = null;

    console.log(
      `[ExportPixelReader] Disposed. Stats: ` +
      `reads=${this._stats.totalReads}, ` +
      `avgTime=${(this._stats.totalReadTime / Math.max(1, this._stats.totalReads)).toFixed(1)}ms`
    );
  }

  // ===========================================================================
  // Private Methods - PBO
  // ===========================================================================

  /**
   * 初始化双缓冲 PBO
   */
  private _initPBOs(): void {
    if (!this._gl) return;

    const gl = this._gl;

    for (let i = 0; i < 2; i++) {
      const pbo = gl.createBuffer();
      if (!pbo) {
        console.warn('[ExportPixelReader] Failed to create PBO, falling back to sync read');
        this._config.usePBO = false;
        return;
      }

      // 初始化 PBO 大小
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, this._pixelDataSize, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

      this._buffers[i]!.pbo = pbo;
    }

    console.log(`[ExportPixelReader] PBOs initialized: ${this._pixelDataSize} bytes each`);
  }

  /**
   * 开始 PBO 异步读取
   */
  private _startPBORead(buffer: BufferState, frameIndex: number): void {
    if (!this._gl || !buffer.pbo) return;

    const gl = this._gl;

    // 绑定 PBO 并启动异步读取
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer.pbo);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // 异步读取到 PBO (不阻塞 CPU)
    gl.readPixels(
      0, 0,
      this._config.width, this._config.height,
      gl.RGBA, gl.UNSIGNED_BYTE,
      0 // offset into PBO
    );

    // 创建同步对象用于检测完成
    if (buffer.sync) {
      gl.deleteSync(buffer.sync);
    }
    buffer.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // 更新状态
    buffer.frameIndex = frameIndex;
    buffer.reading = true;
    buffer.startTime = performance.now();
  }

  /**
   * 等待同步对象完成
   */
  private _waitForSync(buffer: BufferState): void {
    if (!this._gl || !buffer.sync) return;

    const gl = this._gl;

    // 等待 GPU 完成 (最多 1 秒)
    const result = gl.clientWaitSync(buffer.sync, gl.SYNC_FLUSH_COMMANDS_BIT, 1000000000);

    if (result === gl.TIMEOUT_EXPIRED) {
      console.warn('[ExportPixelReader] Sync timeout');
    }

    gl.deleteSync(buffer.sync);
    buffer.sync = null;
  }

  /**
   * 完成 PBO 读取
   */
  private async _completeRead(buffer: BufferState): Promise<PixelReadResult> {
    if (!this._gl || !buffer.pbo) {
      // 回退到同步读取
      return this.readSync(buffer.frameIndex);
    }

    const gl = this._gl;

    // 等待 GPU 完成
    if (buffer.sync) {
      this._waitForSync(buffer);
    }

    // 从 PBO 读取数据到 CPU
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer.pbo);

    const pixels = new Uint8Array(this._pixelDataSize);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

    // 更新状态
    buffer.reading = false;
    const readTime = performance.now() - buffer.startTime;

    this._stats.totalReads++;
    this._stats.totalReadTime += readTime;
    this._stats.pboHits++;

    // 转换格式
    let data: Uint8Array;
    if (this._config.format === 'jpeg') {
      data = await this._rgbaToJpeg(pixels);
    } else {
      // Y 轴翻转
      data = this._flipY(pixels);
    }

    return {
      frameIndex: buffer.frameIndex,
      data,
      format: this._config.format,
      readTime,
    };
  }

  // ===========================================================================
  // Private Methods - Sync Read (Fallback)
  // ===========================================================================

  /**
   * 同步读取开始
   */
  private _startSyncRead(frameIndex: number): void {
    const startTime = performance.now();

    // 同步读取并立即存储结果
    if (this._config.format === 'jpeg') {
      this._readAsJpeg().then(data => {
        const readTime = performance.now() - startTime;
        this._stats.totalReads++;
        this._stats.totalReadTime += readTime;
        this._stats.pboMisses++;

        this._pendingResults.set(frameIndex, {
          frameIndex,
          data,
          format: 'jpeg',
          readTime,
        });
      });
    } else {
      const data = this._readAsRGBA();
      const readTime = performance.now() - startTime;
      this._stats.totalReads++;
      this._stats.totalReadTime += readTime;
      this._stats.pboMisses++;

      this._pendingResults.set(frameIndex, {
        frameIndex,
        data,
        format: 'rgba',
        readTime,
      });
    }
  }

  /**
   * 同步读取 RGBA
   */
  private _readAsRGBA(): Uint8Array {
    if (!this._gl) {
      throw new Error('GL context not available');
    }

    const gl = this._gl;

    gl.finish();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const pixels = new Uint8Array(this._pixelDataSize);
    gl.readPixels(
      0, 0,
      this._config.width, this._config.height,
      gl.RGBA, gl.UNSIGNED_BYTE,
      pixels
    );

    // Y 轴翻转
    return this._flipY(pixels);
  }

  /**
   * 读取为 JPEG
   */
  private async _readAsJpeg(): Promise<Uint8Array> {
    if (!this._canvas) {
      throw new Error('Canvas not available');
    }

    if (this._gl) {
      this._gl.finish();
    }

    const blob = this._canvas instanceof OffscreenCanvas
      ? await this._canvas.convertToBlob({
          type: 'image/jpeg',
          quality: this._config.jpegQuality,
        })
      : await new Promise<Blob>((resolve, reject) => {
          (this._canvas as HTMLCanvasElement).toBlob(
            (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
            'image/jpeg',
            this._config.jpegQuality
          );
        });

    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * RGBA 转 JPEG (使用 ImageBitmap + OffscreenCanvas)
   */
  private async _rgbaToJpeg(pixels: Uint8Array): Promise<Uint8Array> {
    const { width, height } = this._config;

    // 创建 ImageData (需要先翻转 Y)
    const flipped = this._flipY(pixels);
    // Create Uint8ClampedArray from the flipped data
    // Note: We need to copy the data to ensure it's a proper ArrayBuffer (not SharedArrayBuffer)
    const clampedData = new Uint8ClampedArray(flipped.length);
    clampedData.set(flipped);
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

  /**
   * Y 轴翻转
   */
  private _flipY(pixels: Uint8Array): Uint8Array {
    const { width, height } = this._config;
    const rowSize = width * 4;
    const result = new Uint8Array(pixels.length);

    for (let y = 0; y < height; y++) {
      const srcOffset = y * rowSize;
      const dstOffset = (height - 1 - y) * rowSize;
      result.set(pixels.subarray(srcOffset, srcOffset + rowSize), dstOffset);
    }

    return result;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * 创建导出像素读取器
 */
export function createExportPixelReader(
  config: ExportPixelReaderConfig
): ExportPixelReader {
  return new ExportPixelReader(config);
}
