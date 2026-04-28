import { describe, expect, it } from 'vitest';
import type { IRenderPipeline } from '../engine/types';
import type { StrokePoint } from '../types';
import { BrushEngine } from './brush-engine';
import { getDefaultBrushSettings } from './brush-profiles';

interface StrokeRenderCall {
  readonly pointCount: number;
  readonly stampPattern: number | undefined;
  readonly stampTexture: WebGLTexture | null | undefined;
}

function makePoint(): StrokePoint {
  return {
    x: 10,
    y: 12,
    pressure: 1,
    tiltX: 0,
    tiltY: 0,
    timestamp: 0,
  };
}

function createPipeline(calls: StrokeRenderCall[]): IRenderPipeline {
  return {
    compositeLayerStack: () => undefined,
    renderStrokeSegment: (
      points,
      _color,
      _size,
      _targetFBO,
      _targetWidth,
      _targetHeight,
      _hardness,
      _alphaLock,
      stampPattern,
      stampTexture,
    ) => {
      calls.push({
        pointCount: points.length / 5,
        stampPattern,
        stampTexture,
      });
    },
    clear: () => undefined,
    dispose: () => undefined,
  };
}

describe('BrushEngine', () => {
  it('passes texture stamp pattern indices to the render pipeline', () => {
    const calls: StrokeRenderCall[] = [];
    const engine = new BrushEngine(createPipeline(calls));
    const settings = {
      ...getDefaultBrushSettings('stamp', '#ff00aa'),
      stampPattern: 'crosshatch' as const,
    };

    engine.beginStroke(makePoint(), settings, {} as WebGLFramebuffer, 100, 100);

    expect(calls).toEqual([{ pointCount: 1, stampPattern: 2, stampTexture: null }]);
  });

  it('passes selected stamp asset textures without storing them in brush settings', () => {
    const calls: StrokeRenderCall[] = [];
    const engine = new BrushEngine(createPipeline(calls));
    const texture = {} as WebGLTexture;

    engine.beginStroke(
      makePoint(),
      getDefaultBrushSettings('stamp'),
      {} as WebGLFramebuffer,
      100,
      100,
      false,
      null,
      texture,
    );

    expect(calls).toEqual([{ pointCount: 1, stampPattern: 1, stampTexture: texture }]);
  });

  it('uses the regular round dab path for non-stamp brushes', () => {
    const calls: StrokeRenderCall[] = [];
    const engine = new BrushEngine(createPipeline(calls));

    engine.beginStroke(
      makePoint(),
      getDefaultBrushSettings('pen'),
      {} as WebGLFramebuffer,
      100,
      100,
    );

    expect(calls).toEqual([{ pointCount: 1, stampPattern: 0, stampTexture: null }]);
  });
});
