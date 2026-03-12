/**
 * WebGL Context Wrapper
 *
 * Manages WebGL2 context lifecycle, state tracking, and canvas sizing.
 */
import type { IWebGLContext } from './types';

export class WebGLContext implements IWebGLContext {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;

    // Enable blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  }

  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  dispose(): void {
    const ext = this.gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}
