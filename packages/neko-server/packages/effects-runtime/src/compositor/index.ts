/**
 * Compositor Module
 *
 * Multi-track compositing for video editing.
 * Supports Z-order rendering, alpha blending, transforms, and masking.
 */

// Types
export type {
  BlendMode,
  Transform2D,
  Size,
  CompositeLayer,
  CompositorState,
  CompositeResult,
  ICompositor,
} from './types';

export { createDefaultTransform, createCompositeLayer } from './types';

// Shaders
export { BLEND_MODE_VALUES, COMPOSITE_SHADER, CLEAR_SHADER, COPY_SHADER } from './shaders/composite';

// Compositor
export { WgpuCompositor, createWgpuCompositor, isWgpuCompositorSupported } from './WgpuCompositor';
