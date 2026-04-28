/**
 * Light Pass
 *
 * Manages the 2D lighting pass: FBO allocation, multi-light additive
 * accumulation, and ambient light compositing.
 *
 * Inserted into the render pipeline after filterFn and before final blit.
 */
import type { ITextureManager } from './types';
import type { LightSceneObject } from '../types/scene';
import type { AmbientLightConfig } from '../types/light';
import { QUAD_VERT } from './shaders';
import {
  LIGHT_POINT_FRAG,
  LIGHT_NORMAL_FRAG,
  LIGHT_DIRECTIONAL_FRAG,
  LIGHT_DIRECTIONAL_NORMAL_FRAG,
  LIGHT_SPOT_FRAG,
  LIGHT_SPOT_NORMAL_FRAG,
  LIGHT_AMBIENT_FRAG,
} from './light-shaders';

/** Fullscreen quad: position (x,y) + texCoord (u,v) */
const QUAD_VERTICES = new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]);

/** Identity 3x3 matrix (column-major) for texture-space rendering */
const IDENTITY3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export class LightPass {
  private readonly gl: WebGL2RenderingContext;
  private readonly textures: ITextureManager;

  // Output FBO
  private litTex: WebGLTexture | null = null;
  private litFbo: WebGLFramebuffer | null = null;
  private litWidth = 0;
  private litHeight = 0;

  // Quad geometry
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadVBO: WebGLBuffer | null = null;

  // Shader programs (lazy-compiled)
  private pointProgram: WebGLProgram | null = null;
  private normalProgram: WebGLProgram | null = null;
  private directionalProgram: WebGLProgram | null = null;
  private directionalNormalProgram: WebGLProgram | null = null;
  private spotProgram: WebGLProgram | null = null;
  private spotNormalProgram: WebGLProgram | null = null;
  private ambientProgram: WebGLProgram | null = null;

  constructor(gl: WebGL2RenderingContext, textures: ITextureManager) {
    this.gl = gl;
    this.textures = textures;
    this.initQuad();
  }

  private initQuad(): void {
    const gl = this.gl;
    this.quadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.quadVAO);

    this.quadVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    // a_position (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    // a_texCoord (location 1)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
  }

  private ensureBuffers(width: number, height: number): void {
    if (this.litWidth === width && this.litHeight === height) return;

    if (this.litFbo) this.textures.deleteFramebuffer(this.litFbo);
    if (this.litTex) this.textures.deleteTexture(this.litTex);

    this.litTex = this.textures.createTexture(width, height);
    this.litFbo = this.textures.createFramebuffer(this.litTex);
    this.litWidth = width;
    this.litHeight = height;
  }

  private getPointProgram(): WebGLProgram {
    if (!this.pointProgram) {
      this.pointProgram = this.compileProgram(QUAD_VERT, LIGHT_POINT_FRAG);
    }
    return this.pointProgram;
  }

  private getNormalProgram(): WebGLProgram {
    if (!this.normalProgram) {
      this.normalProgram = this.compileProgram(QUAD_VERT, LIGHT_NORMAL_FRAG);
    }
    return this.normalProgram;
  }

  private getDirectionalProgram(): WebGLProgram {
    if (!this.directionalProgram) {
      this.directionalProgram = this.compileProgram(QUAD_VERT, LIGHT_DIRECTIONAL_FRAG);
    }
    return this.directionalProgram;
  }

  private getDirectionalNormalProgram(): WebGLProgram {
    if (!this.directionalNormalProgram) {
      this.directionalNormalProgram = this.compileProgram(QUAD_VERT, LIGHT_DIRECTIONAL_NORMAL_FRAG);
    }
    return this.directionalNormalProgram;
  }

  private getSpotProgram(): WebGLProgram {
    if (!this.spotProgram) {
      this.spotProgram = this.compileProgram(QUAD_VERT, LIGHT_SPOT_FRAG);
    }
    return this.spotProgram;
  }

  private getSpotNormalProgram(): WebGLProgram {
    if (!this.spotNormalProgram) {
      this.spotNormalProgram = this.compileProgram(QUAD_VERT, LIGHT_SPOT_NORMAL_FRAG);
    }
    return this.spotNormalProgram;
  }

  private getAmbientProgram(): WebGLProgram {
    if (!this.ambientProgram) {
      this.ambientProgram = this.compileProgram(QUAD_VERT, LIGHT_AMBIENT_FRAG);
    }
    return this.ambientProgram;
  }

  /**
   * Run the light pass: accumulate all light sources + ambient.
   *
   * Algorithm:
   * 1. Clear litFBO to black
   * 2. Additive blend each light contribution (scene × light)
   * 3. Additive blend ambient (scene × ambient)
   * 4. Return lit texture
   */
  apply(
    sceneTex: WebGLTexture,
    width: number,
    height: number,
    lights: readonly LightSceneObject[],
    ambient: AmbientLightConfig,
    normalMapTex?: WebGLTexture | null,
  ): WebGLTexture {
    const gl = this.gl;
    this.ensureBuffers(width, height);

    // Bind litFBO, clear to black (alpha=1 so we preserve scene alpha later)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.litFbo);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable additive blending: each pass accumulates light contribution
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // Accumulate lights — use normal-mapped shaders when a normal map is available
    const useNormals = !!normalMapTex;

    for (const light of lights) {
      const lightProg = this.getProgramForLight(light, useNormals);

      gl.useProgram(lightProg);

      // Bind scene texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(gl.getUniformLocation(lightProg, 'u_scene'), 0);

      // Bind normal map if available
      if (useNormals) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, normalMapTex!);
        gl.uniform1i(gl.getUniformLocation(lightProg, 'u_normalMap'), 1);
        gl.uniform1f(gl.getUniformLocation(lightProg, 'u_height'), light.properties.height);
        gl.uniform1f(gl.getUniformLocation(lightProg, 'u_specularPower'), 32.0);
        gl.uniform1f(gl.getUniformLocation(lightProg, 'u_specularIntensity'), 0.5);
      }

      // Set transform to identity (texture-space rendering)
      gl.uniformMatrix3fv(gl.getUniformLocation(lightProg, 'u_transform'), false, IDENTITY3);

      // Light uniforms
      gl.uniform2f(gl.getUniformLocation(lightProg, 'u_resolution'), width, height);
      gl.uniform2f(gl.getUniformLocation(lightProg, 'u_lightPos'), light.x, light.y);
      gl.uniform3f(
        gl.getUniformLocation(lightProg, 'u_lightColor'),
        light.properties.color[0],
        light.properties.color[1],
        light.properties.color[2],
      );
      gl.uniform1f(gl.getUniformLocation(lightProg, 'u_intensity'), light.properties.intensity);
      gl.uniform1f(gl.getUniformLocation(lightProg, 'u_radius'), light.properties.radius);
      gl.uniform1f(gl.getUniformLocation(lightProg, 'u_direction'), light.properties.direction);
      gl.uniform1f(gl.getUniformLocation(lightProg, 'u_coneAngle'), light.properties.coneAngle);
      gl.uniform1f(
        gl.getUniformLocation(lightProg, 'u_coneSoftness'),
        light.properties.coneSoftness,
      );

      this.drawQuad();
    }

    // Ambient pass
    const ambientProg = this.getAmbientProgram();
    gl.useProgram(ambientProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.uniform1i(gl.getUniformLocation(ambientProg, 'u_scene'), 0);

    gl.uniformMatrix3fv(gl.getUniformLocation(ambientProg, 'u_transform'), false, IDENTITY3);
    gl.uniform3f(
      gl.getUniformLocation(ambientProg, 'u_ambientColor'),
      ambient.color[0],
      ambient.color[1],
      ambient.color[2],
    );
    gl.uniform1f(gl.getUniformLocation(ambientProg, 'u_ambientIntensity'), ambient.intensity);

    this.drawQuad();

    // Restore default blend mode
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return this.litTex!;
  }

  private getProgramForLight(light: LightSceneObject, useNormals: boolean): WebGLProgram {
    switch (light.properties.lightType) {
      case 'directional':
        return useNormals ? this.getDirectionalNormalProgram() : this.getDirectionalProgram();
      case 'spot':
        return useNormals ? this.getSpotNormalProgram() : this.getSpotProgram();
      case 'point':
        return useNormals ? this.getNormalProgram() : this.getPointProgram();
    }
  }

  private drawQuad(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  private compileProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create light program');
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Light program link failed: ${info}`);
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
      throw new Error(`Light shader compile failed: ${info}`);
    }
    return shader;
  }

  dispose(): void {
    const gl = this.gl;
    if (this.litFbo) this.textures.deleteFramebuffer(this.litFbo);
    if (this.litTex) this.textures.deleteTexture(this.litTex);
    if (this.pointProgram) gl.deleteProgram(this.pointProgram);
    if (this.normalProgram) gl.deleteProgram(this.normalProgram);
    if (this.directionalProgram) gl.deleteProgram(this.directionalProgram);
    if (this.directionalNormalProgram) gl.deleteProgram(this.directionalNormalProgram);
    if (this.spotProgram) gl.deleteProgram(this.spotProgram);
    if (this.spotNormalProgram) gl.deleteProgram(this.spotNormalProgram);
    if (this.ambientProgram) gl.deleteProgram(this.ambientProgram);
    if (this.quadVAO) gl.deleteVertexArray(this.quadVAO);
    if (this.quadVBO) gl.deleteBuffer(this.quadVBO);
  }
}
