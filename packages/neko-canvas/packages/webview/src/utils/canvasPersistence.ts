import type { CanvasData } from '@neko/shared';

export function createCanvasDocumentSaveFingerprint(canvasData: CanvasData): string {
  const { viewport: _viewport, ...semanticData } = canvasData;
  return JSON.stringify(semanticData);
}
