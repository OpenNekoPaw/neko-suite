/**
 * Render Pipeline
 *
 * Composites layer stacks, renders strokes, and applies blend modes.
 * Uses a fullscreen quad approach for layer compositing.
 */
import type { IRenderPipeline, IShaderManager, ITextureManager } from './types';
import type { LayerData, ViewportState } from '../types';
import { BLEND_MODE_INDEX, QUAD_VERT } from './shaders';
import { CLIPPING_MASK_FRAG, LAYER_MASK_FRAG } from './mask-shaders';

/** Fullscreen quad geometry: position (x,y) + texCoord (u,v) */
const QUAD_VERTICES = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);

export class RenderPipeline implements IRenderPipeline {
  private readonly gl: WebGL2RenderingContext;
  private readonly shaders: IShaderManager;
  private readonly textures: ITextureManager;
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;
  private strokeVAO: WebGLVertexArrayObject | null = null;
  private strokeVBO: WebGLBuffer | null = null;

  // Ping-pong compositing buffers
  private compTexA: WebGLTexture | null = null;
  private compTexB: WebGLTexture | null = null;
  private compFboA: WebGLFramebuffer | null = null;
  private compFboB: WebGLFramebuffer | null = null;
  private compWidth = 0;
  private compHeight = 0;

  // Mask processing (temporary FBO for applying masks before blend)
  private maskTex: WebGLTexture | null = null;
  private maskFbo: WebGLFramebuffer | null = null;
  private clipProgram: WebGLProgram | null = null;
  private layerMaskProgram: WebGLProgram | null = null;

  constructor(gl: WebGL2RenderingContext, shaders: IShaderManager, textures: ITextureManager) {
    this.gl = gl;
    this.shaders = shaders;
    this.textures = textures;
    this.initQuadGeometry();
    this.initStrokeGeometry();
  }

  private initQuadGeometry(): void {
    const gl = this.gl;
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    // a_position
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    // a_texCoord
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
  }

  private initStrokeGeometry(): void {
    const gl = this.gl;
    this.strokeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.strokeVAO);

