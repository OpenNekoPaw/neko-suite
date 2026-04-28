import { describe, expect, it } from 'vitest';
import {
  buildViewportTransformMatrix,
  documentToScreenPoint,
  getPanForDocumentPointAtScreenPoint,
  screenToDocumentPoint,
} from './viewport-transform';
import type { ViewportState } from '../types';

describe('viewport transform', () => {
  it('round-trips document and screen points with rotation', () => {
    const viewport: ViewportState = {
      panX: 12,
      panY: -8,
      zoom: 2,
      rotation: Math.PI / 2,
    };
    const size = { width: 200, height: 100 };
    const docPoint = { x: 30, y: 20 };

    const screenPoint = documentToScreenPoint(docPoint, viewport, size);
    const restored = screenToDocumentPoint(screenPoint, viewport, size);

    expect(restored.x).toBeCloseTo(docPoint.x);
    expect(restored.y).toBeCloseTo(docPoint.y);
  });

  it('keeps the existing matrix for zero rotation', () => {
    const matrix = Array.from(
      buildViewportTransformMatrix(
        { panX: 10, panY: 20, zoom: 2, rotation: 0 },
        100,
        100,
        100,
        100,
      ),
    );

    expect(matrix[0]).toBeCloseTo(2);
    expect(matrix[4]).toBeCloseTo(2);
    expect(matrix[6]).toBeCloseTo(1.2);
    expect(matrix[7]).toBeCloseTo(-1.4);
  });

  it('rotates the viewport matrix around the screen center', () => {
    const matrix = Array.from(
      buildViewportTransformMatrix(
        { panX: 0, panY: 0, zoom: 1, rotation: Math.PI / 2 },
        100,
        100,
        100,
        100,
      ),
    );

    expect(matrix[0]).toBeCloseTo(0);
    expect(matrix[1]).toBeCloseTo(-1);
    expect(matrix[3]).toBeCloseTo(1);
    expect(matrix[4]).toBeCloseTo(0);
  });

  it('solves pan for cursor-centered zoom with rotation', () => {
    const size = { width: 200, height: 100 };
    const screenPoint = { x: 140, y: 35 };
    const before: ViewportState = {
      panX: 12,
      panY: -8,
      zoom: 1.5,
      rotation: Math.PI / 4,
    };
    const docPoint = screenToDocumentPoint(screenPoint, before, size);
    const pan = getPanForDocumentPointAtScreenPoint(
      docPoint,
      screenPoint,
      { zoom: 3, rotation: before.rotation },
      size,
    );
    const afterScreen = documentToScreenPoint(docPoint, { ...before, ...pan, zoom: 3 }, size);

    expect(afterScreen.x).toBeCloseTo(screenPoint.x);
    expect(afterScreen.y).toBeCloseTo(screenPoint.y);
  });
});
