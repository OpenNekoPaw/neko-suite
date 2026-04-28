import { describe, expect, it } from 'vitest';
import type { PsdDocumentTreeWire, PsdLayerNodeWire } from '@neko/shared';
import { mapPsdDocumentTree } from './psd-layer-mapper';

describe('PSD layer mapper', () => {
  it('maps raster pixels into native raster layers with pending data', () => {
    const result = mapPsdDocumentTree({
      canvas: createCanvas(),
      layers: [
        createRasterLayer({
          name: 'Paint',
          blendMode: 'mul ',
          pixels: { kind: 'encoded', dataBase64: 'AQID', mimeType: 'image/png' },
        }),
      ],
    });

    expect(result.layers).toHaveLength(1);
    expect(result.layers[0]?.type).toBe('raster');
    expect(result.layers[0]?.blendMode).toBe('multiply');
    expect(result.layers[0]?.pendingData).toBe('AQID');
    expect(result.issues).toHaveLength(0);
  });

  it('maps PSD wire payload after JSON round-trip serialization', () => {
    const payload = JSON.parse(
      JSON.stringify({
        canvas: createCanvas(),
        layers: [
          createRasterLayer({
            name: 'Serialized',
            blendMode: 'screen',
            pixels: { kind: 'encoded', dataBase64: 'AQID', mimeType: 'image/png' },
          }),
        ],
      }),
    );

    const result = mapPsdDocumentTree(payload);

    expect(result.layers[0]?.blendMode).toBe('screen');
    expect(result.layers[0]?.pendingData).toBe('AQID');
    expect(result.issues).toHaveLength(0);
  });

  it('records group pass-through mismatch separately from raster blend fallback', () => {
    const result = mapPsdDocumentTree({
      canvas: createCanvas(),
      layers: [
        {
          ...createGroupLayer('Folder'),
          blendMode: 'pass through',
          children: [
            createRasterLayer({
              name: 'Unsupported',
              blendMode: 'linear dodge',
              pixels: { kind: 'encoded', dataBase64: 'BA==', mimeType: 'image/png' },
            }),
          ],
        },
      ],
    });

    expect(result.issues.map((issue) => issue.code)).toEqual([
      'group-isolation-mismatch',
      'unsupported-blend-mode',
    ]);
    expect(result.layers[0]?.type).toBe('group');
    expect(result.layers[0]?.children[0]?.blendMode).toBe('normal');
  });

  it('maps ag-psd semantic child blend modes inside pass-through groups', () => {
    const result = mapPsdDocumentTree({
      canvas: createCanvas(),
      layers: [
        {
          ...createGroupLayer('Folder'),
          blendMode: 'pass through',
          children: [
            createRasterLayer({
              name: 'Screen Layer',
              blendMode: 'screen',
              pixels: { kind: 'encoded', dataBase64: 'BA==', mimeType: 'image/png' },
            }),
          ],
        },
      ],
    });

    expect(result.layers[0]?.children[0]?.blendMode).toBe('screen');
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'group-isolation-mismatch',
        layerPath: ['Folder'],
      }),
    ]);
  });

  it('keeps empty raster layers visible and reports missing pixel data', () => {
    const result = mapPsdDocumentTree({
      canvas: createCanvas(),
      layers: [createRasterLayer({ name: 'Empty', pixels: undefined })],
    });

    expect(result.layers[0]?.type).toBe('raster');
    expect(result.layers[0]?.pendingData).toBeUndefined();
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'missing-pixel-data',
        layerPath: ['Empty'],
      }),
    ]);
  });

  it('does not duplicate contract issues already reported by the extension adapter', () => {
    const sourceIssues = [
      {
        code: 'group-isolation-mismatch',
        severity: 'warning',
        message: 'adapter warning',
        layerPath: ['Folder'],
      },
      {
        code: 'unsupported-blend-mode',
        severity: 'warning',
        message: 'adapter warning',
        layerPath: ['Folder', 'Unsupported'],
      },
      {
        code: 'missing-pixel-data',
        severity: 'warning',
        message: 'adapter warning',
        layerPath: ['Folder', 'Unsupported'],
      },
    ] as const;

    const result = mapPsdDocumentTree(
      {
        canvas: createCanvas(),
        layers: [
          {
            ...createGroupLayer('Folder'),
            blendMode: 'pass through',
            children: [
              createRasterLayer({
                name: 'Unsupported',
                blendMode: 'linear dodge',
                pixels: undefined,
              }),
            ],
          },
        ],
      },
      sourceIssues,
    );

    expect(result.issues).toHaveLength(3);
    expect(result.issues.filter((issue) => issue.code === 'group-isolation-mismatch')).toHaveLength(
      1,
    );
    expect(result.issues.filter((issue) => issue.code === 'unsupported-blend-mode')).toHaveLength(
      1,
    );
    expect(result.issues.filter((issue) => issue.code === 'missing-pixel-data')).toHaveLength(1);
  });

  it('preserves top-level and nested PSD layer order', () => {
    const result = mapPsdDocumentTree({
      canvas: createCanvas(),
      layers: [
        createRasterLayer({ name: 'Bottom' }),
        {
          ...createGroupLayer('Folder'),
          children: [
            createRasterLayer({ name: 'Nested Bottom' }),
            createRasterLayer({ name: 'Nested Top' }),
          ],
        },
        createRasterLayer({ name: 'Top' }),
      ],
    });

    expect(result.layers.map((layer) => layer.name)).toEqual(['Bottom', 'Folder', 'Top']);
    expect(result.layers[1]?.children.map((layer) => layer.name)).toEqual([
      'Nested Bottom',
      'Nested Top',
    ]);
  });
});

function createCanvas(): PsdDocumentTreeWire['canvas'] {
  return {
    width: 320,
    height: 240,
    dpi: 72,
    backgroundColor: '#ffffff',
  };
}

function createGroupLayer(name: string): PsdLayerNodeWire {
  return {
    name,
    kind: 'group',
    visible: true,
    opacity: 1,
    blendMode: 'norm',
    clippingMask: false,
    left: 0,
    top: 0,
    width: 320,
    height: 240,
    children: [],
  };
}

function createRasterLayer(
  overrides: Partial<PsdLayerNodeWire> & Pick<PsdLayerNodeWire, 'name'>,
): PsdLayerNodeWire {
  return {
    name: overrides.name,
    kind: 'raster',
    visible: true,
    opacity: 1,
    blendMode: 'norm',
    clippingMask: false,
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    pixels: { kind: 'encoded', dataBase64: 'AA==', mimeType: 'image/png' },
    ...overrides,
  };
}
