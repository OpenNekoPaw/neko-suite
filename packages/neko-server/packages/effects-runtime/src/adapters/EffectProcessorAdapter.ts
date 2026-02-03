/**
 * Effect Processor Adapter
 *
 * Provides backward compatibility with the legacy IEffectProcessor interface.
 * Wraps IEffectRunner to provide the old API for gradual migration.
 */

import type {
  IEffectProcessor,
  EffectProcessorState,
  EffectProcessorGpuInfo,
  GpuEffectParams,
  EffectPipeline,
  PipelineEffect,
} from '@uniedit/shared';

import type {
  IEffectRunner,
  IEffectContext,
  EffectInstance,
  ITexture,
  TextureSource,
} from '../types';

// =============================================================================
// Adapter Implementation
// =============================================================================

/**
 * Adapter to make IEffectRunner compatible with legacy IEffectProcessor interface
 *
 * This allows gradual migration from IEffectProcessor to IEffectRunner.
 * The adapter handles:
 * - Converting Uint8Array/VideoFrame to GPU textures
 * - Converting GpuEffectParams to EffectInstance
 * - Reading back GPU textures to Uint8Array
 */
export class EffectProcessorAdapter implements IEffectProcessor {
  private _runner: IEffectRunner;
  private _context: IEffectContext | null = null;
  private _device: GPUDevice | null = null;
  private _queue: GPUQueue | null = null;

  constructor(runner: IEffectRunner) {
    this._runner = runner;
  }

  // =========================================================================
  // IEffectProcessor Properties
  // =========================================================================

  get state(): EffectProcessorState {
    return this._runner.state as EffectProcessorState;
  }

  get gpuInfo(): EffectProcessorGpuInfo | null {
    const info = this._runner.gpuInfo;
    if (!info) return null;

    return {
      deviceName: info.deviceName,
      vendor: info.vendor,
      backend: info.backend,
      isDiscrete: info.isDiscrete,
      maxTextureSize: info.maxTextureSize,
    };
  }

  get isReady(): boolean {
    return this._runner.isReady;
  }

  // =========================================================================
  // IEffectProcessor Methods
  // =========================================================================

  async initialize(): Promise<void> {
    // Request adapter and device
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) {
      throw new Error('WebGPU not supported');
    }

    this._device = await adapter.requestDevice();
    this._queue = this._device.queue;

    // Create context for runner
    this._context = this._createContext();

    // Initialize runner
    await this._runner.initialize(this._context);
  }

  async dispose(): Promise<void> {
    await this._runner.dispose();
    this._device?.destroy();
    this._device = null;
    this._queue = null;
    this._context = null;
  }

  async processFrame(
    frame: Uint8Array | VideoFrame,
    width: number,
    height: number,
    effects: GpuEffectParams[]
  ): Promise<Uint8Array> {
    if (!this._context || !this._device || !this._queue) {
      throw new Error('Adapter not initialized');
    }

    // Convert frame to texture
    const inputTexture = await this._createInputTexture(frame, width, height);

    // Convert GpuEffectParams to EffectInstance
    const effectInstances = effects.map((params, index) =>
      this._convertToEffectInstance(params, index)
    );

    // Run effects
    const result = await this._runner.run(inputTexture, effectInstances, 0);

    // Read back result
    const outputData = await this._readTexture(result.texture, width, height);

    // Cleanup
    this._context.deleteTexture(inputTexture);
    if (result.isNewTexture) {
      this._context.deleteTexture(result.texture);
    }

    return outputData;
  }

  async processPipeline(
    frame: Uint8Array | VideoFrame,
    width: number,
    height: number,
    pipeline: EffectPipeline
  ): Promise<Uint8Array> {
    // Filter enabled effects and sort by order
    const enabledEffects = pipeline.effects
      .filter((e: PipelineEffect) => e.enabled)
      .sort((a: PipelineEffect, b: PipelineEffect) => a.order - b.order)
      .map((e: PipelineEffect) => e.params);

    return this.processFrame(frame, width, height, enabledEffects);
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private _createContext(): IEffectContext {
    if (!this._device || !this._queue) {
      throw new Error('Device not initialized');
    }

    const device = this._device;
    const queue = this._queue;
    const textureCache = new Map<string, GPUTexture>();
    let textureIdCounter = 0;

    return {
      device,
      queue,
      width: 0, // Will be set per-frame
      height: 0,

      createTexture: (_source: TextureSource): ITexture | null => {
        // This is a simplified implementation
        // In practice, you'd handle different source types
        return null;
      },

      createEmptyTexture: (width: number, height: number): ITexture | null => {
        const texture = device.createTexture({
          size: { width, height },
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.STORAGE_BINDING |
            GPUTextureUsage.COPY_SRC |
            GPUTextureUsage.COPY_DST,
        });

        const id = `texture_${textureIdCounter++}`;
        textureCache.set(id, texture);

        return {
          width,
          height,
          native: texture,
          id,
        };
      },

      deleteTexture: (texture: ITexture): void => {
        const gpuTexture = textureCache.get(texture.id);
        if (gpuTexture) {
          gpuTexture.destroy();
          textureCache.delete(texture.id);
        }
      },
    };
  }

  private async _createInputTexture(
    frame: Uint8Array | VideoFrame,
    width: number,
    height: number
  ): Promise<ITexture> {
    if (!this._device || !this._queue) {
      throw new Error('Device not initialized');
    }

    const texture = this._device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC,
    });

    if (frame instanceof VideoFrame) {
      this._queue.copyExternalImageToTexture(
        { source: frame },
        { texture },
        { width, height }
      );
    } else {
      const buffer = new ArrayBuffer(frame.byteLength);
      new Uint8Array(buffer).set(frame);
      this._queue.writeTexture(
        { texture },
        buffer,
        { bytesPerRow: width * 4 },
        { width, height }
      );
    }

    return {
      width,
      height,
      native: texture,
      id: `input_${Date.now()}`,
    };
  }

  private async _readTexture(
    texture: ITexture,
    width: number,
    height: number
  ): Promise<Uint8Array> {
    if (!this._device || !this._queue) {
      throw new Error('Device not initialized');
    }

    const bytesPerRow = Math.ceil((width * 4) / 256) * 256;
    const bufferSize = bytesPerRow * height;

    const stagingBuffer = this._device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this._device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer(
      { texture: texture.native as GPUTexture },
      { buffer: stagingBuffer, bytesPerRow },
      { width, height }
    );
    this._queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const mappedRange = stagingBuffer.getMappedRange();

    // Copy to result, removing padding
    const result = new Uint8Array(width * height * 4);
    const source = new Uint8Array(mappedRange);

    for (let y = 0; y < height; y++) {
      const srcOffset = y * bytesPerRow;
      const dstOffset = y * width * 4;
      result.set(source.subarray(srcOffset, srcOffset + width * 4), dstOffset);
    }

    stagingBuffer.unmap();
    stagingBuffer.destroy();

    return result;
  }

  private _convertToEffectInstance(
    params: GpuEffectParams,
    index: number
  ): EffectInstance {
    return {
      id: `effect_${index}`,
      effectId: params.type,
      clipId: '',
      type: params.type as EffectInstance['type'],
      order: index,
      enabled: true,
      params: params as unknown as Record<string, unknown>,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an effect processor adapter from an effect runner
 */
export function createEffectProcessorAdapter(
  runner: IEffectRunner
): EffectProcessorAdapter {
  return new EffectProcessorAdapter(runner);
}
