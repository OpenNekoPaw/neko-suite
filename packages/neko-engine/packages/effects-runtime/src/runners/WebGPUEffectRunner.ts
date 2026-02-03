/**
 * WebGPU Effect Runner
 *
 * Implements IEffectRunner using WebGPU compute shaders.
 * Designed for zero-copy texture processing in the rendering pipeline.
 */

import type {
  IEffectRunner,
  IEffectContext,
  ITexture,
  EffectInstance,
  EffectRunResult,
  EffectRunnerState,
  EffectRunnerBackend,
  EffectRunnerGpuInfo,
} from '../types';

// =============================================================================
// Shader Code
// =============================================================================

const COLOR_CORRECTION_SHADER = /* wgsl */ `
struct Params {
  brightness: f32,
  contrast: f32,
  saturation: f32,
  hue: f32,
  gamma: f32,
  exposure: f32,
  _padding: vec2<f32>,
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

fn rgb_to_hsl(rgb: vec3<f32>) -> vec3<f32> {
  let max_c = max(max(rgb.r, rgb.g), rgb.b);
  let min_c = min(min(rgb.r, rgb.g), rgb.b);
  let l = (max_c + min_c) / 2.0;

  if (max_c == min_c) {
    return vec3<f32>(0.0, 0.0, l);
  }

  let d = max_c - min_c;
  let s = select(d / (2.0 - max_c - min_c), d / (max_c + min_c), l > 0.5);

  var h: f32;
  if (max_c == rgb.r) {
    h = (rgb.g - rgb.b) / d + select(0.0, 6.0, rgb.g < rgb.b);
  } else if (max_c == rgb.g) {
    h = (rgb.b - rgb.r) / d + 2.0;
  } else {
    h = (rgb.r - rgb.g) / d + 4.0;
  }
  h /= 6.0;

  return vec3<f32>(h, s, l);
}

fn hue_to_rgb(p: f32, q: f32, t: f32) -> f32 {
  var t_mod = t;
  if (t_mod < 0.0) { t_mod += 1.0; }
  if (t_mod > 1.0) { t_mod -= 1.0; }
  if (t_mod < 1.0/6.0) { return p + (q - p) * 6.0 * t_mod; }
  if (t_mod < 1.0/2.0) { return q; }
  if (t_mod < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - t_mod) * 6.0; }
  return p;
}

fn hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
  if (hsl.y == 0.0) {
    return vec3<f32>(hsl.z, hsl.z, hsl.z);
  }

  let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
  let p = 2.0 * hsl.z - q;

  return vec3<f32>(
    hue_to_rgb(p, q, hsl.x + 1.0/3.0),
    hue_to_rgb(p, q, hsl.x),
    hue_to_rgb(p, q, hsl.x - 1.0/3.0)
  );
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);
  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let coord = vec2<i32>(global_id.xy);
  var color = textureLoad(inputTexture, coord, 0);

  // Exposure
  color = vec4<f32>(color.rgb * pow(2.0, params.exposure), color.a);

  // Brightness
  color = vec4<f32>(color.rgb + params.brightness, color.a);

  // Contrast
  color = vec4<f32>((color.rgb - 0.5) * params.contrast + 0.5, color.a);

  // Gamma
  color = vec4<f32>(pow(max(color.rgb, vec3<f32>(0.0)), vec3<f32>(1.0 / params.gamma)), color.a);

  // Saturation and Hue
  var hsl = rgb_to_hsl(color.rgb);
  hsl.y *= params.saturation;
  hsl.x += params.hue / 360.0;
  if (hsl.x > 1.0) { hsl.x -= 1.0; }
  if (hsl.x < 0.0) { hsl.x += 1.0; }
  color = vec4<f32>(hsl_to_rgb(hsl), color.a);

  // Clamp
  color = clamp(color, vec4<f32>(0.0), vec4<f32>(1.0));

  textureStore(outputTexture, coord, color);
}
`;

const BLUR_SHADER = /* wgsl */ `
struct Params {
  radius: f32,
  direction: vec2<f32>,
  _padding: f32,
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);
  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let coord = vec2<i32>(global_id.xy);
  var color = vec4<f32>(0.0);
  var total_weight = 0.0;

  let radius = i32(params.radius);
  let sigma = params.radius / 3.0;

  for (var i = -radius; i <= radius; i++) {
    let offset = vec2<i32>(params.direction * f32(i));
    let sample_coord = coord + offset;

    if (sample_coord.x >= 0 && sample_coord.x < i32(dims.x) &&
        sample_coord.y >= 0 && sample_coord.y < i32(dims.y)) {
      let weight = exp(-f32(i * i) / (2.0 * sigma * sigma));
      color += textureLoad(inputTexture, sample_coord, 0) * weight;
      total_weight += weight;
    }
  }

  color /= total_weight;
  textureStore(outputTexture, coord, color);
}
`;

