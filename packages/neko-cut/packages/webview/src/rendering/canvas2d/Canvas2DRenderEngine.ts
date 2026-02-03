/**
 * Canvas2DRenderEngine - Canvas 2D based render engine
 * 基于 Canvas 2D API 的渲染引擎
 *
 * 替代 CompositorRenderEngine，使用 Canvas 2D API 进行项目渲染
 * 集成 MediaFrameProvider 获取视频帧和图片
 */

import type {
  ProjectData,
  TimelineTrack,
  TimelineElement,
  MediaElement,
  TextElement,
  ColorCorrection,
  AnimatableProperty,
  ShapeElement,
  Transition,
} from '../../types';
import type {
  Shape,
  ShapeInstance,
  ShapeFill,
  ShapeStroke,
  ShapeShadow,
  GradientFill,
  RectangleShape,
  EllipseShape,
  StarShape,
  LineShape,
  BezierShape,
  PolygonShape,
} from '../../types/shape';
import { generateStarPoints } from '../../types/shape';
import { isTimeInElement } from '../../types/capabilities';
import type { IMediaFrameProvider } from '../unified/mediaFrameProvider';
import { createWebviewMediaFrameProvider, type WebviewMediaFrameProviderConfig } from '../unified/mediaFrameProvider';
import type {
  Canvas2DLayer,
  Canvas2DTransform,
  Canvas2DColorCorrection,
  BlendModeType,
  RenderMode,
  RenderQuality,
  RenderableElement,
  Canvas2DFrameResult,
  Canvas2DProgressCallback,
  Canvas2DCompositorOptions,
} from './types';
import { Canvas2DCompositor, createCanvas2DCompositor } from './Canvas2DCompositor';

// =============================================================================
// Types
// =============================================================================

/**
 * Render context
 */
export interface Canvas2DRenderContext {
  project: ProjectData;
  time: number;
  frameIndex: number;
  width: number;
  height: number;
  fps: number;
  mode: RenderMode;
  quality: RenderQuality;
}

/**
 * Transition info
 */
export interface TransitionInfo {
  transition: Transition;
  progress: number;
}

// =============================================================================
// Canvas2DRenderEngine
// =============================================================================

/**
 * Canvas 2D based render engine
 */
export class Canvas2DRenderEngine {
  private _compositor: Canvas2DCompositor | null = null;
  private _frameProvider: IMediaFrameProvider | null = null;
  private _isInitialized = false;
  private _disposed = false;
  private _width = 0;
  private _height = 0;

  // Text/shape rendering OffscreenCanvas
  private _textCanvas: OffscreenCanvas | null = null;
  private _textContext: OffscreenCanvasRenderingContext2D | null = null;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize the render engine
   */
  async initialize(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    options?: Canvas2DCompositorOptions & { frameProvider?: WebviewMediaFrameProviderConfig }
  ): Promise<boolean> {
    if (this._isInitialized) {
      console.warn('[Canvas2DRenderEngine] Already initialized');
      return true;
    }

    console.log('[Canvas2DRenderEngine] Starting initialization...', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      options,
    });

