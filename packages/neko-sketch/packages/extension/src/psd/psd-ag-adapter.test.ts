import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePsdToWire } from './psd-ag-adapter';

const readPsdMock = vi.hoisted(() => vi.fn());
const initializeCanvasMock = vi.hoisted(() => vi.fn());

vi.mock('ag-psd', () => ({
  readPsd: readPsdMock,
  initializeCanvas: initializeCanvasMock,
}));

describe('PSD ag-psd adapter', () => {
  beforeEach(() => {
    readPsdMock.mockReset();
    initializeCanvasMock.mockReset();
  });

  it('reports ag-psd numeric CMYK and non-8-bit documents as color mode issues', async () => {
    readPsdMock.mockReturnValue({
      width: 1,
      height: 1,
      bitsPerChannel: 16,
      colorMode: 4,
      children: [],
    });

    const result = await parsePsdToWire('cmyk.psd', new Uint8Array([1]));
    const colorIssues = result.issues.filter((issue) => issue.code === 'unsupported-color-mode');

    expect(colorIssues).toHaveLength(2);
    expect(colorIssues[0]?.message).toContain('bit depth 16');
    expect(colorIssues[1]?.message).toContain('CMYK (4)');
  });

  it('does not report RGB 8-bit documents as unsupported color mode', async () => {
    readPsdMock.mockReturnValue({
      width: 1,
      height: 1,
      bitsPerChannel: 8,
      colorMode: 3,
      children: [],
    });

    const result = await parsePsdToWire('rgb.psd', new Uint8Array([1]));

    expect(result.issues.filter((issue) => issue.code === 'unsupported-color-mode')).toHaveLength(
      0,
    );
  });

  it('throws a structured parse-failed error when ag-psd cannot parse the file', async () => {
    readPsdMock.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(parsePsdToWire('broken.psd', new Uint8Array([1]))).rejects.toMatchObject({
      name: 'PsdImportError',
      code: 'parse-failed',
      message: 'PSD parse failed: invalid signature',
    });
  });

  it('preserves ag-psd semantic blend modes and reports unsupported layer features', async () => {
    readPsdMock.mockReturnValue({
      width: 1,
      height: 1,
      bitsPerChannel: 8,
      colorMode: 3,
      children: [
        {
          name: 'Text Smart Mask',
          left: 0,
          top: 0,
          right: 1,
          bottom: 1,
          blendMode: 'multiply',
          imageData: {
            width: 1,
            height: 1,
            data: new Uint8Array([255, 0, 0, 255]),
          },
          text: { text: 'hello' },
          smartObject: {},
          mask: {},
          effects: {},
          adjustment: { type: 'brightness/contrast' },
          vectorFill: { type: 'color', color: { r: 255, g: 0, b: 0 } },
        },
      ],
    });

    const result = await parsePsdToWire('features.psd', new Uint8Array([1]));

    expect(result.tree.layers[0]?.blendMode).toBe('multiply');
    expect(result.tree.layers[0]?.pixels).toBeDefined();
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'unsupported-layer-kind',
      'unsupported-layer-kind',
      'mask-not-imported',
      'unsupported-layer-kind',
      'unsupported-layer-kind',
      'unsupported-layer-kind',
    ]);
    expect(result.issues.map((issue) => issue.message)).toEqual([
      'PSD text layer was rasterized during import.',
      'PSD smart object was rasterized during import.',
      'PSD layer mask was not imported.',
      'PSD layer effects were rasterized or dropped during import.',
      'PSD adjustment layer semantics (brightness/contrast) were rasterized or dropped during import.',
      'PSD vector fill or stroke semantics were rasterized or dropped during import.',
    ]);
  });

  it('reports known ag-psd adjustment layer variants without silently dropping semantics', async () => {
    const adjustmentTypes = [
      'levels',
      'curves',
      'exposure',
      'vibrance',
      'hue/saturation',
      'color balance',
      'black & white',
      'photo filter',
      'channel mixer',
      'color lookup',
      'invert',
      'posterize',
      'threshold',
      'gradient map',
      'selective color',
    ] as const;

    readPsdMock.mockReturnValue({
      width: 1,
      height: 1,
      bitsPerChannel: 8,
      colorMode: 3,
      children: adjustmentTypes.map((type) =>
        createLayerWithFeature(`Adjustment ${type}`, { adjustment: { type } }),
      ),
    });

    const result = await parsePsdToWire('adjustments.psd', new Uint8Array([1]));
    const adjustmentIssues = result.issues.filter(
      (issue) =>
        issue.code === 'unsupported-layer-kind' &&
        issue.message.startsWith('PSD adjustment layer semantics'),
    );

    expect(adjustmentIssues).toHaveLength(adjustmentTypes.length);
    for (const type of adjustmentTypes) {
      expect(adjustmentIssues).toContainEqual(
        expect.objectContaining({
          layerPath: [`Adjustment ${type}`],
          message: `PSD adjustment layer semantics (${type}) were rasterized or dropped during import.`,
        }),
      );
    }
  });

  it('emits contract issues for alternate unsupported PSD feature shapes', async () => {
    readPsdMock.mockReturnValue({
      width: 1,
      height: 1,
      bitsPerChannel: 8,
      colorMode: 3,
      children: [
        createLayerWithFeature('Placed', { placedLayer: {} }),
        createLayerWithFeature('Vector Mask', { vectorMask: {} }),
        createLayerWithFeature('Vector Stroke', { vectorStroke: {} }),
      ],
    });

    const result = await parsePsdToWire('contract-issues.psd', new Uint8Array([1]));

    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'unsupported-layer-kind',
        layerPath: ['Placed'],
        message: 'PSD smart object was rasterized during import.',
      }),
      expect.objectContaining({
        code: 'mask-not-imported',
        layerPath: ['Vector Mask'],
        message: 'PSD layer mask was not imported.',
      }),
      expect.objectContaining({
        code: 'unsupported-layer-kind',
        layerPath: ['Vector Stroke'],
        message: 'PSD vector fill or stroke semantics were rasterized or dropped during import.',
      }),
    ]);
  });

  it('reports unsupported raster blend modes before webview mapping', async () => {
    readPsdMock.mockReturnValue({
      width: 1,
      height: 1,
      bitsPerChannel: 8,
      colorMode: 3,
      children: [
        {
          name: 'Linear Dodge',
          left: 0,
          top: 0,
          right: 1,
          bottom: 1,
          blendMode: 'linear dodge',
          imageData: {
            width: 1,
            height: 1,
            data: new Uint8Array([255, 255, 255, 255]),
          },
        },
      ],
    });

    const result = await parsePsdToWire('blend.psd', new Uint8Array([1]));

    expect(result.tree.layers[0]?.blendMode).toBe('linear dodge');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'unsupported-blend-mode',
        layerPath: ['Linear Dodge'],
      }),
    );
  });

  it('recognizes empty ag-psd section divider layers as groups', async () => {
    readPsdMock.mockReturnValue({
      width: 1,
      height: 1,
      bitsPerChannel: 8,
      colorMode: 3,
      children: [
        {
          name: 'Empty Group',
          sectionDivider: { type: 1, key: 'pass' },
          blendMode: 'pass through',
          children: [],
        },
      ],
    });

    const result = await parsePsdToWire('empty-group.psd', new Uint8Array([1]));

    expect(result.tree.layers[0]).toEqual(
      expect.objectContaining({
        name: 'Empty Group',
        kind: 'group',
        blendMode: 'pass through',
        children: [],
      }),
    );
    expect(result.issues.map((issue) => issue.code)).not.toContain('missing-pixel-data');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'group-isolation-mismatch',
        layerPath: ['Empty Group'],
      }),
    );
  });
});

function createLayerWithFeature(
  name: string,
  feature: Record<string, unknown>,
): Record<string, unknown> {
  return {
    name,
    left: 0,
    top: 0,
    right: 1,
    bottom: 1,
    blendMode: 'normal',
    imageData: {
      width: 1,
      height: 1,
      data: new Uint8Array([255, 255, 255, 255]),
    },
    ...feature,
  };
}