    this.strokeVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeVBO);

    // a_position (vec2) + a_pressure (float) = 12 bytes per vertex
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 12, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 12, 8);

    gl.bindVertexArray(null);
  }

  private ensureCompBuffers(width: number, height: number): void {
    if (this.compWidth === width && this.compHeight === height) return;

    // Clean up old buffers
    if (this.compFboA) this.textures.deleteFramebuffer(this.compFboA);
    if (this.compFboB) this.textures.deleteFramebuffer(this.compFboB);
    if (this.compTexA) this.textures.deleteTexture(this.compTexA);
    if (this.compTexB) this.textures.deleteTexture(this.compTexB);

    this.compTexA = this.textures.createTexture(width, height);
    this.compTexB = this.textures.createTexture(width, height);
    this.compFboA = this.textures.createFramebuffer(this.compTexA);
    this.compFboB = this.textures.createFramebuffer(this.compTexB);
    this.compWidth = width;
    this.compHeight = height;
  }

  compositeLayerStack(
    layers: ReadonlyArray<LayerData>,
    viewport: ViewportState,
    filterFn?: (compositeTex: WebGLTexture, width: number, height: number) => WebGLTexture,
    lightingFn?: (filteredTex: WebGLTexture, width: number, height: number) => WebGLTexture,
    layerTransforms?: ReadonlyMap<string, Float32Array>,
    adjustmentFn?: (
      tex: WebGLTexture,
      w: number,
      h: number,
      filterId: string,
      params: Record<string, number>,
      opacity: number,
    ) => WebGLTexture,
  ): void {
    const gl = this.gl;
    if (layers.length === 0) return;

    // Determine canvas size from first layer or use gl canvas size
    const cw = gl.canvas.width;
    const ch = gl.canvas.height;
    this.ensureCompBuffers(cw, ch);

    // Render checkerboard to screen first
    this.renderCheckerboard(cw, ch);

    // Build viewport transform matrix
    const transform = this.buildViewportTransform(viewport, cw, ch);

    // Composite visible layers bottom-to-top
    let current = 0; // 0 = A, 1 = B
    const fbos = [this.compFboA!, this.compFboB!];
    const texs = [this.compTexA!, this.compTexB!];

    // Clear initial composite buffer
    this.clear(fbos[0]!);

    for (const layer of layers) {
      if (!layer.visible) continue;

      // Adjustment layer: apply filter effect to current composite
      if (layer.type === 'adjustment' && layer.adjustmentFilter && adjustmentFn) {
        const adjustedTex = adjustmentFn(
          texs[current]!,
          cw,
          ch,
          layer.adjustmentFilter,
          layer.adjustmentParams ?? {},
          layer.opacity,
        );
        // Blit adjusted result back into current ping-pong buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[current]!);
        gl.viewport(0, 0, cw, ch);
        const blitProg = this.shaders.getProgram('blit');
        gl.useProgram(blitProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, adjustedTex);
        gl.uniform1i(gl.getUniformLocation(blitProg, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(blitProg, 'u_opacity'), 1.0);
        gl.uniformMatrix3fv(gl.getUniformLocation(blitProg, 'u_transform'), false, identity3());
        gl.disable(gl.BLEND);
        this.drawQuad();
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        continue;
      }

      if (!layer.texture) continue;

      // Apply masks if present
      let effectiveTex = layer.texture;

      // Clipping mask: restrict to alpha of the composite below
      if (layer.clippingMask) {
        effectiveTex = this.applyMask(effectiveTex, texs[current]!, cw, ch, true);
      }

      // Layer mask: multiply alpha by grayscale mask layer
      if (layer.maskLayerId) {
        const maskLayer = layers.find((l) => l.id === layer.maskLayerId);
        if (maskLayer?.texture) {
          effectiveTex = this.applyMask(effectiveTex, maskLayer.texture, cw, ch, false);
        }
      }

      const targetFbo = fbos[1 - current]!;
      const baseTex = texs[current]!;
      const blendTex = effectiveTex;
      const modeIndex = BLEND_MODE_INDEX[layer.blendMode] ?? 0;

      // Render blended result to target
      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
      gl.viewport(0, 0, cw, ch);

      const blendProgram = this.shaders.getBlendProgram(layer.blendMode);
      gl.useProgram(blendProgram);

      // Set uniforms
      const baseLoc = gl.getUniformLocation(blendProgram, 'u_base');
      const blendLoc = gl.getUniformLocation(blendProgram, 'u_blend');
      const opacityLoc = gl.getUniformLocation(blendProgram, 'u_opacity');
      const modeLoc = gl.getUniformLocation(blendProgram, 'u_mode');
      const transformLoc = gl.getUniformLocation(blendProgram, 'u_transform');

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
      gl.uniform1i(baseLoc, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blendTex);
      gl.uniform1i(blendLoc, 1);

      gl.uniform1f(opacityLoc, layer.opacity);
      gl.uniform1i(modeLoc, modeIndex);
      gl.uniformMatrix3fv(transformLoc, false, layerTransforms?.get(layer.id) ?? identity3());

      this.drawQuad();

      current = 1 - current;
    }

    // Apply filter chain if provided
    let outputTex = texs[current]!;
    if (filterFn) {
      outputTex = filterFn(outputTex, cw, ch);
    }

    // Apply lighting pass if provided
    if (lightingFn) {
      outputTex = lightingFn(outputTex, cw, ch);
    }

    // Blit final composite to screen with viewport transform
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);

    const blitProgram = this.shaders.getProgram('blit');
    gl.useProgram(blitProgram);

    const texLoc = gl.getUniformLocation(blitProgram, 'u_texture');
    const opLoc = gl.getUniformLocation(blitProgram, 'u_opacity');
    const trLoc = gl.getUniformLocation(blitProgram, 'u_transform');

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, outputTex);
    gl.uniform1i(texLoc, 0);
    gl.uniform1f(opLoc, 1.0);
    gl.uniformMatrix3fv(trLoc, false, transform);

    // Blend over checkerboard
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawQuad();
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }

  renderStrokeSegment(
    points: Float32Array,
    color: [number, number, number, number],
    size: number,
    targetFBO: WebGLFramebuffer,
    targetWidth: number,
    targetHeight: number,
    hardness = 0.7,
    alphaLock = false,
  ): void {
    const gl = this.gl;
    const pointCount = points.length / 3; // x, y, pressure per point
    if (pointCount === 0) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO);
    gl.viewport(0, 0, targetWidth, targetHeight);

    const program = this.shaders.getProgram('stroke');
    gl.useProgram(program);

    const colorLoc = gl.getUniformLocation(program, 'u_color');
    const sizeLoc = gl.getUniformLocation(program, 'u_size');
    const hardnessLoc = gl.getUniformLocation(program, 'u_hardness');
    const transformLoc = gl.getUniformLocation(program, 'u_transform');

    gl.uniform4fv(colorLoc, color);
    gl.uniform1f(sizeLoc, size);
    gl.uniform1f(hardnessLoc, hardness);
    // Orthographic projection: map document pixel coords → clip space
    gl.uniformMatrix3fv(transformLoc, false, ortho3(targetWidth, targetHeight));

    // Upload stroke points
    gl.bindVertexArray(this.strokeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.strokeVBO);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);

    gl.enable(gl.BLEND);
    if (alphaLock) {
      // Alpha lock: paint RGB normally but preserve existing alpha
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    } else {
      // Use separate blend for alpha channel to avoid squaring alpha.
      // RGB: standard alpha blend; Alpha: additive (correct coverage accumulation).
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.drawArrays(gl.POINTS, 0, pointCount);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  clear(fbo: WebGLFramebuffer): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private renderCheckerboard(width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);

    const program = this.shaders.getProgram('checker');
    gl.useProgram(program);

    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const gridLoc = gl.getUniformLocation(program, 'u_gridSize');
    const transformLoc = gl.getUniformLocation(program, 'u_transform');

    gl.uniform2f(resLoc, width, height);
    gl.uniform1f(gridLoc, 16.0);
    gl.uniformMatrix3fv(transformLoc, false, identity3());

    gl.disable(gl.BLEND);
    this.drawQuad();
    gl.enable(gl.BLEND);
  }

  private buildViewportTransform(
    viewport: ViewportState,
    _canvasW: number,
    _canvasH: number,
  ): Float32Array {
    const { panX, panY, zoom } = viewport;
    // panX/panY are in CSS pixels (from pointer events / zoom handler).
    // gl.canvas.width is in device pixels (CSS * DPR). We must use CSS pixel
    // dimensions for the pan-to-NDC conversion to avoid DPR-dependent offset.
    const el = this.gl.canvas as HTMLCanvasElement;
    const cssW = el.clientWidth || _canvasW;
    const cssH = el.clientHeight || _canvasH;

    // Forward transform matching screenToCanvas() inverse:
    //   docX = (screenX - panX) / zoom  →  screenX = zoom * docX + panX
    // Composite texture u = docX/docW, ndcX = 2u - 1.
    // Since init sets style.width = docW, cssW ≈ docW → sx = zoom.
    const sx = zoom;
    const sy = zoom;
    const tx = zoom - 1 + (panX / cssW) * 2;
    const ty = 1 - zoom - (panY / cssH) * 2;

    return new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]);
  }

  private drawQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /**
   * Apply a clipping or layer mask to a texture, returning the masked result.
   * - Clipping mask: clips layer alpha to the alpha of the base composite below.
   * - Layer mask: multiplies layer alpha by the luminance of a grayscale mask layer.
   */
  applyMask(
    layerTex: WebGLTexture,
    maskTex: WebGLTexture,
    width: number,
    height: number,
    isClippingMask: boolean,
  ): WebGLTexture {
    const gl = this.gl;

    // Ensure mask FBO exists
    if (!this.maskTex || !this.maskFbo) {
      this.maskTex = this.textures.createTexture(width, height);
      this.maskFbo = this.textures.createFramebuffer(this.maskTex);
    }

    // Lazy-compile mask programs
    const program = isClippingMask
      ? (this.clipProgram ??= this.compileProgram(QUAD_VERT, CLIPPING_MASK_FRAG))
      : (this.layerMaskProgram ??= this.compileProgram(QUAD_VERT, LAYER_MASK_FRAG));

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maskFbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, layerTex);
    gl.uniform1i(gl.getUniformLocation(program, isClippingMask ? 'u_layer' : 'u_layer'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.uniform1i(gl.getUniformLocation(program, isClippingMask ? 'u_base' : 'u_mask'), 1);

    gl.uniformMatrix3fv(gl.getUniformLocation(program, 'u_transform'), false, identity3());

    gl.disable(gl.BLEND);
    this.drawQuad();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.maskTex;
  }

  private compileProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create mask program');
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Mask program link failed: ${info}`);
    }
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return program;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Mask shader compile failed: ${info}`);
    }
    return shader;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.compFboA) this.textures.deleteFramebuffer(this.compFboA);
    if (this.compFboB) this.textures.deleteFramebuffer(this.compFboB);
    if (this.compTexA) this.textures.deleteTexture(this.compTexA);
    if (this.compTexB) this.textures.deleteTexture(this.compTexB);
    if (this.maskFbo) this.textures.deleteFramebuffer(this.maskFbo);
    if (this.maskTex) this.textures.deleteTexture(this.maskTex);
    if (this.clipProgram) gl.deleteProgram(this.clipProgram);
    if (this.layerMaskProgram) gl.deleteProgram(this.layerMaskProgram);
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
    if (this.strokeVAO) gl.deleteVertexArray(this.strokeVAO);
    if (this.strokeVBO) gl.deleteBuffer(this.strokeVBO);
  }
}

/** Identity 3x3 matrix (column-major) */
function identity3(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

/** Orthographic projection mapping pixel coords (0..w, 0..h) to clip space (-1..1) */
function ortho3(w: number, h: number): Float32Array {
  // Column-major: scale x by 2/w, y by -2/h (flip Y), translate by (-1, +1)
  return new Float32Array([2 / w, 0, 0, 0, -2 / h, 0, -1, 1, 1]);
}
