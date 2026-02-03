/**
 * Canvas2DCompositor - Canvas 2D based compositor
 * 基于 Canvas 2D API 的合成器实现
 *
 * 使用 Canvas 2D API 进行多图层合成
 */

import type {
  Canvas2DLayer,
  Canvas2DCompositorOptions,
  ICanvas2DCompositor,
} from './types';
import {
  DEFAULT_CANVAS2D_OPTIONS,
  BLEND_MODE_MAP,
  colorCorrectionToFilter,
} from './types';

/**
 * Canvas 2D Compositor Implementation
 */
export class Canvas2DCompositor implements ICanvas2DCompositor {
  private _canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private _ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  private _isInitialized = false;
  private _width = 0;
  private _height = 0;
  private _options: Required<Canvas2DCompositorOptions> = { ...DEFAULT_CANVAS2D_OPTIONS };

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async initialize(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: Canvas2DCompositorOptions
  ): Promise<boolean> {
    if (this._isInitialized) {
      console.warn('[Canvas2DCompositor] Already initialized');
      return true;
    }

    try {
      this._canvas = canvas;
      this._options = { ...DEFAULT_CANVAS2D_OPTIONS, ...options };

      // Get 2D context
      const contextOptions: CanvasRenderingContext2DSettings = {
        alpha: this._options.alpha,
        willReadFrequently: this._options.willReadFrequently,
      };

      const ctx = canvas.getContext('2d', contextOptions);
      if (!ctx) {
        console.error('[Canvas2DCompositor] Failed to get 2D context');
        return false;
      }

      this._ctx = ctx;
      this._width = canvas.width;
      this._height = canvas.height;

      // Apply initial settings
      this._applyContextSettings();

      this._isInitialized = true;
      console.log('[Canvas2DCompositor] Initialized successfully');
      return true;
    } catch (error) {
      console.error('[Canvas2DCompositor] Initialization failed:', error);
      return false;
    }
  }

  dispose(): void {
    this._ctx = null;
    this._canvas = null;
    this._isInitialized = false;
    this._width = 0;
    this._height = 0;
  }