const CHROMA_KEY_SHADER = /* wgsl */ `
struct Params {
  keyColor: vec3<f32>,
  similarity: f32,
  smoothness: f32,
  spillSuppression: f32,
  _padding: vec2<f32>,
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let dims = textureDimensions(inputTexture);
  if (global_id.x >= dims.x || global_id.y >= dims.y) {
    return;
  }

  let coord = vec2<i32>(global_id.xy);
  var color = textureLoad(inputTexture, coord, 0);

  // Calculate color distance from key color
  let diff = color.rgb - params.keyColor;
  let dist = length(diff);

  // Calculate alpha based on similarity and smoothness
  let edge = params.similarity;
  let alpha = smoothstep(edge - params.smoothness, edge + params.smoothness, dist);

  // Spill suppression
  if (params.spillSuppression > 0.0) {
    let spillAmount = max(0.0, color.g - max(color.r, color.b));
    color = vec4<f32>(
      color.r,
      color.g - spillAmount * params.spillSuppression,
      color.b,
      color.a
    );
  }

  textureStore(outputTexture, coord, vec4<f32>(color.rgb, color.a * alpha));
}
`;

// =============================================================================
// Supported Effects
// =============================================================================

const SUPPORTED_EFFECTS = [
  'colorCorrection',
  'gaussianBlur',
  'boxBlur',
  'chromaKey',
  'sharpen',
  'vignette',
  'glow',
  'noise',
] as const;

// =============================================================================
// WebGPU Effect Runner
// =============================================================================

/**
 * WebGPU-based effect runner
 * Implements IEffectRunner for zero-copy GPU effect processing
 */
export class WebGPUEffectRunner implements IEffectRunner {
  readonly backend: EffectRunnerBackend = 'webgpu';

  private _state: EffectRunnerState = 'uninitialized';
  private _gpuInfo: EffectRunnerGpuInfo | null = null;

  // GPU resources
  private _device: GPUDevice | null = null;
  private _queue: GPUQueue | null = null;

  // Pipelines
  private _colorCorrectionPipeline: GPUComputePipeline | null = null;
  private _blurPipeline: GPUComputePipeline | null = null;
  private _chromaKeyPipeline: GPUComputePipeline | null = null;

  // Bind group layout
  private _bindGroupLayout: GPUBindGroupLayout | null = null;

  // Texture pool for ping-pong rendering
  private _texturePool: GPUTexture[] = [];

  // =========================================================================
  // Properties
  // =========================================================================

  get state(): EffectRunnerState {
    return this._state;
  }

  get gpuInfo(): EffectRunnerGpuInfo | null {
    return this._gpuInfo;
  }

