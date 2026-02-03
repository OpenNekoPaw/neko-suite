/**
 * Canvas 2D Rendering Module
 * Canvas 2D 渲染模块
 *
 * 使用 Canvas 2D API 进行多图层合成和项目渲染
 */

// Types
export type {
  Canvas2DTransform,
  BlendModeType,
  Canvas2DColorCorrection,
  Canvas2DLayer,
  Canvas2DCompositorOptions,
  ICanvas2DCompositor,
  RenderMode,
  RenderQuality,
  RenderableElement,
  Canvas2DFrameResult,
  Canvas2DProgressCallback,
} from './types';

export {
  DEFAULT_CANVAS2D_TRANSFORM,
  BLEND_MODE_MAP,
  DEFAULT_CANVAS2D_OPTIONS,
  colorCorrectionToFilter,
  createCanvas2DLayer,
} from './types';

// Compositor
export {
  Canvas2DCompositor,
  createCanvas2DCompositor,
  getDefaultCanvas2DCompositor,
  disposeDefaultCanvas2DCompositor,
} from './Canvas2DCompositor';

// Render Engine
export type { Canvas2DRenderContext, TransitionInfo } from './Canvas2DRenderEngine';

export {
  Canvas2DRenderEngine,
  getCanvas2DRenderEngine,
  createCanvas2DRenderEngine,
  disposeCanvas2DRenderEngine,
} from './Canvas2DRenderEngine';
