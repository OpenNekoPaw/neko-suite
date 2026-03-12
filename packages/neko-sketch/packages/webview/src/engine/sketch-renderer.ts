/**
 * Sketch Renderer
 *
 * Top-level facade that assembles WebGLContext + ShaderManager +
 * TextureManager + RenderPipeline into a single renderer.
 */
import type {
  ISketchRenderer,
  IWebGLContext,
  IShaderManager,
  ITextureManager,
  IRenderPipeline,
} from './types';
import type { LayerData, ViewportState } from '../types';
import { WebGLContext } from './webgl-context';
import { ShaderManager } from './shader-manager';
import { TextureManager } from './texture-manager';
import { RenderPipeline } from './render-pipeline';

export class SketchRenderer implements ISketchRenderer {
  private _context!: IWebGLContext;
  private _shaders!: IShaderManager;
  private _textures!: ITextureManager;
  private _pipeline!: IRenderPipeline;
  private initialized = false;

  get context(): IWebGLContext {
    return this._context;
  }
  get shaders(): IShaderManager {
    return this._shaders;
  }
  get textures(): ITextureManager {
    return this._textures;
  }
  get pipeline(): IRenderPipeline {
    return this._pipeline;
  }

  init(canvas: HTMLCanvasElement, width: number, height: number): void {
    if (this.initialized) {
      this.dispose();
    }

    this._context = new WebGLContext(canvas);
    this._context.resize(width, height);

    const gl = this._context.gl;
    this._shaders = new ShaderManager(gl);
    this._textures = new TextureManager(gl);
    this._pipeline = new RenderPipeline(gl, this._shaders, this._textures);

    this.initialized = true;
  }

  resize(width: number, height: number): void {
    if (!this.initialized) return;
    this._context.resize(width, height);
  }

  render(layers: ReadonlyArray<LayerData>, viewport: ViewportState): void {
    if (!this.initialized) return;
    this._pipeline.compositeLayerStack(layers, viewport);
  }

  dispose(): void {
    if (!this.initialized) return;
    this._pipeline.dispose();
    this._textures.dispose();
    this._shaders.dispose();
    this._context.dispose();
    this.initialized = false;
  }
}