  get isReady(): boolean {
    return this._state === 'ready';
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  async initialize(context: IEffectContext): Promise<void> {
    if (this._state !== 'uninitialized') {
      throw new Error(`Cannot initialize in state: ${this._state}`);
    }

    try {
      // Get device from context
      // Check if device has GPUDevice characteristics (createTexture method)
      if (!context.device || typeof (context.device as GPUDevice).createTexture !== 'function') {
        throw new Error('WebGPUEffectRunner requires GPUDevice');
      }

      this._device = context.device as GPUDevice;
      this._queue = context.queue ?? this._device.queue;

      // Get GPU info
      this._gpuInfo = {
        deviceName: 'WebGPU Device',
        vendor: 'Unknown',
        backend: 'webgpu',
        isDiscrete: false,
        maxTextureSize: this._device.limits.maxTextureDimension2D,
      };

      // Create bind group layout
      this._bindGroupLayout = this._device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.COMPUTE,
            texture: { sampleType: 'float' },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            storageTexture: { access: 'write-only', format: 'rgba8unorm' },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' },
          },
        ],
      });

      // Create pipelines
      await this._createPipelines();

      this._state = 'ready';
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  async dispose(): Promise<void> {
    // Clear texture pool
    for (const texture of this._texturePool) {
      texture.destroy();
    }
    this._texturePool = [];

    // Clear pipelines
    this._colorCorrectionPipeline = null;
    this._blurPipeline = null;
    this._chromaKeyPipeline = null;
    this._bindGroupLayout = null;

    // Don't destroy device - it's owned by context
    this._device = null;
    this._queue = null;

    this._state = 'disposed';
  }

  // =========================================================================
  // Effect Execution
  // =========================================================================

  async run(
    input: ITexture,
    effects: EffectInstance[],
    localTime: number
  ): Promise<EffectRunResult> {
    if (!this.isReady || !this._device || !this._queue) {
      throw new Error('Effect runner not ready');
    }

    const startTime = performance.now();

    // Filter enabled and supported effects
    const enabledEffects = effects
      .filter((e) => e.enabled && this.isEffectSupported(e.type))
      .sort((a, b) => a.order - b.order);

    // No effects to apply
    if (enabledEffects.length === 0) {
      return {
        texture: input,
        isNewTexture: false,
        processingTime: performance.now() - startTime,
      };
    }

    this._state = 'processing';

    try {
      // Get or create working textures
      const width = input.width;
      const height = input.height;

      let currentTexture = this._copyToWorkingTexture(input);
      let outputTexture = this._getOrCreateTexture(width, height);

      // Apply each effect
      for (const effect of enabledEffects) {
        await this._applyEffect(currentTexture, outputTexture, effect, localTime);

        // Swap textures for next pass
        const temp = currentTexture;
        currentTexture = outputTexture;
        outputTexture = temp;
      }

      // Return the result texture wrapped in ITexture
      const resultTexture: ITexture = {
        width,
        height,
        native: currentTexture,
        id: `effect_result_${Date.now()}`,
      };

      // Return unused texture to pool
      this._texturePool.push(outputTexture);

      this._state = 'ready';

      return {
        texture: resultTexture,
        isNewTexture: true,
        processingTime: performance.now() - startTime,
      };
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  async runSingle(
    input: ITexture,
    effect: EffectInstance,
    localTime: number
  ): Promise<EffectRunResult> {
    return this.run(input, [effect], localTime);
  }

  // =========================================================================
  // Effect Support
  // =========================================================================

  isEffectSupported(effectType: string): boolean {
    return SUPPORTED_EFFECTS.includes(effectType as typeof SUPPORTED_EFFECTS[number]);
  }

  getSupportedEffects(): string[] {
    return [...SUPPORTED_EFFECTS];
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  private async _createPipelines(): Promise<void> {
    if (!this._device || !this._bindGroupLayout) return;

    const pipelineLayout = this._device.createPipelineLayout({
      bindGroupLayouts: [this._bindGroupLayout],
    });

    // Color correction pipeline
    const colorCorrectionModule = this._device.createShaderModule({
      code: COLOR_CORRECTION_SHADER,
    });
    this._colorCorrectionPipeline = this._device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: colorCorrectionModule, entryPoint: 'main' },
    });

    // Blur pipeline
    const blurModule = this._device.createShaderModule({
      code: BLUR_SHADER,
    });
    this._blurPipeline = this._device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: blurModule, entryPoint: 'main' },
    });

    // Chroma key pipeline
    const chromaKeyModule = this._device.createShaderModule({
      code: CHROMA_KEY_SHADER,
    });
    this._chromaKeyPipeline = this._device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module: chromaKeyModule, entryPoint: 'main' },
    });
  }

  private _copyToWorkingTexture(input: ITexture): GPUTexture {
    if (!this._device || !this._queue) {
      throw new Error('Device not initialized');
    }

    const texture = this._getOrCreateTexture(input.width, input.height);

    // Copy input texture to working texture
    const commandEncoder = this._device.createCommandEncoder();
    commandEncoder.copyTextureToTexture(
      { texture: input.native as GPUTexture },
      { texture },
      { width: input.width, height: input.height }
    );
    this._queue.submit([commandEncoder.finish()]);

    return texture;
  }

  private _getOrCreateTexture(width: number, height: number): GPUTexture {
    if (!this._device) {
      throw new Error('Device not initialized');
    }

    // Try to reuse from pool
    const poolIndex = this._texturePool.findIndex(
      (t) => t.width === width && t.height === height
    );

    if (poolIndex >= 0) {
      return this._texturePool.splice(poolIndex, 1)[0]!;
    }

    // Create new texture
    return this._device.createTexture({
      size: { width, height },
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    });
  }

  private async _applyEffect(
    input: GPUTexture,
    output: GPUTexture,
    effect: EffectInstance,
    _localTime: number
  ): Promise<void> {
    if (!this._device || !this._queue || !this._bindGroupLayout) return;

    let pipeline: GPUComputePipeline | null = null;
    let paramsBuffer: GPUBuffer;

    const params = effect.params;

    switch (effect.type) {
      case 'colorCorrection': {
        pipeline = this._colorCorrectionPipeline;
        const data = new Float32Array([
          (params['brightness'] as number) ?? 0,
          (params['contrast'] as number) ?? 1,
          (params['saturation'] as number) ?? 1,
          (params['hue'] as number) ?? 0,
          (params['gamma'] as number) ?? 1,
          (params['exposure'] as number) ?? 0,
          0, 0, // padding
        ]);
        paramsBuffer = this._device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._queue.writeBuffer(paramsBuffer, 0, data);
        break;
      }

      case 'gaussianBlur':
      case 'boxBlur': {
        // Two-pass separable blur for better quality and performance
        // O(2r) instead of O(r²) complexity
        const radius = (params['radius'] as number) ?? 5;
        const quality = (params['quality'] as string) ?? 'medium';

        // For low quality or small radius, use single pass
        if (quality === 'low' || radius <= 2) {
          pipeline = this._blurPipeline;
          const dataH = new Float32Array([radius, 1, 0, 0]);
          paramsBuffer = this._device.createBuffer({
            size: dataH.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
          });
          this._queue.writeBuffer(paramsBuffer, 0, dataH);
          break;
        }

        // Two-pass blur: horizontal then vertical
        await this._applyTwoPassBlur(input, output, radius);
        return; // Already handled
      }

      case 'chromaKey': {
        pipeline = this._chromaKeyPipeline;
        const keyColor = params['keyColor'] as { r: number; g: number; b: number } | undefined;
        const data = new Float32Array([
          (keyColor?.r ?? 0) / 255,
          (keyColor?.g ?? 255) / 255,
          (keyColor?.b ?? 0) / 255,
          (params['similarity'] as number) ?? 0.4,
          (params['smoothness'] as number) ?? 0.1,
          (params['spillSuppression'] as number) ?? 0.5,
          0, 0, // padding
        ]);
        paramsBuffer = this._device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._queue.writeBuffer(paramsBuffer, 0, data);
        break;
      }

      default:
        console.warn(`[WebGPUEffectRunner] Unsupported effect type: ${effect.type}`);
        return;
    }

    if (!pipeline) return;

    const bindGroup = this._device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: paramsBuffer! } },
      ],
    });

    const commandEncoder = this._device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(
      Math.ceil(input.width / 16),
      Math.ceil(input.height / 16)
    );
    passEncoder.end();

    this._queue.submit([commandEncoder.finish()]);
  }

  /**
   * Apply two-pass separable Gaussian blur
   * Pass 1: Horizontal blur (input → intermediate)
   * Pass 2: Vertical blur (intermediate → output)
   *
   * This reduces complexity from O(r²) to O(2r) for radius r
   */
  private async _applyTwoPassBlur(
    input: GPUTexture,
    output: GPUTexture,
    radius: number
  ): Promise<void> {
    if (!this._device || !this._queue || !this._bindGroupLayout || !this._blurPipeline) {
      return;
    }

    // Get intermediate texture for ping-pong
    const intermediate = this._getOrCreateTexture(input.width, input.height);

    // Pass 1: Horizontal blur (input → intermediate)
    const horizontalParams = new Float32Array([radius, 1, 0, 0]); // direction = (1, 0)
    const horizontalBuffer = this._device.createBuffer({
      size: horizontalParams.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._queue.writeBuffer(horizontalBuffer, 0, horizontalParams);

    const horizontalBindGroup = this._device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: intermediate.createView() },
        { binding: 2, resource: { buffer: horizontalBuffer } },
      ],
    });

    // Pass 2: Vertical blur (intermediate → output)
    const verticalParams = new Float32Array([radius, 0, 1, 0]); // direction = (0, 1)
    const verticalBuffer = this._device.createBuffer({
      size: verticalParams.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._queue.writeBuffer(verticalBuffer, 0, verticalParams);

    const verticalBindGroup = this._device.createBindGroup({
      layout: this._bindGroupLayout,
      entries: [
        { binding: 0, resource: intermediate.createView() },
        { binding: 1, resource: output.createView() },
        { binding: 2, resource: { buffer: verticalBuffer } },
      ],
    });

    // Execute both passes
    const commandEncoder = this._device.createCommandEncoder();

    // Horizontal pass
    const horizontalPass = commandEncoder.beginComputePass();
    horizontalPass.setPipeline(this._blurPipeline);
    horizontalPass.setBindGroup(0, horizontalBindGroup);
    horizontalPass.dispatchWorkgroups(
      Math.ceil(input.width / 16),
      Math.ceil(input.height / 16)
    );
    horizontalPass.end();

    // Vertical pass
    const verticalPass = commandEncoder.beginComputePass();
    verticalPass.setPipeline(this._blurPipeline);
    verticalPass.setBindGroup(0, verticalBindGroup);
    verticalPass.dispatchWorkgroups(
      Math.ceil(input.width / 16),
      Math.ceil(input.height / 16)
    );
    verticalPass.end();

    this._queue.submit([commandEncoder.finish()]);

    // Return intermediate texture to pool
    this._texturePool.push(intermediate);

    // Cleanup buffers
    horizontalBuffer.destroy();
    verticalBuffer.destroy();
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a WebGPU effect runner
 */
export function createWebGPUEffectRunner(): WebGPUEffectRunner {
  return new WebGPUEffectRunner();
}

/**
 * Check if WebGPU is supported
 */
export function isWebGPUSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
