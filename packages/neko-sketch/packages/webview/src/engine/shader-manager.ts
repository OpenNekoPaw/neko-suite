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
import { compileWebGLProgram } from './webgl-utils';

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
    const program = compileWebGLProgram(this.gl, vertSrc, fragSrc, 'Shader');
    this.programs.set(key, program);
  }

  dispose(): void {
    this.programs.forEach((program) => this.gl.deleteProgram(program));
    this.programs.clear();
  }
}
