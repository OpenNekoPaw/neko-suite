/**
 * WebGLCompositor - WebGL 2.0 合成器
 * WebGL 2.0 Compositor implementing ICompositor interface
 *
 * 基于现有 WebGLManager 重构，实现 ICompositor 抽象接口
 */

import type {
  MaskInstance,
  MaskShape,
  RectangleMask,
  EllipseMask,
  PolygonMask,
  BezierMask,
  Point2D,
} from '@uniedit/shared';
import type {
  ICompositor,
  CompositorBackend,
  CompositorOptions,
  TextureSource,
  ITexture,
  ILayer,
  ITransform,
} from '../ICompositor';
import { DEFAULT_COMPOSITOR_OPTIONS } from '../ICompositor';
import type { BlendModeType, ColorCorrectionParams, GPUTransitionType, TransitionRenderParams } from '../types';
import { GPU_TRANSITION_TYPE_MAP } from '../types';
import { SHADER_DEFINITIONS } from '../shaders';

// =============================================================================
// Types
// =============================================================================

interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation>;
  attributes: Map<string, number>;
}

interface WebGLTextureInfo extends ITexture {
  readonly native: WebGLTexture;
}

interface FramebufferInfo {
  framebuffer: WebGLFramebuffer;
  texture: WebGLTextureInfo;
}

// =============================================================================
// Constants
// =============================================================================

/** Blend mode to shader int mapping */
const BLEND_MODE_MAP: Record<BlendModeType, number> = {
  normal: 0,
  dissolve: 0,
  darken: 4,
  multiply: 1,
  colorBurn: 7,
  linearBurn: 17,
  darkerColor: 4,
  lighten: 5,
  screen: 2,
  colorDodge: 6,
  linearDodge: 16,
  lighterColor: 5,
  overlay: 3,
  softLight: 9,
  hardLight: 8,
  vividLight: 18,
  linearLight: 19,
  pinLight: 20,
  hardMix: 21,
  difference: 10,
  exclusion: 11,
  subtract: 22,
  divide: 23,
  hue: 12,
  saturation: 13,
  color: 14,
  luminosity: 15,
};

/** Default color correction params */
const DEFAULT_COLOR_CORRECTION: ColorCorrectionParams = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
};

/** Mask blend mode to shader int mapping */
const MASK_BLEND_MODE_MAP: Record<string, number> = {
  add: 0,
  subtract: 1,
  intersect: 2,
  difference: 3,
};

/** Mask shape type to shader int mapping */
const MASK_SHAPE_TYPE_MAP: Record<string, number> = {
  rectangle: 0,
  ellipse: 1,
  polygon: 2,
  bezier: 3,
};

// =============================================================================
// WebGLCompositor Implementation
// =============================================================================

/**
 * WebGL 2.0 合成器
 */
export class WebGLCompositor implements ICompositor {
  private _gl: WebGL2RenderingContext | null = null;
  private _canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private _isInitialized = false;
  private _width = 0;
  private _height = 0;

  // Resource caches
  private _programs: Map<string, ShaderProgram> = new Map();
  private _textures: Set<WebGLTextureInfo> = new Set();
  private _textureIdCounter = 0;

  // Geometry buffers
  private _quadVAO: WebGLVertexArrayObject | null = null;
  private _quadVBO: WebGLBuffer | null = null;

  // Ping-pong framebuffers for multi-pass effects
  private _pingPongFBs: [FramebufferInfo | null, FramebufferInfo | null] = [null, null];

  // Mask framebuffers for multi-mask compositing
  private _maskFBs: [FramebufferInfo | null, FramebufferInfo | null] = [null, null];

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Properties
  // ---------------------------------------------------------------------------

  get backend(): CompositorBackend {
    return 'webgl';
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
    return this._gl;
  }

  get gpuDevice(): GPUDevice | null {
    return null;  // WebGL doesn't use GPUDevice
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
      console.warn('[WebGLCompositor] Already initialized');
      return true;
    }

    const opts = { ...DEFAULT_COMPOSITOR_OPTIONS, ...options };

    // Get WebGL2 context
    const gl = canvas.getContext('webgl2', {
      alpha: opts.alpha,
      antialias: opts.antialias,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: opts.preserveDrawingBuffer,
      powerPreference: opts.powerPreference,
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      console.error('[WebGLCompositor] WebGL2 not supported');
      return false;
    }

    this._gl = gl;
    this._canvas = canvas;
    this._width = canvas.width;
    this._height = canvas.height;

    // Initialize resources
    try {
      this._initQuadGeometry();
      this._compileShaders();
      this._createPingPongFBs();
      this._createMaskFBs();
      this._isInitialized = true;
      console.log('[WebGLCompositor] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[WebGLCompositor] Initialization failed:', error);
      this.dispose();
      return false;
    }
  }

