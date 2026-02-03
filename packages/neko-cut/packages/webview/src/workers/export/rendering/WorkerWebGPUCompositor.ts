/**
 * Worker WebGPU Zero-Copy Compositor
 *
 * Implements zero-copy video compositing using WebGPU.
 * VideoFrame → GPU Texture → Composite → VideoFrame without CPU readback.
 *
 * Zero-copy pipeline:
 * 1. VideoFrame imported directly as GPUExternalTexture (no copy)
 * 2. GPU shader performs transform and blend
 * 3. Render to OffscreenCanvas
 * 4. Create VideoFrame from canvas (GPU-backed)
 *
 * NOTE: WebGPU is required. No fallback to 2D Canvas.
 */

import type { SerializedProjectData, SerializedTransform } from '../protocol/messages';

// =============================================================================
// Types
// =============================================================================

export interface ZeroCopyCompositorConfig {
  width: number;
  height: number;
}

export interface CompositeLayer {
  elementId: string;
  frame: VideoFrame;
  transform: SerializedTransform;
  zIndex: number;
}

// =============================================================================
// Shader Code
// =============================================================================

const VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) texCoord: vec2f,
}

struct Uniforms {
  transform: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen quad vertices
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );

  var texCoords = array<vec2f, 6>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 0.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 1.0),
    vec2f(1.0, 0.0),
  );

  var output: VertexOutput;
  let pos = uniforms.transform * vec4f(positions[vertexIndex], 0.0, 1.0);
  output.position = pos;
  output.texCoord = texCoords[vertexIndex];
  return output;
}
`;

const FRAGMENT_SHADER = /* wgsl */ `
struct Uniforms {
  transform: mat4x4f,
  opacity: f32,
  _padding: vec3f,
}

@group(0) @binding(0) var videoTexture: texture_external;
@group(0) @binding(1) var videoSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

