/**
 * WebGPUCompositor - WebGPU 合成器
 * WebGPU Compositor implementing ICompositor interface
 *
 * 功能:
 * - 完整的 WebGPU 渲染管线
 * - 纹理管理和更新
 * - 24种混合模式
 * - 颜色校正效果
 * - 变换矩阵支持
 */

/// <reference path="./webgpu.d.ts" />

import type {
  ICompositor,
  CompositorBackend,
  CompositorOptions,
  TextureSource,
  RawTextureSource,
  ITexture,
  ILayer,
} from '../ICompositor';
import type { GPUTransitionType, TransitionRenderParams } from '../types';
import { GPU_TRANSITION_TYPE_MAP } from '../types';
import {
  basicShader,
  colorCorrectionShader,
  transitionShader,
  externalTextureShader,
  externalTextureColorCorrectionShader,
} from './shaders';
import { TexturePool, createTexturePool } from './TexturePool';

// =============================================================================
// Types
// =============================================================================

interface WebGPUTextureInfo extends ITexture {
  readonly native: GPUTexture;
  readonly view: GPUTextureView;
}

interface RenderPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
}

// =============================================================================
// WebGPUCompositor Implementation
// =============================================================================

/**
 * WebGPU 合成器
 */
export class WebGPUCompositor implements ICompositor {
  private _device: GPUDevice | null = null;
  private _context: GPUCanvasContext | null = null;
  private _canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private _isInitialized = false;
  private _width = 0;
  private _height = 0;
  private _textureIdCounter = 0;
  private _canvasFormat: GPUTextureFormat = 'rgba8unorm';

  // Render pipelines (for composite texture - rgba8unorm)
  private _basicPipeline: RenderPipeline | null = null;
  private _colorCorrectionPipeline: RenderPipeline | null = null;
  // Blit pipeline (for canvas output - uses _canvasFormat)
  private _blitPipeline: RenderPipeline | null = null;
  // Transition pipeline (for GPU-accelerated transitions)
  private _transitionPipeline: RenderPipeline | null = null;

  // External texture pipelines (for VideoFrame zero-copy during playback)
  private _externalTexturePipeline: RenderPipeline | null = null;
  private _externalTextureCCPipeline: RenderPipeline | null = null;

  // Shared resources
  private _sampler: GPUSampler | null = null;
  private _vertexBuffer: GPUBuffer | null = null;
  private _indexBuffer: GPUBuffer | null = null;

  // Frame state
  private _commandEncoder: GPUCommandEncoder | null = null;
  private _currentTexture: GPUTexture | null = null;
  private _currentTextureView: GPUTextureView | null = null;

  // Offscreen render target for compositing
  private _compositeTexture: GPUTexture | null = null;
  private _compositeTextureView: GPUTextureView | null = null;

  // Texture pool for intermediate textures (reduces allocation overhead)
  private _texturePool: TexturePool | null = null;

  // Frame texture pool for video frames (separate from intermediate textures)
  // Higher capacity and optimized for video frame dimensions
  private _frameTexturePool: TexturePool | null = null;

  // Buffer pool for transform uniforms (avoid per-frame allocation)
  private _transformBufferPool: GPUBuffer[] = [];
  private _transformBufferPoolIndex = 0;
  private readonly _maxTransformBuffers = 32;

  // Buffer pool for color correction uniforms
  private _ccBufferPool: GPUBuffer[] = [];
  private _ccBufferPoolIndex = 0;
  private readonly _maxCCBuffers = 16;

  // Pre-allocated blit transform buffer (identity matrix, never changes)
  private _blitTransformBuffer: GPUBuffer | null = null;

  // Buffer pool for transition uniforms (48 bytes each)
  private _transitionBufferPool: GPUBuffer[] = [];
  private _transitionBufferPoolIndex = 0;
  private readonly _maxTransitionBuffers = 8;

  // BindGroup cache for drawLayer (avoids per-frame BindGroup creation)
  // Key format: `${textureId}_${pipelineType}_${transformBufferIndex}_${ccBufferIndex}`
  private _bindGroupCache: Map<string, { bindGroup: GPUBindGroup; lastUsed: number }> = new Map();
  private readonly _maxBindGroupCacheSize = 128;

  // Cached blit BindGroup (only needs recreation on resize)
  private _blitBindGroup: GPUBindGroup | null = null;

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Properties
  // ---------------------------------------------------------------------------