  dispose(): void {
    if (!this._gl) return;

    const gl = this._gl;

    // Delete textures
    for (const tex of this._textures) {
      gl.deleteTexture(tex.native);
    }
    this._textures.clear();

    // Delete ping-pong framebuffers
    for (const fb of this._pingPongFBs) {
      if (fb) {
        gl.deleteFramebuffer(fb.framebuffer);
        gl.deleteTexture(fb.texture.native);
      }
    }
    this._pingPongFBs = [null, null];

    // Delete mask framebuffers
    for (const fb of this._maskFBs) {
      if (fb) {
        gl.deleteFramebuffer(fb.framebuffer);
        gl.deleteTexture(fb.texture.native);
      }
    }
    this._maskFBs = [null, null];

    // Delete programs
    for (const prog of this._programs.values()) {
      gl.deleteProgram(prog.program);
    }
    this._programs.clear();

    // Delete quad geometry
    if (this._quadVAO) {
      gl.deleteVertexArray(this._quadVAO);
      this._quadVAO = null;
    }
    if (this._quadVBO) {
      gl.deleteBuffer(this._quadVBO);
      this._quadVBO = null;
    }

    this._gl = null;
    this._canvas = null;
    this._isInitialized = false;
    this._width = 0;
    this._height = 0;

    console.log('[WebGLCompositor] Disposed');
  }