  resize(width: number, height: number): void {
    if (!this._canvas) return;

    this._canvas.width = width;
    this._canvas.height = height;
    this._width = width;
    this._height = height;

    // Re-apply settings after resize (context state is reset)
    this._applyContextSettings();
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get width(): number {
    return this._width;
  }

  get height(): number {
    return this._height;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  beginFrame(): void {
    if (!this._ctx) return;

    // Clear canvas
    this._ctx.clearRect(0, 0, this._width, this._height);

    // Fill background if specified
    if (this._options.backgroundColor) {
      this._ctx.fillStyle = this._options.backgroundColor;
      this._ctx.fillRect(0, 0, this._width, this._height);
    }
  }

  drawLayer(layer: Canvas2DLayer): void {
    if (!this._ctx) return;

    const ctx = this._ctx;
    ctx.save();

    try {
      // Get source dimensions
      const sourceWidth = layer.sourceWidth ?? this._getSourceWidth(layer.source);
      const sourceHeight = layer.sourceHeight ?? this._getSourceHeight(layer.source);

      if (sourceWidth === 0 || sourceHeight === 0) {
        ctx.restore();
        return;
      }

      // Apply blend mode
      ctx.globalCompositeOperation = BLEND_MODE_MAP[layer.blendMode] || 'source-over';

      // Apply opacity
      ctx.globalAlpha = layer.opacity;

      // Apply color correction as CSS filter
      if (layer.colorCorrection) {
        ctx.filter = colorCorrectionToFilter(layer.colorCorrection);
      } else {
        ctx.filter = 'none';
      }

      // Apply masks if present
      if (layer.masks && layer.masks.length > 0) {
        this._applyMasks(ctx, layer.masks);
      }

      // Calculate transform
      const transform = layer.transform;
      const canvasWidth = this._width;
      const canvasHeight = this._height;

      // Position in canvas coordinates
      const posX = transform.x * canvasWidth;
      const posY = transform.y * canvasHeight;

      // Anchor point in source coordinates
      const anchorX = transform.anchorX * sourceWidth;
      const anchorY = transform.anchorY * sourceHeight;

      // Apply transformation matrix
      ctx.translate(posX, posY);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.scale(transform.scaleX, transform.scaleY);
      ctx.translate(-anchorX, -anchorY);

      // Draw the image
      ctx.drawImage(layer.source, 0, 0, sourceWidth, sourceHeight);
    } catch (error) {
      console.error('[Canvas2DCompositor] Error drawing layer:', error);
    }

    ctx.restore();
  }

  drawLayers(layers: Canvas2DLayer[]): void {
    for (const layer of layers) {
      this.drawLayer(layer);
    }
  }

  endFrame(): void {
    // Canvas 2D doesn't need explicit frame end
    // This is a no-op for API compatibility
  }

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------

  toImageData(): ImageData {
    if (!this._ctx) {
      throw new Error('Compositor not initialized');
    }
    return this._ctx.getImageData(0, 0, this._width, this._height);
  }

  async toBlob(type = 'image/png', quality = 0.92): Promise<Blob> {
    if (!this._canvas) {
      throw new Error('Compositor not initialized');
    }

    return new Promise((resolve, reject) => {
      if (this._canvas instanceof HTMLCanvasElement) {
        this._canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          type,
          quality
        );
      } else if (this._canvas instanceof OffscreenCanvas) {
        this._canvas
          .convertToBlob({ type, quality })
          .then(resolve)
          .catch(reject);
      } else {
        reject(new Error('Invalid canvas type'));
      }
    });
  }

  async toImageBitmap(): Promise<ImageBitmap> {
    if (!this._canvas) {
      throw new Error('Compositor not initialized');
    }

    if (this._canvas instanceof OffscreenCanvas) {
      return this._canvas.transferToImageBitmap();
    } else {
      return createImageBitmap(this._canvas);
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  private _applyContextSettings(): void {
    if (!this._ctx) return;

    this._ctx.imageSmoothingEnabled = this._options.imageSmoothingEnabled;
    this._ctx.imageSmoothingQuality = this._options.imageSmoothingQuality;
  }

  private _getSourceWidth(source: CanvasImageSource): number {
    if (source instanceof HTMLImageElement) {
      return source.naturalWidth || source.width;
    }
    if (source instanceof HTMLVideoElement) {
      return source.videoWidth || source.width;
    }
    if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
      return source.width;
    }
    if (source instanceof ImageBitmap) {
      return source.width;
    }
    if (source instanceof VideoFrame) {
      return source.displayWidth;
    }
    if (source instanceof ImageData) {
      return source.width;
    }
    return 0;
  }

  private _getSourceHeight(source: CanvasImageSource): number {
    if (source instanceof HTMLImageElement) {
      return source.naturalHeight || source.height;
    }
    if (source instanceof HTMLVideoElement) {
      return source.videoHeight || source.height;
    }
    if (source instanceof HTMLCanvasElement || source instanceof OffscreenCanvas) {
      return source.height;
    }
    if (source instanceof ImageBitmap) {
      return source.height;
    }
    if (source instanceof VideoFrame) {
      return source.displayHeight;
    }
    if (source instanceof ImageData) {
      return source.height;
    }
    return 0;
  }

  private _applyMasks(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    masks: import('../../types').MaskInstance[]
  ): void {
    // Create a clipping path from masks
    // Note: This is a simplified implementation
    // Full mask support would require more complex compositing

    for (const mask of masks) {
      if (!mask.enabled) continue;

      ctx.beginPath();

      const shape = mask.shape;
      switch (shape.type) {
        case 'rectangle':
          this._drawRectangleMask(ctx, shape);
          break;
        case 'ellipse':
          this._drawEllipseMask(ctx, shape);
          break;
        case 'polygon':
          this._drawPolygonMask(ctx, shape);
          break;
        default:
          // For unsupported mask types (bezier), skip
          continue;
      }

      if (mask.inverted) {
        // For inverted masks, we need a different approach
        // This is simplified - full implementation would use compositing
        ctx.rect(0, 0, this._width, this._height);
      }

      ctx.clip(mask.inverted ? 'evenodd' : 'nonzero');
    }
  }

  private _drawRectangleMask(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    shape: import('@uniedit/shared').RectangleMask
  ): void {
    // Shape uses centerX/centerY and width/height as percentages (0-100)
    const centerX = (shape.centerX / 100) * this._width;
    const centerY = (shape.centerY / 100) * this._height;
    const width = (shape.width / 100) * this._width;
    const height = (shape.height / 100) * this._height;
    const cornerRadius = shape.cornerRadius;
    const rotation = shape.rotation;

    // Calculate top-left from center
    const x = centerX - width / 2;
    const y = centerY - height / 2;

    ctx.save();

    // Apply rotation around center
    if (rotation !== 0) {
      ctx.translate(centerX, centerY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }

    if (cornerRadius > 0) {
      const r = Math.min(cornerRadius / 100 * Math.min(width, height), Math.min(width, height) / 2);
      ctx.roundRect(x, y, width, height, r);
    } else {
      ctx.rect(x, y, width, height);
    }

    ctx.restore();
  }

  private _drawEllipseMask(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    shape: import('@uniedit/shared').EllipseMask
  ): void {
    // Shape uses centerX/centerY and width/height as percentages (0-100)
    const centerX = (shape.centerX / 100) * this._width;
    const centerY = (shape.centerY / 100) * this._height;
    const rx = (shape.width / 100 / 2) * this._width;
    const ry = (shape.height / 100 / 2) * this._height;
    const rotation = (shape.rotation * Math.PI) / 180;

    ctx.ellipse(centerX, centerY, rx, ry, rotation, 0, Math.PI * 2);
  }

  private _drawPolygonMask(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    shape: import('@uniedit/shared').PolygonMask
  ): void {
    const points = shape.points;
    if (!points || points.length < 3) return;

    // Points use x/y as percentages (0-100)
    ctx.moveTo((points[0].x / 100) * this._width, (points[0].y / 100) * this._height);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo((points[i].x / 100) * this._width, (points[i].y / 100) * this._height);
    }

    ctx.closePath();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a new Canvas 2D compositor
 */
export function createCanvas2DCompositor(): Canvas2DCompositor {
  return new Canvas2DCompositor();
}

// Singleton instance
let _defaultCompositor: Canvas2DCompositor | null = null;

/**
 * Get or create the default compositor instance
 */
export function getDefaultCanvas2DCompositor(): Canvas2DCompositor {
  if (!_defaultCompositor) {
    _defaultCompositor = new Canvas2DCompositor();
  }
  return _defaultCompositor;
}

/**
 * Dispose the default compositor instance
 */
export function disposeDefaultCanvas2DCompositor(): void {
  if (_defaultCompositor) {
    _defaultCompositor.dispose();
    _defaultCompositor = null;
  }
}
