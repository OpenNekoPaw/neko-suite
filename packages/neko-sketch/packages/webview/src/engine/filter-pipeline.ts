/**
 * Filter Pipeline
 *
 * Applies a chain of image filters using ping-pong FBO rendering.
 * Each filter reads from one texture and writes to another.
 */
import type { AppliedFilter, FilterParam, FilterParamValue } from '../types/filter';
import type { FilterRegistry } from './filter-registry';
import type { ITextureManager } from './types';
import { FILTER_VERT } from './filter-shaders';

function isVec2Value(value: FilterParamValue): value is [number, number] {
  return (
    Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === 'number')
  );
}

function isVec4Value(value: FilterParamValue): value is [number, number, number, number] {
  return (
    Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === 'number')
  );
}

export class FilterPipeline {
  private readonly gl: WebGL2RenderingContext;
  private readonly textures: ITextureManager;
  private readonly programs = new Map<string, WebGLProgram>();

  // Ping-pong filter buffers
  private filterTexA: WebGLTexture | null = null;
  private filterTexB: WebGLTexture | null = null;
  private filterFboA: WebGLFramebuffer | null = null;
  private filterFboB: WebGLFramebuffer | null = null;
  private filterWidth = 0;
  private filterHeight = 0;

  // Shared quad VAO
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  constructor(gl: WebGL2RenderingContext, textures: ITextureManager) {
    this.gl = gl;
    this.textures = textures;
    this.initQuad();
  }

  private initQuad(): void {
    const gl = this.gl;
    const verts = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);
    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
  }

  private ensureBuffers(width: number, height: number): void {
    if (this.filterWidth === width && this.filterHeight === height) return;

    if (this.filterFboA) this.textures.deleteFramebuffer(this.filterFboA);
    if (this.filterFboB) this.textures.deleteFramebuffer(this.filterFboB);
    if (this.filterTexA) this.textures.deleteTexture(this.filterTexA);
    if (this.filterTexB) this.textures.deleteTexture(this.filterTexB);

    this.filterTexA = this.textures.createTexture(width, height);
    this.filterTexB = this.textures.createTexture(width, height);
    this.filterFboA = this.textures.createFramebuffer(this.filterTexA);
    this.filterFboB = this.textures.createFramebuffer(this.filterTexB);
    this.filterWidth = width;
    this.filterHeight = height;
  }

  private getOrCompileProgram(filterId: string, fragSource: string): WebGLProgram {
    const cached = this.programs.get(filterId);
    if (cached) return cached;

    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, FILTER_VERT);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSource);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create filter program');
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Filter program link failed: ${info}`);
    }

    gl.deleteShader(vert);
    gl.deleteShader(frag);
    this.programs.set(filterId, program);
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
      throw new Error(`Filter shader compile failed: ${info}`);
    }
    return shader;
  }

  /**
   * Apply a chain of filters to a source texture.
   * Returns the texture containing the final result.
   */
  applyFilters(
    srcTexture: WebGLTexture,
    width: number,
    height: number,
    filters: readonly AppliedFilter[],
    registry: FilterRegistry,
  ): WebGLTexture {
    const enabledFilters = filters.filter((f) => f.enabled);
    if (enabledFilters.length === 0) return srcTexture;

    this.ensureBuffers(width, height);
    const gl = this.gl;

    // Copy source into filterTexA via blit
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    // We need to draw srcTexture into fboA
    this.blitTexture(srcTexture, this.filterFboA!);

    let current = 0; // 0=A, 1=B
    const fbos = [this.filterFboA!, this.filterFboB!];
    const texs = [this.filterTexA!, this.filterTexB!];

    for (const applied of enabledFilters) {
      const def = registry.get(applied.filterId);
      if (!def) continue;

      const program = this.getOrCompileProgram(applied.filterId, def.fragmentShader);
      const targetFbo = fbos[1 - current]!;
      const srcTex = texs[current]!;

      gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
      gl.viewport(0, 0, width, height);
      gl.useProgram(program);

      // Bind source texture
      const texLoc = gl.getUniformLocation(program, 'u_texture');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(texLoc, 0);

      // Set resolution uniform if present
      const resLoc = gl.getUniformLocation(program, 'u_resolution');
      if (resLoc) gl.uniform2f(resLoc, width, height);

      // Gaussian blur needs two passes (H then V)
      if (applied.filterId === 'gaussian-blur') {
        this.applyGaussianBlur(program, applied, width, height, current, fbos, texs);
        current = 1 - current;
        continue;
      }

      // Set filter-specific uniforms
      for (const param of def.params) {
        const loc = gl.getUniformLocation(program, param.name);
        if (!loc) continue;
        const val = applied.params[param.name] ?? param.default;
        this.setParamUniform(loc, param, val);
      }

      gl.disable(gl.BLEND);
      this.drawQuad();
      current = 1 - current;
    }

    return texs[current]!;
  }

  private setParamUniform(
    loc: WebGLUniformLocation,
    param: FilterParam,
    value: FilterParamValue,
  ): void {
    const gl = this.gl;
    switch (param.type) {
      case 'float':
        if (typeof value === 'number') gl.uniform1f(loc, value);
        return;
      case 'int':
        if (typeof value === 'number') gl.uniform1i(loc, Math.round(value));
        return;
      case 'bool':
        if (typeof value === 'boolean') gl.uniform1i(loc, value ? 1 : 0);
        return;
      case 'vec2':
        if (isVec2Value(value)) gl.uniform2f(loc, value[0], value[1]);
        return;
      case 'color':
        if (isVec4Value(value)) gl.uniform4f(loc, value[0], value[1], value[2], value[3]);
        return;
    }
  }

  private applyGaussianBlur(
    program: WebGLProgram,
    applied: AppliedFilter,
    width: number,
    height: number,
    startIdx: number,
    fbos: WebGLFramebuffer[],
    texs: WebGLTexture[],
  ): void {
    const gl = this.gl;
    const radiusValue = applied.params['u_radius'];
    const radius = typeof radiusValue === 'number' ? radiusValue : 5;

    // Horizontal pass
    const hTarget = fbos[1 - startIdx]!;
    const hSrc = texs[startIdx]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, hTarget);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, hSrc);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution')!, width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_radius')!, radius);
    gl.uniform1f(gl.getUniformLocation(program, 'u_direction')!, 0.0);
    gl.disable(gl.BLEND);
    this.drawQuad();

    // Vertical pass
    const vTarget = fbos[startIdx]!;
    const vSrc = texs[1 - startIdx]!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, vTarget);
    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, vSrc);
    gl.uniform1f(gl.getUniformLocation(program, 'u_direction')!, 1.0);
    this.drawQuad();
  }

  private blitTexture(src: WebGLTexture, targetFbo: WebGLFramebuffer): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo);
    gl.viewport(0, 0, this.filterWidth, this.filterHeight);

    // Use a simple blit — we just draw the texture with no transform
    const program = this.getOrCompileProgram(
      '__blit',
      `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texture;
