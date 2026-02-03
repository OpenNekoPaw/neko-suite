/**
 * WgpuCompositor
 *
 * Multi-track compositor for Extension Host (Node.js environment).
 * Uses CPU-based compositing with optimized pixel operations.
 *
 * Features:
 * - Z-order layer sorting
 * - Alpha blending with multiple blend modes
 * - 2D transforms (position, scale, rotation)
 * - Mask support (track and clip masks)
 *
 * Architecture:
 * - Current: CPU compositing (optimized for correctness)
 * - Future: GPU compositing via wgpu when media-processor-rs adds composite API
 */

import type { ITexture } from '../types';
import type {
  ICompositor,
  CompositorState,
  CompositeLayer,
  CompositeResult,
  Size,
  Transform2D,
  BlendMode,
} from './types';
import { BLEND_MODE_VALUES } from './shaders/composite';

// =============================================================================
// Blend Mode Functions
// =============================================================================

/**
 * Apply blend mode to a single channel (0-255 range)
 */
function blendChannel(src: number, dst: number, mode: number): number {
  // Normalize to 0-1 range
  const s = src / 255;
  const d = dst / 255;

  let result: number;

  switch (mode) {
    case BLEND_MODE_VALUES.multiply:
      result = s * d;
      break;
    case BLEND_MODE_VALUES.screen:
      result = 1 - (1 - s) * (1 - d);
      break;
    case BLEND_MODE_VALUES.overlay:
      result = d < 0.5 ? 2 * s * d : 1 - 2 * (1 - s) * (1 - d);
      break;
    case BLEND_MODE_VALUES.darken:
      result = Math.min(s, d);
      break;
    case BLEND_MODE_VALUES.lighten:
      result = Math.max(s, d);
      break;
    case BLEND_MODE_VALUES.colorDodge:
      result = s >= 1 ? 1 : Math.min(1, d / (1 - s));
      break;
    case BLEND_MODE_VALUES.colorBurn:
      result = s <= 0 ? 0 : Math.max(0, 1 - (1 - d) / s);
      break;
    case BLEND_MODE_VALUES.hardLight:
      result = s < 0.5 ? 2 * s * d : 1 - 2 * (1 - s) * (1 - d);
      break;
    case BLEND_MODE_VALUES.softLight: {
      if (s < 0.5) {
        result = d - (1 - 2 * s) * d * (1 - d);
      } else {
        const dd = d <= 0.25 ? ((16 * d - 12) * d + 4) * d : Math.sqrt(d);
        result = d + (2 * s - 1) * (dd - d);
      }
      break;
    }
    case BLEND_MODE_VALUES.difference:
      result = Math.abs(s - d);
      break;
    case BLEND_MODE_VALUES.exclusion:
      result = s + d - 2 * s * d;
      break;
    case BLEND_MODE_VALUES.add:
      result = Math.min(1, s + d);
      break;
    case BLEND_MODE_VALUES.subtract:
      result = Math.max(0, d - s);
      break;
    default:
      // Normal blend - handled separately
      result = s;
  }

  return Math.round(result * 255);
}

/**
 * Composite source over destination with blend mode and opacity
 * Uses Porter-Duff source-over compositing
 */
function compositePixel(
  srcR: number,
  srcG: number,
  srcB: number,
  srcA: number,
  dstR: number,
  dstG: number,
  dstB: number,
  dstA: number,
  blendMode: number,
  opacity: number
): [number, number, number, number] {
  // Apply opacity to source alpha
  const srcAlpha = (srcA / 255) * opacity;

  // If source is fully transparent, return destination
  if (srcAlpha <= 0) {
    return [dstR, dstG, dstB, dstA];
  }

  const dstAlpha = dstA / 255;

  // If destination is fully transparent, return source with opacity
  if (dstAlpha <= 0) {
    return [srcR, srcG, srcB, Math.round(srcAlpha * 255)];
  }

  // Apply blend mode to RGB
  let blendedR: number, blendedG: number, blendedB: number;
  if (blendMode === BLEND_MODE_VALUES.normal) {
    blendedR = srcR;
    blendedG = srcG;
    blendedB = srcB;
  } else {
    blendedR = blendChannel(srcR, dstR, blendMode);
    blendedG = blendChannel(srcG, dstG, blendMode);
    blendedB = blendChannel(srcB, dstB, blendMode);
  }

  // Porter-Duff source-over alpha compositing
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);

  if (outAlpha <= 0) {
    return [0, 0, 0, 0];
  }

  // Composite RGB with premultiplied alpha
  const outR = Math.round((blendedR * srcAlpha + dstR * dstAlpha * (1 - srcAlpha)) / outAlpha);
  const outG = Math.round((blendedG * srcAlpha + dstG * dstAlpha * (1 - srcAlpha)) / outAlpha);
  const outB = Math.round((blendedB * srcAlpha + dstB * dstAlpha * (1 - srcAlpha)) / outAlpha);
  const outA = Math.round(outAlpha * 255);

  return [outR, outG, outB, outA];
}

