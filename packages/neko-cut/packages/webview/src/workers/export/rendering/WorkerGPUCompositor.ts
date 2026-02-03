/**
 * Worker GPU Compositor
 *
 * Composites multiple video frames using 2D Canvas in Web Worker.
 * Uses OffscreenCanvas for rendering without blocking main thread.
 *
 * Note: WebGPU compositing would require full shader pipeline implementation.
 * For now, we use 2D Canvas which is sufficient for most export scenarios.
 */

import type { SerializedProjectData, SerializedTransform } from '../protocol/messages';

// =============================================================================
// Types
// =============================================================================

export interface CompositorConfig {
  width: number;
  height: number;
}

export interface CompositeLayer {
  elementId: string;
  frame: VideoFrame;
  transform: SerializedTransform;
  zIndex: number;
}

// =============================================================================
// WorkerGPUCompositor
// =============================================================================

export class WorkerGPUCompositor {
  private _canvas: OffscreenCanvas | null = null;
  private _ctx: OffscreenCanvasRenderingContext2D | null = null;
  private _config: CompositorConfig | null = null;

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize compositor with OffscreenCanvas
   */
  async initialize(canvas: OffscreenCanvas): Promise<void> {
    this._canvas = canvas;
    this._config = {
      width: canvas.width,
      height: canvas.height,
    };

    // Get 2D context
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this._ctx = ctx;

    console.log('[WorkerGPUCompositor] Initialized with 2D context');
  }

  // ===========================================================================
  // Rendering
  // ===========================================================================

  /**
   * Render frame with multiple layers
   */
  async renderFrame(
    time: number,
    videoFrames: Map<string, VideoFrame>,
    project: SerializedProjectData
  ): Promise<void> {
    if (!this._ctx || !this._config) {
      throw new Error('Compositor not initialized');
    }

    const { width, height } = this._config;

    // Clear canvas with black background
    this._ctx.fillStyle = '#000000';
    this._ctx.fillRect(0, 0, width, height);

    // Collect visible layers
    const layers: CompositeLayer[] = [];

    for (const track of project.tracks) {
      if (track.type !== 'video') continue;

      for (const element of track.elements) {
        // Check if element is visible at this time
        if (time < element.startTime || time >= element.startTime + element.duration) {
          continue;
        }

        // Get video frame for this element
        const frame = videoFrames.get(element.id);
        if (!frame) continue;

        layers.push({
          elementId: element.id,
          frame,
          transform: element.transform,
          zIndex: track.index,
        });
      }
    }

    // Sort by z-index (lower index = bottom layer)
    layers.sort((a, b) => a.zIndex - b.zIndex);

    // Render each layer
    for (const layer of layers) {
      this._renderLayer(layer);
    }
  }

  /**
   * Render single layer
   */
  private _renderLayer(layer: CompositeLayer): void {
    if (!this._ctx || !this._config) return;

    const { width, height } = this._config;
    const { frame, transform } = layer;

    // Calculate pixel coordinates from normalized values
    const x = transform.x * width;
    const y = transform.y * height;
    const w = transform.width * width;
    const h = transform.height * height;

    this._ctx.save();

    // Apply opacity
    if (transform.opacity < 1) {
      this._ctx.globalAlpha = transform.opacity;
    }

    // Apply rotation
    if (transform.rotation !== 0) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      this._ctx.translate(cx, cy);
      this._ctx.rotate((transform.rotation * Math.PI) / 180);
      this._ctx.translate(-cx, -cy);
    }

    // Apply flip
    if (transform.flipX || transform.flipY) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      this._ctx.translate(cx, cy);
      this._ctx.scale(transform.flipX ? -1 : 1, transform.flipY ? -1 : 1);
      this._ctx.translate(-cx, -cy);
    }

    // Apply scale
    if (transform.scaleX !== 1 || transform.scaleY !== 1) {
      const cx = x + w / 2;
      const cy = y + h / 2;
      this._ctx.translate(cx, cy);
      this._ctx.scale(transform.scaleX, transform.scaleY);
      this._ctx.translate(-cx, -cy);
    }

    // Draw video frame
    this._ctx.drawImage(frame, x, y, w, h);

    this._ctx.restore();
  }

  /**
   * Create VideoFrame from current canvas state
   */
  toVideoFrame(timestamp: number): VideoFrame {
    if (!this._canvas) {
      throw new Error('Compositor not initialized');
    }

    return new VideoFrame(this._canvas, { timestamp });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /**
   * Dispose compositor resources
   */
  dispose(): void {
    this._ctx = null;
    this._canvas = null;
    this._config = null;
  }
}