@fragment
fn main(@location(0) texCoord: vec2f) -> @location(0) vec4f {
  let color = textureSampleBaseClampToEdge(videoTexture, videoSampler, texCoord);
  return vec4f(color.rgb, color.a * uniforms.opacity);
}
`;

// =============================================================================
// WorkerWebGPUCompositor
// =============================================================================

export class WorkerWebGPUCompositor {
  private _canvas: OffscreenCanvas | null = null;
  private _config: ZeroCopyCompositorConfig | null = null;

  // WebGPU resources
  private _device: GPUDevice | null = null;
  private _context: GPUCanvasContext | null = null;
  private _pipeline: GPURenderPipeline | null = null;
  private _sampler: GPUSampler | null = null;
  private _uniformBuffer: GPUBuffer | null = null;

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize compositor with OffscreenCanvas
   * @throws Error if WebGPU is not available
   */
  async initialize(canvas: OffscreenCanvas): Promise<void> {
    this._canvas = canvas;
    this._config = {
      width: canvas.width,
      height: canvas.height,
    };

    // Check WebGPU availability
    if (!('gpu' in navigator)) {
      throw new Error('WebGPU is not supported in this browser');
    }

    await this._initializeWebGPU(canvas);
    console.log('[WorkerWebGPUCompositor] Initialized with WebGPU (zero-copy)');
  }

  private async _initializeWebGPU(canvas: OffscreenCanvas): Promise<void> {
    // Request adapter and device
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error('No WebGPU adapter available');
    }

    this._device = await adapter.requestDevice();

    // Configure canvas context
    this._context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
    if (!this._context) {
      throw new Error('Failed to get WebGPU context');
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    this._context.configure({
      device: this._device,
      format,
      alphaMode: 'premultiplied',
    });

    // Create shader module
    const shaderModule = this._device.createShaderModule({
      code: VERTEX_SHADER + FRAGMENT_SHADER,
    });

    // Create pipeline
    this._pipeline = this._device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: shaderModule,
        entryPoint: 'main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'main',
        targets: [{
          format,
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
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    // Create sampler
    this._sampler = this._device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Create uniform buffer (transform matrix + opacity)
    this._uniformBuffer = this._device.createBuffer({
      size: 96, // mat4x4f (64) + f32 opacity (4) + vec3f padding at offset 80 (12) = 96 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  /**
   * Render frame with multiple layers using WebGPU zero-copy
   */
  async renderFrame(
    time: number,
    videoFrames: Map<string, VideoFrame>,
    project: SerializedProjectData
  ): Promise<void> {
    if (!this._config || !this._device || !this._context || !this._pipeline) {
      throw new Error('Compositor not initialized');
    }

    // Collect visible layers
    const layers: CompositeLayer[] = [];

    for (const track of project.tracks) {
      if (track.type !== 'video') continue;

      for (const element of track.elements) {
        if (time < element.startTime || time >= element.startTime + element.duration) {
          continue;
        }

        const frame = videoFrames.get(element.id);
        if (!frame) continue;

        layers.push({
          elementId: element.id,
          frame,
          transform: element.transform,
          zIndex: track.index,
        });
      }
    }

    // Sort by z-index
    layers.sort((a, b) => a.zIndex - b.zIndex);

    // Render using WebGPU
    await this._renderWebGPU(layers);
  }

  /**
   * WebGPU zero-copy rendering
   */
  private async _renderWebGPU(layers: CompositeLayer[]): Promise<void> {
    if (!this._device || !this._context || !this._pipeline || !this._config) return;

    const { width, height } = this._config;

    // Get current texture
    const textureView = this._context.getCurrentTexture().createView();

    // Create command encoder
    const commandEncoder = this._device.createCommandEncoder();

    // Begin render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    renderPass.setPipeline(this._pipeline);

    // Render each layer
    for (const layer of layers) {
      this._renderLayerWebGPU(renderPass, layer, width, height);
    }

    renderPass.end();

    // Submit commands
    this._device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Render single layer using WebGPU (zero-copy VideoFrame import)
   */
  private _renderLayerWebGPU(
    renderPass: GPURenderPassEncoder,
    layer: CompositeLayer,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (!this._device || !this._pipeline || !this._sampler || !this._uniformBuffer) return;

    const { frame, transform } = layer;

    // Import VideoFrame as external texture (ZERO-COPY!)
    const externalTexture = this._device.importExternalTexture({
      source: frame,
    });

    // Calculate transform matrix
    const transformMatrix = this._calculateTransformMatrix(transform, canvasWidth, canvasHeight);

    // Update uniform buffer
    // WGSL struct: mat4x4f (64) + f32 opacity at offset 64 + vec3f padding at offset 80 = 96 bytes
    const uniformData = new Float32Array(24);
    uniformData.set(transformMatrix, 0);
    uniformData[16] = transform.opacity;
    // indices 17-23 are padding (already 0)
    this._device.queue.writeBuffer(this._uniformBuffer, 0, uniformData);

    // Create bind group
    const bindGroup = this._device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: externalTexture },
        { binding: 1, resource: this._sampler },
        { binding: 2, resource: { buffer: this._uniformBuffer } },
      ],
    });

    renderPass.setBindGroup(0, bindGroup);
    renderPass.draw(6); // 6 vertices for quad
  }

  /**
   * Calculate 4x4 transform matrix from SerializedTransform
   * Uses the same calculation as preview's _createTransformData
   */
  private _calculateTransformMatrix(
    transform: SerializedTransform,
    canvasWidth: number,
    canvasHeight: number
  ): Float32Array {
    const matrix = new Float32Array(16);

    // NOTE: SerializedTransform fields are named confusingly:
    // - width/height are actually scaleX/scaleY (1.0 = original size)
    // - x/y are pixel offsets from center (same as preview's transform.x/y)

    // Build transform matrix (same as preview's _createTransformData)
    const scaleX = (transform.width ?? 1) * (transform.flipX ? -1 : 1);
    const scaleY = (transform.height ?? 1) * (transform.flipY ? -1 : 1);

    // Convert pixel offset to clip space (-1 to 1)
    const translateX = (transform.x ?? 0) / (canvasWidth / 2);
    const translateY = (transform.y ?? 0) / (canvasHeight / 2);

    const rad = ((transform.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Column-major 4x4 matrix
    matrix[0] = scaleX * cos;
    matrix[1] = scaleX * sin;
    matrix[2] = 0;
    matrix[3] = 0;

    matrix[4] = -scaleY * sin;
    matrix[5] = scaleY * cos;
    matrix[6] = 0;
    matrix[7] = 0;

    matrix[8] = 0;
    matrix[9] = 0;
    matrix[10] = 1;
    matrix[11] = 0;

    matrix[12] = translateX;
    matrix[13] = translateY;
    matrix[14] = 0;
    matrix[15] = 1;

    return matrix;
  }

  /**
   * Create VideoFrame from current canvas state
   */
  toVideoFrame(timestamp: number): VideoFrame {
    if (!this._canvas) {
      throw new Error('Compositor not initialized');
    }

    // Creating VideoFrame from OffscreenCanvas is GPU-backed (zero-copy)
    return new VideoFrame(this._canvas, { timestamp });
  }

  // ===========================================================================
  // Properties
  // ===========================================================================

  /**
   * Always true - WebGPU zero-copy mode
   */
  get isZeroCopy(): boolean {
    return true;
  }

  /**
   * Always WebGPU
   */
  get backend(): string {
    return 'WebGPU';
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose compositor resources
   */
  dispose(): void {
    if (this._uniformBuffer) {
      this._uniformBuffer.destroy();
      this._uniformBuffer = null;
    }

    if (this._device) {
      this._device.destroy();
      this._device = null;
    }

    this._pipeline = null;
    this._sampler = null;
    this._context = null;
    this._canvas = null;
    this._config = null;
  }
}