  resize(width: number, height: number): void {
    if (!this._canvas) return;

    this._canvas.width = width;
    this._canvas.height = height;
    this._width = width;
    this._height = height;

    // Recreate ping-pong framebuffers
    this._destroyPingPongFBs();
    this._createPingPongFBs();

    // Recreate mask framebuffers
    this._destroyMaskFBs();
    this._createMaskFBs();
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Texture Management
  // ---------------------------------------------------------------------------

  createTexture(source: TextureSource): ITexture | null {
    if (!this._gl) return null;

    const gl = this._gl;

    const texture = gl.createTexture();
    if (!texture) {
      console.error('[WebGLCompositor] Failed to create texture');
      return null;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Flip Y for HTML elements
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    // Get dimensions
    let width = 0;
    let height = 0;

    if (source instanceof HTMLImageElement || source instanceof HTMLVideoElement) {
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

    // Upload texture data
    // Note: VideoFrame from ImageBitmap may not work directly with texImage2D in some browsers
    // We cast to TexImageSource which WebGL should handle
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);

    gl.bindTexture(gl.TEXTURE_2D, null);

    const textureInfo: WebGLTextureInfo = {
      native: texture,
      width,
      height,
      id: `webgl_tex_${this._textureIdCounter++}`,
    };

    this._textures.add(textureInfo);
    return textureInfo;
  }

  updateTexture(texture: ITexture, source: TextureSource): void {
    if (!this._gl) return;

    const gl = this._gl;
    const webglTexture = texture as WebGLTextureInfo;

    gl.bindTexture(gl.TEXTURE_2D, webglTexture.native);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  deleteTexture(texture: ITexture): void {
    if (!this._gl) return;

    const webglTexture = texture as WebGLTextureInfo;
    this._gl.deleteTexture(webglTexture.native);
    this._textures.delete(webglTexture);
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Frame Texture Pooling
  // ---------------------------------------------------------------------------

  /**
   * Acquire a frame texture from the pool, optionally updating its content
   * WebGL implementation: creates or reuses textures (simplified pooling)
   *
   * @param width - Texture width
   * @param height - Texture height
   * @param source - Optional texture source to write into the acquired texture
   * @returns Texture info or null if creation fails
   */
  acquirePooledFrameTexture(
    width: number,
    height: number,
    source?: TextureSource
  ): ITexture | null {
    if (!this._gl) return null;

    const gl = this._gl;

    // Create new texture
    const texture = gl.createTexture();
    if (!texture) {
      console.error('[WebGLCompositor] Failed to create pooled texture');
      return null;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Allocate texture storage
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Upload content if source is provided
    if (source) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    }

    gl.bindTexture(gl.TEXTURE_2D, null);

    const textureInfo: WebGLTextureInfo = {
      native: texture,
      width,
      height,
      id: `frame_pool_${this._textureIdCounter++}`,
    };

    this._textures.add(textureInfo);
    return textureInfo;
  }

  /**
   * Release a frame texture back to the pool
   * WebGL implementation: deletes the texture (no actual pooling)
   *
   * @param texture - The texture to release
   */
  releasePooledFrameTexture(texture: ITexture): void {
    // In WebGL, we simply delete the texture
    // A more sophisticated implementation could maintain a pool
    this.deleteTexture(texture);
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Rendering
  // ---------------------------------------------------------------------------

  beginFrame(): void {
    if (!this._gl) return;

    const gl = this._gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this._width, this._height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  drawLayer(layer: ILayer): void {
    if (!this._gl) return;

    const gl = this._gl;

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Check if we need color correction
    const hasColorCorrection = layer.colorCorrection && this._hasNonDefaultColorCorrection(layer.colorCorrection);

    // Check if we need masks
    const hasMasks = layer.masks && layer.masks.length > 0;

    if (hasMasks) {
      // Render with masks
      this._renderWithMasks(layer, hasColorCorrection ?? false);
    } else if (hasColorCorrection) {
      this._renderWithColorCorrection(layer);
    } else {
      this._renderBasic(layer);
    }

    gl.disable(gl.BLEND);
  }

  drawLayers(layers: ILayer[]): void {
    if (!this._gl || layers.length === 0) return;

    const gl = this._gl;

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Ensure ping-pong framebuffers exist
    if (!this._pingPongFBs[0] || !this._pingPongFBs[1]) {
      this._createPingPongFBs();
    }

    // Render first layer to ping buffer
    let currentFB = this._pingPongFBs[0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, currentFB?.framebuffer || null);
    gl.viewport(0, 0, this._width, this._height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Render each layer
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const isLast = i === layers.length - 1;

      // For blend modes other than normal, use blend shader
      if (layer.blendMode !== 'normal' && currentFB) {
        this._renderWithBlendMode(layer, currentFB.texture, isLast);
      } else {
        if (isLast) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        this.drawLayer(layer);
      }

      // Swap ping-pong buffers for next iteration
      if (!isLast) {
        currentFB = currentFB === this._pingPongFBs[0] ? this._pingPongFBs[1] : this._pingPongFBs[0];
      }
    }

    gl.disable(gl.BLEND);
  }

  endFrame(): void {
    // CRITICAL: Ensure all GPU commands are completed before reading pixels
    // Without this, toBlob/toImageData may read incomplete frame data
    if (this._gl) {
      this._gl.finish();
    }
  }

  // ---------------------------------------------------------------------------
  // ICompositor Implementation - Export
  // ---------------------------------------------------------------------------

  toVideoFrame(timestamp: number): VideoFrame {
    if (!this._canvas) {
      console.error('[WebGLCompositor] toVideoFrame failed: canvas is null');
      throw new Error('Compositor not initialized');
    }

    // Check if WebGL context is still valid
    if (!this._gl) {
      console.error('[WebGLCompositor] toVideoFrame failed: WebGL context is null');
      throw new Error('WebGL context not available');
    }

    // Check if context is lost
    if (this._gl.isContextLost()) {
      console.error('[WebGLCompositor] toVideoFrame failed: WebGL context is lost');
      throw new Error('WebGL context lost');
    }

    // Log canvas state for debugging
    console.log('[WebGLCompositor] toVideoFrame: creating VideoFrame', {
      canvasWidth: this._canvas.width,
      canvasHeight: this._canvas.height,
      timestamp,
      isOffscreenCanvas: this._canvas instanceof OffscreenCanvas,
    });

    // Create VideoFrame from canvas
    try {
      const videoFrame = new VideoFrame(this._canvas as HTMLCanvasElement, {
        timestamp,
      });
      console.log('[WebGLCompositor] toVideoFrame: VideoFrame created successfully', {
        width: videoFrame.displayWidth,
        height: videoFrame.displayHeight,
        format: videoFrame.format,
      });
      return videoFrame;
    } catch (error) {
      console.error('[WebGLCompositor] toVideoFrame failed: VideoFrame constructor error', {
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
    if (!this._gl) {
      throw new Error('Compositor not initialized');
    }

    const gl = this._gl;

    // CRITICAL: Ensure all GPU commands are completed before reading pixels
    gl.finish();

    const pixels = new Uint8ClampedArray(this._width * this._height * 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, this._width, this._height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // Flip Y (WebGL origin is bottom-left)
    const rowSize = this._width * 4;
    const tempRow = new Uint8ClampedArray(rowSize);

    for (let y = 0; y < this._height / 2; y++) {
      const topOffset = y * rowSize;
      const bottomOffset = (this._height - 1 - y) * rowSize;

      tempRow.set(pixels.subarray(topOffset, topOffset + rowSize));
      pixels.copyWithin(topOffset, bottomOffset, bottomOffset + rowSize);
      pixels.set(tempRow, bottomOffset);
    }

    return new ImageData(pixels, this._width, this._height);
  }

  async toImageDataAsync(): Promise<ImageData> {
    // WebGL supports sync readPixels, just wrap the sync version
    return this.toImageData();
  }

  async toBlob(type: string = 'image/png', quality?: number): Promise<Blob> {
    if (!this._canvas) {
      throw new Error('Compositor not initialized');
    }

    // CRITICAL: Ensure all GPU commands are completed before reading canvas
    // This prevents corrupted/incomplete JPEG data (EOI missing error in FFmpeg)
    if (this._gl) {
      this._gl.finish();
    }

    // Convert canvas to blob with timeout protection
    const blobPromise = this._canvas instanceof OffscreenCanvas
      ? this._canvas.convertToBlob({ type, quality })
      : new Promise<Blob>((resolve, reject) => {
          (this._canvas as HTMLCanvasElement).toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to create blob'));
              }
            },
            type,
            quality
          );
        });

    // Apply timeout to blob conversion (10 seconds)
    return Promise.race([
      blobPromise,
      new Promise<Blob>((_, reject) =>
        setTimeout(() => reject(new Error('Blob conversion timeout')), 10000)
      ),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Initialization
  // ---------------------------------------------------------------------------

  private _initQuadGeometry(): void {
    if (!this._gl) return;

    const gl = this._gl;

    // Quad vertices: position (x, y) and texCoord (u, v)
    const vertices = new Float32Array([
      -1.0, -1.0,  0.0, 0.0,
       1.0, -1.0,  1.0, 0.0,
      -1.0,  1.0,  0.0, 1.0,
       1.0,  1.0,  1.0, 1.0,
    ]);

    // Create VAO
    this._quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this._quadVAO);

    // Create VBO
    this._quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Position attribute (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);

    // TexCoord attribute (location 1)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  private _compileShaders(): void {
    for (const def of SHADER_DEFINITIONS) {
      const program = this._compileProgram(def.vertex, def.fragment);
      if (program) {
        this._programs.set(def.name, program);
      }
    }

    console.log(`[WebGLCompositor] Compiled ${this._programs.size} shader programs`);
  }

  private _compileProgram(vertexSource: string, fragmentSource: string): ShaderProgram | null {
    if (!this._gl) return null;

    const gl = this._gl;

    // Compile vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    if (!vertexShader) return null;

    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);

    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('[WebGLCompositor] Vertex shader error:', gl.getShaderInfoLog(vertexShader));
      gl.deleteShader(vertexShader);
      return null;
    }

    // Compile fragment shader
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
      return null;
    }

    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);

    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('[WebGLCompositor] Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    // Link program
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, 'a_position');
    gl.bindAttribLocation(program, 1, 'a_texCoord');
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[WebGLCompositor] Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // Get uniforms and attributes
    const uniforms = new Map<string, WebGLUniformLocation>();
    const attributes = new Map<string, number>();

    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
      const info = gl.getActiveUniform(program, i);
      if (info) {
        const location = gl.getUniformLocation(program, info.name);
        if (location) {
          uniforms.set(info.name, location);
        }
      }
    }

    const attribCount = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < attribCount; i++) {
      const info = gl.getActiveAttrib(program, i);
      if (info) {
        attributes.set(info.name, gl.getAttribLocation(program, info.name));
      }
    }

    return { program, uniforms, attributes };
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Framebuffers
  // ---------------------------------------------------------------------------

  private _createPingPongFBs(): void {
    this._pingPongFBs[0] = this._createFramebuffer(this._width, this._height);
    this._pingPongFBs[1] = this._createFramebuffer(this._width, this._height);
  }

  private _destroyPingPongFBs(): void {
    for (const fb of this._pingPongFBs) {
      if (fb && this._gl) {
        this._gl.deleteFramebuffer(fb.framebuffer);
        this._gl.deleteTexture(fb.texture.native);
      }
    }
    this._pingPongFBs = [null, null];
  }

  private _createFramebuffer(width: number, height: number): FramebufferInfo | null {
    if (!this._gl) return null;

    const gl = this._gl;

    const texture = gl.createTexture();
    if (!texture) return null;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('[WebGLCompositor] Framebuffer incomplete:', status);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
      return null;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
      framebuffer,
      texture: {
        native: texture,
        width,
        height,
        id: `fb_tex_${this._textureIdCounter++}`,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Rendering
  // ---------------------------------------------------------------------------

  private _renderBasic(layer: ILayer): void {
    if (!this._gl) return;

    const gl = this._gl;
    const program = this._programs.get('basic');
    if (!program) return;

    gl.useProgram(program.program);

    // Set uniforms
    const matrixLoc = program.uniforms.get('u_matrix');
    const textureLoc = program.uniforms.get('u_texture');
    const opacityLoc = program.uniforms.get('u_opacity');

    if (matrixLoc) {
      const matrix = this._computeTransformMatrix(layer.transform);
      gl.uniformMatrix3fv(matrixLoc, false, matrix);
    }

    if (textureLoc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (layer.texture as WebGLTextureInfo).native);
      gl.uniform1i(textureLoc, 0);
    }

    if (opacityLoc) {
      gl.uniform1f(opacityLoc, layer.opacity);
    }

    this._drawQuad();
  }

  private _renderWithColorCorrection(layer: ILayer): void {
    if (!this._gl) return;

    const gl = this._gl;
    const program = this._programs.get('colorCorrection');
    if (!program) {
      this._renderBasic(layer);
      return;
    }

    gl.useProgram(program.program);

    const cc = layer.colorCorrection || DEFAULT_COLOR_CORRECTION;

    // Set transform matrix
    const matrixLoc = program.uniforms.get('u_matrix');
    if (matrixLoc) {
      const matrix = this._computeTransformMatrix(layer.transform);
      gl.uniformMatrix3fv(matrixLoc, false, matrix);
    }

    // Set texture
    const textureLoc = program.uniforms.get('u_texture');
    if (textureLoc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (layer.texture as WebGLTextureInfo).native);
      gl.uniform1i(textureLoc, 0);
    }

    // Set opacity
    const opacityLoc = program.uniforms.get('u_opacity');
    if (opacityLoc) {
      gl.uniform1f(opacityLoc, layer.opacity);
    }

    // Set basic color correction uniforms
    this._setUniform(program, 'u_exposure', cc.exposure);
    this._setUniform(program, 'u_contrast', cc.contrast);
    this._setUniform(program, 'u_highlights', cc.highlights);
    this._setUniform(program, 'u_shadows', cc.shadows);
    this._setUniform(program, 'u_whites', cc.whites);
    this._setUniform(program, 'u_blacks', cc.blacks);
    this._setUniform(program, 'u_temperature', cc.temperature);
    this._setUniform(program, 'u_tint', cc.tint);
    this._setUniform(program, 'u_saturation', cc.saturation);
    this._setUniform(program, 'u_vibrance', cc.vibrance);

    // Set vignette uniforms
    const vignette = cc.vignette;
    this._setUniform(program, 'u_vignetteAmount', vignette?.amount ?? 0);
    this._setUniform(program, 'u_vignetteMidpoint', vignette?.midpoint ?? 50);
    this._setUniform(program, 'u_vignetteRoundness', vignette?.roundness ?? 0);
    this._setUniform(program, 'u_vignetteFeather', vignette?.feather ?? 50);

    // Set color wheels uniforms
    const wheels = cc.colorWheels;
    const shadowsWheel = wheels?.shadows ?? { hue: 0, saturation: 100, luminance: 0 };
    const midtonesWheel = wheels?.midtones ?? { hue: 0, saturation: 100, luminance: 0 };
    const highlightsWheel = wheels?.highlights ?? { hue: 0, saturation: 100, luminance: 0 };

    this._setUniform3f(program, 'u_wheelShadows', shadowsWheel.hue, shadowsWheel.saturation, shadowsWheel.luminance);
    this._setUniform3f(program, 'u_wheelMidtones', midtonesWheel.hue, midtonesWheel.saturation, midtonesWheel.luminance);
    this._setUniform3f(program, 'u_wheelHighlights', highlightsWheel.hue, highlightsWheel.saturation, highlightsWheel.luminance);

    this._drawQuad();
  }

  private _renderWithBlendMode(layer: ILayer, baseTexture: WebGLTextureInfo, toScreen: boolean): void {
    if (!this._gl) return;

    const gl = this._gl;
    const program = this._programs.get('blend');
    if (!program) return;

    if (toScreen) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, this._width, this._height);
    gl.useProgram(program.program);

    // Set base texture (background)
    const baseTexLoc = program.uniforms.get('u_baseTexture');
    if (baseTexLoc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseTexture.native);
      gl.uniform1i(baseTexLoc, 0);
    }

    // Set blend texture (foreground)
    const blendTexLoc = program.uniforms.get('u_blendTexture');
    if (blendTexLoc) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (layer.texture as WebGLTextureInfo).native);
      gl.uniform1i(blendTexLoc, 1);
    }

    // Set opacity
    const opacityLoc = program.uniforms.get('u_opacity');
    if (opacityLoc) {
      gl.uniform1f(opacityLoc, layer.opacity);
    }

    // Set blend mode
    const blendModeLoc = program.uniforms.get('u_blendMode');
    if (blendModeLoc) {
      gl.uniform1i(blendModeLoc, BLEND_MODE_MAP[layer.blendMode] || 0);
    }

    this._drawQuad();
  }

