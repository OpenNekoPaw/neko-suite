import { describe, expect, it } from 'vitest';
import type { LayerData } from '../types';
import { createVectorLayerData, listVectorPathNodes } from '../tools/vector-editing';
import { createRectangle } from '../tools/vector-tool';
import { deserializeDocument, serializeDocument } from './document-serializer';
import { CURRENT_NKS_VERSION } from '@neko/shared/nks';

describe('document serializer vector data', () => {
  it('serializes vector layer source paths separately from raster pixels', () => {
    const path = createRectangle(0, 0, 100, 50, {
      color: [1, 0, 0, 1],
      rule: 'nonzero',
    });
    const anchor = listVectorPathNodes(path)[0]!.ref;
    const layer = makeLayer({
      type: 'vector',
      vectorData: {
        ...createVectorLayerData([path]),
        handleModes: [{ anchor, mode: 'mirrored' }],
      },
    });

    const doc = serializeDocument(
      { width: 100, height: 50, dpi: 144, backgroundColor: '#ffffff' },
      [layer],
      { panX: 0, panY: 0, zoom: 1, rotation: 0 },
      null,
    );

    expect(doc.layers[0]?.vectorData?.paths[0]?.id).toBe(path.id);
    expect(doc.layers[0]?.vectorData?.handleModes).toEqual([{ anchor, mode: 'mirrored' }]);
    expect(doc.layers[0]?.data).toBeUndefined();
    expect(doc.version).toBe(CURRENT_NKS_VERSION);
  });

  it('deserializes valid vector paths and drops malformed path entries', () => {
    const parsed = deserializeDocument({
      version: '1.1',
      canvas: { width: 100, height: 50, dpi: 144, backgroundColor: '#ffffff' },
      viewport: { panX: 0, panY: 0, zoom: 1, rotation: 0 },
      brushPresets: [],
      palette: [],
      layers: [
        {
          ...makeLayer(),
          type: 'vector',
          vectorData: {
            paths: [
              createRectangle(0, 0, 100, 50),
              { id: 'bad-path', segments: [{ type: 'bad', points: [] }], closed: false },
            ],
            selectedPathId: null,
            selectedNodeRefs: [
              { pathId: 'shape', segmentIndex: 0, pointIndex: 0, role: 'anchor' },
              { pathId: 'shape', segmentIndex: 0, pointIndex: 0, role: 'bad' },
            ],
            handleModes: [
              {
                anchor: { pathId: 'shape', segmentIndex: 0, pointIndex: 0, role: 'anchor' },
                mode: 'smooth',
              },
              {
                anchor: { pathId: 'shape', segmentIndex: 0, pointIndex: 0, role: 'anchor' },
                mode: 'bad',
              },
            ],
          },
        },
      ],
    });

    expect(parsed?.layers[0]?.vectorData?.paths).toHaveLength(1);
    expect(parsed?.layers[0]?.vectorData?.selectedNodeRefs).toEqual([
      { pathId: 'shape', segmentIndex: 0, pointIndex: 0, role: 'anchor' },
    ]);
    expect(parsed?.layers[0]?.vectorData?.handleModes).toEqual([
      {
        anchor: { pathId: 'shape', segmentIndex: 0, pointIndex: 0, role: 'anchor' },
        mode: 'smooth',
      },
    ]);
  });
});

function makeLayer(overrides: Partial<LayerData> = {}): LayerData {
  return {
    id: 'layer-vector',
    name: 'Vector Layer',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    offsetX: 0,
    offsetY: 0,
    clippingMask: false,
    maskLayerId: null,
    children: [],
    texture: null,
    alphaLock: false,
    ...overrides,
  };
}
