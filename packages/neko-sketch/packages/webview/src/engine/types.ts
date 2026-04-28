/**
 * WebGL Engine Types
 *
 * Core interfaces for the 2D rendering engine.
 */
import type { LayerData, ViewportState } from '../types';

/** WebGL context wrapper interface */
export interface IWebGLContext {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Shader program management */
export interface IShaderManager {
  getProgram(key: string): WebGLProgram;
  getBlendProgram(mode: string): WebGLProgram;
  dispose(): void;
}

/** Texture lifecycle management */
export interface ITextureManager {
  createTexture(width: number, height: number, data?: Uint8Array | null): WebGLTexture;
  createFramebuffer(texture: WebGLTexture): WebGLFramebuffer;
  updateTexture(
    texture: WebGLTexture,
    x: number,
    y: number,
    w: number,
    h: number,
    data: Uint8Array,
  ): void;
  readPixels(fbo: WebGLFramebuffer, x: number, y: number, w: number, h: number): Uint8Array;
  deleteTexture(texture: WebGLTexture): void;
  deleteFramebuffer(fbo: WebGLFramebuffer): void;
  dispose(): void;
}

/** Render pipeline for compositing and drawing */
export interface IRenderPipeline {
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
  ): void;
  renderStrokeSegment(
    points: Float32Array,
    color: [number, number, number, number],
    size: number,
    targetFBO: WebGLFramebuffer,
    targetWidth: number,
    targetHeight: number,
    hardness?: number,
    alphaLock?: boolean,
    stampPattern?: number,
    stampTexture?: WebGLTexture | null,
  ): void;
  clear(fbo: WebGLFramebuffer): void;
  dispose(): void;
}

/** Full renderer interface */
export interface ISketchRenderer {
  readonly context: IWebGLContext;
  readonly shaders: IShaderManager;
  readonly textures: ITextureManager;
  readonly pipeline: IRenderPipeline;
  init(canvas: HTMLCanvasElement, width: number, height: number): void;
  resize(width: number, height: number): void;
  render(layers: ReadonlyArray<LayerData>, viewport: ViewportState): void;
  dispose(): void;
}
