/**
 * Shader Manager
 *
 * Compiles, caches, and manages WebGL shader programs.
 */
import type { IShaderManager } from './types';
import {
  QUAD_VERT,
  BLIT_FRAG,
  BLEND_FRAG,
  STROKE_VERT,
  STROKE_FRAG,
  CHECKER_FRAG,
} from './shaders';

export class ShaderManager implements IShaderManager {
  private readonly programs = new Map<string, WebGLProgram>();
  private readonly gl: WebGL2RenderingContext;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.initBuiltinPrograms();
  }

  private initBuiltinPrograms(): void {
    this.compileAndCache('blit', QUAD_VERT, BLIT_FRAG);
    this.compileAndCache('blend', QUAD_VERT, BLEND_FRAG);
    this.compileAndCache('stroke', STROKE_VERT, STROKE_FRAG);
    this.compileAndCache('checker', QUAD_VERT, CHECKER_FRAG);
  }

  getProgram(key: string): WebGLProgram {
    const program = this.programs.get(key);
    if (!program) {
      throw new Error(`Shader program not found: ${key}`);
    }
    return program;
  }

  getBlendProgram(_mode: string): WebGLProgram {
    // All blend modes use the same program with a u_mode uniform
    return this.getProgram('blend');
  }

  private compileAndCache(key: string, vertSrc: string, fragSrc: string): void {
    const program = this.createProgram(vertSrc, fragSrc);
    this.programs.set(key, program);
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const vert = this.compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this.compileShader(gl.FRAGMENT_SHADER, fragSrc);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create WebGL program');

    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      throw new Error(`Shader link failed: ${info}`);
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
      throw new Error(`Shader compile failed: ${info}`);
    }

    return shader;
  }

  dispose(): void {
    this.programs.forEach((program) => this.gl.deleteProgram(program));
    this.programs.clear();
  }
}
