/**
 * Brush Engine
 *
 * Manages stroke lifecycle: begin → addPoint → end.
 * Interpolates points, applies pressure mapping, and
 * renders dabs to the active layer's framebuffer.
 */
import type { StrokePoint, BrushSettings, StrokeResult, SymmetryConfig } from '../types';
import type { IRenderPipeline } from '../engine/types';
import { interpolateStroke } from './stroke-interpolator';
import { pressureToSize, pressureToOpacity } from './pressure-mapper';
import { BRUSH_PROFILES } from './brush-profiles';
import { getTextureStampPatternIndex } from './texture-stamp';

export interface IBrushEngine {
  beginStroke(
    point: StrokePoint,
    settings: BrushSettings,
    layerFBO: WebGLFramebuffer,
    width: number,
    height: number,
    alphaLock?: boolean,
    symmetry?: SymmetryConfig | null,
    stampTexture?: WebGLTexture | null,
  ): void;
  addPoint(point: StrokePoint): void;
  endStroke(): StrokeResult | null;
  isActive(): boolean;
}

export class BrushEngine implements IBrushEngine {
  private readonly pipeline: IRenderPipeline;
  private points: StrokePoint[] = [];
  private settings: BrushSettings | null = null;
  private layerFBO: WebGLFramebuffer | null = null;
  private fboWidth = 0;
  private fboHeight = 0;
  private active = false;
  private alphaLock = false;
  private symmetry: SymmetryConfig | null = null;
  private stampTexture: WebGLTexture | null = null;
  private bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };

  constructor(pipeline: IRenderPipeline) {
    this.pipeline = pipeline;
  }

  beginStroke(
    point: StrokePoint,
    settings: BrushSettings,
    layerFBO: WebGLFramebuffer,
    width: number,
    height: number,
    alphaLock = false,
    symmetry?: SymmetryConfig | null,
    stampTexture: WebGLTexture | null = null,
  ): void {
    this.points = [point];
    this.settings = settings;
    this.alphaLock = alphaLock;
    this.symmetry = symmetry && symmetry.mode !== 'none' ? symmetry : null;
    this.stampTexture = stampTexture;
    this.layerFBO = layerFBO;
    this.fboWidth = width;
    this.fboHeight = height;
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

    // Render mirrored segments for symmetry painting
    if (this.symmetry) {
      const mirrored = mirrorPoints(interpolated, this.symmetry);
      for (const seg of mirrored) {
        this.renderPoints(seg);
      }
    }
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
    const stampPattern =
      this.settings.type === 'stamp' ? getTextureStampPatternIndex(this.settings.stampPattern) : 0;

    // Convert to Float32Array (x, y, pressure, tiltX, tiltY) per point
    const data = new Float32Array(points.length * 5);
    for (let i = 0; i < points.length; i++) {
      const pt = points[i]!;
      const pressure = this.settings.pressureSizeEnabled
        ? pressureToSize(pt.pressure, 1.0, profile.minSizeFraction, profile.pressureCurve)
        : 1.0;
      data[i * 5] = pt.x;
      data[i * 5 + 1] = pt.y;
      data[i * 5 + 2] = pressure;
      data[i * 5 + 3] = pt.tiltX;
      data[i * 5 + 4] = pt.tiltY;
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

    this.pipeline.renderStrokeSegment(
      data,
      color,
      this.settings.size,
      this.layerFBO,
      this.fboWidth,
      this.fboHeight,
      this.settings.hardness,
      this.alphaLock,
      stampPattern,
      this.stampTexture,
    );
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
    this.fboWidth = 0;
    this.fboHeight = 0;
    this.active = false;
    this.stampTexture = null;
    this.bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  }
}

/** Generate mirrored point arrays for symmetry painting */
function mirrorPoints(points: StrokePoint[], sym: SymmetryConfig): StrokePoint[][] {
  const result: StrokePoint[][] = [];
  const { mode, axisX, axisY, radialCount } = sym;

  if (mode === 'vertical' || mode === 'both') {
    result.push(points.map((p) => ({ ...p, x: 2 * axisX - p.x })));
  }
  if (mode === 'horizontal' || mode === 'both') {
    result.push(points.map((p) => ({ ...p, y: 2 * axisY - p.y })));
  }
  if (mode === 'both') {
    // Diagonal mirror (both axes)
    result.push(points.map((p) => ({ ...p, x: 2 * axisX - p.x, y: 2 * axisY - p.y })));
  }
  if (mode === 'radial') {
    const n = Math.max(2, Math.min(16, radialCount));
    for (let i = 1; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      result.push(
        points.map((p) => {
          const dx = p.x - axisX;
          const dy = p.y - axisY;
          return { ...p, x: axisX + dx * cos - dy * sin, y: axisY + dx * sin + dy * cos };
        }),
      );
    }
  }

  return result;
}

/** Convert hex color string to RGBA tuple */
function hexToRGBA(hex: string, alpha: number): [number, number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b, alpha];
}