// =============================================================================
// Transform Utilities
// =============================================================================

/**
 * Build inverse transform matrix for sampling
 * Returns a function that maps output coordinates to source coordinates
 */
function buildInverseTransform(
  transform: Transform2D,
  sourceWidth: number,
  sourceHeight: number
): (outX: number, outY: number) => [number, number] {
  const { x, y, scaleX, scaleY, rotation, anchorX, anchorY } = transform;

  // Convert rotation to radians
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Anchor point in source pixels
  const ax = anchorX * sourceWidth;
  const ay = anchorY * sourceHeight;

  // Inverse scale
  const invScaleX = 1 / scaleX;
  const invScaleY = 1 / scaleY;

  return (outX: number, outY: number): [number, number] => {
    // Translate to origin (relative to layer position)
    const tx = outX - x;
    const ty = outY - y;

    // Inverse rotation
    const rx = tx * cos + ty * sin;
    const ry = -tx * sin + ty * cos;

    // Inverse scale and translate to anchor
    const srcX = rx * invScaleX + ax;
    const srcY = ry * invScaleY + ay;

    return [srcX, srcY];
  };
}

/**
 * Bilinear interpolation for texture sampling
 */
function sampleTexture(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number
): [number, number, number, number] {
  // Bounds check
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return [0, 0, 0, 0];
  }

  // Integer coordinates
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);

  // Fractional parts
  const fx = x - x0;
  const fy = y - y0;

  // Sample four corners
  const idx00 = (y0 * width + x0) * 4;
  const idx10 = (y0 * width + x1) * 4;
  const idx01 = (y1 * width + x0) * 4;
  const idx11 = (y1 * width + x1) * 4;

  // Bilinear interpolation for each channel
  const r =
    data[idx00]! * (1 - fx) * (1 - fy) +
    data[idx10]! * fx * (1 - fy) +
    data[idx01]! * (1 - fx) * fy +
    data[idx11]! * fx * fy;

  const g =
    data[idx00 + 1]! * (1 - fx) * (1 - fy) +
    data[idx10 + 1]! * fx * (1 - fy) +
    data[idx01 + 1]! * (1 - fx) * fy +
    data[idx11 + 1]! * fx * fy;

  const b =
    data[idx00 + 2]! * (1 - fx) * (1 - fy) +
    data[idx10 + 2]! * fx * (1 - fy) +
    data[idx01 + 2]! * (1 - fx) * fy +
    data[idx11 + 2]! * fx * fy;

  const a =
    data[idx00 + 3]! * (1 - fx) * (1 - fy) +
    data[idx10 + 3]! * fx * (1 - fy) +
    data[idx01 + 3]! * (1 - fx) * fy +
    data[idx11 + 3]! * fx * fy;

  return [Math.round(r), Math.round(g), Math.round(b), Math.round(a)];
}

/**
 * Get blend mode numeric value
 */
function getBlendModeValue(mode: BlendMode): number {
  return BLEND_MODE_VALUES[mode] ?? BLEND_MODE_VALUES.normal;
}

// =============================================================================
// WgpuCompositor Implementation
// =============================================================================