  private _setUniform(program: ShaderProgram, name: string, value: number): void {
    if (!this._gl) return;
    const loc = program.uniforms.get(name);
    if (loc) {
      this._gl.uniform1f(loc, value);
    }
  }

  private _setUniform3f(program: ShaderProgram, name: string, x: number, y: number, z: number): void {
    if (!this._gl) return;
    const loc = program.uniforms.get(name);
    if (loc) {
      this._gl.uniform3f(loc, x, y, z);
    }
  }

  private _computeTransformMatrix(transform: ITransform): Float32Array {
    const { x, y, scaleX, scaleY, rotation } = transform;

    // Convert normalized coords to clip space (-1 to 1)
    const tx = (x - 0.5) * 2;
    const ty = (0.5 - y) * 2;

    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const aspectX = 1;
    const aspectY = this._width / this._height;

    const m = new Float32Array(9);

    const sx = scaleX * aspectX;
    const sy = scaleY * aspectY;

    m[0] = cos * sx;
    m[1] = sin * sx;
    m[2] = 0;
    m[3] = -sin * sy;
    m[4] = cos * sy;
    m[5] = 0;
    m[6] = tx;
    m[7] = ty;
    m[8] = 1;

    return m;
  }

  private _drawQuad(): void {
    if (!this._gl || !this._quadVAO) return;

    const gl = this._gl;
    gl.bindVertexArray(this._quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private _hasNonDefaultColorCorrection(cc: ColorCorrectionParams): boolean {
    return (
      cc.exposure !== 0 ||
      cc.contrast !== 0 ||
      cc.highlights !== 0 ||
      cc.shadows !== 0 ||
      cc.whites !== 0 ||
      cc.blacks !== 0 ||
      cc.temperature !== 0 ||
      cc.tint !== 0 ||
      cc.saturation !== 0 ||
      cc.vibrance !== 0
    );
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Mask Framebuffers
  // ---------------------------------------------------------------------------

  private _createMaskFBs(): void {
    this._maskFBs[0] = this._createFramebuffer(this._width, this._height);
    this._maskFBs[1] = this._createFramebuffer(this._width, this._height);
  }

  private _destroyMaskFBs(): void {
    for (const fb of this._maskFBs) {
      if (fb && this._gl) {
        this._gl.deleteFramebuffer(fb.framebuffer);
        this._gl.deleteTexture(fb.texture.native);
      }
    }
    this._maskFBs = [null, null];
  }

  // ---------------------------------------------------------------------------
  // Private Methods - Mask Rendering
  // ---------------------------------------------------------------------------

  /**
   * Render layer with masks applied
   * 渲染带蒙版的图层
   */
  private _renderWithMasks(layer: ILayer, hasColorCorrection: boolean): void {
    if (!this._gl || !layer.masks || layer.masks.length === 0) {
      // No masks, render normally
      if (hasColorCorrection) {
        this._renderWithColorCorrection(layer);
      } else {
        this._renderBasic(layer);
      }
      return;
    }

    const gl = this._gl;

    // Ensure mask framebuffers exist
    if (!this._maskFBs[0] || !this._maskFBs[1]) {
      this._createMaskFBs();
    }

    // Step 1: Generate combined mask texture
    const combinedMaskTexture = this._generateCombinedMask(layer.masks);
    if (!combinedMaskTexture) {
      // Fallback to rendering without mask
      if (hasColorCorrection) {
        this._renderWithColorCorrection(layer);
      } else {
        this._renderBasic(layer);
      }
      return;
    }

    // Step 2: Render layer to temp framebuffer (with or without color correction)
    const tempFB = this._pingPongFBs[0];
    if (!tempFB) {
      this._renderBasic(layer);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, tempFB.framebuffer);
    gl.viewport(0, 0, this._width, this._height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (hasColorCorrection) {
      this._renderWithColorCorrection(layer);
    } else {
      this._renderBasic(layer);
    }

    // Step 3: Apply mask to rendered layer and output to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this._width, this._height);

    const maskProgram = this._programs.get('mask');
    if (!maskProgram) {
      // Fallback: just draw the temp texture without mask
      this._drawTextureToScreen(tempFB.texture);
      return;
    }

    gl.useProgram(maskProgram.program);

    // Set layer texture
    const textureLoc = maskProgram.uniforms.get('u_texture');
    if (textureLoc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tempFB.texture.native);
      gl.uniform1i(textureLoc, 0);
    }

    // Set mask texture
    const maskTexLoc = maskProgram.uniforms.get('u_maskTexture');
    if (maskTexLoc) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, combinedMaskTexture.native);
      gl.uniform1i(maskTexLoc, 1);
    }

    // Set mask parameters - use 100% opacity since we've already combined
    this._setUniform(maskProgram, 'u_opacity', 100);

    // Set inverted flag (false for combined mask as individual masks handle inversion)
    const invertedLoc = maskProgram.uniforms.get('u_inverted');
    if (invertedLoc) {
      gl.uniform1i(invertedLoc, 0);
    }

    this._drawQuad();
  }

  /**
   * Generate combined mask from multiple mask instances
   * 从多个蒙版实例生成组合蒙版
   */
  private _generateCombinedMask(masks: MaskInstance[]): WebGLTextureInfo | null {
    if (!this._gl || masks.length === 0) return null;

    // Sort masks by order
    const sortedMasks = [...masks].sort((a, b) => a.order - b.order);

    // Ensure mask framebuffers exist
    if (!this._maskFBs[0] || !this._maskFBs[1]) {
      this._createMaskFBs();
    }

    // Generate first mask
    let currentMaskFB: FramebufferInfo | null = this._maskFBs[0];
    if (!currentMaskFB) return null;

    // Render first mask
    this._renderMaskShape(sortedMasks[0], currentMaskFB);

    // Composite subsequent masks
    for (let i = 1; i < sortedMasks.length; i++) {
      const nextMaskFB: FramebufferInfo | null = currentMaskFB === this._maskFBs[0] ? this._maskFBs[1] : this._maskFBs[0];
      if (!nextMaskFB || !currentMaskFB) continue;

      // Render next mask to temp
      const tempMaskFB = this._pingPongFBs[1];
      if (!tempMaskFB) continue;

      this._renderMaskShape(sortedMasks[i], tempMaskFB);

      // Composite current + temp into nextMaskFB
      this._compositeMasks(
        currentMaskFB.texture,
        tempMaskFB.texture,
        sortedMasks[i].blendMode,
        nextMaskFB
      );

      currentMaskFB = nextMaskFB;
    }

    return currentMaskFB?.texture ?? null;
  }

  /**
   * Render a single mask shape to framebuffer
   * 渲染单个蒙版形状到 framebuffer
   */
  private _renderMaskShape(mask: MaskInstance, targetFB: FramebufferInfo): void {
    if (!this._gl) return;

    const gl = this._gl;
    const program = this._programs.get('maskGenerate');
    if (!program) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB.framebuffer);
    gl.viewport(0, 0, this._width, this._height);
    gl.clearColor(0, 0, 0, 1); // Clear to black (no mask)
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program.program);