  get backend(): CompositorBackend {
    return 'webgpu';
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  get nativeContext(): WebGL2RenderingContext | null {
    // WebGPU doesn't use WebGL context
    return null;
  }

  get gpuDevice(): GPUDevice | null {
    return this._device;
  }

  get canvas(): HTMLCanvasElement | OffscreenCanvas | null {
    return this._canvas;
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Lifecycle
  // ---------------------------------------------------------------------------

  async initialize(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: CompositorOptions
  ): Promise<boolean> {
    if (this._isInitialized) {
      console.warn('[WebGPUCompositor] Already initialized');
      return true;
    }

    try {
      // Request GPU adapter
      const adapter = await navigator.gpu?.requestAdapter({
        powerPreference:
          options?.powerPreference === 'low-power' ? 'low-power' : 'high-performance',
      });

      if (!adapter) {
        console.error('[WebGPUCompositor] Failed to get GPU adapter');
        return false;
      }

      // Request device
      this._device = await adapter.requestDevice();
      if (!this._device) {
        console.error('[WebGPUCompositor] Failed to get GPU device');
        return false;
      }

      // Get canvas context
      this._context = canvas.getContext('webgpu') as GPUCanvasContext | null;
      if (!this._context) {
        console.error('[WebGPUCompositor] Failed to get WebGPU context');
        return false;
      }

      // Configure context
      this._canvasFormat = navigator.gpu.getPreferredCanvasFormat();
      this._context.configure({
        device: this._device,
        format: this._canvasFormat,
        alphaMode: options?.alpha ? 'premultiplied' : 'opaque',
        // CRITICAL FIX: Add CopySrc usage for export pixel reading
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });

      this._canvas = canvas;
      this._width = canvas.width;
      this._height = canvas.height;

      // Create shared resources
      this._createSharedResources();

      // Create render pipelines
      await this._createPipelines();

      // Create composite render target
      this._createCompositeTarget();

      // Create texture pool for intermediate textures
      this._texturePool = createTexturePool(this._device, {
        maxSize: 16, // Keep up to 16 textures in pool
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });

      // Create frame texture pool for video frames (higher capacity)
      // Supports 5 tracks @ 30fps with some headroom: ~64 textures
      this._frameTexturePool = createTexturePool(this._device, {
        maxSize: 64, // Pool size for video frame textures
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });

      this._isInitialized = true;

      return true;
    } catch (error) {
      console.error('[WebGPUCompositor] Initialization failed:', error);
      this.dispose();
      return false;
    }
  }

  dispose(): void {
    // Dispose frame texture pool
    if (this._frameTexturePool) {
      this._frameTexturePool.dispose();
      this._frameTexturePool = null;
    }

    // Dispose texture pool
    if (this._texturePool) {
      this._texturePool.dispose();
      this._texturePool = null;
    }

    // Destroy textures
    this._compositeTexture?.destroy();
    this._compositeTexture = null;
    this._compositeTextureView = null;

    // Destroy buffers
    this._vertexBuffer?.destroy();
    this._indexBuffer?.destroy();
    this._vertexBuffer = null;
    this._indexBuffer = null;

    // Destroy buffer pools
    for (const buffer of this._transformBufferPool) {
      buffer.destroy();
    }
    this._transformBufferPool = [];

    for (const buffer of this._ccBufferPool) {
      buffer.destroy();
    }
    this._ccBufferPool = [];

    for (const buffer of this._transitionBufferPool) {
      buffer.destroy();
    }
    this._transitionBufferPool = [];

    this._blitTransformBuffer?.destroy();
    this._blitTransformBuffer = null;

    // Clear bind group cache
    this._bindGroupCache.clear();
    this._blitBindGroup = null;

    // Destroy pipelines
    this._basicPipeline = null;
    this._colorCorrectionPipeline = null;
    this._blitPipeline = null;
    this._transitionPipeline = null;
    this._externalTexturePipeline = null;
    this._externalTextureCCPipeline = null;

    // Destroy device
    if (this._device) {
      this._device.destroy();
      this._device = null;
    }

    this._context = null;
    this._canvas = null;
    this._sampler = null;
    this._isInitialized = false;
    this._width = 0;
    this._height = 0;
  }

  resize(width: number, height: number): void {
    if (!this._canvas || !this._context || !this._device) return;

    this._canvas.width = width;
    this._canvas.height = height;
    this._width = width;
    this._height = height;

    // Reconfigure context
    this._context.configure({
      device: this._device,
      format: this._canvasFormat,
      alphaMode: 'premultiplied',
      // CRITICAL FIX: Add CopySrc usage for export pixel reading
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    // Recreate composite target
    this._createCompositeTarget();

    // Invalidate blit bind group (will be recreated on next endFrame)
    this._blitBindGroup = null;
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Texture Management
  // ---------------------------------------------------------------------------

  createTexture(source: TextureSource): ITexture | null {
    if (!this._device) return null;

    // Get dimensions
    let width = 0;
    let height = 0;

    // Check for RawTextureSource (from Extension zero-copy transfer)
    if (this._isRawTextureSource(source)) {
      width = source.width;
      height = source.height;
    } else if (source instanceof HTMLImageElement || source instanceof HTMLVideoElement) {
      width = source.width || (source as HTMLVideoElement).videoWidth || 0;
      height = source.height || (source as HTMLVideoElement).videoHeight || 0;
    } else if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
      width = source.width;
      height = source.height;
    } else if (source instanceof ImageBitmap) {
      width = source.width;
      height = source.height;
    } else if (source instanceof VideoFrame) {
      width = source.displayWidth;
      height = source.displayHeight;
    } else if (source instanceof ImageData) {
      width = source.width;
      height = source.height;
    }

    if (width === 0 || height === 0) {
      console.warn('[WebGPUCompositor] Invalid texture source dimensions');
      return null;
    }

    // Determine texture format
    const format: GPUTextureFormat = this._isRawTextureSource(source) && source.format === 'bgra8'
      ? 'bgra8unorm'
      : 'rgba8unorm';

    // Create GPU texture
    const texture = this._device.createTexture({
      size: { width, height },
      format,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Copy source to texture
    this._copySourceToTexture(source, texture, width, height);

    const textureInfo: WebGPUTextureInfo = {
      native: texture,
      view: texture.createView(),
      width,
      height,
      id: `webgpu_tex_${this._textureIdCounter++}`,
    };

    return textureInfo;
  }

  updateTexture(texture: ITexture, source: TextureSource): void {
    if (!this._device) return;

    const gpuTexture = (texture as WebGPUTextureInfo).native;
    this._copySourceToTexture(source, gpuTexture, texture.width, texture.height);
  }

  deleteTexture(texture: ITexture): void {
    const gpuTexture = (texture as WebGPUTextureInfo).native;
    gpuTexture.destroy();
  }

  // ---------------------------------------------------------------------------
  // Texture Pool Methods (for intermediate/temporary textures)
  // ---------------------------------------------------------------------------

  /**
   * Acquire a pooled texture for intermediate use
   * 从纹理池获取临时纹理（用于合成中间结果）
   *
   * @param width - Texture width
   * @param height - Texture height
   * @returns Pooled texture info or null if pool unavailable
   */
  acquirePooledTexture(width: number, height: number): WebGPUTextureInfo | null {
    if (!this._texturePool) return null;

    const { texture, view } = this._texturePool.acquire(width, height);

    return {
      native: texture,
      view,
      width,
      height,
      id: `pooled_${width}x${height}_${Date.now()}`,
    };
  }

  /**
   * Release a pooled texture back to the pool
   * 将纹理归还到纹理池
   *
   * @param texture - The texture to release
   */
  releasePooledTexture(texture: ITexture): void {
    if (!this._texturePool) return;

    const gpuTexture = (texture as WebGPUTextureInfo).native;
    this._texturePool.release(gpuTexture);
  }

  /**
   * Get texture pool statistics
   * 获取纹理池统计信息
   */
  getTexturePoolStats(): { total: number; inUse: number; available: number } | null {
    if (!this._texturePool) return null;

    const stats = this._texturePool.getStats();
    return {
      total: stats.total,
      inUse: stats.inUse,
      available: stats.available,
    };
  }

  /**
   * Clear unused textures from the pool
   * 清理纹理池中未使用的纹理
   */
  clearUnusedPooledTextures(): number {
    if (!this._texturePool) return 0;
    return this._texturePool.clearUnused();
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Frame Texture Pooling
  // ---------------------------------------------------------------------------

  /**
   * Acquire a frame texture from the pool, optionally updating its content
   * 从帧纹理池获取纹理，可选同时更新内容
   *
   * This is used by GPURenderEngine to pool video frame textures,
   * avoiding per-frame GPU memory allocation.
   *
   * @param width - Texture width
   * @param height - Texture height
   * @param source - Optional texture source to write into the acquired texture
   * @returns Pooled texture info or null if pool unavailable
   */
  acquirePooledFrameTexture(
    width: number,
    height: number,
    source?: TextureSource
  ): ITexture | null {
    if (!this._device || !this._frameTexturePool) return null;

    const { texture, view } = this._frameTexturePool.acquire(width, height);

    // Update content if source is provided
    if (source) {
      this._copySourceToTexture(source, texture, width, height);
    }

    return {
      native: texture,
      view,
      width,
      height,
      id: `frame_pool_${width}x${height}_${this._textureIdCounter++}`,
    } as WebGPUTextureInfo;
  }

  /**
   * Release a frame texture back to the pool (marks as reusable, does not destroy)
   * 将帧纹理归还到池中（标记为可复用，不销毁）
   *
   * @param texture - The texture to release
   */
  releasePooledFrameTexture(texture: ITexture): void {
    if (!this._frameTexturePool) return;

    const gpuTexture = (texture as WebGPUTextureInfo).native;
    this._frameTexturePool.release(gpuTexture);
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Rendering
  // ---------------------------------------------------------------------------

  beginFrame(): void {
    if (!this._device || !this._context) {
      console.warn('[WebGPUCompositor] beginFrame: device or context is null', {
        hasDevice: !!this._device,
        hasContext: !!this._context,
      });
      return;
    }

    // Reset buffer pool indices for new frame
    this._transformBufferPoolIndex = 0;
    this._ccBufferPoolIndex = 0;
    this._transitionBufferPoolIndex = 0;

    // Get current swap chain texture
    try {
      this._currentTexture = this._context.getCurrentTexture();
      this._currentTextureView = this._currentTexture.createView();
      console.log('[WebGPUCompositor] beginFrame: got current texture', {
        width: this._currentTexture.width,
        height: this._currentTexture.height,
        format: this._currentTexture.format,
      });
    } catch (error) {
      console.error('[WebGPUCompositor] beginFrame: failed to get current texture', error);
      throw error;
    }

    // Create command encoder
    this._commandEncoder = this._device.createCommandEncoder();

    // Clear composite target and submit IMMEDIATELY
    // This is critical for zero-copy external texture rendering:
    // GPUExternalTexture expires at end of JS task, so drawLayerWithExternalTexture
    // must submit immediately. If we defer the clear to endFrame(), it would
    // execute AFTER the external texture render, causing black frames.
    if (this._compositeTextureView) {
      const clearEncoder = this._device.createCommandEncoder({
        label: 'clear-encoder',
      });
      const clearPass = clearEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this._compositeTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      clearPass.end();
      this._device.queue.submit([clearEncoder.finish()]);
    }
  }

  drawLayer(layer: ILayer): void {
    if (
      !this._device ||
      !this._commandEncoder ||
      !this._compositeTextureView ||
      !this._basicPipeline
    )
      return;

    const textureInfo = layer.texture as WebGPUTextureInfo;
    if (!textureInfo?.view) return;

    // Determine which pipeline to use
    const hasColorCorrection = layer.colorCorrection !== undefined;
    const pipeline = hasColorCorrection
      ? this._colorCorrectionPipeline
      : this._basicPipeline;

    if (!pipeline) return;

    // Acquire transform buffer from pool (avoids per-frame allocation)
    const transformBufferIndex = this._transformBufferPoolIndex;
    const transformData = this._createTransformData(layer);
    const transformBuffer = this._acquireTransformBuffer();
    this._device.queue.writeBuffer(transformBuffer, 0, transformData.buffer as ArrayBuffer, transformData.byteOffset, transformData.byteLength);

    // Get CC buffer index if needed
    let ccBufferIndex = -1;
    let ccBuffer: GPUBuffer | null = null;
    if (hasColorCorrection && layer.colorCorrection) {
      ccBufferIndex = this._ccBufferPoolIndex;
      const ccData = this._createColorCorrectionData(layer.colorCorrection);
      ccBuffer = this._acquireCCBuffer();
      this._device.queue.writeBuffer(ccBuffer, 0, ccData.buffer as ArrayBuffer, ccData.byteOffset, ccData.byteLength);
    }

    // Generate cache key: textureId_pipelineType_transformIdx_ccIdx
    const pipelineType = hasColorCorrection ? 'cc' : 'basic';
    const cacheKey = `${textureInfo.id}_${pipelineType}_${transformBufferIndex}_${ccBufferIndex}`;

    // Try to get cached bind group
    let bindGroup: GPUBindGroup;
    const cached = this._bindGroupCache.get(cacheKey);

    if (cached) {
      // Cache hit - reuse bind group (buffer data already updated above)
      bindGroup = cached.bindGroup;
      cached.lastUsed = performance.now();
    } else {
      // Cache miss - create new bind group
      const bindGroupEntries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: transformBuffer } },
        { binding: 1, resource: this._sampler! },
        { binding: 2, resource: textureInfo.view },
      ];

      if (hasColorCorrection && ccBuffer) {
        bindGroupEntries.push({ binding: 3, resource: { buffer: ccBuffer } });
      }

      bindGroup = this._device.createBindGroup({
        layout: pipeline.bindGroupLayout,
        entries: bindGroupEntries,
      });

      // Add to cache with LRU eviction
      if (this._bindGroupCache.size >= this._maxBindGroupCacheSize) {
        this._evictLRUBindGroup();
      }
      this._bindGroupCache.set(cacheKey, { bindGroup, lastUsed: performance.now() });
    }

    // Begin render pass
    const renderPass = this._commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this._compositeTextureView,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(pipeline.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, this._vertexBuffer!);
    renderPass.setIndexBuffer(this._indexBuffer!, 'uint16');
    renderPass.drawIndexed(6);
    renderPass.end();
  }

  drawLayers(layers: ILayer[]): void {
    for (const layer of layers) {
      this.drawLayer(layer);
    }
  }

  /**
   * Draw layer using external texture (zero-copy VideoFrame)
   * 使用外部纹理绘制图层（零拷贝 VideoFrame 渲染）
   *
   * The VideoFrame is imported via importExternalTexture — no pixel copy needed.
   * The VideoFrame must remain open during rendering (caller closes it after).
   *
   * CRITICAL: GPUExternalTexture is only valid within the same JS task it was created.
   * Therefore this method uses its own command encoder and submits immediately,
   * rather than waiting for endFrame(). This ensures the external texture is still
   * active when queue.submit() is called.
   *
   * @param layer - Layer parameters (without texture, since we use VideoFrame directly)
   * @param videoFrame - VideoFrame to render via zero-copy
   */
  drawLayerWithExternalTexture(
    layer: Omit<ILayer, 'texture'>,
    videoFrame: VideoFrame
  ): void {
    if (
      !this._device ||
      !this._compositeTextureView ||
      !this._externalTexturePipeline
    )
      return;

    // Import external texture (zero-copy — no pixel data is copied)
    const externalTexture = this._device.importExternalTexture({
      source: videoFrame,
    });

    // Select pipeline based on color correction
    const hasColorCorrection = layer.colorCorrection !== undefined;
    const pipeline = hasColorCorrection
      ? this._externalTextureCCPipeline
      : this._externalTexturePipeline;

    if (!pipeline) return;

    // CRITICAL: Use a SEPARATE command encoder for external texture rendering
    // and submit IMMEDIATELY. GPUExternalTexture expires at the end of the current
    // JS task, so we cannot wait for endFrame() to submit.
    const commandEncoder = this._device.createCommandEncoder({
      label: 'external-texture-encoder',
    });

    // Build layer data for transform computation (reuse _createTransformData)
    // We need a fake ILayer to pass to _createTransformData
    const transformData = this._createTransformData(layer as ILayer);
    const transformBuffer = this._acquireTransformBuffer();
    this._device.queue.writeBuffer(
      transformBuffer,
      0,
      transformData.buffer as ArrayBuffer,
      transformData.byteOffset,
      transformData.byteLength
    );

    // Build bind group entries with GPUExternalTexture resource
    const bindGroupEntries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: transformBuffer } },
      { binding: 1, resource: this._sampler! },
      { binding: 2, resource: externalTexture },
    ];

    // Add color correction uniforms if needed
    if (hasColorCorrection && layer.colorCorrection) {
      const ccData = this._createColorCorrectionData(layer.colorCorrection);
      const ccBuffer = this._acquireCCBuffer();
      this._device.queue.writeBuffer(
        ccBuffer,
        0,
        ccData.buffer as ArrayBuffer,
        ccData.byteOffset,
        ccData.byteLength
      );
      bindGroupEntries.push({ binding: 3, resource: { buffer: ccBuffer } });
    }

    const bindGroup = this._device.createBindGroup({
      layout: pipeline.bindGroupLayout,
      entries: bindGroupEntries,
    });

    // Render pass - using the separate command encoder
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this._compositeTextureView,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
    });

    renderPass.setPipeline(pipeline.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, this._vertexBuffer!);
    renderPass.setIndexBuffer(this._indexBuffer!, 'uint16');
    renderPass.drawIndexed(6);
    renderPass.end();

    // CRITICAL: Submit IMMEDIATELY while external texture is still active
    // This is the key fix - GPUExternalTexture expires at end of JS task,
    // so we cannot defer submission to endFrame()
    this._device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Batch draw multiple layers using external textures (zero-copy VideoFrame)
   * 批量使用外部纹理绘制多个图层（零拷贝 VideoFrame 渲染）
   *
   * This is more efficient than calling drawLayerWithExternalTexture multiple times
   * because it uses a single command encoder and single submit for all layers.
   *
   * @param layers Array of layer params and VideoFrames
   */
  drawLayersWithExternalTextures(
    layers: Array<{ layer: Omit<ILayer, 'texture'>; videoFrame: VideoFrame }>
  ): void {
    if (
      !this._device ||
      !this._compositeTextureView ||
      !this._externalTexturePipeline ||
      layers.length === 0
    )
      return;

    // Use single command encoder for all layers
    const commandEncoder = this._device.createCommandEncoder({
      label: 'batch-external-texture-encoder',
    });

    // Import all external textures first (they must be imported in same JS task)
    const importedLayers = layers.map(({ layer, videoFrame }) => ({
      layer,
      externalTexture: this._device!.importExternalTexture({ source: videoFrame }),
      hasColorCorrection: layer.colorCorrection !== undefined,
    }));

    // Render each layer in sequence (using same command encoder)
    for (const { layer, externalTexture, hasColorCorrection } of importedLayers) {
      const pipeline = hasColorCorrection
        ? this._externalTextureCCPipeline
        : this._externalTexturePipeline;

      if (!pipeline) continue;

      // Build transform data
      const transformData = this._createTransformData(layer as ILayer);
      const transformBuffer = this._acquireTransformBuffer();
      this._device!.queue.writeBuffer(
        transformBuffer,
        0,
        transformData.buffer as ArrayBuffer,
        transformData.byteOffset,
        transformData.byteLength
      );

      // Build bind group entries
      const bindGroupEntries: GPUBindGroupEntry[] = [
        { binding: 0, resource: { buffer: transformBuffer } },
        { binding: 1, resource: this._sampler! },
        { binding: 2, resource: externalTexture },
      ];

      // Add color correction if needed
      if (hasColorCorrection && layer.colorCorrection) {
        const ccData = this._createColorCorrectionData(layer.colorCorrection);
        const ccBuffer = this._acquireCCBuffer();
        this._device!.queue.writeBuffer(
          ccBuffer,
          0,
          ccData.buffer as ArrayBuffer,
          ccData.byteOffset,
          ccData.byteLength
        );
        bindGroupEntries.push({ binding: 3, resource: { buffer: ccBuffer } });
      }

      const bindGroup = this._device!.createBindGroup({
        layout: pipeline.bindGroupLayout,
        entries: bindGroupEntries,
      });

      // Render pass for this layer
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this._compositeTextureView!,
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });

      renderPass.setPipeline(pipeline.pipeline);
      renderPass.setBindGroup(0, bindGroup);
      renderPass.setVertexBuffer(0, this._vertexBuffer!);
      renderPass.setIndexBuffer(this._indexBuffer!, 'uint16');
      renderPass.drawIndexed(6);
      renderPass.end();
    }