/**
 * WgpuCompositor - Multi-track compositor for Extension Host
 *
 * Uses CPU-based compositing with optimized pixel operations.
 * Supports Z-order rendering, alpha blending, transforms, and masking.
 *
 * @example
 * ```typescript
 * const compositor = new WgpuCompositor();
 * await compositor.initialize();
 *
 * const layers: CompositeLayer[] = [
 *   createCompositeLayer('bg', bgTexture, { zIndex: 0 }),
 *   createCompositeLayer('fg', fgTexture, { zIndex: 1, opacity: 0.8 }),
 * ];
 *
 * const result = await compositor.compose(layers, { width: 1920, height: 1080 });
 * ```
 */
export class WgpuCompositor implements ICompositor {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  private _state: CompositorState = 'uninitialized';
  private _textureIdCounter = 0;

  // ---------------------------------------------------------------------------
  // ICompositor Properties
  // ---------------------------------------------------------------------------

  get state(): CompositorState {
    return this._state;
  }

  get isReady(): boolean {
    return this._state === 'ready';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Initialize the compositor
   */
  async initialize(): Promise<void> {
    if (this._state !== 'uninitialized') {
      throw new Error(`Cannot initialize in state: ${this._state}`);
    }

    // CPU compositor doesn't need special initialization
    this._state = 'ready';
    console.log('[WgpuCompositor] Initialized (CPU mode)');
  }

  /**
   * Dispose resources
   */
  async dispose(): Promise<void> {
    if (this._state === 'disposed') {
      return;
    }

    this._state = 'disposed';
    console.log('[WgpuCompositor] Disposed');
  }

  // ---------------------------------------------------------------------------
  // Compositing
  // ---------------------------------------------------------------------------

  /**
   * Composite multiple layers into a single output
   */
  async compose(
    layers: CompositeLayer[],
    outputSize: Size,
    backgroundColor: [number, number, number, number] = [0, 0, 0, 0]
  ): Promise<CompositeResult> {
    if (!this.isReady) {
      throw new Error('Compositor not ready');
    }

    const startTime = performance.now();

    // Filter visible layers and sort by zIndex (lower first = bottom)
    const visibleLayers = layers
      .filter((layer) => layer.visible !== false && layer.opacity > 0)
      .sort((a, b) => a.zIndex - b.zIndex);

    // Create output buffer
    const { width, height } = outputSize;
    const output = new Uint8Array(width * height * 4);

    // Fill with background color
    const [bgR, bgG, bgB, bgA] = backgroundColor.map((c) => Math.round(c * 255));
    for (let i = 0; i < output.length; i += 4) {
      output[i] = bgR!;
      output[i + 1] = bgG!;
      output[i + 2] = bgB!;
      output[i + 3] = bgA!;
    }

    this._state = 'compositing';

    try {
      // Composite each layer from bottom to top
      for (const layer of visibleLayers) {
        this._compositeLayer(output, width, height, layer);
      }

      // Create output texture
      const outputTexture = this._createTexture(output, width, height);

      this._state = 'ready';

      return {
        texture: outputTexture,
        isNewTexture: true,
        compositingTime: performance.now() - startTime,
        layerCount: visibleLayers.length,
      };
    } catch (error) {
      this._state = 'error';
      throw error;
    }
  }

  /**
   * Read pixels from a texture
   */
  async readPixels(texture: ITexture): Promise<Uint8Array> {
    // If texture has native data as Uint8Array, return it directly
    if (texture.native instanceof Uint8Array) {
      return texture.native;
    }

    // If texture has native data as ArrayBuffer, convert to Uint8Array
    if (texture.native instanceof ArrayBuffer) {
      return new Uint8Array(texture.native);
    }

    // For WgpuTexture with data property
    const wgpuTexture = texture as { data?: Uint8Array };
    if (wgpuTexture.data) {
      return wgpuTexture.data;
    }

    throw new Error('Cannot read pixels from texture: unsupported native type');
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Composite a single layer onto the output buffer
   */
  private _compositeLayer(output: Uint8Array, outWidth: number, outHeight: number, layer: CompositeLayer): void {
    const { texture, transform, opacity, blendMode, mask, maskInverted } = layer;

    // Get source data
    const srcData = this._getTextureData(texture);
    const srcWidth = texture.width;
    const srcHeight = texture.height;

    // Get mask data if present
    let maskData: Uint8Array | null = null;
    let maskWidth = 0;
    let maskHeight = 0;
    if (mask) {
      maskData = this._getTextureData(mask);
      maskWidth = mask.width;
      maskHeight = mask.height;
    }

    // Build inverse transform
    const inverseTransform = buildInverseTransform(transform, srcWidth, srcHeight);

    // Get blend mode value
    const blendModeValue = getBlendModeValue(blendMode);

    // Composite each output pixel
    for (let outY = 0; outY < outHeight; outY++) {
      for (let outX = 0; outX < outWidth; outX++) {
        // Transform to source coordinates
        const [srcX, srcY] = inverseTransform(outX, outY);

        // Skip if outside source bounds
        if (srcX < 0 || srcX >= srcWidth || srcY < 0 || srcY >= srcHeight) {
          continue;
        }

        // Sample source texture
        const [srcR, srcG, srcB, srcA] = sampleTexture(srcData, srcWidth, srcHeight, srcX, srcY);

        // Apply mask if present
        let maskAlpha = 1;
        if (maskData) {
          // Sample mask at source coordinates (mask is in source space)
          const maskU = srcX / srcWidth;
          const maskV = srcY / srcHeight;
          const [, , , mA] = sampleTexture(maskData, maskWidth, maskHeight, maskU * maskWidth, maskV * maskHeight);
          maskAlpha = mA / 255;
          if (maskInverted) {
            maskAlpha = 1 - maskAlpha;
          }
        }

        // Apply mask to source alpha
        const maskedSrcA = srcA * maskAlpha;

        // Get destination pixel
        const outIdx = (outY * outWidth + outX) * 4;
        const dstR = output[outIdx]!;
        const dstG = output[outIdx + 1]!;
        const dstB = output[outIdx + 2]!;
        const dstA = output[outIdx + 3]!;

        // Composite
        const [outR, outG, outB, outA] = compositePixel(
          srcR,
          srcG,
          srcB,
          maskedSrcA,
          dstR,
          dstG,
          dstB,
          dstA,
          blendModeValue,
          opacity
        );

        // Write output
        output[outIdx] = outR;
        output[outIdx + 1] = outG;
        output[outIdx + 2] = outB;
        output[outIdx + 3] = outA;
      }
    }
  }

  /**
   * Get pixel data from a texture
   */
  private _getTextureData(texture: ITexture): Uint8Array {
    if (texture.native instanceof Uint8Array) {
      return texture.native;
    }

    if (texture.native instanceof ArrayBuffer) {
      return new Uint8Array(texture.native);
    }

    const wgpuTexture = texture as { data?: Uint8Array };
    if (wgpuTexture.data) {
      return wgpuTexture.data;
    }

    throw new Error(`Cannot get texture data: unsupported native type`);
  }

  /**
   * Create a texture from pixel data
   */
  private _createTexture(data: Uint8Array, width: number, height: number): ITexture {
    const id = `wgpu_composite_${++this._textureIdCounter}`;
    return new WgpuTexture(id, width, height, 'rgba8', data);
  }
}

// =============================================================================
// WgpuTexture Implementation
// =============================================================================

/**
 * Texture wrapper for wgpu compositor
 */
class WgpuTexture implements ITexture {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'rgba8' | 'bgra8';
  readonly data: Uint8Array;

  constructor(id: string, width: number, height: number, format: 'rgba8' | 'bgra8', data: Uint8Array) {
    this.id = id;
    this.width = width;
    this.height = height;
    this.format = format;
    this.data = data;
  }

  get native(): unknown {
    return this.data;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new WgpuCompositor instance
 */
export function createWgpuCompositor(): WgpuCompositor {
  return new WgpuCompositor();
}

/**
 * Check if wgpu compositor is available
 * CPU compositor is always available in Node.js
 */
export function isWgpuCompositorSupported(): boolean {
  // Check if we're in Node.js environment
  const globalProcess =
    typeof globalThis !== 'undefined' ? (globalThis as Record<string, unknown>).process : undefined;
  return (
    !!globalProcess &&
    typeof (globalProcess as Record<string, unknown>).versions !== 'undefined' &&
    typeof ((globalProcess as Record<string, unknown>).versions as Record<string, unknown>)?.node !== 'undefined'
  );
}