void main() { fragColor = texture(u_texture, v_texCoord); }
`,
    );
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texture'), 0);
    gl.disable(gl.BLEND);
    this.drawQuad();
  }

  private drawQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /**
   * Mix two textures by a blend factor. Returns the mixed result texture.
   * result = mix(texA, texB, factor)
   */
  mixTextures(
    texA: WebGLTexture,
    texB: WebGLTexture,
    width: number,
    height: number,
    factor: number,
  ): WebGLTexture {
    this.ensureBuffers(width, height);
    const gl = this.gl;
    const program = this.getOrCompileProgram(
      '__mix',
      `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_texA;
uniform sampler2D u_texB;
uniform float u_factor;
void main() {
  vec4 a = texture(u_texA, v_texCoord);
  vec4 b = texture(u_texB, v_texCoord);
  fragColor = mix(a, b, u_factor);
}`,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.filterFboA);
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texA);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texA'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texB);
    gl.uniform1i(gl.getUniformLocation(program, 'u_texB'), 1);

    gl.uniform1f(gl.getUniformLocation(program, 'u_factor'), factor);

    gl.disable(gl.BLEND);
    this.drawQuad();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return this.filterTexA!;
  }

  dispose(): void {
    const gl = this.gl;
    this.programs.forEach((p) => gl.deleteProgram(p));
    this.programs.clear();
    if (this.filterFboA) this.textures.deleteFramebuffer(this.filterFboA);
    if (this.filterFboB) this.textures.deleteFramebuffer(this.filterFboB);
    if (this.filterTexA) this.textures.deleteTexture(this.filterTexA);
    if (this.filterTexB) this.textures.deleteTexture(this.filterTexB);
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
  }
}