    // Set shape type
    const shapeTypeLoc = program.uniforms.get('u_shapeType');
    if (shapeTypeLoc) {
      gl.uniform1i(shapeTypeLoc, MASK_SHAPE_TYPE_MAP[mask.shape.type] || 0);
    }

    // Set common parameters
    this._setUniform(program, 'u_feather', mask.feather / 100);
    this._setUniform(program, 'u_expansion', mask.expansion / 100);

    // Set shape-specific parameters
    this._setMaskShapeUniforms(program, mask.shape);

    this._drawQuad();

    // Note: Inversion is handled in the mask application shader (FRAGMENT_MASK)
    // via u_inverted uniform, not in the mask generation phase.
    // The mask.inverted flag is passed when applying the mask to the layer.

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Set mask shape uniforms based on shape type
   * 根据形状类型设置蒙版形状 uniform
   */
  private _setMaskShapeUniforms(program: ShaderProgram, shape: MaskShape): void {
    if (!this._gl) return;
    const gl = this._gl;

    switch (shape.type) {
      case 'rectangle': {
        const rect = shape as RectangleMask;
        // Convert percentage to normalized (0-1)
        const centerLoc = program.uniforms.get('u_center');
        if (centerLoc) {
          gl.uniform2f(centerLoc, rect.centerX / 100, rect.centerY / 100);
        }
        const sizeLoc = program.uniforms.get('u_size');
        if (sizeLoc) {
          gl.uniform2f(sizeLoc, rect.width / 100, rect.height / 100);
        }
        this._setUniform(program, 'u_rotation', rect.rotation);
        this._setUniform(program, 'u_cornerRadius', rect.cornerRadius / 100);
        break;
      }
      case 'ellipse': {
        const ellipse = shape as EllipseMask;
        const centerLoc = program.uniforms.get('u_center');
        if (centerLoc) {
          gl.uniform2f(centerLoc, ellipse.centerX / 100, ellipse.centerY / 100);
        }
        const sizeLoc = program.uniforms.get('u_size');
        if (sizeLoc) {
          gl.uniform2f(sizeLoc, ellipse.width / 100, ellipse.height / 100);
        }
        this._setUniform(program, 'u_rotation', ellipse.rotation);
        break;
      }
      case 'polygon': {
        const polygon = shape as PolygonMask;
        const pointCountLoc = program.uniforms.get('u_pointCount');
        if (pointCountLoc) {
          gl.uniform1i(pointCountLoc, polygon.points.length);
        }
        // Set polygon points
        this._setPolygonPoints(program, polygon.points);
        break;
      }
      case 'bezier': {
        const bezier = shape as BezierMask;
        const pointCountLoc = program.uniforms.get('u_pointCount');
        if (pointCountLoc) {
          gl.uniform1i(pointCountLoc, bezier.points.length);
        }
        // For bezier, we approximate with anchor points for now
        const anchorPoints = bezier.points.map(p => p.anchor);
        this._setPolygonPoints(program, anchorPoints);
        break;
      }
    }
  }

