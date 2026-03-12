/**
 * Brush Engine
 *
 * Manages stroke lifecycle: begin → addPoint → end.
 * Interpolates points, applies pressure mapping, and
 * renders dabs to the active layer's framebuffer.
 */
import type { StrokePoint, BrushSettings, StrokeResult } from '../types';
import type { IRenderPipeline } from '../engine/types';
import { interpolateStroke } from './stroke-interpolator';
import { pressureToSize, pressureToOpacity } from './pressure-mapper';
import { BRUSH_PROFILES } from './brush-profiles';

export interface IBrushEngine {
  beginStroke(point: StrokePoint, settings: BrushSettings, layerFBO: WebGLFramebuffer): void;
  addPoint(point: StrokePoint): void;
  endStroke(): StrokeResult | null;
  isActive(): boolean;
}

export class BrushEngine implements IBrushEngine {
  private readonly pipeline: IRenderPipeline;
  private points: StrokePoint[] = [];
  private settings: BrushSettings | null = null;
  private layerFBO: WebGLFramebuffer | null = null;
  private active = false;
  private bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  constructor(pipeline: IRenderPipeline) {
    this.pipeline = pipeline;
  }

  beginStroke(point: StrokePoint, settings: BrushSettings, layerFBO: WebGLFramebuffer): void {
    this.points = [point];
    this.settings = settings;
    this.layerFBO = layerFBO;
    this.active = true;
    this.bounds = { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };

    // Render initial dab
    this.renderPoints([point]);
  }

  addPoint(point: StrokePoint): void {
    if (!this.active || !this.settings || !this.layerFBO) return;

    this.points.push(point);
    this.updateBounds(point);

    // Interpolate recent segment
    const recent = this.points.slice(-4);
    const spacing = this.settings.spacing * this.settings.size;
    const interpolated = interpolateStroke(recent, Math.max(1, spacing));

    this.renderPoints(interpolated);
  }

  endStroke(): StrokeResult | null {
    if (!this.active || !this.settings) return null;

    const result: StrokeResult = {
      points: [...this.points],
      bounds: {
        x: this.bounds.minX,
        y: this.bounds.minY,
        width: this.bounds.maxX - this.bounds.minX,
        height: this.bounds.maxY - this.bounds.minY,
      },
      layerId: '', // Set by caller
    };

    this.reset();
    return result;
  }

  isActive(): boolean {
    return this.active;
  }

  private renderPoints(points: StrokePoint[]): void {
    if (!this.settings || !this.layerFBO || points.length === 0) return;

    const profile = BRUSH_PROFILES[this.settings.type];
    const color = hexToRGBA(this.settings.color, this.settings.opacity);

    // Convert to Float32Array (x, y, pressure) per point
    const data = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      const pressure = this.settings.pressureSizeEnabled
        ? pressureToSize(pt.pressure, 1.0, profile.minSizeFraction, profile.pressureCurve)
        : 1.0;
      data[i * 3] = pt.x;
      data[i * 3 + 1] = pt.y;
      data[i * 3 + 2] = pressure;
    }

    // Apply pressure to opacity for the whole stroke segment
    if (this.settings.pressureOpacityEnabled && points.length > 0) {
      const avgPressure = points.reduce((s, p) => s + p.pressure, 0) / points.length;
      const opacity = pressureToOpacity(
        avgPressure,
        this.settings.opacity,
        profile.minOpacityFraction,
        profile.pressureCurve,
      );
      color[3] = opacity;
    }

    this.pipeline.renderStrokeSegment(data, color, this.settings.size, this.layerFBO);
  }

  private updateBounds(point: StrokePoint): void {
    const pad = (this.settings?.size ?? 0) / 2;
    this.bounds.minX = Math.min(this.bounds.minX, point.x - pad);
    this.bounds.minY = Math.min(this.bounds.minY, point.y - pad);
    this.bounds.maxX = Math.max(this.bounds.maxX, point.x + pad);
    this.bounds.maxY = Math.max(this.bounds.maxY, point.y + pad);
  }

  private reset(): void {
    this.points = [];
    this.settings = null;
    this.layerFBO = null;
    this.active = false;
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }
}

/** Convert hex color string to RGBA tuple */
function hexToRGBA(hex: string, alpha: number): [number, number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b, alpha];
}
