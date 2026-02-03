/**
 * Compositor Types
 *
 * Type definitions for multi-track compositing.
 * Supports Z-order rendering, alpha blending, and masking.
 */

import type { ITexture } from '../types';

// =============================================================================
// Blend Modes
// =============================================================================

/**
 * Blend mode for layer compositing
 * Based on Porter-Duff compositing operators and common blend modes
 */
export type BlendMode =
  // Porter-Duff operators
  | 'normal' // Source over destination (default)
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'colorDodge'
  | 'colorBurn'
  | 'hardLight'
  | 'softLight'
  | 'difference'
  | 'exclusion'
  // Additional modes
  | 'add' // Additive blending
  | 'subtract';

// =============================================================================
// Transform Types
// =============================================================================

/**
 * 2D transform for layer positioning
 */
export interface Transform2D {
  /** X position (pixels from left) */
  x: number;
  /** Y position (pixels from top) */
  y: number;
  /** Scale X (1.0 = 100%) */
  scaleX: number;
  /** Scale Y (1.0 = 100%) */
  scaleY: number;
  /** Rotation in degrees */
  rotation: number;
  /** Anchor point X (0-1, relative to layer size) */
  anchorX: number;
  /** Anchor point Y (0-1, relative to layer size) */
  anchorY: number;
}

/**
 * Create default transform (identity)
 */
export function createDefaultTransform(): Transform2D {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    anchorX: 0.5,
    anchorY: 0.5,
  };
}

// =============================================================================
// Size Types
// =============================================================================

/**
 * Size in pixels
 */
export interface Size {
  width: number;
  height: number;
}

// =============================================================================
// Composite Layer
// =============================================================================

/**
 * A layer to be composited
 * Represents a single track/clip in the composition
 */
export interface CompositeLayer {
  /** Layer ID (for debugging/tracking) */
  id: string;
  /** Source texture */
  texture: ITexture;
  /** 2D transform */
  transform: Transform2D;
  /** Layer opacity (0-1) */
  opacity: number;
  /** Blend mode */
  blendMode: BlendMode;
  /** Optional mask texture (alpha channel used for masking) */
  mask?: ITexture;
  /** Mask invert flag */
  maskInverted?: boolean;
  /** Z-index for layer ordering (higher = on top) */
  zIndex: number;
  /** Whether the layer is visible */
  visible?: boolean;
}

/**
 * Create a composite layer with defaults
 */
export function createCompositeLayer(
  id: string,
  texture: ITexture,
  options?: Partial<Omit<CompositeLayer, 'id' | 'texture'>>
): CompositeLayer {
  return {
    id,
    texture,
    transform: options?.transform ?? createDefaultTransform(),
    opacity: options?.opacity ?? 1,
    blendMode: options?.blendMode ?? 'normal',
    mask: options?.mask,
    maskInverted: options?.maskInverted ?? false,
    zIndex: options?.zIndex ?? 0,
    visible: options?.visible ?? true,
  };
}

// =============================================================================
// Compositor State
// =============================================================================

/**
 * Compositor state
 */
export type CompositorState =
  | 'uninitialized'
  | 'ready'
  | 'compositing'
  | 'error'
  | 'disposed';

// =============================================================================
// Compositor Result
// =============================================================================

/**
 * Composition result
 */
export interface CompositeResult {
  /** Output texture */
  texture: ITexture;
  /** Whether the texture is newly created */
  isNewTexture: boolean;
  /** Compositing time in milliseconds */
  compositingTime: number;
  /** Number of layers composited */
  layerCount: number;
}

// =============================================================================
// ICompositor Interface
// =============================================================================

/**
 * ICompositor - Multi-track compositing interface
 *
 * Composites multiple layers into a single output texture.
 * Supports Z-order rendering, alpha blending, transforms, and masking.
 *
 * @example
 * ```typescript
 * const compositor = new WgpuCompositor();
 * await compositor.initialize();
 *
 * const layers: CompositeLayer[] = [
 *   { id: 'bg', texture: bgTexture, zIndex: 0, ... },
 *   { id: 'fg', texture: fgTexture, zIndex: 1, opacity: 0.8, ... },
 * ];
 *
 * const result = await compositor.compose(layers, { width: 1920, height: 1080 });
 * // result.texture contains the composited output
 * ```
 */
export interface ICompositor {
  /** Current state */
  readonly state: CompositorState;

  /** Whether the compositor is ready */
  readonly isReady: boolean;

  /**
   * Initialize the compositor
   */
  initialize(): Promise<void>;

  /**
   * Composite multiple layers into a single output
   *
   * @param layers Layers to composite (will be sorted by zIndex)
   * @param outputSize Output texture size
   * @param backgroundColor Optional background color (RGBA, 0-1)
   * @returns Composite result with output texture
   */
  compose(
    layers: CompositeLayer[],
    outputSize: Size,
    backgroundColor?: [number, number, number, number]
  ): Promise<CompositeResult>;

  /**
   * Read pixels from a texture
   * Used for preview frame generation
   *
   * @param texture Texture to read
   * @returns Pixel data as Uint8Array (RGBA format)
   */
  readPixels(texture: ITexture): Promise<Uint8Array>;

  /**
   * Dispose resources
   */
  dispose(): Promise<void>;
}