  /**
   * Set polygon points uniform array
   * 设置多边形顶点 uniform 数组
   */
  private _setPolygonPoints(program: ShaderProgram, points: Point2D[]): void {
    if (!this._gl) return;
    const gl = this._gl;

    // Max 32 points supported by shader
    const maxPoints = Math.min(points.length, 32);

    for (let i = 0; i < maxPoints; i++) {
      const pointLoc = program.uniforms.get(`u_points[${i}]`);
      if (pointLoc) {
        gl.uniform2f(pointLoc, points[i].x / 100, points[i].y / 100);
      }
    }
  }

  /**
   * Composite two masks together
   * 合成两个蒙版
   */
  private _compositeMasks(
    maskA: WebGLTextureInfo,
    maskB: WebGLTextureInfo,
    blendMode: string,
    targetFB: FramebufferInfo
  ): void {
    if (!this._gl) return;

    const gl = this._gl;
    const program = this._programs.get('maskComposite');
    if (!program) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB.framebuffer);
    gl.viewport(0, 0, this._width, this._height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program.program);

    // Set mask A
    const maskALoc = program.uniforms.get('u_maskA');
    if (maskALoc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, maskA.native);
      gl.uniform1i(maskALoc, 0);
    }

    // Set mask B
    const maskBLoc = program.uniforms.get('u_maskB');
    if (maskBLoc) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskB.native);
      gl.uniform1i(maskBLoc, 1);
    }

    // Set blend mode
    const blendModeLoc = program.uniforms.get('u_blendMode');
    if (blendModeLoc) {
      gl.uniform1i(blendModeLoc, MASK_BLEND_MODE_MAP[blendMode] || 0);
    }

    this._drawQuad();

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Draw texture to screen (utility method)
   * 将纹理绘制到屏幕（工具方法）
   */
  private _drawTextureToScreen(texture: WebGLTextureInfo): void {
    if (!this._gl) return;

    const gl = this._gl;
    const program = this._programs.get('basic');
    if (!program) return;

    gl.useProgram(program.program);

    // Identity matrix
    const matrixLoc = program.uniforms.get('u_matrix');
    if (matrixLoc) {
      const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
      gl.uniformMatrix3fv(matrixLoc, false, identity);
    }

    const textureLoc = program.uniforms.get('u_texture');
    if (textureLoc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.native);
      gl.uniform1i(textureLoc, 0);
    }

    const opacityLoc = program.uniforms.get('u_opacity');
    if (opacityLoc) {
      gl.uniform1f(opacityLoc, 1.0);
    }

    this._drawQuad();
  }

  // ---------------------------------------------------------------------------
  // Public Methods - Transition Rendering
  // ---------------------------------------------------------------------------

  /**
   * Render transition between two textures
   * 渲染两个纹理之间的转场效果
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
  ): WebGLTextureInfo | null {
    if (!this._gl) return null;

    const gl = this._gl;
    const program = this._programs.get('transition');
    if (!program) {
      console.warn('[WebGLCompositor] Transition shader not found, falling back to crossfade');
      // Fallback to simple blend
      return this._renderSimpleCrossfade(fromTexture, toTexture, params.progress, toScreen);
    }

    // Determine render target
    let targetFB: FramebufferInfo | null = null;
    if (!toScreen) {
      targetFB = this._pingPongFBs[0];
      if (!targetFB) {
        console.error('[WebGLCompositor] No framebuffer available for transition');
        return null;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, this._width, this._height);
    gl.useProgram(program.program);

    // Set source texture (from)
    const fromTexLoc = program.uniforms.get('u_fromTexture');
    if (fromTexLoc) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (fromTexture as WebGLTextureInfo).native);
      gl.uniform1i(fromTexLoc, 0);
    }

    // Set destination texture (to)
    const toTexLoc = program.uniforms.get('u_toTexture');
    if (toTexLoc) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (toTexture as WebGLTextureInfo).native);
      gl.uniform1i(toTexLoc, 1);
    }

    // Set transition progress
    const progressLoc = program.uniforms.get('u_progress');
    if (progressLoc) {
      gl.uniform1f(progressLoc, Math.max(0, Math.min(1, params.progress)));
    }

    // Set transition type
    const typeLoc = program.uniforms.get('u_transitionType');
    if (typeLoc) {
      const typeInt = GPU_TRANSITION_TYPE_MAP[params.type] ?? 1; // Default to fade
      gl.uniform1i(typeLoc, typeInt);
    }

    // Set softness (for wipe transitions)
    const softnessLoc = program.uniforms.get('u_softness');
    if (softnessLoc) {
      gl.uniform1f(softnessLoc, params.softness ?? 0.01);
    }

    // Set blinds count (for blinds transitions)
    const blindsCountLoc = program.uniforms.get('u_blindsCount');
    if (blindsCountLoc) {
      gl.uniform1i(blindsCountLoc, params.blindsCount ?? 8);
    }

    // Set start angle (for clock wipe transitions, in radians)
    const startAngleLoc = program.uniforms.get('u_startAngle');
    if (startAngleLoc) {
      // Convert degrees to radians, default to -90 degrees (top)
      const angleRad = ((params.startAngle ?? -90) * Math.PI) / 180;
      gl.uniform1f(startAngleLoc, angleRad);
    }

    // Set dip color (for dip-to-color transition)
    const dipColorLoc = program.uniforms.get('u_dipColor');
    if (dipColorLoc) {
      const color = params.dipColor ?? [0, 0, 0];
      gl.uniform3f(dipColorLoc, color[0], color[1], color[2]);
    }

    this._drawQuad();

    if (!toScreen && targetFB) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return targetFB.texture;
    }

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

  // ---------------------------------------------------------------------------
  // Private Methods - Transition Helpers
  // ---------------------------------------------------------------------------

  /**
   * Simple crossfade fallback when transition shader is not available
   * 转场着色器不可用时的简单交叉淡化回退
   */
  private _renderSimpleCrossfade(
    fromTexture: ITexture,
    toTexture: ITexture,
    progress: number,
    toScreen: boolean
  ): WebGLTextureInfo | null {
    if (!this._gl) return null;

    const gl = this._gl;
    const program = this._programs.get('blend');
    if (!program) return null;

    // Determine render target
    let targetFB: FramebufferInfo | null = null;
    if (!toScreen) {
      targetFB = this._pingPongFBs[0];
      if (!targetFB) return null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFB.framebuffer);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, this._width, this._height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw from texture first
    const basicProgram = this._programs.get('basic');
    if (basicProgram) {
      gl.useProgram(basicProgram.program);

      const matrixLoc = basicProgram.uniforms.get('u_matrix');
      if (matrixLoc) {
        const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        gl.uniformMatrix3fv(matrixLoc, false, identity);
      }

      const textureLoc = basicProgram.uniforms.get('u_texture');
      if (textureLoc) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, (fromTexture as WebGLTextureInfo).native);
        gl.uniform1i(textureLoc, 0);
      }

      const opacityLoc = basicProgram.uniforms.get('u_opacity');
      if (opacityLoc) {
        gl.uniform1f(opacityLoc, 1.0 - progress);
      }

      this._drawQuad();

      // Draw to texture on top
      if (textureLoc) {
        gl.bindTexture(gl.TEXTURE_2D, (toTexture as WebGLTextureInfo).native);
      }

      if (opacityLoc) {
        gl.uniform1f(opacityLoc, progress);
      }

      this._drawQuad();
    }

    gl.disable(gl.BLEND);

    if (!toScreen && targetFB) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return targetFB.texture;
    }

    return null;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * 创建 WebGL 合成器实例
 */
export function createWebGLCompositor(): WebGLCompositor {
  return new WebGLCompositor();
}