    try {
      // Create compositor
      this._compositor = createCanvas2DCompositor();
      const success = await this._compositor.initialize(canvas, options);
      if (!success) {
        console.error('[Canvas2DRenderEngine] Failed to initialize compositor');
        return false;
      }

      this._width = canvas.width;
      this._height = canvas.height;

      // Create media frame provider (using WebviewMediaFrameProvider)
      console.log('[Canvas2DRenderEngine] Creating WebviewMediaFrameProvider...');
      this._frameProvider = createWebviewMediaFrameProvider(options?.frameProvider);

      // Create text/shape rendering OffscreenCanvas
      this._textCanvas = new OffscreenCanvas(this._width, this._height);
      this._textContext = this._textCanvas.getContext('2d');

      this._isInitialized = true;

      console.log('[Canvas2DRenderEngine] Initialized with Canvas 2D backend');
      return true;
    } catch (error) {
      console.error('[Canvas2DRenderEngine] Initialization failed:', error);
      return false;
    }
  }

  /**
   * Resize the render engine
   */
  resize(width: number, height: number): void {
    if (!this._compositor) return;

    this._compositor.resize(width, height);
    this._width = width;
    this._height = height;

    // Resize text/shape rendering canvas
    if (this._textCanvas) {
      this._textCanvas.width = width;
      this._textCanvas.height = height;
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this._disposed = true;

    this._compositor?.dispose();
    this._compositor = null;

    this._frameProvider?.dispose();
    this._frameProvider = null;

    this._textCanvas = null;
    this._textContext = null;

    this._isInitialized = false;
    this._width = 0;
    this._height = 0;
  }

  /**
   * Helper to close all frame sources in elements array
   */
  private _closeElementSources(elements: RenderableElement[]): void {
    for (const element of elements) {
      if (element.source instanceof VideoFrame) {
        try {
          element.source.close();
        } catch {
          // Ignore close errors
        }
      } else if (element.source instanceof ImageBitmap) {
        try {
          element.source.close();
        } catch {
          // Ignore close errors
        }
      }
    }
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

  get frameProvider(): IMediaFrameProvider | null {
    return this._frameProvider;
  }

  setFrameProvider(provider: IMediaFrameProvider): void {
    if (this._frameProvider) {
      this._frameProvider.dispose();
    }
    this._frameProvider = provider;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /**
   * Render a single frame
   */
  async renderFrame(
    _context: Canvas2DRenderContext,
    elements: RenderableElement[]
  ): Promise<void> {
    if (!this._compositor) {
      throw new Error('Render engine not initialized');
    }

    // Resources to close after rendering
    const framesToClose: VideoFrame[] = [];
    const bitmapsToClose: ImageBitmap[] = [];

    // Begin frame
    this._compositor.beginFrame();

    // Sort by zIndex
    const sortedElements = [...elements].sort((a, b) => a.zIndex - b.zIndex);

    // Render each element
    for (const element of sortedElements) {
      // Create layer
      const layer: Canvas2DLayer = {
        source: element.source,
        transform: element.transform,
        opacity: element.opacity,
        blendMode: element.blendMode,
        colorCorrection: element.colorCorrection,
        masks: element.masks,
        sourceWidth: element.sourceWidth,
        sourceHeight: element.sourceHeight,
      };

      this._compositor.drawLayer(layer);

      // Collect resources for cleanup
      if (element.source instanceof VideoFrame) {
        framesToClose.push(element.source);
      } else if (element.source instanceof ImageBitmap) {
        bitmapsToClose.push(element.source);
      }
    }

    // End frame
    this._compositor.endFrame();

    // Close all VideoFrames
    for (const frame of framesToClose) {
      try {
        frame.close();
      } catch {
        // Ignore close errors
      }
    }

    // Close all ImageBitmaps
    for (const bitmap of bitmapsToClose) {
      try {
        bitmap.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  /**
   * Render a project frame
   */
  async renderProjectFrame(
    project: ProjectData,
    time: number,
    mode: RenderMode = 'preview',
    quality: RenderQuality = 'preview'
  ): Promise<void> {
    // Check if disposed before starting
    if (this._disposed) {
      return;
    }

    const context: Canvas2DRenderContext = {
      project,
      time,
      frameIndex: Math.floor(time * project.fps),
      width: this._width,
      height: this._height,
      fps: project.fps,
      mode,
      quality,
    };

    // Use non-blocking frame fetching for preview playback
    const nonBlocking = mode === 'preview' && quality === 'preview';
    const elements = await this._gatherRenderableElements(project, time, nonBlocking);

    // Check if disposed after gathering (async operation)
    if (this._disposed) {
      this._closeElementSources(elements);
      return;
    }

    try {
      await this.renderFrame(context, elements);
    } catch (error) {
      // Ensure frames are closed even if rendering fails
      this._closeElementSources(elements);
      throw error;
    }
  }

  /**
   * Export to ImageData
   */
  toImageData(): ImageData {
    if (!this._compositor) {
      throw new Error('Render engine not initialized');
    }
    return this._compositor.toImageData();
  }

  /**
   * Export to Blob
   */
  async toBlob(type?: string, quality?: number): Promise<Blob> {
    if (!this._compositor) {
      throw new Error('Render engine not initialized');
    }
    return this._compositor.toBlob(type, quality);
  }

  /**
   * Export to ImageBitmap
   */
  async toImageBitmap(): Promise<ImageBitmap> {
    if (!this._compositor) {
      throw new Error('Render engine not initialized');
    }
    return this._compositor.toImageBitmap();
  }

  // -------------------------------------------------------------------------
  // Export Generator
  // -------------------------------------------------------------------------

  /**
   * Export frames generator
   */
  async *exportFrames(
    project: ProjectData,
    fps: number,
    onProgress?: Canvas2DProgressCallback
  ): AsyncGenerator<Canvas2DFrameResult> {
    if (!this._compositor) {
      throw new Error('Render engine not initialized');
    }

    const duration = this._calculateDuration(project);
    const totalFrames = Math.ceil(duration * fps);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const time = frameIndex / fps;
      const startTime = performance.now();

      // Render frame
      await this.renderProjectFrame(project, time, 'export', 'final');

      // Get ImageBitmap
      const imageBitmap = await this._compositor.toImageBitmap();

      const renderTime = performance.now() - startTime;

      // Progress callback
      if (onProgress) {
        const percent = ((frameIndex + 1) / totalFrames) * 100;
        onProgress(frameIndex, totalFrames, percent);
      }

      yield {
        frameIndex,
        totalFrames,
        renderTime,
        imageBitmap,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Internal Methods
  // -------------------------------------------------------------------------

  /**
   * Gather renderable elements from project data
   */
  private async _gatherRenderableElements(
    project: ProjectData,
    time: number,
    nonBlocking = false
  ): Promise<RenderableElement[]> {
    const renderables: RenderableElement[] = [];
    const promises: Promise<RenderableElement | null>[] = [];

    // Iterate all tracks
    for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
      const track = project.tracks[trackIndex];

      // Skip hidden tracks
      if (track.hidden) {
        continue;
      }

      // Iterate elements on track
      for (const element of track.elements) {
        // Check if element is in current time range
        if (!isTimeInElement(element, time)) {
          continue;
        }

        // Get renderable element (async)
        promises.push(
          this._elementToRenderableElement(element, track, trackIndex, time, nonBlocking)
        );
      }
    }

    // Wait for all elements to be processed
    // Use allSettled to ensure we can clean up on partial failures
    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        renderables.push(result.value);
      }
      // For rejected promises, no frame was created so nothing to clean up
    }

    return renderables;
  }

  /**
   * Convert timeline element to renderable element
   */
  private async _elementToRenderableElement(
    element: TimelineElement,
    track: TimelineTrack,
    trackIndex: number,
    time: number,
    nonBlocking = false
  ): Promise<RenderableElement | null> {
    // Get media source (async)
    const sourceInfo = await this._getElementMediaSource(element, time, nonBlocking);

    if (!sourceInfo) {
      return null;
    }

    // Calculate transform
    const transform = this._calculateTransform(element, time);

    // Calculate opacity
    const opacity = this._calculateOpacity(element, track, time);

    // Get blend mode
    const blendMode = (element.blendMode as BlendModeType) || 'normal';

    // Get color correction
    const colorCorrection = this._getColorCorrection(element);

    // Get masks (filter disabled ones)
    const masks = element.masks?.filter((m) => m.enabled);

    return {
      id: element.id,
      source: sourceInfo.source,
      transform,
      opacity,
      blendMode,
      colorCorrection,
      masks: masks && masks.length > 0 ? masks : undefined,
      zIndex: trackIndex,
      sourceWidth: sourceInfo.width,
      sourceHeight: sourceInfo.height,
    };
  }

  /**
   * Get element's media source
   */
  private async _getElementMediaSource(
    element: TimelineElement,
    time: number,
    nonBlocking = false
  ): Promise<{ source: CanvasImageSource; width: number; height: number } | null> {
    if (!this._frameProvider) {
      console.warn('[Canvas2DRenderEngine] No frame provider configured');
      return null;
    }

    // Calculate local time with trimStart
    const trimStart = element.trimStart ?? 0;
    const localTime = time - element.startTime + trimStart;

    switch (element.type) {
      case 'media': {
        const mediaElement = element as MediaElement;
        const src = mediaElement.src;

        if (!src) {
          return null;
        }

        // Determine media type
        const ext = src.toLowerCase().split('.').pop() || '';
        const videoExtensions = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

        if (videoExtensions.includes(ext)) {
          // Video: calculate source time
          const sourceOffset =
            (mediaElement as unknown as { sourceOffset?: number }).sourceOffset ?? 0;
          const sourceTime = localTime + sourceOffset;
          const frame = await this._frameProvider.getVideoFrame(
            element.id,
            src,
            sourceTime,
            nonBlocking
          );
          if (frame) {
            return {
              source: frame,
              width: frame.displayWidth,
              height: frame.displayHeight,
            };
          }
          return null;
        } else if (imageExtensions.includes(ext)) {
          // Image
          const bitmap = await this._frameProvider.getImageBitmap(element.id, src);
          if (bitmap) {
            return {
              source: bitmap,
              width: bitmap.width,
              height: bitmap.height,
            };
          }
          return null;
        }

        return null;
      }

      case 'text': {
        // Render text to OffscreenCanvas
        const bitmap = this._renderTextToCanvas(element as TextElement, localTime);
        if (bitmap) {
          return {
            source: bitmap,
            width: this._width,
            height: this._height,
          };
        }
        return null;
      }

      case 'audio': {
        // Audio elements have no visual output
        return null;
      }

      default: {
        // Shape elements
        if ((element as { type: string }).type === 'shape') {
          const bitmap = this._renderShapeToCanvas(element as ShapeElement, localTime);
          if (bitmap) {
            return {
              source: bitmap,
              width: this._width,
              height: this._height,
            };
          }
        }
        return null;
      }
    }
  }

  /**
   * Render text to OffscreenCanvas
   */
  private _renderTextToCanvas(element: TextElement, _localTime: number): ImageBitmap | null {
    if (!this._textCanvas || !this._textContext) return null;

    const ctx = this._textContext;
    const canvas = this._textCanvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set text style
    const fontWeight = element.fontWeight === 'bold' ? 'bold' : 'normal';
    const fontStyle = element.fontStyle === 'italic' ? 'italic' : 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${element.fontSize}px ${element.fontFamily}`;
    ctx.fillStyle = element.color;
    ctx.textAlign = element.textAlign;
    ctx.textBaseline = 'middle';

    // Calculate text position (centered)
    let x = canvas.width / 2;
    if (element.textAlign === 'left') {
      x = 0;
    } else if (element.textAlign === 'right') {
      x = canvas.width;
    }
    const y = canvas.height / 2;

    // Draw background if present
    if (element.backgroundColor && element.backgroundColor !== 'transparent') {
      const metrics = ctx.measureText(element.content);
      const textWidth = metrics.width;
      const textHeight = element.fontSize * 1.2;
      const bgX =
        x -
        (element.textAlign === 'center'
          ? textWidth / 2
          : element.textAlign === 'right'
            ? textWidth
            : 0);

      ctx.fillStyle = element.backgroundColor;
      ctx.fillRect(bgX - 4, y - textHeight / 2 - 2, textWidth + 8, textHeight + 4);
      ctx.fillStyle = element.color;
    }

    // Draw text decoration
    if (element.textDecoration !== 'none') {
      const metrics = ctx.measureText(element.content);
      const textWidth = metrics.width;
      const startX =
        x -
        (element.textAlign === 'center'
          ? textWidth / 2
          : element.textAlign === 'right'
            ? textWidth
            : 0);

      ctx.strokeStyle = element.color;
      ctx.lineWidth = Math.max(1, element.fontSize / 20);

      if (element.textDecoration === 'underline') {
        const underlineY = y + element.fontSize * 0.3;
        ctx.beginPath();
        ctx.moveTo(startX, underlineY);
        ctx.lineTo(startX + textWidth, underlineY);
        ctx.stroke();
      } else if (element.textDecoration === 'line-through') {
        ctx.beginPath();
        ctx.moveTo(startX, y);
        ctx.lineTo(startX + textWidth, y);
        ctx.stroke();
      }
    }

    // Draw text
    ctx.fillText(element.content, x, y);

    // Create ImageBitmap
    try {
      return canvas.transferToImageBitmap();
    } catch {
      return null;
    }
  }

  /**
   * Render shape to OffscreenCanvas
   */
  private _renderShapeToCanvas(element: ShapeElement, _localTime: number): ImageBitmap | null {
    if (!this._textCanvas || !this._textContext) return null;

    const ctx = this._textContext;
    const canvas = this._textCanvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Check for shape instances
    if (!element.shapes || element.shapes.length === 0) {
      try {
        return canvas.transferToImageBitmap();
      } catch {
        return null;
      }
    }

    // Sort by zIndex and render all shape instances
    const sortedShapes = [...element.shapes].sort((a, b) => a.zIndex - b.zIndex);

    for (const shapeInstance of sortedShapes) {
      if (!shapeInstance.visible) continue;
      this._renderShapeInstance(ctx, shapeInstance, canvas.width, canvas.height);
    }

    try {
      return canvas.transferToImageBitmap();
    } catch {
      return null;
    }
  }

  /**
   * Render a single shape instance
   */
  private _renderShapeInstance(
    ctx: OffscreenCanvasRenderingContext2D,
    instance: ShapeInstance,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    ctx.save();

    const { shape, style } = instance;

    // Apply shadow if enabled
    if (style.shadow.enabled) {
      this._applyShapeShadow(ctx, style.shadow);
    }

    // Draw shape path
    ctx.beginPath();
    this._drawShapePath(ctx, shape, canvasWidth, canvasHeight);

    // Apply fill
    this._applyShapeFill(ctx, style.fill, canvasWidth, canvasHeight);

    // Clear shadow for stroke
    ctx.shadowColor = 'transparent';

    // Apply stroke
    if (style.stroke.enabled) {
      this._applyShapeStroke(ctx, style.stroke);
    }

    ctx.restore();
  }

  /**
   * Draw shape path
   */
  private _drawShapePath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: Shape,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    // Convert percentage coordinates to pixels
    const toPixelX = (percent: number) => (percent / 100) * canvasWidth;
    const toPixelY = (percent: number) => (percent / 100) * canvasHeight;
    const toPixelW = (percent: number) => (percent / 100) * canvasWidth;
    const toPixelH = (percent: number) => (percent / 100) * canvasHeight;

    switch (shape.shapeType) {
      case 'rectangle':
        this._drawRectanglePath(
          ctx,
          shape as RectangleShape,
          toPixelX,
          toPixelY,
          toPixelW,
          toPixelH
        );
        break;
      case 'ellipse':
        this._drawEllipsePath(ctx, shape as EllipseShape, toPixelX, toPixelY, toPixelW, toPixelH);
        break;
      case 'polygon':
        this._drawPolygonPath(ctx, shape as PolygonShape, toPixelX, toPixelY);
        break;
      case 'star':
        this._drawStarPath(ctx, shape as StarShape, toPixelX, toPixelY);
        break;
      case 'line':
        this._drawLinePath(ctx, shape as LineShape, toPixelX, toPixelY);
        break;
      case 'bezier':
        this._drawBezierPath(ctx, shape as BezierShape, toPixelX, toPixelY);
        break;
    }
  }

  private _drawRectanglePath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: RectangleShape,
    toPixelX: (p: number) => number,
    toPixelY: (p: number) => number,
    toPixelW: (p: number) => number,
    toPixelH: (p: number) => number
  ): void {
    const cx = toPixelX(shape.centerX);
    const cy = toPixelY(shape.centerY);
    const w = toPixelW(shape.width);
    const h = toPixelH(shape.height);
    const x = cx - w / 2;
    const y = cy - h / 2;

    ctx.save();

    if (shape.rotation !== 0) {
      ctx.translate(cx, cy);
      ctx.rotate((shape.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    if (shape.cornerRadius > 0) {
      const r = Math.min(
        (shape.cornerRadius / 100) * Math.min(w, h),
        Math.min(w, h) / 2
      );
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h);
    }

    ctx.restore();
  }

  private _drawEllipsePath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: EllipseShape,
    toPixelX: (p: number) => number,
    toPixelY: (p: number) => number,
    toPixelW: (p: number) => number,
    toPixelH: (p: number) => number
  ): void {
    const cx = toPixelX(shape.centerX);
    const cy = toPixelY(shape.centerY);
    const rx = toPixelW(shape.radiusX);
    const ry = toPixelH(shape.radiusY);

    ctx.save();

    if (shape.rotation !== 0) {
      ctx.translate(cx, cy);
      ctx.rotate((shape.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    ctx.restore();
  }

  private _drawPolygonPath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: PolygonShape,
    toPixelX: (p: number) => number,
    toPixelY: (p: number) => number
  ): void {
    if (shape.points.length < 3) return;

    ctx.moveTo(toPixelX(shape.points[0].x), toPixelY(shape.points[0].y));

    for (let i = 1; i < shape.points.length; i++) {
      ctx.lineTo(toPixelX(shape.points[i].x), toPixelY(shape.points[i].y));
    }

    ctx.closePath();
  }

  private _drawStarPath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: StarShape,
    toPixelX: (p: number) => number,
    toPixelY: (p: number) => number
  ): void {
    const points = generateStarPoints(shape);
    if (points.length < 3) return;

    ctx.moveTo(toPixelX(points[0].x), toPixelY(points[0].y));

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toPixelX(points[i].x), toPixelY(points[i].y));
    }

    ctx.closePath();
  }

  private _drawLinePath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: LineShape,
    toPixelX: (p: number) => number,
    toPixelY: (p: number) => number
  ): void {
    ctx.moveTo(toPixelX(shape.startX), toPixelY(shape.startY));
    ctx.lineTo(toPixelX(shape.endX), toPixelY(shape.endY));
  }

  private _drawBezierPath(
    ctx: OffscreenCanvasRenderingContext2D,
    shape: BezierShape,
    toPixelX: (p: number) => number,
    toPixelY: (p: number) => number
  ): void {
    if (shape.points.length < 2) return;

    const firstPoint = shape.points[0];
    ctx.moveTo(toPixelX(firstPoint.anchor.x), toPixelY(firstPoint.anchor.y));

    for (let i = 1; i < shape.points.length; i++) {
      const prevPoint = shape.points[i - 1];
      const currPoint = shape.points[i];

      const cp1x = toPixelX(prevPoint.anchor.x + prevPoint.handleOut.x);
      const cp1y = toPixelY(prevPoint.anchor.y + prevPoint.handleOut.y);
      const cp2x = toPixelX(currPoint.anchor.x + currPoint.handleIn.x);
      const cp2y = toPixelY(currPoint.anchor.y + currPoint.handleIn.y);
      const endX = toPixelX(currPoint.anchor.x);
      const endY = toPixelY(currPoint.anchor.y);

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    }

    if (shape.closed && shape.points.length > 2) {
      const lastPoint = shape.points[shape.points.length - 1];
      const fp = shape.points[0];

      const cp1x = toPixelX(lastPoint.anchor.x + lastPoint.handleOut.x);
      const cp1y = toPixelY(lastPoint.anchor.y + lastPoint.handleOut.y);
      const cp2x = toPixelX(fp.anchor.x + fp.handleIn.x);
      const cp2y = toPixelY(fp.anchor.y + fp.handleIn.y);
      const endX = toPixelX(fp.anchor.x);
      const endY = toPixelY(fp.anchor.y);

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
      ctx.closePath();
    }
  }

  private _applyShapeFill(
    ctx: OffscreenCanvasRenderingContext2D,
    fill: ShapeFill,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    if (fill.type === 'none') return;

    ctx.globalAlpha *= fill.opacity;

    if (fill.type === 'solid' && fill.color) {
      ctx.fillStyle = fill.color;
      ctx.fill();
    } else if (fill.type === 'gradient' && fill.gradient) {
      ctx.fillStyle = this._createShapeGradient(ctx, fill.gradient, canvasWidth, canvasHeight);
      ctx.fill();
    }

    ctx.globalAlpha /= fill.opacity;
  }

  private _applyShapeStroke(ctx: OffscreenCanvasRenderingContext2D, stroke: ShapeStroke): void {
    ctx.globalAlpha *= stroke.opacity;

    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = stroke.lineCap;
    ctx.lineJoin = stroke.lineJoin;
    ctx.miterLimit = stroke.miterLimit;

    if (stroke.dashArray.length > 0) {
      ctx.setLineDash(stroke.dashArray);
      ctx.lineDashOffset = stroke.dashOffset;
    }

    ctx.stroke();

    ctx.globalAlpha /= stroke.opacity;
  }

  private _applyShapeShadow(ctx: OffscreenCanvasRenderingContext2D, shadow: ShapeShadow): void {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }

  private _createShapeGradient(
    ctx: OffscreenCanvasRenderingContext2D,
    gradient: GradientFill,
    canvasWidth: number,
    canvasHeight: number
  ): CanvasGradient {
    let grad: CanvasGradient;

    if (gradient.type === 'radial') {
      const cx = (gradient.centerX ?? 0.5) * canvasWidth;
      const cy = (gradient.centerY ?? 0.5) * canvasHeight;
      const r = (gradient.radius ?? 0.5) * Math.max(canvasWidth, canvasHeight);

      grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    } else {
      // Linear gradient
      const angle = ((gradient.angle ?? 0) * Math.PI) / 180;
      const length = Math.max(canvasWidth, canvasHeight);
      const centerX = canvasWidth / 2;
      const centerY = canvasHeight / 2;
      const dx = (Math.cos(angle) * length) / 2;
      const dy = (Math.sin(angle) * length) / 2;

      grad = ctx.createLinearGradient(centerX - dx, centerY - dy, centerX + dx, centerY + dy);
    }

    for (const stop of gradient.stops) {
      grad.addColorStop(stop.offset, stop.color);
    }

    return grad;
  }

  /**
   * Calculate element transform
   */
  private _calculateTransform(element: TimelineElement, time: number): Canvas2DTransform {
    // Priority: animated transform
    const animTransform = element.animTransform;
    if (animTransform) {
      const localTime = time - element.startTime;
      return {
        x: this._getAnimatedValue(animTransform.x, localTime, 0.5),
        y: this._getAnimatedValue(animTransform.y, localTime, 0.5),
        scaleX: this._getAnimatedValue(animTransform.scaleX, localTime, 1),
        scaleY: this._getAnimatedValue(animTransform.scaleY, localTime, 1),
        rotation: this._getAnimatedValue(animTransform.rotation, localTime, 0),
        anchorX: animTransform.anchorX ?? 0.5,
        anchorY: animTransform.anchorY ?? 0.5,
      };
    }

    // Fallback to static transform
    const transform = element.transform;
    if (transform) {
      return {
        x: transform.x,
        y: transform.y,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        rotation: transform.rotation,
        anchorX: transform.anchorX,
        anchorY: transform.anchorY,
      };
    }

    // Default values
    return {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    };
  }

  /**
   * Calculate opacity
   */
  private _calculateOpacity(
    element: TimelineElement,
    _track: TimelineTrack,
    time: number
  ): number {
    const animTransform = element.animTransform;
    if (animTransform) {
      const localTime = time - element.startTime;
      return this._getAnimatedValue(animTransform.opacity, localTime, 1);
    }

    const staticOpacity = element.transform?.opacity ?? element.opacity ?? 1;
    return staticOpacity;
  }

  /**
   * Get animated value at time
   */
  private _getAnimatedValue(
    prop: AnimatableProperty | undefined,
    localTime: number,
    defaultValue: number
  ): number {
    if (!prop) return defaultValue;

    if (!prop.keyframes || prop.keyframes.length === 0) {
      return prop.baseValue ?? defaultValue;
    }

    const keyframes = prop.keyframes;

    if (localTime <= keyframes[0].time) {
      return keyframes[0].value;
    }

    if (localTime >= keyframes[keyframes.length - 1].time) {
      return keyframes[keyframes.length - 1].value;
    }

    for (let i = 0; i < keyframes.length - 1; i++) {
      const kf1 = keyframes[i];
      const kf2 = keyframes[i + 1];

      if (localTime >= kf1.time && localTime <= kf2.time) {
        const t = (localTime - kf1.time) / (kf2.time - kf1.time);
        return kf1.value + (kf2.value - kf1.value) * t;
      }
    }

    return prop.baseValue ?? defaultValue;
  }

  /**
   * Get color correction parameters
   */
  private _getColorCorrection(element: TimelineElement): Canvas2DColorCorrection | undefined {
    if (element.type !== 'media') return undefined;

    const mediaElement = element as MediaElement;
    const cc = mediaElement.colorCorrection as ColorCorrection | undefined;
    if (!cc || !cc.enabled) return undefined;

    const basic = cc.basic;
    return {
      brightness: basic.exposure ?? 0,
      contrast: basic.contrast ?? 0,
      saturation: basic.saturation ?? 0,
    };
  }

  /**
   * Calculate project duration
   */
  private _calculateDuration(project: ProjectData): number {
    let maxDuration = 0;

    for (const track of project.tracks) {
      for (const element of track.elements) {
        const elementEnd = element.startTime + element.duration;
        if (elementEnd > maxDuration) {
          maxDuration = elementEnd;
        }
      }
    }

    return maxDuration;
  }
}

// =============================================================================
// Singleton and Factory Functions
// =============================================================================

let _instance: Canvas2DRenderEngine | null = null;

/**
 * Get render engine singleton
 */
export function getCanvas2DRenderEngine(): Canvas2DRenderEngine {
  if (!_instance) {
    _instance = new Canvas2DRenderEngine();
  }
  return _instance;
}

/**
 * Create new render engine instance
 */
export function createCanvas2DRenderEngine(): Canvas2DRenderEngine {
  return new Canvas2DRenderEngine();
}

/**
 * Dispose render engine singleton
 */
export function disposeCanvas2DRenderEngine(): void {
  if (_instance) {
    _instance.dispose();
    _instance = null;
  }
}