    // Single submit for all layers
    this._device.queue.submit([commandEncoder.finish()]);
  }

  endFrame(): void {
    if (!this._device || !this._commandEncoder || !this._currentTextureView) {
      console.warn('[WebGPUCompositor] endFrame: missing required state', {
        hasDevice: !!this._device,
        hasCommandEncoder: !!this._commandEncoder,
        hasCurrentTextureView: !!this._currentTextureView,
      });
      return;
    }

    console.log('[WebGPUCompositor] endFrame: starting', {
      hasCompositeTextureView: !!this._compositeTextureView,
      hasBlitPipeline: !!this._blitPipeline,
    });

    // Copy composite texture to swap chain using blit pipeline
    if (this._compositeTextureView && this._blitPipeline) {
      const finalPass = this._commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this._currentTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });

      // Draw composite texture to screen using blit pipeline (uses canvas format)
      // Use cached blit bind group (only recreated on resize)
      if (!this._blitBindGroup) {
        this._blitBindGroup = this._device.createBindGroup({
          layout: this._blitPipeline.bindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this._blitTransformBuffer! } },
            { binding: 1, resource: this._sampler! },
            { binding: 2, resource: this._compositeTextureView },
          ],
        });
      }

      finalPass.setPipeline(this._blitPipeline.pipeline);
      finalPass.setBindGroup(0, this._blitBindGroup);
      finalPass.setVertexBuffer(0, this._vertexBuffer!);
      finalPass.setIndexBuffer(this._indexBuffer!, 'uint16');
      finalPass.drawIndexed(6);
      finalPass.end();
    }

    // Submit commands
    this._device.queue.submit([this._commandEncoder.finish()]);
    console.log('[WebGPUCompositor] endFrame: commands submitted');

    // Clean up frame state
    this._commandEncoder = null;
    this._currentTexture = null;
    this._currentTextureView = null;
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Export
  // ---------------------------------------------------------------------------

  toVideoFrame(timestamp: number): VideoFrame {
    if (!this._canvas) {
      console.error('[WebGPUCompositor] toVideoFrame failed: canvas is null');
      throw new Error('Compositor not initialized');
    }

    // Check if WebGPU context is still valid
    if (!this._context || !this._device) {
      console.error('[WebGPUCompositor] toVideoFrame failed: context or device is null', {
        hasContext: !!this._context,
        hasDevice: !!this._device,
      });
      throw new Error('WebGPU context lost or device unavailable');
    }

    // NOTE: Do NOT call getCurrentTexture() here!
    // In WebGPU, getCurrentTexture() returns the texture for the NEXT frame,
    // and calling it after endFrame() may invalidate the current canvas content.
    // The canvas should already have valid content from the last endFrame() call.

    // Log canvas state for debugging
    console.log('[WebGPUCompositor] toVideoFrame: creating VideoFrame', {
      canvasWidth: this._canvas.width,
      canvasHeight: this._canvas.height,
      timestamp,
      isOffscreenCanvas: this._canvas instanceof OffscreenCanvas,
    });

    // Create VideoFrame from canvas
    // VideoFrame constructor reads from the canvas's current displayed content
    try {
      const videoFrame = new VideoFrame(this._canvas as HTMLCanvasElement, {
        timestamp,
      });
      console.log('[WebGPUCompositor] toVideoFrame: VideoFrame created successfully', {
        width: videoFrame.displayWidth,
        height: videoFrame.displayHeight,
        format: videoFrame.format,
      });
      return videoFrame;
    } catch (error) {
      console.error('[WebGPUCompositor] toVideoFrame failed: VideoFrame constructor error', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        canvasWidth: this._canvas.width,
        canvasHeight: this._canvas.height,
        timestamp,
      });
      throw error;
    }
  }

  toImageData(): ImageData {
    if (!this._device || !this._compositeTexture) {
      throw new Error('Compositor not initialized');
    }

    // Create staging buffer for readback
    const bytesPerRow = Math.ceil((this._width * 4) / 256) * 256;
    const bufferSize = bytesPerRow * this._height;

    const stagingBuffer = this._device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this._device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: this._compositeTexture },
      { buffer: stagingBuffer, bytesPerRow },
      { width: this._width, height: this._height }
    );
    this._device.queue.submit([commandEncoder.finish()]);

    // Note: This is synchronous but WebGPU prefers async
    // For production, use async version
    throw new Error('WebGPU toImageData requires async operation - use toImageDataAsync instead');
  }

  async toImageDataAsync(): Promise<ImageData> {
    if (!this._device || !this._compositeTexture) {
      throw new Error('Compositor not initialized');
    }

    // Create staging buffer for readback
    const bytesPerRow = Math.ceil((this._width * 4) / 256) * 256;
    const bufferSize = bytesPerRow * this._height;

    const stagingBuffer = this._device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this._device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: this._compositeTexture },
      { buffer: stagingBuffer, bytesPerRow },
      { width: this._width, height: this._height }
    );
    this._device.queue.submit([commandEncoder.finish()]);

    // Map buffer and read data
    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedData = new Uint8Array(stagingBuffer.getMappedRange());

    // Copy data to ImageData (accounting for bytesPerRow padding)
    const pixels = new Uint8ClampedArray(this._width * this._height * 4);
    const actualBytesPerRow = this._width * 4;

    for (let y = 0; y < this._height; y++) {
      const srcOffset = y * bytesPerRow;
      const dstOffset = y * actualBytesPerRow;
      pixels.set(mappedData.subarray(srcOffset, srcOffset + actualBytesPerRow), dstOffset);
    }

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return new ImageData(pixels, this._width, this._height);
  }

  async toBlob(type: string = 'image/png', quality?: number): Promise<Blob> {
    if (!this._canvas || !this._device || !this._compositeTexture) {
      throw new Error('Compositor not initialized');
    }

    // CRITICAL: Wait for GPU queue to complete before reading
    // This prevents corrupted/incomplete JPEG data (EOI missing error in FFmpeg)
    try {
      const queue = this._device.queue as GPUQueue & { onSubmittedWorkDone?: () => Promise<void> };
      if (queue.onSubmittedWorkDone) {
        await Promise.race([
          queue.onSubmittedWorkDone(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('GPU sync timeout')), 5000)
          ),
        ]);
      }
    } catch (error) {
      console.warn('[WebGPUCompositor] GPU sync warning:', error);
    }

    // CRITICAL FIX: Read from composite texture (RGBA format) instead of canvas (BGRA format)
    // This avoids the color channel swap issue that occurs when reading from BGRA canvas
    // and encoding to JPEG (which expects RGB data).
    const imageData = await this.toImageDataAsync();

    // Create a temporary canvas to encode the ImageData to blob
    const tempCanvas = new OffscreenCanvas(this._width, this._height);
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D context for blob encoding');
    }

    ctx.putImageData(imageData, 0, 0);

    // Convert to blob
    const blobPromise = tempCanvas.convertToBlob({ type, quality });

    // Apply timeout to blob conversion (10 seconds)
    return Promise.race([
      blobPromise,
      new Promise<Blob>((_, reject) =>
        setTimeout(() => reject(new Error('Blob conversion timeout')), 10000)
      ),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Resource Creation
  // ---------------------------------------------------------------------------

  private _createSharedResources(): void {
    if (!this._device) return;

    // Create sampler
    this._sampler = this._device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // Create vertex buffer (fullscreen quad)
    // prettier-ignore
    const vertices = new Float32Array([
      // Position (x, y), TexCoord (u, v)
      -1, -1, 0, 1,  // Bottom-left
       1, -1, 1, 1,  // Bottom-right
       1,  1, 1, 0,  // Top-right
      -1,  1, 0, 0,  // Top-left
    ]);

    this._vertexBuffer = this._device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._vertexBuffer, 0, vertices.buffer as ArrayBuffer, vertices.byteOffset, vertices.byteLength);

    // Create index buffer
    const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);
    this._indexBuffer = this._device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(this._indexBuffer, 0, indices.buffer as ArrayBuffer, indices.byteOffset, indices.byteLength);

    // Initialize buffer pools for uniform data reuse
    this._initBufferPools();
  }

  /**
   * Initialize buffer pools for uniform data reuse
   * Pre-allocates buffers to avoid per-frame allocation overhead
   */
  private _initBufferPools(): void {
    if (!this._device) return;

    // Transform buffer pool (96 bytes each)
    for (let i = 0; i < this._maxTransformBuffers; i++) {
      this._transformBufferPool.push(
        this._device.createBuffer({
          size: 96,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          label: `transform_pool_${i}`,
        })
      );
    }

    // Color correction buffer pool (48 bytes each)
    for (let i = 0; i < this._maxCCBuffers; i++) {
      this._ccBufferPool.push(
        this._device.createBuffer({
          size: 48,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          label: `cc_pool_${i}`,
        })
      );
    }

    // Transition uniform buffer pool (48 bytes each)
    for (let i = 0; i < this._maxTransitionBuffers; i++) {
      this._transitionBufferPool.push(
        this._device.createBuffer({
          size: 48,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          label: `transition_pool_${i}`,
        })
      );
    }

    // Pre-allocate blit transform buffer (static identity matrix)
    this._blitTransformBuffer = this._device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'blit_transform_static',
    });

    // Write identity matrix once (never changes)
    // WGSL struct: mat4x4f (64 bytes) + opacity f32 (4 bytes) + padding (28 bytes) = 96 bytes
    const identityData = new Float32Array([
      // Identity matrix 4x4
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
      // Opacity at offset 64
      1.0,
      // Padding to 96 bytes
      0, 0, 0,
      0, 0, 0, 0,
    ]);
    this._device.queue.writeBuffer(
      this._blitTransformBuffer,
      0,
      identityData.buffer as ArrayBuffer,
      identityData.byteOffset,
      identityData.byteLength
    );
  }

  private _acquireTransformBuffer(): GPUBuffer {
    const buffer = this._transformBufferPool[this._transformBufferPoolIndex];
    this._transformBufferPoolIndex =
      (this._transformBufferPoolIndex + 1) % this._maxTransformBuffers;
    return buffer!;
  }

  private _acquireCCBuffer(): GPUBuffer {
    const buffer = this._ccBufferPool[this._ccBufferPoolIndex];
    this._ccBufferPoolIndex = (this._ccBufferPoolIndex + 1) % this._maxCCBuffers;
    return buffer!;
  }

  private _acquireTransitionBuffer(): GPUBuffer {
    const buffer = this._transitionBufferPool[this._transitionBufferPoolIndex];
    this._transitionBufferPoolIndex =
      (this._transitionBufferPoolIndex + 1) % this._maxTransitionBuffers;
    return buffer!;
  }

  /**
   * Evict the least recently used bind group from cache
   */
  private _evictLRUBindGroup(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._bindGroupCache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._bindGroupCache.delete(oldestKey);
    }
  }

  private async _createPipelines(): Promise<void> {
    if (!this._device) return;

    // Basic pipeline (for composite texture - rgba8unorm)
    this._basicPipeline = this._createRenderPipeline(basicShader, false, 'rgba8unorm');

    // Color correction pipeline (for composite texture - rgba8unorm)
    this._colorCorrectionPipeline = this._createRenderPipeline(colorCorrectionShader, true, 'rgba8unorm');

    // Blit pipeline (for canvas output - uses platform preferred format)
    // Note: WebGPU handles RGBA->BGRA conversion automatically when rendering
    // to a BGRA canvas. The color inversion issue in export is handled separately.
    this._blitPipeline = this._createRenderPipeline(basicShader, false, this._canvasFormat);

    // Transition pipeline (for GPU-accelerated transitions)
    this._transitionPipeline = this._createTransitionPipeline();

    // External texture pipelines (for VideoFrame zero-copy during playback)
    this._externalTexturePipeline = this._createExternalTexturePipeline(
      externalTextureShader,
      false
    );
    this._externalTextureCCPipeline = this._createExternalTexturePipeline(
      externalTextureColorCorrectionShader,
      true
    );
  }

  private _createRenderPipeline(
    shaderCode: string,
    hasColorCorrection: boolean,
    targetFormat: GPUTextureFormat
  ): RenderPipeline {
    if (!this._device) throw new Error('Device not initialized');

    const shaderModule = this._device.createShaderModule({
      code: shaderCode,
    });

    // Create bind group layout
    const bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
    ];

    if (hasColorCorrection) {
      bindGroupLayoutEntries.push({
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      });
    }

    const bindGroupLayout = this._device.createBindGroupLayout({
      entries: bindGroupLayoutEntries,
    });

    const pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = this._device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: 16, // 4 floats * 4 bytes
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' }, // position
              { shaderLocation: 1, offset: 8, format: 'float32x2' }, // texCoord
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: targetFormat,
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    return { pipeline, bindGroupLayout };
  }

  /**
   * Create external texture render pipeline (for VideoFrame zero-copy)
   * 创建外部纹理渲染管线（用于 VideoFrame 零拷贝）
   *
   * Key difference: binding(2) uses externalTexture instead of texture
   */
  private _createExternalTexturePipeline(
    shaderCode: string,
    hasColorCorrection: boolean
  ): RenderPipeline {
    if (!this._device) throw new Error('Device not initialized');

    const shaderModule = this._device.createShaderModule({
      code: shaderCode,
    });

    // Create bind group layout with externalTexture binding
    const bindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        externalTexture: {}, // Key: external texture binding for zero-copy VideoFrame
      },
    ];

    if (hasColorCorrection) {
      bindGroupLayoutEntries.push({
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      });
    }

    const bindGroupLayout = this._device.createBindGroupLayout({
      entries: bindGroupLayoutEntries,
    });

    const pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = this._device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: 'rgba8unorm',
            blend: {
              color: {
                srcFactor: 'src-alpha',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    return { pipeline, bindGroupLayout };
  }

  /**
   * Create transition render pipeline
   * 创建转场渲染管线
   */
  private _createTransitionPipeline(): RenderPipeline {
    if (!this._device) throw new Error('Device not initialized');

    const shaderModule = this._device.createShaderModule({
      code: transitionShader,
    });

    // Transition shader bind group layout:
    // binding 0: TransitionUniforms (uniform buffer)
    // binding 1: sampler
    // binding 2: fromTexture
    // binding 3: toTexture
    const bindGroupLayout = this._device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    });

    const pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout],
    });

    const pipeline = this._device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vertexMain',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragmentMain',
        targets: [
          {
            format: 'rgba8unorm',
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'zero',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'zero',
                operation: 'add',
              },
            },
          },
        ],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    return { pipeline, bindGroupLayout };
  }

  private _createCompositeTarget(): void {
    if (!this._device) return;

    // Destroy existing
    this._compositeTexture?.destroy();

    // Create new composite texture
    this._compositeTexture = this._device.createTexture({
      size: { width: this._width, height: this._height },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    this._compositeTextureView = this._compositeTexture.createView();
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Data Creation
  // ---------------------------------------------------------------------------

  private _copySourceToTexture(
    source: TextureSource,
    texture: GPUTexture,
    width: number,
    height: number
  ): void {
    if (!this._device) return;

    // Handle RawTextureSource (from Extension zero-copy transfer)
    if (this._isRawTextureSource(source)) {
      // Ensure we have an ArrayBuffer for writeTexture
      let arrayBuffer: ArrayBuffer;
      if (source.data instanceof ArrayBuffer) {
        arrayBuffer = source.data;
      } else {
        // Uint8Array - need to get underlying ArrayBuffer
        // Use slice to ensure we get a proper ArrayBuffer (not SharedArrayBuffer)
        arrayBuffer = source.data.slice().buffer as ArrayBuffer;
      }

      this._device.queue.writeTexture(
        { texture },
        arrayBuffer,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height }
      );
      return;
    }

    if (
      source instanceof ImageBitmap ||
      source instanceof HTMLCanvasElement ||
      source instanceof OffscreenCanvas ||
      source instanceof HTMLVideoElement ||
      source instanceof VideoFrame
    ) {
      this._device.queue.copyExternalImageToTexture(
        { source: source as ImageBitmap },
        { texture },
        { width, height }
      );
    } else if (source instanceof ImageData) {
      this._device.queue.writeTexture(
        { texture },
        source.data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height }
      );
    } else if (source instanceof HTMLImageElement) {
      // Convert to ImageBitmap first
      createImageBitmap(source).then((bitmap) => {
        this._device?.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture },
          { width, height }
        );
        bitmap.close();
      });
    }
  }

  /**
   * Type guard for RawTextureSource
   */
  private _isRawTextureSource(source: TextureSource): source is RawTextureSource {
    return (
      typeof source === 'object' &&
      source !== null &&
      'data' in source &&
      'width' in source &&
      'height' in source &&
      (source.data instanceof ArrayBuffer || source.data instanceof Uint8Array)
    );
  }

  private _createTransformData(layer: ILayer): Float32Array {
    // Create MVP matrix from transform
    const transform = layer.transform;
    // WGSL struct alignment:
    // mat4x4f: 64 bytes at offset 0
    // opacity (f32): 4 bytes at offset 64
    // _padding (vec3f): aligned to 16, so at offset 80, size 12
    // Total struct size aligned to 16: 96 bytes = 24 floats
    const data = new Float32Array(24);

    // Build transform matrix
    const scaleX = transform.scaleX ?? 1;
    const scaleY = transform.scaleY ?? 1;
    const rotation = ((transform.rotation ?? 0) * Math.PI) / 180;
    const translateX = (transform.x ?? 0) / (this._width / 2);
    const translateY = (transform.y ?? 0) / (this._height / 2);

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Column-major 4x4 matrix (64 bytes, indices 0-15)
    data[0] = scaleX * cos;
    data[1] = scaleX * sin;
    data[2] = 0;
    data[3] = 0;

    data[4] = -scaleY * sin;
    data[5] = scaleY * cos;
    data[6] = 0;
    data[7] = 0;

    data[8] = 0;
    data[9] = 0;
    data[10] = 1;
    data[11] = 0;

    data[12] = translateX;
    data[13] = translateY;
    data[14] = 0;
    data[15] = 1;

    // Opacity at offset 64 (index 16)
    data[16] = layer.opacity ?? 1;
    // Padding to align vec3f to 16 bytes (indices 17-19)
    data[17] = 0;
    data[18] = 0;
    data[19] = 0;
    // _padding vec3f at offset 80 (indices 20-22)
    data[20] = 0;
    data[21] = 0;
    data[22] = 0;
    // Final padding to 96 bytes (index 23)
    data[23] = 0;

    return data;
  }

  private _createColorCorrectionData(cc: NonNullable<ILayer['colorCorrection']>): Float32Array {
    // ColorCorrectionParams fields:
    // exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, saturation, vibrance
    return new Float32Array([
      cc.exposure ?? 0,      // -5 to 5
      cc.contrast ?? 0,      // -100 to 100
      cc.saturation ?? 0,    // -100 to 100
      cc.temperature ?? 0,   // -100 to 100
      cc.tint ?? 0,          // -100 to 100
      cc.vibrance ?? 0,      // -100 to 100
      cc.highlights ?? 0,    // -100 to 100
      cc.shadows ?? 0,       // -100 to 100
      cc.whites ?? 0,        // -100 to 100
      cc.blacks ?? 0,        // -100 to 100
      0, 0, // padding to align to 48 bytes (12 floats)
    ]);
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Transition Rendering
  // ---------------------------------------------------------------------------

  /**
   * Render transition between two textures using GPU-accelerated shaders
   * 使用 GPU 加速着色器渲染两个纹理之间的转场效果
   *
   * Supports 24 transition types including fade, wipe, slide, zoom, iris, clock, blinds, etc.
   * 支持 24 种转场类型，包括淡入淡出、擦除、滑动、缩放、光圈、时钟、百叶窗等
   *
   * @param fromTexture - Source texture (outgoing clip)
   * @param toTexture - Destination texture (incoming clip)
   * @param params - Transition parameters
   * @param toScreen - Whether to render directly to screen (default: true)
   * @returns Resulting texture if not rendering to screen
   */
  renderTransition(
    fromTexture: ITexture,
    toTexture: ITexture,
    params: TransitionRenderParams,
    toScreen: boolean = true
  ): ITexture | null {
    if (!this._device || !this._commandEncoder || !this._transitionPipeline || !this._compositeTextureView) {
      console.warn('[WebGPUCompositor] Cannot render transition - not properly initialized');
      return null;
    }

    const fromTextureInfo = fromTexture as WebGPUTextureInfo;
    const toTextureInfo = toTexture as WebGPUTextureInfo;

    if (!fromTextureInfo?.view || !toTextureInfo?.view) {
      console.warn('[WebGPUCompositor] Invalid texture views for transition');
      return null;
    }

    // Get transition type index
    const transitionType = GPU_TRANSITION_TYPE_MAP[params.type] ?? GPU_TRANSITION_TYPE_MAP['fade'];

    // Create transition uniforms buffer
    // TransitionUniforms struct:
    // - progress: f32
    // - transitionType: u32
    // - softness: f32
    // - blindsCount: f32
    // - startAngle: f32
    // - dipColorR: f32
    // - dipColorG: f32
    // - dipColorB: f32
    // - _padding: f32
    const uniformData = new Float32Array(12); // 48 bytes aligned
    uniformData[0] = params.progress;
    // Set transition type as unsigned int (reinterpret float bits)
    const uint32View = new Uint32Array(uniformData.buffer);
    uint32View[1] = transitionType;
    uniformData[2] = params.softness ?? 0.1;
    uniformData[3] = params.blindsCount ?? 10;
    uniformData[4] = (params.startAngle ?? 0) * Math.PI / 180; // Convert degrees to radians
    // Dip color (normalized 0-1)
    if (params.dipColor) {
      uniformData[5] = params.dipColor[0];
      uniformData[6] = params.dipColor[1];
      uniformData[7] = params.dipColor[2];
    } else {
      uniformData[5] = 0;
      uniformData[6] = 0;
      uniformData[7] = 0;
    }
    uniformData[8] = 0; // padding

    // Acquire transition buffer from pool (avoids per-frame allocation)
    const uniformBuffer = this._acquireTransitionBuffer();
    this._device.queue.writeBuffer(uniformBuffer, 0, uniformData);

    // Create bind group for transition shader
    const bindGroup = this._device.createBindGroup({
      layout: this._transitionPipeline.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: this._sampler! },
        { binding: 2, resource: fromTextureInfo.view },
        { binding: 3, resource: toTextureInfo.view },
      ],
    });

    const targetView = toScreen ? this._compositeTextureView : this._compositeTextureView;

    // Begin render pass
    const renderPass = this._commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetView,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          storeOp: 'store',
        },
      ],
    });

    // Draw fullscreen quad with transition shader
    renderPass.setPipeline(this._transitionPipeline.pipeline);
    renderPass.setBindGroup(0, bindGroup);
    renderPass.setVertexBuffer(0, this._vertexBuffer!);
    renderPass.setIndexBuffer(this._indexBuffer!, 'uint16');
    renderPass.drawIndexed(6);
    renderPass.end();

    return null;
  }

  /**
   * Check if a transition type is supported by GPU
   * 检查转场类型是否支持 GPU 加速
   */
  isTransitionSupported(type: string): boolean {
    return type in GPU_TRANSITION_TYPE_MAP;
  }

  /**
   * Get all supported GPU transition types
   * 获取所有支持 GPU 加速的转场类型
   */
  getSupportedTransitions(): GPUTransitionType[] {
    return Object.keys(GPU_TRANSITION_TYPE_MAP) as GPUTransitionType[];
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * 创建 WebGPU 合成器实例
 */
export function createWebGPUCompositor(): WebGPUCompositor {
  return new WebGPUCompositor();
}
