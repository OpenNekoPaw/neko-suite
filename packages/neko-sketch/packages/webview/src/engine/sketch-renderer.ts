/**
 * Sketch Renderer
 *
 * Top-level facade that assembles WebGLContext + ShaderManager +
 * TextureManager + RenderPipeline + FilterPipeline + ParticleRenderer
 * into a single renderer with effects support.
 */
import type {
  ISketchRenderer,
  IWebGLContext,
  IShaderManager,
  ITextureManager,
  IRenderPipeline,
} from './types';
import type { LayerData, ViewportState } from '../types';
import type { AppliedFilter } from '../types/filter';
import type { ParticleEmitterConfig } from '../types/particle';
import type { LightSceneObject } from '../types/scene';
import type { AmbientLightConfig } from '../types/light';
import { WebGLContext } from './webgl-context';
import { ShaderManager } from './shader-manager';
import { TextureManager } from './texture-manager';
import { RenderPipeline } from './render-pipeline';
import { FilterPipeline } from './filter-pipeline';
import { FilterRegistry } from './filter-registry';
import { LightPass } from './light-pass';
import { ParticleRenderer } from './particle-renderer';
import { ParticleSimulation } from './particle-simulation';

export interface LightingConfig {
  readonly enabled: boolean;
  readonly lights: readonly LightSceneObject[];
  readonly ambient: AmbientLightConfig;
  readonly normalMapTex?: WebGLTexture | null;
}

export class SketchRenderer implements ISketchRenderer {
  private _context!: IWebGLContext;
  private _shaders!: IShaderManager;
  private _textures!: ITextureManager;
  private _pipeline!: IRenderPipeline;
  private _filterPipeline!: FilterPipeline;
  private _filterRegistry!: FilterRegistry;
  private _lightPass!: LightPass;
  private _particleRenderer!: ParticleRenderer;
  private _particleSim!: ParticleSimulation;
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
  get filterPipeline(): FilterPipeline {
    return this._filterPipeline;
  }
  get filterRegistry(): FilterRegistry {
    return this._filterRegistry;
  }
  get lightPass(): LightPass {
    return this._lightPass;
  }
  get particleRenderer(): ParticleRenderer {
    return this._particleRenderer;
  }
  get particleSim(): ParticleSimulation {
    return this._particleSim;
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
    this._filterRegistry = new FilterRegistry();
    this._filterPipeline = new FilterPipeline(gl, this._textures);
    this._lightPass = new LightPass(gl, this._textures);
    this._particleRenderer = new ParticleRenderer(gl);
    this._particleSim = new ParticleSimulation();

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

  /**
   * Render with optional filter chain and particle overlay.
   *
   * @param layers       - Layer stack to composite
   * @param viewport     - Current viewport transform
   * @param filters      - Applied filters to run after compositing
   * @param emitters     - Active particle emitter configs
   * @param particlePreview - Whether particle preview is enabled
   * @param dt           - Delta time in seconds for particle simulation
   */
  renderWithEffects(
    layers: ReadonlyArray<LayerData>,
    viewport: ViewportState,
    filters: readonly AppliedFilter[],
    emitters: readonly ParticleEmitterConfig[],
    particlePreview: boolean,
    dt: number,
    layerTransforms?: ReadonlyMap<string, Float32Array>,
    lightingConfig?: LightingConfig,
  ): void {
    if (!this.initialized) return;

    // Build filter callback for enabled filters
    const enabledFilters = filters.filter((f) => f.enabled);
    const filterFn =
      enabledFilters.length > 0
        ? (tex: WebGLTexture, w: number, h: number) =>
            this._filterPipeline.applyFilters(tex, w, h, enabledFilters, this._filterRegistry)
        : undefined;

    // Build lighting callback if lighting is enabled with active lights
    const lightingFn = lightingConfig?.enabled
      ? (tex: WebGLTexture, w: number, h: number) =>
          this._lightPass.apply(
            tex,
            w,
            h,
            lightingConfig.lights,
            lightingConfig.ambient,
            lightingConfig.normalMapTex,
          )
      : undefined;

    // Build adjustment callback — reuses FilterPipeline for per-layer adjustment processing
    const adjustmentFn = (
      tex: WebGLTexture,
      w: number,
      h: number,
      filterId: string,
      params: Record<string, number>,
      opacity: number,
    ): WebGLTexture => {
      const applied = {
        id: '__adj',
        filterId,
        params,
        enabled: true,
      };
      const adjusted = this._filterPipeline.applyFilters(
        tex,
        w,
        h,
        [applied],
        this._filterRegistry,
      );
      // Blend original and adjusted by opacity for partial-strength adjustments
      if (opacity >= 1.0) return adjusted;
      // Mix: lerp between original and adjusted via a blit pass
      return this._filterPipeline.mixTextures(tex, adjusted, w, h, opacity);
    };

    // Composite layers with optional filter chain, lighting, and per-layer parallax transforms
    this._pipeline.compositeLayerStack(
      layers,
      viewport,
      filterFn,
      lightingFn,
      layerTransforms,
      adjustmentFn,
    );

    // Render particles on top if preview is active
    if (particlePreview && emitters.length > 0) {
      const gl = this._context.gl;
      const cw = gl.canvas.width;
      const ch = gl.canvas.height;

      for (const emitter of emitters) {
        this._particleSim.emit(emitter, dt);
      }
      this._particleSim.update(dt);

      const { data, count } = this._particleSim.getInstanceData();
      if (count > 0) {
        const blendMode = emitters[0]?.blendMode ?? 'additive';
        this._particleRenderer.render(data, count, cw, ch, blendMode);
      }
    }
  }

  dispose(): void {
    if (!this.initialized) return;
    this._filterPipeline.dispose();
    this._lightPass.dispose();
    this._particleRenderer.dispose();
    this._pipeline.dispose();
    this._textures.dispose();
    this._shaders.dispose();
    this._context.dispose();
    this.initialized = false;
  }
}
