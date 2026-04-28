import { describe, expect, it } from 'vitest';
import { writePsdBuffer } from 'ag-psd';
import { parsePsdToWire } from './psd-ag-adapter';

describe('PSD ag-psd adapter integration', () => {
  it('parses a generated PSD through the real ag-psd reader in Node', async () => {
    const bytes = writePsdBuffer(
      {
        width: 1,
        height: 1,
        children: [
          {
            name: 'Generated Layer',
            left: 0,
            top: 0,
            right: 1,
            bottom: 1,
            blendMode: 'multiply',
            opacity: 255,
            imageData: {
              width: 1,
              height: 1,
              data: new Uint8Array([255, 0, 0, 255]),
            },
          },
        ],
      },
      { useImageData: true },
    );

    const result = await parsePsdToWire('generated.psd', new Uint8Array(bytes));

    expect(result.tree.canvas.width).toBe(1);
    expect(result.tree.canvas.height).toBe(1);
    expect(result.tree.layers).toHaveLength(1);
    expect(result.tree.layers[0]).toEqual(
      expect.objectContaining({
        name: 'Generated Layer',
        kind: 'raster',
        blendMode: 'multiply',
        width: 1,
        height: 1,
      }),
    );
    expect(result.tree.layers[0]?.pixels).toEqual(
      expect.objectContaining({
        kind: 'encoded',
        dataBase64: expect.any(String),
        mimeType: 'image/png',
      }),
    );
    expect(JSON.parse(JSON.stringify(result)).tree.layers[0].pixels.dataBase64).toEqual(
      result.tree.layers[0]?.pixels?.dataBase64,
    );
  });

  it('preserves generated PSD groups and ag-psd pass-through blend mode', async () => {
    const bytes = writePsdBuffer(
      {
        width: 1,
        height: 1,
        children: [
          {
            name: 'Generated Group',
            blendMode: 'pass through',
            opened: true,
            children: [
              {
                name: 'Nested Layer',
                left: 0,
                top: 0,
                right: 1,
                bottom: 1,
                blendMode: 'screen',
                opacity: 255,
                imageData: {
                  width: 1,
                  height: 1,
                  data: new Uint8Array([0, 255, 0, 255]),
                },
              },
            ],
          },
        ],
      },
      { useImageData: true },
    );

    const result = await parsePsdToWire('generated-group.psd', new Uint8Array(bytes));
    const group = result.tree.layers[0];
    const child = group?.children?.[0];

    expect(group).toEqual(
      expect.objectContaining({
        name: 'Generated Group',
        kind: 'group',
        blendMode: 'pass through',
      }),
    );
    expect(child).toEqual(
      expect.objectContaining({
        name: 'Nested Layer',
        kind: 'raster',
        blendMode: 'screen',
        width: 1,
        height: 1,
      }),
    );
    expect(child?.pixels).toEqual(
      expect.objectContaining({ kind: 'encoded', dataBase64: expect.any(String) }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'group-isolation-mismatch',
        layerPath: ['Generated Group'],
      }),
    );
  });

  it('preserves top-level and nested layer order from ag-psd output', async () => {
    const bytes = writePsdBuffer(
      {
        width: 2,
        height: 1,
        children: [
          createOnePixelLayer('Bottom Layer', [255, 0, 0, 255]),
          {
            name: 'Ordered Group',
            blendMode: 'pass through',
            opened: true,
            children: [
              createOnePixelLayer('Nested Bottom', [0, 255, 0, 255]),
              createOnePixelLayer('Nested Top', [0, 0, 255, 255]),
            ],
          },
          createOnePixelLayer('Top Layer', [255, 255, 255, 255]),
        ],
      },
      { useImageData: true },
    );

    const result = await parsePsdToWire('generated-order.psd', new Uint8Array(bytes));
    const group = result.tree.layers[1];

    expect(result.tree.layers.map((layer) => layer.name)).toEqual([
      'Bottom Layer',
      'Ordered Group',
      'Top Layer',
    ]);
    expect(group?.children?.map((layer) => layer.name)).toEqual(['Nested Bottom', 'Nested Top']);
  });
});

function createOnePixelLayer(name: string, data: readonly [number, number, number, number]) {
  return {
    name,
    left: 0,
    top: 0,
    right: 1,
    bottom: 1,
    blendMode: 'normal',
    opacity: 255,
    imageData: {
      width: 1,
      height: 1,
      data: new Uint8Array(data),
    },
  };
}
