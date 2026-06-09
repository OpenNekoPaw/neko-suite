import { describe, expect, it } from 'vitest';
import type { CanvasData } from '@neko/shared';
import { createCanvasDocumentSaveFingerprint } from './canvasPersistence';

function canvasData(viewport: CanvasData['viewport'], name = 'Canvas'): CanvasData {
  return {
    version: '1.0',
    name,
    viewport,
    nodes: [],
    connections: [],
  };
}

describe('canvas persistence helpers', () => {
  it('ignores viewport when creating the document save fingerprint', () => {
    const a = canvasData({ pan: { x: 0, y: 0 }, zoom: 1 });
    const b = canvasData({ pan: { x: 400, y: -120 }, zoom: 2 });

    expect(createCanvasDocumentSaveFingerprint(a)).toBe(createCanvasDocumentSaveFingerprint(b));
  });

  it('changes fingerprint for semantic document edits', () => {
    const a = canvasData({ pan: { x: 0, y: 0 }, zoom: 1 }, 'Canvas A');
    const b = canvasData({ pan: { x: 0, y: 0 }, zoom: 1 }, 'Canvas B');

    expect(createCanvasDocumentSaveFingerprint(a)).not.toBe(createCanvasDocumentSaveFingerprint(b));
  });
});
